// Run: node --test
// No network, nothing to install.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import sizes from '../data/sizes.js';
import query from '../js/query.js';
import sample from '../js/sample.js';
import { SizeTable, lifecycleChange } from '../js/lifecycle.js';
import { readList } from '../js/input.js';
import { plan, toMachine } from '../js/planner.js';
import { caveats, imageSupportsNvme } from '../js/extras.js';
import * as F from '../js/files.js';

const table = new SizeTable(sizes.sizes);
const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const NOW = new Date('2026-10-09T12:00:00Z');

function run(text) {
    const list = readList(text);
    const machines = list.rows.map((r, i) => toMachine(r, list.map, i + 2, table, NOW));
    return { list, plan: plan(machines, table, NOW) };
}
const byName = (p, name) => p.machines.find((m) => m.read.name === name);

// ---- Nothing leaves the page ----

test('the page forbids every network request', () => {
    const html = read('index.html');
    const csp = /http-equiv="Content-Security-Policy" content="([^"]+)"/.exec(html);
    assert.ok(csp, 'a Content-Security-Policy is in the page');
    assert.match(csp[1], /connect-src 'none'/);
    assert.match(csp[1], /default-src 'none'/);
    assert.match(csp[1], /script-src 'self'(;|$)/);
    assert.match(csp[1], /form-action 'none'/);
});

test('no file can send data or load code from elsewhere', () => {
    const files = [
        'index.html', 'style.css',
        ...readdirSync(new URL('../js/', import.meta.url)).map((f) => `js/${f}`),
        ...readdirSync(new URL('../data/', import.meta.url)).map((f) => `data/${f}`),
    ];
    for (const f of files) {
        const text = read(f);
        for (const bad of [/\bfetch\s*\(/, /XMLHttpRequest/, /WebSocket/, /sendBeacon/, /EventSource/, /\bimport\s*\(/, /localStorage/, /sessionStorage/, /indexedDB/, /document\.cookie/]) {
            assert.doesNotMatch(text, bad, `${f} must not use ${bad}`);
        }
        // Scripts and styles only from this site.
        assert.doesNotMatch(text, /<script[^>]+src="(https?:)?\/\//i, `${f}: script from another site`);
        assert.doesNotMatch(text, /<link[^>]+href="(https?:)?\/\//i, `${f}: stylesheet from another site`);
        assert.doesNotMatch(text, /from\s+['"]https?:/, `${f}: module from another site`);
    }
});

test('the query and the sample on the page match their files', () => {
    assert.equal(query, read('query.kql').replace(/\r\n/g, '\n'));
    assert.equal(sample, read('samples/contoso-from-azure.csv').replace(/\r\n/g, '\n'));
});

// ---- Same list, same answer ----

test('the same list gives the same files twice', () => {
    const files = () => {
        const { plan: p, list } = run(sample);
        return [F.toCsv(F.SUMMARY_COLUMNS, F.summaryRows(p)), F.toCsv(F.TARGET_COLUMNS, F.targetRows(p, table, NOW)),
            F.toCsv(F.NOT_CHECKED_COLUMNS, F.notCheckedRows(p, table, NOW)), F.aboutText(p, list, 'sample', NOW)];
    };
    assert.deepEqual(files(), files());
});

// ---- Reading the list ----

test('wrong columns stop, and say which', () => {
    const { list } = run(read('samples/contoso-wrong-columns.csv'));
    assert.deepEqual(list.stops, ['The list has no Machine name column.', 'The list has no Current size column.', 'The list has no Generation column.']);
});

test('a pasted (tab-separated) list reads the same as the CSV', () => {
    const csv = run(read('samples/contoso-by-hand.csv')).plan;
    const pasted = run(read('samples/contoso-by-hand.csv').replace(/,/g, '\t')).plan;
    assert.deepEqual(pasted.machines.map((m) => [m.outcome, m.short]), csv.machines.map((m) => [m.outcome, m.short]));
});

test('a missing generation is not checked, and the other rows still run', () => {
    const { plan: p } = run(sample);
    const m = byName(p, 'contoso-nogen01');
    assert.equal(m.vm, null);
    assert.equal(m.outcome, 'Needs team review');
    assert.equal(byName(p, 'contoso-web01').outcome, 'Must move - supported target');
});

// ---- Lifecycle ----

test('v4 to v5 is the same stage, never shown as newer', () => {
    assert.equal(lifecycleChange('Standard_D4s_v4', 'Standard_D4s_v5'), 'same');
    assert.equal(lifecycleChange('Standard_D4s_v3', 'Standard_D4s_v6'), 'up');
});

test('an unknown size is not checked, never a guess', () => {
    const m = byName(run(sample).plan, 'contoso-odd01');
    assert.equal(m.moveRequired, 'Review');
    assert.equal(m.stage.stage, null);
});

test('a current size needs no move', () => {
    const m = byName(run(sample).plan, 'contoso-app02');
    assert.equal(m.outcome, 'No move required');
});

// ---- The extra columns ----

test('Azure Disk Encryption makes v6 and v7 a no, not v5', () => {
    const m = byName(run(sample).plan, 'contoso-sql01');
    assert.deepEqual([m.short.v6, m.short.v7], ['No - Azure Disk Encryption', 'No - Azure Disk Encryption']);
    assert.notEqual(m.short.v5, 'No - Azure Disk Encryption');
});

test('SAP, unmanaged disks and an ephemeral OS disk: no suggestion', () => {
    const p = run(sample).plan;
    assert.equal(byName(p, 'contoso-sap01').outcome, 'Must move - outside the scope of this tool');
    assert.equal(byName(p, 'contoso-old01').short.v5, 'No - unmanaged disks');
    assert.equal(byName(p, 'contoso-b01').short.v5, 'No - ephemeral OS disk');
});

test('a blank column is "check", never a pass', () => {
    const { plan: p } = run(read('samples/contoso-by-hand.csv'));
    const row = byName(p, 'contoso-file01').rows.find((r) => r.series === 'v6');
    for (const topic of ['NVMe', 'Disk encryption', 'Hibernation', 'SAP', 'Identity', 'Zone']) {
        assert.equal(row.caveats[topic].state, 'check', topic);
    }
});

test('NVMe support follows Microsoft\'s list; a custom image cannot tell', () => {
    assert.equal(imageSupportsNvme('MicrosoftWindowsServer', 'WindowsServer', '2022-datacenter-g2'), true);
    assert.equal(imageSupportsNvme('MicrosoftWindowsServer', 'WindowsServer', '2016-Datacenter'), false);
    assert.equal(imageSupportsNvme('RedHat', 'RHEL', '8_5'), false);
    assert.equal(imageSupportsNvme('RedHat', 'RHEL', '86-gen2'), true);
    assert.equal(imageSupportsNvme('Canonical', 'ubuntu-24_04-lts', 'server'), true);
    assert.equal(imageSupportsNvme('', '', ''), null);
});

// ---- Owner's first try, 2026-10-09 ----

test('a machine that is not moving has no warnings', () => {
    const p = run(sample).plan;
    for (const m of p.machines.filter((x) => x.moveRequired === 'No')) assert.deepEqual(F.warnings(m), [], m.read.name);
    assert.ok(F.warnings(byName(p, 'contoso-web01')).length, 'a machine that must move keeps its warnings');
});

test('a machine that is not moving says "Not needed", never a no', async () => {
    const { answerWords } = await import('../js/words.js');
    const m = byName(run('Machine name,Current size,Generation\ncontoso-b02,Standard_B2ls_v2,2\n').plan, 'contoso-b02');
    assert.equal(m.outcome, 'No move required');
    assert.deepEqual(['v5', 'v6', 'v7'].map((s) => answerWords(m, s)), ['Not needed', 'Not needed', 'Not needed']);
    // A supported newer size is still shown, for reference.
    assert.equal(answerWords(byName(run(sample).plan, 'contoso-app01'), 'v5'), 'Standard_D2ds_v5');
});

test('the results zip opens and holds the four files, unchanged', async () => {
    const { makeZip } = await import('../js/zip.js');
    const { execFileSync } = await import('node:child_process');
    const { writeFileSync, mkdtempSync, readFileSync: rf } = await import('node:fs');
    const { tmpdir } = await import('node:os');
    const { join } = await import('node:path');
    const files = [{ name: 'vm-summary.csv', text: '﻿"a","b"\r\n"1","é"\r\n' }, { name: 'about-these-results.txt', text: 'hello' }];
    const dir = mkdtempSync(join(tmpdir(), 'zip-'));
    writeFileSync(join(dir, 'r.zip'), makeZip(files));
    // Python's zipfile checks every CRC.
    const out = execFileSync('python', ['-I', '-c', 'import sys,zipfile; z=zipfile.ZipFile(sys.argv[1]); assert z.testzip() is None; sys.stdout.buffer.write(z.read("vm-summary.csv"))', join(dir, 'r.zip')]);
    assert.equal(out.toString('utf8'), files[0].text);
});

test('every size in the table is recognised', async () => {
    const { currentStage } = await import('../js/planner.js');
    assert.deepEqual(table.keys().filter((n) => currentStage(n, table, NOW).stage === null), []);
});

test('no machine that must move is left "not checked" just because its family has no target', () => {
    const p = run('Machine name,Current size,Generation\ncontoso-m01,Standard_M192ids_v2,2\ncontoso-dc01,Standard_DC4s_v3,2\n').plan;
    assert.equal(byName(p, 'contoso-m01').outcome, 'Must move - outside the scope of this tool');
    assert.equal(byName(p, 'contoso-dc01').outcome, 'Must move - outside the scope of this tool');
});

// ---- Microsoft's retired-sizes guide (owner, 2026-10-09: follow it) ----

test('F, Fs and Fsv2 machines may choose Falsv6, which is Current', async () => {
    const { sizeLifecycleStage } = await import('../js/lifecycle.js');
    const m = byName(run('Machine name,Current size,Generation,OS\ncontoso-f02,Standard_F4s_v2,2,Linux\n').plan, 'contoso-f02');
    const v6 = m.rows.find((r) => r.series === 'v6');
    assert.ok(v6.otherSizes.includes('Standard_F4als_v6'), v6.otherSizes.join(', '));
    assert.equal(sizeLifecycleStage('Standard_F4als_v6').stage, 'Current');
});

test('B v1 and Av2 machines get a burstable option (Bsv2 or Basv2)', async () => {
    const { answerWords } = await import('../js/words.js');
    const p = run('Machine name,Current size,Generation,OS\ncontoso-b02,Standard_B2ms,2,Linux\ncontoso-a02,Standard_A2m_v2,1,Linux\ncontoso-d02,Standard_D4s_v3,2,Linux\n').plan;
    assert.equal(answerWords(byName(p, 'contoso-b02'), 'burstable'), 'Standard_B2s_v2');
    assert.equal(answerWords(byName(p, 'contoso-a02'), 'burstable'), 'Standard_B4s_v2');
    assert.equal(answerWords(byName(p, 'contoso-d02'), 'burstable'), '', 'only B v1 and Av2 machines');
});

test('every link points to a real Microsoft Learn or GitHub path', () => {
    const files = ['index.html', ...readdirSync(new URL('../js/', import.meta.url)).map((f) => `js/${f}`), ...readdirSync(new URL('../data/', import.meta.url)).map((f) => `data/${f}`)];
    for (const f of files) {
        for (const [url] of read(f).matchAll(/https:\/\/[^\s'"`)<]+/g)) {
            assert.match(url, /^https:\/\/(learn\.microsoft\.com\/azure\/(virtual-machines|well-architected\/design-guides\/capacity-resilience)|github\.com\/chrislittle\/azure-vm-lifecycle-planner$)/, `${f}: ${url}`);
        }
    }
});

test('every link from the page to its own files carries the release version', async () => {
    const version = (await import('../js/version.js')).default;
    const tag = `?v=${version}`;
    for (const f of readdirSync(new URL('../js/', import.meta.url))) {
        for (const [, spec] of read(`js/${f}`).matchAll(/from\s+['"](\.{1,2}\/[^'"]+)['"]/g)) {
            assert.ok(spec.endsWith(tag), `js/${f} imports ${spec} without ${tag}`);
        }
    }
    const html = read('index.html');
    assert.ok(html.includes(`src="js/page.js${tag}"`), 'index.html: page.js');
    assert.ok(html.includes(`href="style.css${tag}"`), 'index.html: style.css');
});

test('a network virtual appliance gets no target size; other VMs get no appliance note', async () => {
    const { isApplianceImage } = await import('../js/extras.js');
    assert.equal(isApplianceImage('paloaltonetworks', 'vmseries-flex'), true);
    assert.equal(isApplianceImage('Canonical', 'ubuntu-24_04-lts'), false, 'ubuntu* counts only with an appliance publisher');
    assert.equal(isApplianceImage('', 'vmseries-flex'), false, 'a custom image cannot tell');
    const p = run(sample).plan;
    const fw = byName(p, 'contoso-fw01');
    assert.equal(fw.outcome, 'Must move - outside the scope of this tool');
    assert.equal(F.groupOf(fw), 'gate', 'an appliance is a hard gate');
    for (const m of p.machines.filter((x) => x.read.name !== 'contoso-fw01' && x.vm)) {
        for (const r of m.rows) assert.equal(r.caveats['Network virtual appliance']?.state || '', '', m.read.name);
    }
});

test('a fact that is fine shows no note', () => {
    const p = run(sample).plan;
    for (const m of p.machines) for (const r of m.rows) for (const c of Object.values(r.caveats || {})) {
        assert.ok(['', 'problem', 'attention', 'check'].includes(c.state), `${m.read.name}: ${c.state} ${c.text}`);
        if (!c.state) assert.equal(c.text, '');
    }
});

// ---- 0.2.0: result groups, how to move, ranked sizes ----

test('result groups: ready, do this first, hard gate, no supported size', () => {
    const p = run(sample).plan;
    assert.equal(F.groupOf(byName(p, 'contoso-sap01')), 'gate');
    assert.equal(F.groupOf(byName(p, 'contoso-gpu01')), 'nopath');
    assert.equal(F.groupOf(byName(p, 'contoso-web01')), 'first', 'temporary disk and identity are readiness signals');
    assert.equal(F.groupOf(byName(p, 'contoso-app01')), 'modern');
    const clean = run('Machine name,Current size,Generation,OS,NIC count,Data-disk count,Security type,Image publisher,Image offer,Image SKU,Accelerated NICs,Primary NIC accelerated,Azure Disk Encryption,Hibernation,Scale set,Azure Virtual Desktop,SAP,Unmanaged disks,Ephemeral OS disk,System-assigned identity,Availability set,Zone\n'
        + 'contoso-ok,Standard_D4_v3,2,Linux,1,0,TrustedLaunch,Canonical,ubuntu-24_04-lts,server,1,Yes,No,No,No,No,No,No,No,No,No,1\n').plan;
    assert.equal(F.groupOf(byName(clean, 'contoso-ok')), 'ready', JSON.stringify(F.signals(byName(clean, 'contoso-ok'))));
});

test('how to move: v5 resize, v6 and v7 deploy in parallel', async () => {
    const { moveWords } = await import('../js/words.js');
    assert.match(moveWords('v5', false, true), /^Resize the current VM/);
    assert.match(moveWords('v5', true, true), /^Rebuild/);
    assert.match(moveWords('v6', false, true), /^Deploy a new VM at this size in parallel/);
    assert.match(moveWords('v7', false, true), /Microsoft highly recommends/);
});

test('ranked sizes: the best first, each one fits and passes the checks', async () => {
    const { rankedSizes, targetSize } = await import('../js/lifecycle.js');
    const p = run('Machine name,Current size,Generation,OS,NIC count,Data-disk count\ncontoso-r1,Standard_DS4_v2,2,Linux,1,0\n').plan;
    const m = byName(p, 'contoso-r1');
    const v6 = m.rows.find((r) => r.series === 'v6');
    const ranked = rankedSizes(m.vm, table, v6.option, NOW);
    assert.equal(ranked[0].size, v6.option.targetSize);
    assert.ok(ranked.length >= 3 && ranked.length <= 5, ranked.map((x) => x.size).join(' '));
    assert.ok(ranked.some((x) => x.why === 'processor'), 'an AMD or Intel equivalent');
    const src = table.get('Standard_DS4_v2').caps;
    for (const x of ranked) {
        const c = table.get(x.size).caps;
        assert.ok(Number(c.vCPUsAvailable || c.vCPUs) >= Number(src.vCPUs) && Number(c.MemoryGB) >= Number(src.MemoryGB), `${x.size} is not smaller`);
        const t = targetSize({ sourceSize: 'Standard_DS4_v2', sizeMap: [{ source: 'Standard_DS4_v2', target: x.size }], table, targetGeneration: 'v6', hyperVGeneration: 'V2' });
        assert.equal(t.target, x.size, `${x.size} passes the checks`);
    }
});

test('a storage or backup appliance is a hard gate', async () => {
    const { isStorageApplianceImage } = await import('../js/extras.js');
    assert.equal(isStorageApplianceImage('veeam', 'veeam-backup-replication'), true);
    assert.equal(isStorageApplianceImage('purestorageinc1578960262525', 'cloud_block_store_azure_beta_image'), true);
    assert.equal(isStorageApplianceImage('veeam', 'office365backup'), false, 'only the appliance offers');
    assert.equal(isStorageApplianceImage('', 'veeam-backup-replication'), false, 'a custom image cannot tell');
    const m = byName(run(sample).plan, 'contoso-bkp01');
    assert.equal(F.groupOf(m), 'gate');
    assert.equal(m.short.v6, 'No - storage or backup appliance');
});

// ---- Workload patterns ----

test('each VM gets the workload pattern of its signals', () => {
    const p = run(sample).plan;
    const expect = {
        'contoso-aks-np1': 'A', 'contoso-vmss01': 'A', 'contoso-avd01': 'B', 'contoso-dbx01': 'C', 'contoso-api01': 'E',
        'contoso-avd02': 'E', 'contoso-sql01': 'F', 'contoso-fc01': 'F', 'contoso-sap01': 'F', 'contoso-fw01': 'G', 'contoso-bkp01': 'G',
    };
    for (const [name, pattern] of Object.entries(expect)) assert.equal(byName(p, name).pattern, pattern, name);
});

test('a list without the pattern columns gives no pattern: unknown is not pattern E', () => {
    const p = run(read('samples/contoso-every-series.csv')).plan;
    assert.ok(p.machines.every((m) => m.pattern !== 'E'));
    const rows = F.summaryRows(p);
    assert.ok(rows.every((r) => r['Workload type'] === 'Type not checked'));
});

test('an AVD session host with no host pool type is not checked, not pattern E', () => {
    const head = 'Machine name,Current size,Generation,Scale set,Azure Virtual Desktop,SAP,Managed by,AVD host pool type,SQL Server,Shared disk';
    const p = run(`${head}\ncontoso-vd1,Standard_D4s_v3,V2,No,Yes,No,None,,No,No\ncontoso-vd2,Standard_D4s_v3,V2,No,Yes,No,None,Personal,No,No\n`).plan;
    assert.equal(byName(p, 'contoso-vd1').pattern, '');
    assert.equal(byName(p, 'contoso-vd2').pattern, 'E');
});

test('a scale set without a generation: a Generation 2 image SKU tells, else not checked', () => {
    const p = run(sample).plan;
    const aks = byName(p, 'contoso-aks-np1');
    assert.equal(aks.vm, null);
    assert.deepEqual(aks.problems.map((x) => x.why), ['scale-set-generation-missing']);
    assert.equal(F.groupOf(aks), 'unchecked');
    const vmss = byName(p, 'contoso-vmss01');
    assert.equal(vmss.vm.gen, 'V2');
    assert.ok(vmss.notes.some((n) => n.includes('22_04-lts-gen2')));
});

test('for a pool or a service, the pattern says how to move', () => {
    const p = run(sample).plan;
    const rows = F.targetRows(p, table, NOW);
    const dbx = rows.filter((r) => r['Machine'] === 'contoso-dbx01' && r['Supported'] === 'Yes');
    assert.ok(dbx.length);
    assert.ok(dbx.every((r) => r['How to move'].startsWith('A service')), 'not "resize the current VM"');
    const api = rows.find((r) => r['Machine'] === 'contoso-api01' && r['Series'] === 'v5');
    assert.ok(api['How to move'].startsWith('Resize the current VM'));
});
