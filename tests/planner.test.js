// Run: node --test
// No network, nothing to install.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import sizes from '../data/sizes.js';
import query from '../js/query.js';
import sample from '../js/sample.js';
import { SizeTable, lifecycleChange, machineAdvice, rankedSizes } from '../js/lifecycle.js';
import { COLUMNS, readList } from '../js/input.js';
import { plan, toMachine } from '../js/planner.js';
import { caveats, imageSupportsNvme } from '../js/extras.js';
import * as F from '../js/files.js';
import { largeList } from './large-list.js';

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
    assert.match(csp[1], /base-uri 'none'/);
    assert.match(csp[1], /img-src 'self' data:(;|$)/);
});

test('the report has its own policy: no scripts, nothing to load', async () => {
    const { reportHtml } = await import('../js/report.js');
    const html = reportHtml(run(sample).plan, table, 'sample', NOW);
    const csp = /http-equiv="Content-Security-Policy" content="([^"]+)"/.exec(html);
    assert.ok(csp);
    assert.match(csp[1], /default-src 'none'/);
    assert.doesNotMatch(csp[1], /script-src/);
});

test('no real identifiers: the only GUIDs are all zeros, or public Azure policy IDs', () => {
    // A public Azure built-in policy definition ID is not a tenant or a subscription.
    const allowed = new Set(['00000000-0000-0000-0000-000000000000', 'e87a87f5-e6dd-4919-be21-abb0a4ea4630']);
    const files = ['README.md', 'PLAN.md', 'template.csv', 'index.html', 'query.kql',
        ...readdirSync(new URL('../samples/', import.meta.url)).map((f) => `samples/${f}`),
        ...readdirSync(new URL('../data/', import.meta.url)).map((f) => `data/${f}`),
        ...readdirSync(new URL('../js/', import.meta.url)).map((f) => `js/${f}`),
        ...readdirSync(new URL('../docs/', import.meta.url)).map((f) => `docs/${f}`),
        ...readdirSync(new URL('../tools/', import.meta.url)).map((f) => `tools/${f}`)];
    for (const f of files) {
        for (const g of read(f).match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi) || []) {
            assert.ok(allowed.has(g.toLowerCase()), `${f}: ${g} is not an allowed GUID`);
        }
    }
});

test('the CSV files never carry a formula from the list', () => {
    const csv = F.toCsv(['Machine'], [{ Machine: '=1+1' }, { Machine: '+cmd' }, { Machine: '@SUM(1)' }, { Machine: '-2+3' }, { Machine: '-' }, { Machine: 'contoso-web01' }]);
    const cells = csv.replace(/^\uFEFF/, '').trim().split('\r\n').slice(1).map((l) => l.slice(1, -1));
    assert.deepEqual(cells, ["'=1+1", "'+cmd", "'@SUM(1)", "'-2+3", '-', 'contoso-web01']);
});

test('no file can send data or load code from elsewhere', () => {
    const files = [
        'index.html', 'style.css',
        ...readdirSync(new URL('../js/', import.meta.url)).map((f) => `js/${f}`),
        ...readdirSync(new URL('../data/', import.meta.url)).map((f) => `data/${f}`),
    ];
    for (const f of files) {
        const text = read(f);
        for (const bad of [/\bfetch\s*\(/, /XMLHttpRequest/, /WebSocket/, /sendBeacon/, /EventSource/, /\bimport\s*\(/, /localStorage/, /sessionStorage/, /indexedDB/, /document\.cookie/,
            /RTCPeerConnection/, /window\.open\s*\(/, /(window|document)\.location(\.href)?\s*=[^=]|\blocation\.(assign|replace)\s*\(/, /new\s+Image\s*\(/, /new\s+(Shared)?Worker\s*\(/, /serviceWorker/, /\sping=/, /rel="(prefetch|preconnect|dns-prefetch|preload)"/,
            /innerHTML|outerHTML|insertAdjacentHTML|document\.write|\beval\s*\(|new\s+Function\s*\(/]) {
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
    assert.deepEqual(list.stops, ['The list has no VM name column.', 'The list has no Current size column.', 'The list has no Generation column.']);
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
    for (const topic of ['NVMe', 'Disk encryption', 'Hibernation', 'Identity', 'Zone']) {
        assert.equal(row.caveats[topic].state, 'check', topic);
    }
    // SAP shows only for Yes, as an appliance does (0.9.4-beta). The workload type still
    // names a missing SAP column (tests/sap.test.js).
    assert.deepEqual(row.caveats['SAP'], { state: '', text: '' });
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

test('the results zip opens, holds the files unchanged, and compresses them', async () => {
    const { makeZip } = await import('../js/zip.js');
    const { execFileSync } = await import('node:child_process');
    const { writeFileSync, mkdtempSync, readFileSync: rf } = await import('node:fs');
    const { tmpdir } = await import('node:os');
    const { join } = await import('node:path');
    const big = '"contoso-vm","eastus","Standard_D4s_v5"\r\n'.repeat(2000);
    const files = [{ name: 'vm-summary.csv', text: '﻿"a","b"\r\n"1","é"\r\n' + big }, { name: 'about-these-results.txt', text: 'hello' }];
    const dir = mkdtempSync(join(tmpdir(), 'zip-'));
    const zip = await makeZip(files);
    writeFileSync(join(dir, 'r.zip'), zip);
    // Python's zipfile checks every CRC. Method 8 is deflate, 0 is stored: a file that
    // does not get smaller ("hello") is stored.
    const out = execFileSync('python', ['-I', '-c', 'import sys,zipfile; z=zipfile.ZipFile(sys.argv[1]); assert z.testzip() is None; assert [i.compress_type for i in z.infolist()] == [8, 0]; sys.stdout.buffer.write(z.read("vm-summary.csv"))', join(dir, 'r.zip')]);
    assert.ok(zip.length < files[0].text.length / 10, `zip ${zip.length} bytes`);
    // Python reads the sizes from the central directory: check the local header too,
    // which streaming readers use.
    const dv = new DataView(zip.buffer, zip.byteOffset);
    const at = zip.length - 22, central = dv.getUint32(at + 16, true);
    assert.equal(dv.getUint32(18, true), dv.getUint32(central + 20, true), 'compressed size');
    assert.equal(dv.getUint32(22, true), dv.getUint32(central + 24, true), 'size');
    assert.equal(dv.getUint32(22, true), new TextEncoder().encode(files[0].text).length);
    // A browser without CompressionStream stores the files.
    const saved = globalThis.CompressionStream;
    try {
        globalThis.CompressionStream = undefined;
        const plain = await makeZip(files);
        assert.equal(new DataView(plain.buffer, plain.byteOffset).getUint16(8, true), 0);
    } finally {
        globalThis.CompressionStream = saved;
    }
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
            // The identity note cites the managed identities overview (0.9.3-beta). The query
            // (js/query.js) names the two pages of the Azure VM extension for SAP solutions (0.9.4-beta).
            // The Generation 1 upgrade page names a Microsoft short link for its Linux registration (0.9.7-beta).
            assert.match(url, /^https:\/\/(learn\.microsoft\.com\/azure\/(virtual-machines|well-architected\/design-guides\/capacity-resilience|sap\/workloads\/vm-extension-for-sap-(new|standard)$)|learn\.microsoft\.com\/entra\/identity\/managed-identities-azure-resources\/overview$|aka\.ms\/Gen1ToTLUpgrade$|github\.com\/chrislittle\/azure-vm-lifecycle-planner$)/, `${f}: ${url}`);
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
    assert.match(moveWords('v5', 'not-needed'), /^Resize the current VM/);
    // 0.9.5-beta: never a rebuild. With the preview feature, still a resize.
    assert.match(moveWords('v5', 'needed', { size: 'Standard_D4ds_v5' }), /^Resize the current VM\./);
    assert.match(moveWords('v6', 'not-needed'), /^Deploy a new VM at this size in parallel/);
    assert.match(moveWords('v7', 'needed'), /Microsoft highly recommends/);
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
    // AKS makes the new nodes from its own image: the generation does not matter.
    const aks = byName(p, 'contoso-aks-np1');
    assert.ok(aks.vm, 'AKS is planned without the generation');
    assert.equal(F.groupOf(aks), 'pool');
    assert.equal(aks.read.generation, null, 'the files still show the generation as the list gave it');
    const head = 'Machine name,Current size,Generation,Resource type,Managed by,Scale set,Image publisher';
    const own = byName(run(`${head}
contoso-ss1,Standard_D4s_v3,,Scale set,None,Yes,
`).plan, 'contoso-ss1');
    assert.deepEqual(own.problems.map((x) => x.why), ['scale-set-generation-missing'], 'a scale set of your own still needs it');
    assert.equal(F.groupOf(own), 'unchecked');
    const vmss = byName(p, 'contoso-vmss01');
    assert.equal(vmss.vm.gen, 'V2');
    assert.ok(vmss.notes.some((n) => n.includes('22_04-lts-gen2')));
});

test('for a pool or a service, the pattern says how to move', () => {
    const p = run(sample).plan;
    const rows = F.targetRows(p, table, NOW);
    const dbx = rows.filter((r) => r['VM name'] === 'contoso-dbx01' && r['Supported'] === 'Yes');
    assert.ok(dbx.length);
    assert.ok(dbx.every((r) => r['How to move'].startsWith('Change the node type in the Azure Databricks cluster.')), 'not "resize the current VM"');
    const api = rows.find((r) => r['VM name'] === 'contoso-api01' && r['Series'] === 'v5');
    assert.ok(api['How to move'].startsWith('Resize the current VM'));
});

// ---- The service or pool group, and the notes (0.4.0-beta) ----

test('a VM in a service or pool has its own group, and a service-managed VM has no notes', () => {
    const p = run(sample).plan;
    const dbx = byName(p, 'contoso-dbx01');
    assert.equal(F.groupOf(dbx), 'pool');
    assert.deepEqual(F.signals(dbx), { actions: [], attention: [], checks: [] }, 'the service manages the image and the disks');
    assert.equal(F.groupOf(byName(p, 'contoso-vmss01')), 'pool');
    assert.equal(F.groupOf(byName(p, 'contoso-api01')), 'ready', 'a standalone VM keeps its group');
});

test('the advice names the service that the list gives', async () => {
    const { poolAdvice } = await import('../js/words.js');
    const p = run(sample).plan;
    assert.match(poolAdvice(byName(p, 'contoso-dbx01')).todo, /Azure Databricks/);
    assert.match(poolAdvice(byName(p, 'contoso-aks-np1')).todo, /AKS node pool/);
    assert.match(poolAdvice(byName(p, 'contoso-vmss01')).todo, /new scale set/);
    const head = 'Machine name,Current size,Generation,Managed by';
    const batch = byName(run(`${head}
contoso-x1,Standard_D4s_v3,V2,Microsoft.Batch
`).plan, 'contoso-x1');
    assert.equal(batch.pattern, 'C');
    assert.match(poolAdvice(batch).todo, /Microsoft\.Batch/);
    for (const m of p.machines) assert.ok(!/for example Azure Databricks/.test(poolAdvice(m).todo + poolAdvice(m).more), m.read.name);
});

test('each note shows once, with the series it applies to', () => {
    const m = byName(run(sample).plan, 'contoso-web01');
    const n = F.allNotes(m);
    const all = [...n.actions, ...n.attention, ...n.checks];
    const keys = all.map((x) => `${x.topic}|${x.text}`);
    assert.equal(new Set(keys).size, keys.length, 'no note twice');
    for (const x of all) assert.ok(x.series.every((s) => ['v5', 'v6', 'v7', 'burstable'].includes(s)));
});

test('the availability set note says when all the VMs must stop', () => {
    const p = run(sample).plan;
    const m = byName(p, 'contoso-web02');
    const n = F.allNotes(m).attention.find((x) => x.topic === 'Availability set');
    // 0.9.5-beta: a resize, in the words of the resize method.
    assert.match(n.text, /If Azure does not offer the new size for this set, stop \(deallocate\) all the VMs in the set first\./);
    // v6 and v7 make a new VM: the note says how a new VM joins the set.
    const head = 'Machine name,Current size,Generation,OS,Availability set';
    const both = F.allNotes(byName(run(`${head}
contoso-as1,Standard_D4s_v3,V2,Linux,Yes
`).plan, 'contoso-as1')).attention.filter((x) => x.topic === 'Availability set');
    // 0.9.4-beta: v6 and v7 give both methods (tests below).
    assert.ok(both.some((x) => x.series.includes('v6') && /If you deploy a new VM in parallel: put the new VM in the same availability set/.test(x.text)));
});

// ---- Same names in other groups or subscriptions (0.4.6-beta) ----

test('the resource ID gives the subscription and the resource group', async () => {
    const { readResourceId } = await import('../js/planner.js');
    const r = readResourceId('/subscriptions/00000000-0000-0000-0000-000000000000/resourceGroups/rg-contoso-dr/providers/Microsoft.Compute/virtualMachines/contoso-web01');
    assert.equal(r.subscriptionId, '00000000-0000-0000-0000-000000000000');
    assert.equal(r.resourceGroup, 'rg-contoso-dr');
    assert.deepEqual(readResourceId(''), { resourceId: '', subscriptionId: '', resourceGroup: '' });
    assert.equal(readResourceId('not an id').resourceGroup, '');
});

test('two VMs with the same name stay apart in every file', () => {
    const head = 'Machine name,Region,Current size,Generation,Resource ID';
    const id = (rg) => `/subscriptions/00000000-0000-0000-0000-000000000000/resourceGroups/${rg}/providers/Microsoft.Compute/virtualMachines/contoso-app09`;
    // The first cannot be checked (no generation); the second can.
    const { plan: p } = run(`${head}\ncontoso-app09,eastus2,Standard_D4s_v3,,${id('rg-a')}\ncontoso-app09,eastus2,Standard_D4s_v3,V2,${id('rg-b')}\n`);
    const rows = F.notCheckedRows(p, table, NOW);
    assert.ok(rows.length >= 1);
    for (const r of rows) assert.equal(r['Resource group'], 'rg-a', 'the reason belongs to the VM in rg-a');
    assert.ok(rows.some((r) => /generation/i.test(r['Why'])));
    const summary = F.summaryRows(p);
    assert.deepEqual(summary.map((r) => r['Resource group']), ['rg-a', 'rg-b']);
    assert.ok(summary.every((r) => r['Resource ID'].includes('/resourceGroups/')));
});

test('the sample has a VM name twice, in two resource groups', () => {
    const twins = run(sample).plan.machines.filter((m) => m.read.name === 'contoso-web01');
    assert.equal(twins.length, 2);
    assert.notEqual(twins[0].read.resourceGroup, twins[1].read.resourceGroup);
});

// ---- The report (0.5.0-beta) ----

test('the report is one safe HTML file with every VM that must move', async () => {
    const { reportHtml } = await import('../js/report.js');
    const { plan: p } = run(sample);
    const html = reportHtml(p, table, 'sample list (contoso)', NOW);
    assert.ok(html.startsWith('<!doctype html>'));
    assert.ok(!/<script|<link|<img|src=|@import|url\(/i.test(html), 'nothing to run and nothing to load');
    for (const m of p.machines) assert.ok(html.includes(m.read.name), m.read.name);
    for (const m of p.machines.filter((x) => F.groupOf(x) !== 'modern')) assert.ok(html.includes(`id="vm-${m.read.row}"`), `card for ${m.read.name}`);
    assert.equal(reportHtml(p, table, 'sample list (contoso)', NOW), html, 'same list, same report');
});

test('the report escapes the text of the list', async () => {
    const { reportHtml } = await import('../js/report.js');
    const { plan: p } = run('Machine name,Current size,Generation\n<b>x</b>,Standard_D4s_v3,V2\n');
    const html = reportHtml(p, table, '<i>list</i>', NOW);
    assert.ok(!html.includes('<b>x</b>') && html.includes('&lt;b&gt;x&lt;/b&gt;'));
    assert.ok(!html.includes('<i>list</i>'));
});

// ---- Fixes from the review (0.5.1-beta) ----

test('RHEL 10 and Oracle Linux 10 are newer than the NVMe list: check, not a fail', () => {
    assert.equal(imageSupportsNvme('RedHat', 'RHEL', '10-lvm-gen2'), null);
    assert.equal(imageSupportsNvme('RedHat', 'RHEL', '10_0'), null);
    assert.equal(imageSupportsNvme('Oracle', 'Oracle-Linux', 'ol10-lvm-gen2'), null);
    assert.equal(imageSupportsNvme('RedHat', 'RHEL', '9_4'), true);
    assert.equal(imageSupportsNvme('RedHat', 'RHEL', '86-gen2'), true);
    assert.equal(imageSupportsNvme('Oracle', 'Oracle-Linux', 'ol84'), false);
});

test('no size with the same name is not a "no": E16-4s_v3 on v7 is not checked', () => {
    const m = byName(run('VM name,Current size,Generation\ncontoso-e1,Standard_E16-4s_v3,V2\n').plan, 'contoso-e1');
    const v7 = m.rows.find((r) => r.series === 'v7');
    assert.equal(v7.result, 'Needs team review');
    assert.ok(table.has('Standard_E16s_v7'), 'another v7 size fits');
});

test('an unknown OS with Azure Disk Encryption is not checked, not a resize', () => {
    const m = byName(run('VM name,Current size,Generation,OS,Azure Disk Encryption\ncontoso-b3,Standard_B2s,V2,,Yes\n').plan, 'contoso-b3');
    assert.equal(m.rows.find((r) => r.series === 'burstable').result, 'Needs team review');
});

test('a size in lower case gives the same answer', () => {
    const p = run('VM name,Current size,Generation\ncontoso-a,Standard_A1,V2\ncontoso-b,standard_a1,V2\ncontoso-c,STANDARD_DS3_V2,V2\ncontoso-d,Standard_DS3_v2,V2\n').plan;
    assert.equal(byName(p, 'contoso-a').outcome, byName(p, 'contoso-b').outcome);
    assert.deepEqual(byName(p, 'contoso-c').short, byName(p, 'contoso-d').short);
});

test('accelerated networking is not "on" when the NIC count is unknown', () => {
    const m = byName(run('VM name,Current size,Generation,OS,Accelerated NICs\ncontoso-n,Standard_D4s_v3,V2,Linux,1\n').plan, 'contoso-n');
    const v5 = m.rows.find((r) => r.series === 'v5');
    assert.equal(v5.option.acceleratedNetworking.turnsOn, null);
});

test('do this first says what is first: steps, or facts to check', async () => {
    const { todo } = await import('../js/details.js');
    const m = byName(run('VM name,Current size,Generation\ncontoso-z,Standard_D4s_v3,V2\n').plan, 'contoso-z');
    assert.equal(F.groupOf(m), 'first');
    assert.ok(todo(m, 'first').more.includes('Check the facts in "To check" first.'));
});

test('the report gives the reason for vendor approval', async () => {
    const { reportHtml } = await import('../js/report.js');
    const html = reportHtml(run(sample).plan, table, 'sample', NOW);
    assert.match(html, /This VM is a network virtual appliance/);
});

test('the list reader takes a sep= line, spaces before quotes, and keeps line numbers', () => {
    const list = readList('sep=,\nVM name,Current size,Generation\n\ncontoso-s1, "Standard_D2s_v3",V2\n');
    assert.deepEqual(list.stops, []);
    assert.equal(list.rows[0][1].trim(), 'Standard_D2s_v3');
    assert.equal(list.rows[0].line, 4);
});

test('lists with the old "Machine name" column still work', () => {
    const list = readList('Machine name,Current size,Generation\ncontoso-o1,Standard_D2s_v3,V2\n');
    assert.deepEqual(list.stops, []);
    assert.equal(list.map['VM name'], 0);
});

// ---- Watching the sources (0.6.0-beta) ----

// A page in the Microsoft Learn layout: the article between the metadata block and
// the feedback section.
const learnPage = (article, date = '2026-09-26') => `<html><head><meta name="updated_at" content="${date}T06:04:00Z"></head><body>`
    + '<nav><table><tr><th>Menu</th></tr><tr><td>x</td></tr></table></nav><main><p>Access to this page requires authorization.</p>'
    + `<div id="article-metadata"></div><div class="content">${article}</div>`
    + '<section id="site-user-feedback-footer"><h2>Feedback</h2><p>Was this page helpful?</p></section></main></body></html>';

test('the source check reads every line of the article, with its section', async () => {
    const { readArticle, pageDate } = await import('../tools/sources.mjs');
    const html = learnPage('<p>Intro.</p><h2 id="a">Lifecycle stages</h2><p>v6 and v7 series are <b>Current</b>.</p>'
        + '<table><thead><tr><th>Series name</th><th>Planned&nbsp;Retirement Date<sup>1</sup></th></tr></thead><tr><td>D-series</td><td>05/01/28</td></tr></table>'
        + '<h3>Linux</h3><ul><li>RHEL<ul><li>8.6 and newer</li></ul></li><li>Ubuntu 24.04</li></ul>'
        + '<pre><code>az vm list</code></pre><script>var t = 1;</script>');
    assert.deepEqual(readArticle(html), [
        '(top) :: Intro.',
        'Lifecycle stages :: v6 and v7 series are Current.',
        'Lifecycle stages :: Series name | Planned Retirement Date = D-series | 05/01/28',
        'Lifecycle stages > Linux :: RHEL',
        'Lifecycle stages > Linux :: 8.6 and newer',
        'Lifecycle stages > Linux :: Ubuntu 24.04',
    ], 'no menu, no code, no footnote number, no feedback, nested list items kept');
    assert.equal(pageDate(html), '2026-09-26');
    assert.throws(() => readArticle('<main><table><tr><td>x</td></tr></table></main>'), /article layout/);
});

test('the source check counts duplicates and writes a safe, short report', async () => {
    const { diffFacts } = await import('../tools/sources.mjs');
    const { changeReport } = await import('../tools/watch-sources.mjs');
    assert.deepEqual(diffFacts(['a', 'a', 'b'], ['a', 'b', 'c']), { added: ['c'], removed: ['a'] });
    const s = { id: 'x', name: 'Test page', url: 'https://learn.microsoft.com/en-us/azure/virtual-machines/x' };
    const before = { readUtc: '2026-10-16', pageUpdatedUtc: '2026-09-26', facts: ['A :: one', 'A :: two'] };
    const body = changeReport(s, before, { pageUpdatedUtc: '2026-10-20', facts: ['A :: one', 'A :: ask @someone, see #12 `x`'] }, '2026-10-20');
    assert.match(body, /- `A :: ask @someone, see #12 'x'`/, 'page text in a code span: no mention, no link');
    assert.match(body, /source-check-fingerprint: [0-9a-f]{16}/);
    assert.equal(changeReport(s, before, { facts: before.facts }, '2026-10-20'), null, 'no change, no report');
    const many = Array.from({ length: 3000 }, (_, i) => `A :: a long line of text number ${i} that Microsoft changed on the page`);
    assert.ok(changeReport(s, before, { facts: many }, '2026-10-20').length < 65536, 'fits in a GitHub issue');
});

test('every Microsoft Learn page that the data or the code cites is watched', async () => {
    const { SOURCES } = await import('../tools/sources.mjs');
    const watched = new Set(SOURCES.map((s) => s.url.replace('https://learn.microsoft.com/en-us', '').toLowerCase()));
    const files = [...readdirSync(new URL('../data/', import.meta.url)).map((f) => `data/${f}`), ...readdirSync(new URL('../js/', import.meta.url)).map((f) => `js/${f}`)];
    for (const f of files) {
        for (const u of read(f).match(/https:\/\/learn\.microsoft\.com\/[A-Za-z0-9/_.-]+/g) || []) {
            const path = u.replace(/^https:\/\/learn\.microsoft\.com(\/en-us)?/, '').replace(/\/$/, '').toLowerCase();
            assert.ok(watched.has(path), `${f} cites ${u}: add it to tools/sources.mjs`);
        }
    }
    const snapshot = JSON.parse(read('tools/source-snapshot.json'));
    for (const s of SOURCES) assert.ok(snapshot[s.id] && snapshot[s.id].facts.length >= 3, `${s.id} is in the snapshot`);
});

test('a storage or backup appliance is found by its image, its purchase plan or its gallery', async () => {
    const { isStorageAppliance, isAppliance, inManagedApplication } = await import('../js/extras.js');
    assert.equal(isStorageAppliance({ imagePublisher: 'cohesity', imageOffer: 'cohesity-cloudtd-tool' }), true, 'Cohesity DataPlatform Cloud Edition');
    assert.equal(isStorageAppliance({ planPublisher: 'rubrik-inc', planProduct: 'rubrik-cloud-data-management' }), true, 'a purchase plan, with a custom image');
    assert.equal(isStorageAppliance({ imageId: '/communityGalleries/WekaIO-00000000-0000-0000-0000-000000000000/images/weka_custom_image/versions/3.0.0' }), true, "WEKA's gallery");
    assert.equal(isStorageAppliance({ imageId: '/subscriptions/x/resourceGroups/y/providers/Microsoft.Compute/galleries/contoso/images/web' }), false, 'an own gallery image is not an appliance');
    assert.equal(isStorageAppliance({ imagePublisher: 'veeam', imageOffer: 'office365backup' }), false);
    assert.equal(isAppliance({ planPublisher: 'paloaltonetworks', planProduct: 'vmseries-flex' }), true, 'an NVA by its plan');
    assert.equal(inManagedApplication({ managedBy: 'Managed application' }), true);
    const p = run(sample).plan;
    for (const n of ['contoso-rbk01', 'contoso-weka01', 'contoso-coh01', 'contoso-pure01']) assert.equal(F.groupOf(byName(p, n)), 'gate', n);
    assert.equal(byName(p, 'contoso-weka01').short.v6, 'No - storage or backup appliance', 'vendor approval is the first reason');
    assert.equal(byName(p, 'contoso-pure01').short.v6, 'No - managed application');
});

// ---- Reading Azure (0.7.0-beta) ----

test('the size table is rebuilt in its own layout, with the safer value where regions disagree', async () => {
    const { mergeRegions, sizesText, diffSizes } = await import('../tools/azure-sources.mjs');
    // Same table, same text: a refresh changes only the lines that changed.
    const head = read('data/sizes.js').split('export default')[0];
    const lf = (t) => t.replace(/\r\n/g, '\n');
    assert.equal(lf(head + sizesText(sizes.readUtc, sizes.how, sizes)), lf(read('data/sizes.js')));
    const a = { Standard_X2_v9: { family: 'x', capabilities: { vCPUs: '2', MaxNetworkInterfaces: '4', HyperVGenerations: 'V1,V2', PremiumIO: 'True' } } };
    const b = { Standard_X2_v9: { family: 'x', capabilities: { vCPUs: '2', MaxNetworkInterfaces: '2', HyperVGenerations: 'V2', PremiumIO: 'False' } } };
    const m = mergeRegions([a, b]);
    assert.deepEqual(m.sizes.Standard_X2_v9.capabilities, { vCPUs: '2', PremiumIO: 'False', HyperVGenerations: 'V2', MaxNetworkInterfaces: '2' });
    assert.deepEqual(m.differsByRegion, ['Standard_X2_v9']);
    assert.deepEqual(diffSizes(a, { ...b, Standard_Y1: b.Standard_X2_v9 }), [
        'Added: Standard_Y1', 'Changed: Standard_X2_v9 HyperVGenerations V1,V2 -> V2',
        'Changed: Standard_X2_v9 MaxNetworkInterfaces 4 -> 2', 'Changed: Standard_X2_v9 PremiumIO True -> False']);
});

test('the Marketplace check reports new offers and possible new vendors, but not reviewed ones', async () => {
    const { catalogFindings } = await import('../tools/azure-sources.mjs');
    const list = { vendors: [{ vendor: 'Contoso Storage', publisher: 'contoso', offers: ['vault*'] }], reviewed: ['contoso/vault-console-ignored'], notVendors: ['contoso.backup.extension'] };
    const lines = catalogFindings(list, {
        allPublishers: ['contoso', 'contoso.backup.extension', 'fabrikam-backup', 'canonical'],
        offers: { contoso: ['vault-edge', 'vault-console-ignored', 'vaultfs-new', 'monitor'] },
    });
    assert.deepEqual(lines, ['New offer to review: Contoso Storage: contoso/monitor', 'Possible new vendor: publisher fabrikam-backup']);
});

test('an Azure error never puts the subscription ID in an issue, and "not a vendor" publishers are checked again', async () => {
    const { safePath, catalogFindings } = await import('../tools/azure-sources.mjs');
    assert.equal(safePath('/subscriptions/00000000-0000-0000-0000-000000000000/providers/Microsoft.Compute/skus?api-version=2021-07-01&$filter=x'),
        '/subscriptions/<subscription>/providers/Microsoft.Compute/skus');
    const lines = catalogFindings({ vendors: [], reviewed: ['contoso.ext/old'], notVendors: ['contoso.ext'] },
        { allPublishers: ['contoso.ext'], offers: { 'contoso.ext': ['old', 'new-appliance'] } });
    assert.deepEqual(lines, ['New image from a publisher marked "not a vendor": contoso.ext/new-appliance']);
});

// ---- Mutation checks: each rule below had no test that failed when the rule broke ----

// The size table with some facts changed: { size: { capability: value } }. A value of
// undefined removes that capability; null removes the size.
function tableWith(changes) {
    const out = {};
    for (const [name, s] of Object.entries(sizes.sizes)) {
        if (changes[name] === null) continue;
        const capabilities = { ...s.capabilities };
        for (const [k, v] of Object.entries(changes[name] || {})) { if (v === undefined) delete capabilities[k]; else capabilities[k] = v; }
        out[name] = { ...s, capabilities };
    }
    return new SizeTable(out);
}
function runWith(text, t) {
    const list = readList(text);
    return plan(list.rows.map((r, i) => toMachine(r, list.map, i + 2, t, NOW)), t, NOW);
}
const rowOf = (m, series) => m.rows.find((r) => r.series === series);

test('the lifecycle stage: a size is Retired from its retirement day, and End of Life before it', async () => {
    const { currentStage } = await import('../js/planner.js');
    assert.equal(currentStage('Standard_D4_v2', table, new Date('2028-04-30T12:00:00Z')).stage, 'End of Life');
    assert.equal(currentStage('Standard_D4_v2', table, new Date('2028-05-01T12:00:00Z')).stage, 'Retired', 'on the day');
    assert.equal(currentStage('Standard_D4_v2', table, new Date('2028-06-01T00:00:00Z')).stage, 'Retired');
    // The first sizes have no version in the name: for the stage they are v1.
    const { sizeLifecycleStage } = await import('../js/lifecycle.js');
    assert.equal(sizeLifecycleStage('Standard_D2').stage, 'End of Life');
    assert.equal(lifecycleChange('Standard_D2', 'Standard_D2s_v6'), 'up');
});

test('a VM on a retired size is outside the tool from one day before the retirement day', async () => {
    const { sizeRetiredForTool } = await import('../js/lifecycle.js');
    assert.equal(sizeRetiredForTool('Standard_D4_v2', new Date('2028-04-29T00:00:00Z')), false);
    assert.equal(sizeRetiredForTool('Standard_D4_v2', new Date('2028-04-30T00:00:00Z')), true);
    const m = toMachine(['contoso-a1', 'Standard_A1', 'V2'], { 'VM name': 0, 'Current size': 1, 'Generation': 2 }, 2, table, NOW);
    assert.ok(m.vm.blockers.includes('size-retired'));
});

test('a reason code that this tool does not know is "not checked", never a no', () => {
    const list = readList('VM name,Current size,Generation,OS\ncontoso-u1,Standard_D4s_v3,V2,Linux\n');
    const m = toMachine(list.rows[0], list.map, 2, table, NOW);
    m.vm.blockers.push('a-new-reason');
    const p = plan([m], table, NOW);
    for (const s of ['v5', 'v6', 'v7']) assert.equal(rowOf(p.machines[0], s).result, 'Needs team review', s);
});

test('a size that is supported, but with a limit the table does not give, is not checked', () => {
    const t = tableWith({ Standard_D4ds_v5: { MaxNetworkInterfaces: undefined } });
    const m = runWith('VM name,Current size,Generation,OS,NIC count\ncontoso-u2,Standard_D4s_v3,V2,Linux,2\n', t).machines[0];
    const v5 = rowOf(m, 'v5');
    assert.equal(v5.result, 'Needs team review');
    assert.deepEqual(v5.reviewWhy, ['target-not-in-table']);
});

test('a VM that must move, with only some options outside the tool, is not checked', () => {
    // v6 and v7: Generation 1 (outside the tool). v5: no size holds 64 data disks (a fact).
    const m = run('VM name,Current size,Generation,OS,NIC count,Data-disk count\ncontoso-q,Standard_D4s_v3,V1,Linux,1,64\n').plan.machines[0];
    assert.equal(m.outcome, 'Needs team review');
    assert.equal(m.short.v5, 'No fitting size (data disks)');
});

test('the results keep the order of the list', () => {
    const p = run(sample).plan;
    const rows = p.machines.map((m) => m.read.row);
    assert.deepEqual(rows, [...rows].sort((a, b) => a - b));
    assert.equal(p.machines[0].read.name, 'contoso-web01');
});

test('Generation 1: v6 and v7 need Generation 2; a Trusted launch VM must be Generation 2', () => {
    const p = run('VM name,Current size,Generation,OS,Security type\ncontoso-g1,Standard_A2_v2,V1,Linux,\ncontoso-g2,Standard_D4s_v3,1,Linux,TrustedLaunch\ncontoso-g3,Standard_D4s_v3,,Linux,TrustedLaunch\n').plan;
    const g1 = byName(p, 'contoso-g1');
    assert.deepEqual([g1.short.v6, g1.short.v7], ['No - needs Gen2', 'No - needs Gen2']);
    const g2 = byName(p, 'contoso-g2');
    assert.deepEqual(g2.problems.map((x) => x.why), ['generation-conflicts-with-security-type']);
    assert.equal(g2.outcome, 'Needs team review');
    assert.equal(byName(p, 'contoso-g3').vm.gen, 'V2', 'Trusted launch runs on Generation 2 only');
});

test('a Promo size is read as its size; a negative count is not a number', async () => {
    const { readSizeName, readCount } = await import('../js/planner.js');
    assert.equal(readSizeName('Standard_DS3_v2_Promo', table).size, 'Standard_DS3_v2');
    assert.deepEqual(readCount('-1').value, null);
    assert.ok(readCount('-1').note);
});

test('an HPC size says HPC, not "no size in this family"', () => {
    assert.equal(byName(run(sample).plan, 'contoso-hpc01').short.v6, 'No - HPC/FPGA out of scope');
});

test('a VM with no vCPUs and memory in the size table: no guess at a larger size', () => {
    // Standard_D4_v2: the number is not the vCPU count.
    const t = tableWith({ Standard_D4_v2: { vCPUs: undefined, vCPUsAvailable: undefined, MemoryGB: undefined } });
    const m = runWith('VM name,Current size,Generation,OS\ncontoso-s1,Standard_D4_v2,V2,Linux\n', t).machines[0];
    assert.deepEqual(rowOf(m, 'v5').codes, ['shape-unknown']);
    assert.equal(rowOf(m, 'v5').result, 'Needs team review');
    // A VM whose shape is not known gets no other ranked sizes: none can be shown not smaller.
    const t2 = tableWith({ Standard_D4s_v3: { vCPUs: undefined, vCPUsAvailable: undefined, MemoryGB: undefined } });
    const m2 = runWith('VM name,Current size,Generation,OS\ncontoso-s2,Standard_D4s_v3,V2,Linux\n', t2).machines[0];
    const v6 = rowOf(m2, 'v6');
    assert.equal(v6.result, 'Supported');
    assert.deepEqual(rankedSizes(m2.vm, t2, v6.option, NOW).map((x) => x.size), [v6.option.targetSize]);
});

test('the target must hold the VM: not smaller, enough NICs and data disks, and its generation', () => {
    const small = tableWith({ Standard_D4ds_v5: { MemoryGB: '8' }, Standard_D4s_v5: { MemoryGB: '8' } });
    assert.equal(runWith('VM name,Current size,Generation,OS\ncontoso-t1,Standard_D4s_v3,V2,Linux\n', small).machines[0].short.v5, 'No fitting size');
    const p = run('VM name,Current size,Generation,OS,NIC count,Data-disk count\ncontoso-t2,Standard_D2s_v3,V2,Linux,4,0\ncontoso-t3,Standard_D2s_v3,V2,Linux,1,10\n').plan;
    assert.equal(byName(p, 'contoso-t2').short.v5, 'No fitting size (NICs)');
    assert.equal(byName(p, 'contoso-t3').short.v5, 'No fitting size (data disks)');
    const gen2Only = tableWith({ Standard_D4ds_v5: { HyperVGenerations: 'V2' }, Standard_D4s_v5: { HyperVGenerations: 'V2' } });
    const g = runWith('VM name,Current size,Generation,OS\ncontoso-t4,Standard_D4s_v3,V1,Linux\n', gen2Only).machines[0];
    const v5 = rowOf(g, 'v5').option.targetSize;
    assert.ok(v5 && gen2Only.get(v5).caps.HyperVGenerations.split(',').includes('V1'), `${v5} takes Generation 1`);
});

test('the temporary disk is read from the size name when the table does not give it', async () => {
    const { diskArchitecture } = await import('../js/lifecycle.js');
    assert.equal(diskArchitecture('Standard_D4ds_v5', null), 'scsi-temp');
    assert.equal(diskArchitecture('Standard_D4ds_v6', null), 'nvme-temp');
    assert.equal(diskArchitecture('Standard_D4s_v6', null), 'diskless');
});

test('a Windows VM whose temporary disk changes type: a resize with the preview feature, never a rebuild', () => {
    const rows = F.targetRows(run(sample).plan, table, NOW).filter((r) => r['VM name'] === 'contoso-web01' && r['Region'] === 'eastus2');
    // 0.9.5-beta: the tool never recommends a rebuild. The column stays, and says No.
    assert.deepEqual(rows.map((r) => r['Rebuild']), ['No', 'No', 'No']);
    assert.deepEqual(rows.map((r) => r['Preview feature']), ['Not needed', 'Needed', 'Needed'], 'v5 keeps a SCSI temporary disk; v6 and v7 have none');
    assert.equal(rowOf(byName(run(sample).plan, 'contoso-web01'), 'v6').option.rebuild, undefined, 'no rebuild flag');
    // A v5 size with a temporary disk, for a VM without one (a changed table): a resize
    // with the feature. Azure Disk Encryption: no size that keeps the temporary disk type.
    const t = tableWith({ Standard_D4s_v5: { MaxResourceVolumeMB: '153600' } });
    const head = 'VM name,Current size,Generation,OS,Azure Disk Encryption';
    const p = runWith(`${head}\ncontoso-r1,Standard_D4s_v4,V2,Windows,No\ncontoso-r2,Standard_D4s_v4,V2,Windows,Yes\ncontoso-r3,Standard_D4s_v4,V2,,Yes\ncontoso-r4,Standard_D4s_v4,V2,Linux,Yes\n`, t);
    const r1 = rowOf(byName(p, 'contoso-r1'), 'v5');
    assert.deepEqual([r1.result, r1.option.targetSize, r1.option.previewFeature, r1.option.featureFallback], ['Supported', 'Standard_D4s_v5', 'needed', { size: null }]);
    const r2 = rowOf(byName(p, 'contoso-r2'), 'v5');
    assert.deepEqual([r2.codes, r2.result], [['disk-encryption-preview'], 'Not supported by design']);
    assert.deepEqual(rowOf(byName(p, 'contoso-r3'), 'v5').codes, ['os-unknown-encryption'], 'unknown OS: not checked');
    assert.equal(rowOf(byName(p, 'contoso-r3'), 'v5').result, 'Needs team review');
    assert.deepEqual([rowOf(byName(p, 'contoso-r4'), 'v5').result, rowOf(byName(p, 'contoso-r4'), 'v5').option.previewFeature], ['Supported', 'not-needed'], 'Linux needs no feature');
});

test('ranked sizes: none smaller than the VM, none that loses Azure Disk Encryption, five at most', () => {
    const t = tableWith({ Standard_D4ads_v6: { MemoryGB: '4' } });
    const m = runWith('VM name,Current size,Generation,OS\ncontoso-k1,Standard_D4s_v3,V2,Linux\n', t).machines[0];
    const v6 = rowOf(m, 'v6');
    assert.ok(!rankedSizes(m.vm, t, v6.option, NOW).some((x) => x.size === 'Standard_D4ads_v6'), 'a smaller size is not ranked');
    const w = run('VM name,Current size,Generation,OS,Azure Disk Encryption\ncontoso-k2,Standard_D4s_v3,V2,Windows,Yes\n').plan.machines[0];
    const v5 = rowOf(w, 'v5');
    assert.ok(!rankedSizes(w.vm, table, v5.option, NOW).some((x) => x.size === 'Standard_D4s_v5'), 'no temporary disk: on Windows the preview feature, which this tool does not plan with Azure Disk Encryption');
    assert.ok(rankedSizes({ ...w.vm, os: 'Linux' }, table, v5.option, NOW).some((x) => x.size === 'Standard_D4s_v5'), 'the fixture: Linux gets it');
    // These VMs have more than five sizes that fit on v5.
    for (const [n, gen] of [['Standard_D2_v2', 'V2'], ['Standard_D16_v3', 'V1']]) {
        const a = run(`VM name,Current size,Generation,OS\ncontoso-k3,${n},${gen},Linux\n`).plan.machines[0];
        assert.equal(rankedSizes(a.vm, table, rowOf(a, 'v5').option, NOW).length, 5, n);
    }
});

test('the burstable size takes the generation and the NICs of the VM', () => {
    const t = tableWith({ Standard_B2ls_v2: { HyperVGenerations: 'V2' } });
    const g = runWith('VM name,Current size,Generation,OS\ncontoso-b5,Standard_A2_v2,V1,Linux\n', t).machines[0];
    assert.notEqual(g.short.burstable, 'Standard_B2ls_v2');
    assert.match(g.short.burstable, /^Standard_B/);
    const n = run('VM name,Current size,Generation,OS,NIC count\ncontoso-b6,Standard_B2ms,V2,Linux,3\n').plan.machines[0];
    assert.notEqual(n.short.burstable, 'Standard_B2ls_v2', 'Standard_B2ls_v2 holds 2 NICs');
    assert.ok(Number(table.get(n.short.burstable).caps.MaxNetworkInterfaces) >= 3);
});

test('NVMe support: Windows Server 2019, rolling and interim images, CentOS', () => {
    assert.equal(imageSupportsNvme('MicrosoftWindowsServer', 'WindowsServer', '2019-datacenter-gensecond'), true);
    assert.equal(imageSupportsNvme('Canonical', '0001-com-ubuntu-server-mantic', '23_10'), null, 'an interim Ubuntu: not on the list either way');
    assert.equal(imageSupportsNvme('RedHat', 'RHEL', '9-lvm-gen2'), true, 'a rolling RHEL 9 image');
    assert.equal(imageSupportsNvme('OpenLogic', 'CentOS', '7_9'), false);
});

test('notes: a new VM on v6 and v7 gets a new identity; unknown accelerated networking is "check"', () => {
    const m = run('VM name,Current size,Generation,OS,System-assigned identity\ncontoso-i1,Standard_D4s_v3,V2,Linux,Yes\n').plan.machines[0];
    assert.equal(rowOf(m, 'v6').caveats['Identity'].state, 'problem');
    assert.equal(rowOf(m, 'v5').caveats['Accelerated networking'].state, 'check', 'the new size needs it, and the list does not say');
});

// 0.9.3-beta (owner, 2026-11-06): a system-assigned identity has the life cycle of its
// VM. v6 and v7 have two methods (deploy in parallel: a new VM; change the size of the
// current VM: the same VM), so the note gives both. A rebuild is a new VM. A resize keeps it.
const IDENTITY_PARALLEL = '"System-assigned identity" is Yes. If you deploy a new VM in parallel, record the role assignments of the system-assigned identity. A new VM gets a new identity: add them to it again. If you change the size of the current VM, the VM keeps its identity.';
// A new VM: a pool or a service makes new nodes (0.9.4-beta words, kept).
const IDENTITY_NEW_VM = '"System-assigned identity" is Yes. Record the role assignments of the system-assigned identity. A new VM gets a new identity: add them to it again.';
test('notes: the identity note follows the method of each series (v6 and v7 both methods, a resize nothing)', () => {
    const head = 'VM name,Current size,Generation,OS,System-assigned identity\n';
    const p = run(`${head}contoso-i2,Standard_B2ms,V2,Windows,Yes\ncontoso-i3,Standard_B2ms,V2,Linux,Yes\ncontoso-i4,Standard_D4s_v3,V2,,Yes\n`).plan;
    const win = byName(p, 'contoso-i2');
    for (const s of ['v6', 'v7']) {
        const c = rowOf(win, s).caveats['Identity'];
        assert.deepEqual([c.state, c.text], ['problem', IDENTITY_PARALLEL], s);
        assert.match(c.text, /If you deploy a new VM in parallel, /);
        assert.match(c.text, /If you change the size of the current VM, the VM keeps its identity\.$/);
    }
    // 0.9.5-beta: Burstable (B2s_v2, no temporary disk) is a resize with the preview
    // feature, and v5 a plain resize. Both keep the VM: no note.
    assert.equal(rowOf(win, 'burstable').option.previewFeature, 'needed', 'the fixture: Burstable needs the feature');
    for (const s of ['v5', 'burstable']) assert.deepEqual(rowOf(win, s).caveats['Identity'], { state: '', text: '' }, `${s}: a resize keeps the identity`);
    const ids = F.allNotes(win).actions.filter((x) => x.topic === 'Identity');
    assert.deepEqual(ids.map((x) => [x.text, x.series]), [[IDENTITY_PARALLEL, ['v6', 'v7']]]);
    // Generation 1: the same resize as Generation 2.
    const gen1 = byName(run(`${head}contoso-i5,Standard_B2ms,V1,Windows,Yes\n`).plan, 'contoso-i5');
    assert.deepEqual(rowOf(gen1, 'burstable').caveats['Identity'], { state: '', text: '' });
    // Linux: v5 and Burstable are a resize.
    const linux = byName(p, 'contoso-i3');
    for (const s of ['v5', 'burstable']) assert.deepEqual(rowOf(linux, s).caveats['Identity'], { state: '', text: '' }, s);
    assert.equal(rowOf(linux, 'v6').caveats['Identity'].text, IDENTITY_PARALLEL);
    // No OS in the list: v6 and v7 still give both methods; v5 is a resize on any OS.
    const noOs = byName(p, 'contoso-i4');
    assert.equal(rowOf(noOs, 'v7').caveats['Identity'].text, IDENTITY_PARALLEL);
    assert.deepEqual(rowOf(noOs, 'v5').caveats['Identity'], { state: '', text: '' });
    // The method of the option decides it: v5 with the feature is still a resize.
    const vm = { os: 'Windows', sourceSize: 'Standard_D4s_v3', sourceDiskArch: 'scsi-temp' };
    const base = { targetSize: 'Standard_D4s_v5', targetDiskArch: 'diskless', acceleratedNetworking: {} };
    assert.deepEqual(caveats(vm, { systemIdentity: true }, { ...base, option: 'v5', previewFeature: 'needed' })['Identity'], { state: '', text: '' });
    // A pool makes new nodes: the new-VM words where 0.9.4-beta had them (Windows, the temporary disk changes type).
    assert.equal(caveats(vm, { systemIdentity: true }, { ...base, option: 'v5', previewFeature: null }, true)['Identity'].text, IDENTITY_NEW_VM);
    assert.deepEqual(caveats(vm, { systemIdentity: true }, { ...base, targetDiskArch: 'scsi-temp', option: 'v5', previewFeature: null }, true)['Identity'], { state: '', text: '' });
    assert.deepEqual(caveats({ ...vm, os: 'Linux' }, { systemIdentity: true }, { ...base, option: 'v5', previewFeature: null }, true)['Identity'], { state: '', text: '' }, 'a Linux pool: as in 0.9.4-beta');
    assert.equal(caveats(vm, { availabilitySet: true }, { ...base, option: 'burstable', previewFeature: null }, true)['Availability set'].text, '"Availability set" is Yes. Azure adds a VM to an availability set only when it creates the VM. Deploy the new VM into the set.');
    assert.deepEqual(caveats(vm, { systemIdentity: true }, { ...base, option: 'v5', previewFeature: 'needed' }, false)['Identity'], { state: '', text: '' }, 'not a pool: a resize');
    assert.equal(caveats(vm, { systemIdentity: true }, { ...base, targetSize: 'Standard_D4ds_v6', targetDiskArch: 'nvme-temp', option: 'v6', previewFeature: 'needed' })['Identity'].text, IDENTITY_PARALLEL);
});

// 0.9.5-beta (owner, 2026-11-06 and 2026-11-07): the tool never recommends a rebuild.
// Measured in lab tests, 2026-11-01 to 2026-11-07: a Windows VM on a size with a SCSI
// temporary disk resizes in place to a size without one (every v6 and v7 size counts as
// "without one") only with the preview feature VMTempDiskResizePreview, on Generation 1
// and Generation 2. A size with no temporary disk resizes to any v6 or v7 size with no
// feature. Linux never needs it.
const FEATURE = 'The resize needs the preview feature VMTempDiskResizePreview, registered on the subscription. Move the page file from the temporary disk to C: before the resize.';
const FEATURE_NO_OS = 'On a Windows VM, the resize needs the preview feature VMTempDiskResizePreview, registered on the subscription. On Windows, move the page file from the temporary disk to C: before the resize.';
const FEATURE_UNKNOWN = 'The size table does not give the temporary disk of each size. This tool cannot tell if a Windows VM needs the preview feature VMTempDiskResizePreview for this resize.';
const FALLBACK_SIZE = (s) => `Without the feature, resize to ${s}.`;
const FALLBACK_NONE = 'Without the feature, this tool finds no v5 size of this shape that keeps the temporary disk type.';
const FALLBACK_V5 = (s) => `Without the feature, use the v5 size ${s}.`;
const FALLBACK_NO_V5 = 'Without the feature, this tool finds no other size for a resize.';
const FEATURE_TODO = (size, fallback) => `Resize to ${size}. First register the preview feature VMTempDiskResizePreview on the subscription. ${fallback}`;
const FEATURE_TODO_NO_OS = (size, fallback) => `Resize to ${size}. On a Windows VM, first register the preview feature VMTempDiskResizePreview on the subscription. ${fallback}`;
const COLUMN = { needed: 'Needed', notNeeded: 'Not needed', noOs: 'Not checked. Needed on Windows.', unknown: 'Not checked. The size table does not give the temporary disk.' };
// 0.9.4-beta: each method in the same words. 0.9.5-beta: v5 and Burstable are only a resize.
const AVSET_PARALLEL = 'put the new VM in the same availability set when you create it. Azure cannot add an existing VM to a set.';
const AVSET_IN_PLACE = 'the VM stays in its set. You can resize the VMs one at a time. If Azure does not offer the new size for this set, stop (deallocate) all the VMs in the set first.';
const AVSET_BOTH = `"Availability set" is Yes. If you deploy a new VM in parallel: ${AVSET_PARALLEL} If you change the size of the current VM: ${AVSET_IN_PLACE}`;
const AVSET_STAYS = '"Availability set" is Yes. The VM stays in its set. You can resize the VMs one at a time. If Azure does not offer the new size for this set, stop (deallocate) all the VMs in the set first.';
const AVSET_NEW_VM = '"Availability set" is Yes. Azure adds a VM to an availability set only when it creates the VM. Deploy the new VM into the set.';
const B = 'Burstable (Bsv2, Basv2)';
const PARALLEL = 'Deploy a new VM at this size in parallel, move the workload, then delete the old VM. Microsoft highly recommends this for v6 and v7. You can also change the size of the current VM, but that has more steps and more risk.';
const RESIZE = 'Resize the current VM. Azure supports a resize to this size.';
const POOL = (m) => ['A', 'B', 'C', 'D'].includes(m.pattern);
const TWO_WAYS_WORDS = 'Two ways: deploy a new VM in parallel (Microsoft recommends this), or change the size of this VM.';

test('the preview feature: each word, and the rule for each fact (made-up facts)', async () => {
    const W = await import('../js/words.js');
    const { previewFeature } = await import('../js/lifecycle.js');
    const PAR = 'Deploy a new VM at this size in parallel, move the workload, then delete the old VM. Microsoft highly recommends this for v6 and v7. You can also change the size of the current VM, but that has more steps and more risk.';
    const RES = 'Resize the current VM. Azure supports a resize to this size.';
    for (const s of ['v6', 'v7']) {
        assert.equal(W.moveWords(s, 'needed'), `${PAR} ${FEATURE}`);
        assert.equal(W.moveWords(s, 'windows'), `${PAR} ${FEATURE_NO_OS}`);
        assert.equal(W.moveWords(s, 'unknown'), `${PAR} ${FEATURE_UNKNOWN}`);
        for (const f of ['not-needed', null, undefined]) assert.equal(W.moveWords(s, f), PAR, String(f));
    }
    assert.equal(W.moveWords('v5', 'needed', { size: 'Standard_D4ds_v5' }), `Resize the current VM. ${FEATURE} ${FALLBACK_SIZE('Standard_D4ds_v5')}`);
    assert.equal(W.moveWords('v5', 'needed', { size: null }), `Resize the current VM. ${FEATURE} ${FALLBACK_NONE}`);
    assert.equal(W.moveWords('v5', 'windows', { size: 'Standard_D4ds_v5' }), `Resize the current VM. ${FEATURE_NO_OS} ${FALLBACK_SIZE('Standard_D4ds_v5')}`);
    assert.equal(W.moveWords('burstable', 'needed', { size: 'Standard_D2ds_v5' }), `Resize the current VM. ${FEATURE} ${FALLBACK_V5('Standard_D2ds_v5')}`);
    assert.equal(W.moveWords('burstable', 'windows', { size: null }), `Resize the current VM. ${FEATURE_NO_OS} ${FALLBACK_NO_V5}`);
    for (const s of ['v5', 'burstable']) {
        assert.equal(W.moveWords(s, 'unknown'), `Resize the current VM. ${FEATURE_UNKNOWN}`);
        assert.equal(W.moveWords(s, 'unknown', { size: 'Standard_D4ds_v5' }), `Resize the current VM. ${FEATURE_UNKNOWN}`, 'a fallback only with the feature');
        assert.equal(W.moveWords(s, 'not-needed', { size: 'Standard_D4ds_v5' }), RES);
        for (const f of ['not-needed', null, undefined]) assert.equal(W.moveWords(s, f), RES, `${s} ${f}`);
    }
    // No word "rebuild" in any move.
    for (const s of ['v5', 'v6', 'v7', 'burstable']) for (const f of ['needed', 'windows', 'unknown', 'not-needed', null]) for (const fb of [null, { size: null }, { size: 'Standard_D4ds_v5' }]) assert.doesNotMatch(W.moveWords(s, f, fb), /rebuild/i);
    assert.equal(W.featureColumn('needed'), COLUMN.needed);
    assert.equal(W.featureColumn('not-needed'), COLUMN.notNeeded);
    assert.equal(W.featureColumn('windows'), COLUMN.noOs);
    assert.equal(W.featureColumn('unknown'), COLUMN.unknown);
    assert.equal(W.featureColumn(null), '');

    // The rule: Windows (or no OS), and a SCSI temporary disk on one side only.
    const opt = (targetDiskArch, tempDiskChange = true, supported = true) => ({ supported, targetSize: 'Standard_X', targetDiskArch, tempDiskChange });
    const vm = (os, sourceDiskArch) => ({ os, sourceDiskArch });
    assert.equal(previewFeature(vm('Windows', 'scsi-temp'), opt('diskless')), 'needed');
    assert.equal(previewFeature(vm('Windows', 'scsi-temp'), opt('nvme-temp')), 'needed', 'every v6 and v7 size counts as no temporary disk');
    assert.equal(previewFeature(vm('Windows', 'nvme-temp'), opt('scsi-temp')), 'needed', 'the other direction too');
    assert.equal(previewFeature(vm('Windows', 'diskless'), opt('scsi-temp')), 'needed', 'no temporary disk to a SCSI one');
    assert.equal(previewFeature(vm('Windows', 'diskless'), opt('nvme-temp')), 'not-needed', 'no temporary disk to an NVMe one: measured 2026-11-07');
    assert.equal(previewFeature(vm('Windows', 'nvme-temp'), opt('diskless')), 'not-needed');
    assert.equal(previewFeature(vm('Windows', 'scsi-temp'), opt('scsi-temp', false)), 'not-needed', 'same kind');
    assert.equal(previewFeature(vm('Windows', 'diskless'), opt('diskless', false)), 'not-needed');
    assert.equal(previewFeature(vm('Linux', 'scsi-temp'), opt('nvme-temp')), 'not-needed', 'Linux never needs it');
    assert.equal(previewFeature(vm('Linux', 'scsi-temp'), opt('nvme-temp', null)), 'not-needed', 'Linux, also when the table cannot tell');
    assert.equal(previewFeature(vm('', 'scsi-temp'), opt('diskless')), 'windows', 'no OS: on Windows');
    assert.equal(previewFeature(vm('', 'scsi-temp'), opt('scsi-temp', false)), 'not-needed');
    assert.equal(previewFeature(vm('Windows', 'scsi-temp'), opt('scsi-temp', null)), 'unknown', 'unknown is never a pass');
    assert.equal(previewFeature(vm('', 'scsi-temp'), opt('diskless', null)), 'unknown');
    assert.equal(previewFeature(vm('Windows', 'scsi-temp'), opt('diskless', true, false)), null, 'no supported size');
    assert.equal(previewFeature({ ...vm('Windows', 'scsi-temp'), gen: 'V1' }, opt('diskless')), 'needed', 'Generation 1 the same as Generation 2');
    assert.equal(previewFeature({ ...vm('Windows', 'scsi-temp'), gen: 'V2', genAssumed: true }, opt('diskless')), 'needed', 'the pool rule, not this one, decides for a service');
});

test('the preview feature on each row type: Burstable and v6 and v7, Generation 1 and 2, Linux, no OS, a pool', async () => {
    const { todo } = await import('../js/details.js');
    const head = 'VM name,Current size,Generation,OS,System-assigned identity,Availability set,Azure Disk Encryption,Managed by,Resource type\n';
    const text = `${head}contoso-n2,Standard_B2ms,V2,Windows,Yes,Yes,No,None,VM\ncontoso-n1,Standard_B2ms,V1,Windows,Yes,Yes,No,None,VM\n`
        + 'contoso-nl,Standard_B2ms,V2,Linux,Yes,Yes,No,None,VM\ncontoso-nu,Standard_B2ms,V2,,Yes,Yes,No,None,VM\n'
        + 'contoso-nw,Standard_D4s_v3,V2,Windows,Yes,Yes,No,None,VM\ncontoso-nd,Standard_D4s_v4,V2,Windows,Yes,Yes,No,None,VM\n'
        + 'contoso-na,Standard_B2ms,,Windows,Yes,Yes,No,AKS,VM\ncontoso-ns,Standard_B2ms,V2,Windows,Yes,Yes,No,None,Scale set\n';
    const p = run(text).plan;
    const all = F.targetRows(p, table, NOW);
    const col = (name, series, c) => all.find((r) => r['VM name'] === name && r['Series'] === series)[c];

    // Windows on B2ms (a SCSI temporary disk), Generation 2 and Generation 1 the same:
    // Burstable (no temporary disk) needs the feature, v5 keeps a temporary disk.
    for (const name of ['contoso-n2', 'contoso-n1']) {
        const m = byName(p, name);
        const b = rowOf(m, 'burstable');
        const v5 = rowOf(m, 'v5').option.targetSize;
        assert.match(v5, /^Standard_[A-Z]\d+[a-z]*d[a-z]*_v5$/, `${name}: the v5 size has a temporary disk`);
        assert.deepEqual([b.result, b.option.targetSize, b.option.previewFeature, b.option.featureFallback], ['Supported', 'Standard_B2s_v2', 'needed', { size: v5 }], name);
        assert.equal(col(name, B, 'How to move'), `Resize the current VM. ${FEATURE} ${FALLBACK_V5(v5)}`, name);
        assert.equal(col(name, 'v5', 'How to move'), 'Resize the current VM. Azure supports a resize to this size.', name);
        assert.deepEqual(['v5', B].map((s) => col(name, s, 'Rebuild')), ['No', 'No'], name);
        assert.deepEqual(['v5', B].map((s) => col(name, s, 'Preview feature')), [COLUMN.notNeeded, COLUMN.needed], name);
        assert.equal(F.likelyRow(m).series, 'burstable');
        assert.equal(todo(m, F.groupOf(m)).main, FEATURE_TODO('Standard_B2s_v2', FALLBACK_V5(v5)), name);
        assert.deepEqual(b.caveats['Identity'], { state: '', text: '' }, `${name}: a resize keeps the identity`);
        assert.deepEqual([b.caveats['Availability set'].state, b.caveats['Availability set'].text], ['attention', AVSET_STAYS], name);
        assert.equal(rowOf(m, 'v5').caveats['Availability set'].text, AVSET_STAYS, name);
    }
    // Generation 2 only: v6 and v7 (Generation 1 has no v6 or v7 size).
    for (const s of ['v6', 'v7']) {
        assert.equal(col('contoso-n2', s, 'How to move'), `${PARALLEL} ${FEATURE}`, s);
        assert.equal(col('contoso-n2', s, 'Preview feature'), COLUMN.needed, s);
        assert.equal(rowOf(byName(p, 'contoso-n1'), s).option.supported, false, `Generation 1 ${s}`);
    }
    // Linux: never the feature.
    for (const s of ['v5', 'v6', 'v7', B]) {
        assert.doesNotMatch(col('contoso-nl', s, 'How to move'), /VMTempDiskResizePreview/, s);
        assert.equal(col('contoso-nl', s, 'Preview feature'), COLUMN.notNeeded, s);
    }
    // No OS: "On a Windows VM".
    const nuV5 = rowOf(byName(p, 'contoso-nu'), 'v5').option.targetSize;
    assert.equal(col('contoso-nu', B, 'How to move'), `Resize the current VM. ${FEATURE_NO_OS} ${FALLBACK_V5(nuV5)}`);
    assert.equal(col('contoso-nu', 'v6', 'How to move'), `${PARALLEL} ${FEATURE_NO_OS}`);
    assert.deepEqual(['v5', 'v6', B].map((s) => col('contoso-nu', s, 'Preview feature')), [COLUMN.notNeeded, COLUMN.noOs, COLUMN.noOs]);
    assert.deepEqual(['v5', 'v6', B].map((s) => col('contoso-nu', s, 'Rebuild')), ['No', 'No', 'No']);
    const nu = byName(p, 'contoso-nu');
    assert.equal(todo(nu, F.groupOf(nu)).main, FEATURE_TODO_NO_OS('Standard_B2s_v2', FALLBACK_V5(nuV5)));
    // Windows on a v3 size with a SCSI temporary disk: v6 and v7 need it, v5 (a d size) not.
    assert.deepEqual(['v5', 'v6', 'v7'].map((s) => col('contoso-nw', s, 'Preview feature')), [COLUMN.notNeeded, COLUMN.needed, COLUMN.needed]);
    // Windows with no temporary disk (D4s_v4): never the feature.
    assert.deepEqual(['v5', 'v6', 'v7'].map((s) => col('contoso-nd', s, 'Preview feature')), [COLUMN.notNeeded, COLUMN.notNeeded, COLUMN.notNeeded]);
    for (const s of ['v5', 'v6', 'v7']) assert.doesNotMatch(col('contoso-nd', s, 'How to move'), /VMTempDiskResizePreview/, s);
    // A pool or a service (and the generation that this tool assumed for AKS): the pool
    // advice, no feature, and the new-VM notes of 0.9.4-beta.
    for (const name of ['contoso-na', 'contoso-ns']) {
        const m = byName(p, name);
        assert.ok(POOL(m), `${name}: the fixture is a pool or a service`);
        const b = rowOf(m, 'burstable');
        assert.deepEqual([b.result, b.option.previewFeature, b.option.featureFallback], ['Supported', null, null], name);
        assert.equal(col(name, B, 'Rebuild'), 'No', name);
        assert.equal(col(name, B, 'Preview feature'), '', name);
        assert.ok(!col(name, B, 'How to move').includes('VMTempDiskResizePreview'), name);
        assert.equal(b.caveats['Identity'].text, IDENTITY_NEW_VM, name);
        assert.equal(b.caveats['Availability set'].text, AVSET_NEW_VM, name);
    }
    assert.equal(byName(p, 'contoso-na').vm.genAssumed, true);
    // Burstable: the v5 size is the way without the feature only when it needs no feature
    // itself (a changed table where the v5 size loses its SCSI temporary disk).
    const v5size = rowOf(byName(p, 'contoso-n2'), 'v5').option.targetSize;
    const t = tableWith({ [v5size]: { MaxResourceVolumeMB: '0' } });
    const q = runWith('VM name,Current size,Generation,OS\ncontoso-nq,Standard_B2ms,V2,Windows\n', t).machines[0];
    assert.equal(rowOf(q, 'v5').option.previewFeature, 'needed', 'the fixture: v5 needs the feature too');
    assert.deepEqual(rowOf(q, 'burstable').option.featureFallback, { size: null });
    assert.equal(F.targetRows(runWith('VM name,Current size,Generation,OS\ncontoso-nq,Standard_B2ms,V2,Windows\n', t), t, NOW).find((r) => r['Series'] === B)['How to move'], `Resize the current VM. ${FEATURE} ${FALLBACK_NO_V5}`);
    // An unknown kind is not a crossing either way.
    const { crossesScsiTempDisk } = await import('../js/lifecycle.js');
    for (const [a, b] of [[null, 'scsi-temp'], ['scsi-temp', null], [undefined, 'diskless'], ['', 'nvme-temp']]) assert.equal(crossesScsiTempDisk(a, b), null, `${a} ${b}`);
});

test('v5 with the preview feature: the d size of the same shape without it (a chosen size, Generation 1 and 2)', async () => {
    const { adviceOption } = await import('../js/lifecycle.js');
    const head = 'VM name,Current size,Generation,OS,Azure Disk Encryption,NIC count,Data-disk count\n';
    const p = run(`${head}contoso-c2,Standard_D4s_v3,V2,Windows,No,1,0\ncontoso-c1,Standard_D4s_v3,V1,Windows,No,1,0\ncontoso-ca,Standard_D4as_v4,V2,Windows,No,1,0\n`
        + 'contoso-ce,Standard_D4s_v3,V2,Windows,Yes,1,0\ncontoso-cu,Standard_D4s_v3,V2,,Yes,1,0\ncontoso-cl,Standard_D4s_v3,V2,Linux,No,1,0\n').plan;
    // The size picker gives the d size; for a v3 size, a size without a temporary disk is
    // one of the choices. (Generation 1 chooses by shape, from d sizes only: its row with
    // no d size is below, with a changed table.)
    for (const name of ['contoso-c2', 'contoso-c1']) assert.equal(rowOf(byName(p, name), 'v5').option.targetSize, 'Standard_D4ds_v5', `${name}: the fixture`);
    const vm = byName(p, 'contoso-c2').vm;
    const o = adviceOption(vm, 'v5', table, 'Standard_D4s_v5', NOW);
    assert.deepEqual([o.supported, o.targetSize, o.previewFeature, o.featureFallback], [true, 'Standard_D4s_v5', 'needed', { size: 'Standard_D4ds_v5' }]);
    // The generation does not change it (measured on Generation 1 and Generation 2).
    assert.deepEqual(adviceOption({ ...vm, gen: 'V1', hyperVGeneration: 'V1' }, 'v5', table, null, NOW).previewFeature, 'not-needed', 'Generation 1: the d size, a plain resize');
    // Ranked sizes: the d size comes second.
    assert.deepEqual(rankedSizes(vm, table, o, NOW).slice(0, 2).map((x) => [x.size, x.why]), [['Standard_D4s_v5', 'closest'], ['Standard_D4ds_v5', 'temp-disk-added']]);
    // The processor maker stays (AMD: Dasv4 to Dadsv5).
    const amd = adviceOption(byName(p, 'contoso-ca').vm, 'v5', table, 'Standard_D4as_v5', NOW);
    assert.deepEqual([amd.previewFeature, amd.featureFallback], ['needed', { size: 'Standard_D4ads_v5' }]);
    // Azure Disk Encryption: the size that keeps the temporary disk type, as a plain resize
    // (a resize keeps the encryption). This tool does not plan the feature with it.
    const ade = adviceOption(byName(p, 'contoso-ce').vm, 'v5', table, 'Standard_D4s_v5', NOW);
    assert.deepEqual([ade.supported, ade.targetSize, ade.previewFeature], [true, 'Standard_D4ds_v5', 'not-needed']);
    const adeNoOs = adviceOption(byName(p, 'contoso-cu').vm, 'v5', table, 'Standard_D4s_v5', NOW);
    assert.deepEqual([adeNoOs.supported, adeNoOs.targetSize, adeNoOs.previewFeature], [true, 'Standard_D4ds_v5', 'not-needed'], 'no OS: a resize on any OS');
    // A size choice that this VM can only reach with the feature is not offered with Azure Disk Encryption.
    assert.ok(!rowOf(byName(p, 'contoso-ce'), 'v5').option.sizeChoices.some((c) => c.size === 'Standard_D4s_v5'));
    assert.ok(rowOf(byName(p, 'contoso-c2'), 'v5').option.sizeChoices.some((c) => c.size === 'Standard_D4s_v5'), 'the fixture: offered without it');
    // Linux: no feature, no fallback.
    const lin = adviceOption(byName(p, 'contoso-cl').vm, 'v5', table, 'Standard_D4s_v5', NOW);
    assert.deepEqual([lin.targetSize, lin.previewFeature, lin.featureFallback], ['Standard_D4s_v5', 'not-needed', null]);

    // An NVMe temporary disk (FXmdsv2) to a v5 d size crosses the boundary the other way:
    // the size without the d is the fallback. The list says Generation 1, so the size is
    // chosen by shape. Azure Disk Encryption takes the fallback (a plain resize).
    const fx = run(`${head}contoso-f1,Standard_FX12mds_v2,V1,Windows,No,1,0\ncontoso-fe,Standard_FX12mds_v2,V1,Windows,Yes,1,0\ncontoso-fu,Standard_FX12mds_v2,V1,,Yes,1,0\n`).plan;
    const f1 = rowOf(byName(fx, 'contoso-f1'), 'v5').option;
    assert.deepEqual([f1.supported, f1.targetSize, f1.previewFeature, f1.featureFallback], [true, 'Standard_E32ds_v5', 'needed', { size: 'Standard_E32s_v5' }]);
    assert.deepEqual(rankedSizes(byName(fx, 'contoso-f1').vm, table, f1, NOW).slice(0, 2).map((x) => [x.size, x.why]), [['Standard_E32ds_v5', 'closest'], ['Standard_E32s_v5', 'temp-disk-removed']]);
    for (const name of ['contoso-fe', 'contoso-fu']) {
        const o = rowOf(byName(fx, name), 'v5').option;
        assert.deepEqual([o.supported, o.targetSize, o.previewFeature], [true, 'Standard_E32s_v5', 'not-needed'], name);
    }
    // A VM already on v6 (with Azure Disk Encryption in the list): v5 is "not needed", as for any v6 VM.
    const v6 = run(`${head}contoso-f6,Standard_D4ds_v6,V2,Windows,Yes,1,0\n`).plan.machines[0];
    assert.deepEqual(rowOf(v6, 'v5').codes, ['source-is-newer']);

    // No d size of this shape (a changed table): the feature, and no fallback. Azure Disk
    // Encryption: not in this tool on Windows, not checked with no OS.
    const t = tableWith({ Standard_D4ds_v5: null });
    const q = runWith(`${head}contoso-x2,Standard_D4s_v3,V2,Windows,No,1,0\ncontoso-x1,Standard_D4s_v3,V1,Windows,No,1,0\ncontoso-xe,Standard_D4s_v3,V2,Windows,Yes,1,0\ncontoso-xu,Standard_D4s_v3,V2,,Yes,1,0\n`, t);
    const rows = F.targetRows(q, t, NOW);
    for (const name of ['contoso-x2', 'contoso-x1']) {
        const o = rowOf(byName(q, name), 'v5').option;
        assert.deepEqual([o.supported, o.targetSize, o.previewFeature, o.featureFallback], [true, 'Standard_D4s_v5', 'needed', { size: null }], name);
        const r = rows.find((x) => x['VM name'] === name && x['Series'] === 'v5');
        assert.deepEqual([r['How to move'], r['Rebuild'], r['Preview feature']], [`Resize the current VM. ${FEATURE} ${FALLBACK_NONE}`, 'No', COLUMN.needed], name);
    }
    assert.deepEqual(rowOf(byName(q, 'contoso-xe'), 'v5').codes, ['disk-encryption-preview']);
    assert.equal(rows.find((x) => x['VM name'] === 'contoso-xe' && x['Series'] === 'v5')['Series result'], 'Not in this tool');
    assert.deepEqual([rowOf(byName(q, 'contoso-xu'), 'v5').codes, rowOf(byName(q, 'contoso-xu'), 'v5').result], [['os-unknown-encryption'], 'Needs team review']);
    // No OS: the same fallback rule ("On a Windows VM").
    const nu = runWith(`${head}contoso-xn,Standard_D4s_v3,V2,,No,1,0\n`, t).machines[0];
    assert.deepEqual([rowOf(nu, 'v5').option.previewFeature, rowOf(nu, 'v5').option.featureFallback], ['windows', { size: null }]);
    // v6 and v7 have no fallback: deploy in parallel is the first method.
    for (const s of ['v6', 'v7']) assert.deepEqual([rowOf(byName(p, 'contoso-c2'), s).option.previewFeature, rowOf(byName(p, 'contoso-c2'), s).option.featureFallback], ['needed', null], s);
    // The fallback must pass every check of a target: not smaller than the VM ...
    const small = tableWith({ Standard_D4ds_v5: { MemoryGB: '8' } });
    const sm = runWith(`${head}contoso-xs,Standard_D4s_v3,V2,Windows,No,1,0\n`, small).machines[0];
    assert.deepEqual([rowOf(sm, 'v5').option.targetSize, rowOf(sm, 'v5').option.featureFallback], ['Standard_D4s_v5', { size: null }], 'the d size is smaller than the VM');
    // ... and a NIC limit that the size table gives (unknown is not a pass).
    const nics = tableWith({ Standard_D4ds_v5: { MaxNetworkInterfaces: undefined } });
    const two = runWith(`${head}contoso-xk,Standard_D4s_v3,V2,Windows,No,2,0\n`, nics).machines[0];
    const chosen = adviceOption(two.vm, 'v5', nics, 'Standard_D4s_v5', NOW);
    assert.deepEqual([chosen.targetSize, chosen.previewFeature, chosen.featureFallback], ['Standard_D4s_v5', 'needed', { size: null }]);
    assert.deepEqual(adviceOption(byName(p, 'contoso-c2').vm, 'v5', nics, 'Standard_D4s_v5', NOW).featureFallback, { size: 'Standard_D4ds_v5' }, 'the fixture: one NIC fits');
});

test('Burstable with Azure Disk Encryption: no resize with the preview feature; unknown temporary disk: not checked', async () => {
    const { todo } = await import('../js/details.js');
    const head = 'VM name,Current size,Generation,OS,Azure Disk Encryption\n';
    const p = run(`${head}contoso-be,Standard_B2ms,V2,Windows,Yes\ncontoso-bu,Standard_B2ms,V1,,Yes\ncontoso-bl,Standard_B2ms,V2,Linux,Yes\n`).plan;
    const be = rowOf(byName(p, 'contoso-be'), 'burstable');
    assert.deepEqual([be.option.supported, be.codes, be.result], [false, ['disk-encryption-preview'], 'Not supported by design']);
    assert.equal(byName(p, 'contoso-be').short.burstable, 'No - Azure Disk Encryption with the preview feature');
    const { answerWords } = await import('../js/words.js');
    assert.equal(answerWords(byName(p, 'contoso-be'), 'burstable'), 'No - the preview feature with Azure Disk Encryption is not in this tool');
    assert.match(F.targetRows(p, table, NOW).find((r) => r['VM name'] === 'contoso-be' && r['Series'] === B)['Reason'], /Lab tests did not use the feature with Azure Disk Encryption, so this tool does not plan it\./);
    assert.ok(rowOf(byName(p, 'contoso-be'), 'v5').option.supported, 'v5 keeps the temporary disk: a plain resize');
    assert.deepEqual(rowOf(byName(p, 'contoso-bu'), 'burstable').codes, ['os-unknown-encryption']);
    assert.equal(rowOf(byName(p, 'contoso-bl'), 'burstable').option.supported, true, 'Linux: a plain resize');
    // The size table does not give the temporary disk of the current size: not checked, never a pass.
    const gone = tableWith({ Standard_D4s_v3: null });
    const q = runWith('VM name,Current size,Generation,OS\ncontoso-gw,Standard_D4s_v3,V2,Windows\ncontoso-gl,Standard_D4s_v3,V2,Linux\n', gone);
    const rows = F.targetRows(q, gone, NOW);
    const r = (name, s) => rows.find((x) => x['VM name'] === name && x['Series'] === s);
    for (const s of ['v5', 'v6']) {
        assert.equal(rowOf(byName(q, 'contoso-gw'), s).option.previewFeature, 'unknown', s);
        assert.equal(r('contoso-gw', s)['Preview feature'], COLUMN.unknown, s);
        assert.ok(r('contoso-gw', s)['How to move'].endsWith(FEATURE_UNKNOWN), s);
        assert.equal(r('contoso-gl', s)['Preview feature'], COLUMN.notNeeded, s);
    }
    const gw = byName(q, 'contoso-gw');
    if (F.likelyRow(gw).series === 'v5') assert.ok(todo(gw, F.groupOf(gw)).more.includes(FEATURE_UNKNOWN));
    const v5only = runWith('VM name,Current size,Generation,OS\ncontoso-gv,Standard_D4s_v3,V1,Windows\n', gone).machines[0];
    assert.equal(F.likelyRow(v5only).series, 'v5', 'the fixture: Generation 1 has no v6 or v7 size');
    assert.ok(todo(v5only, F.groupOf(v5only)).more.includes(FEATURE_UNKNOWN), 'What to do says it too');
});

test('no rebuild anywhere: no customer text recommends one, and the Rebuild column is No', async () => {
    const { todo, whyLines } = await import('../js/details.js');
    const { reportHtml } = await import('../js/report.js');
    const lists = ['contoso-from-azure.csv', 'contoso-every-series.csv', 'contoso-by-hand.csv'].map((f) => read(`samples/${f}`));
    lists.push(sample, 'VM name,Current size,Generation,OS,System-assigned identity,Availability set,Azure Disk Encryption\n'
        + 'contoso-z1,Standard_B2ms,V1,Windows,Yes,Yes,No\ncontoso-z2,Standard_B2ms,V2,,Yes,Yes,Yes\ncontoso-z3,Standard_A2_v2,V1,Windows,Yes,Yes,No\ncontoso-z4,Standard_D4s_v3,V2,Windows,Yes,Yes,Yes\n');
    let rows = 0;
    for (const text of lists) {
        const { plan: p, list } = run(text);
        for (const r of F.targetRows(p, table, NOW)) {
            if (r['Target size'] || r['How to move']) { assert.equal(r['Rebuild'], 'No', `${r['VM name']} ${r['Series']}`); rows++; }
            for (const c of F.TARGET_COLUMNS) assert.doesNotMatch(String(r[c] ?? ''), /rebuild/i, `${r['VM name']} ${r['Series']} ${c}`);
        }
        for (const r of F.summaryRows(p)) for (const c of F.SUMMARY_COLUMNS) assert.doesNotMatch(String(r[c] ?? ''), /rebuild/i, `${r['VM name']} ${c}`);
        for (const m of p.machines) {
            const g = F.groupOf(m);
            const t = todo(m, g);
            assert.doesNotMatch([t.main, ...t.more, ...whyLines(m, g, table, NOW)].join(' '), /rebuild/i, m.read.name);
        }
        assert.doesNotMatch(reportHtml(p, table, 'x', NOW), /rebuild/i);
        // The about file says only that the tool never recommends one.
        const about = F.aboutText(p, list, 'x', NOW).split('\r\n').filter((l) => /rebuild/i.test(l));
        assert.deepEqual(about, ['  Rebuild:   This tool never tells you to rebuild a VM (to make a new VM with the same disks).', '             In vm-target-sizes.csv, Rebuild is No for every size.']);
    }
    assert.ok(rows > 100, `${rows} rows with a size`);
    assert.deepEqual(F.TARGET_COLUMNS.slice(-2), ['SAP sign', 'Preview feature'], 'the new column at the end');
    assert.ok(F.TARGET_COLUMNS.includes('Rebuild'), 'the column stays');
    // The page.
    assert.doesNotMatch(read('index.html').replace(/<head>[\s\S]*?<\/head>/, ''), /rebuild/i);
    assert.doesNotMatch(read('js/page.js'), /rebuild/i);
});

// Review of 0.9.5-beta (2026-11-06).
test('review: the report says which resize needs the feature on v6 and v7', async () => {
    const { reportHtml } = await import('../js/report.js');
    const p = run('VM name,Current size,Generation,OS\ncontoso-rv1,Standard_D4s_v3,V2,Windows\ncontoso-rv2,Standard_D4s_v3,V2,\n').plan;
    const html = reportHtml(p, table, 'x', NOW);
    const card = (name) => { const i = html.indexOf(`<h3>${name}</h3>`); return html.slice(i, html.indexOf('</section>', i)); };
    // 0.9.6-beta: the feature is a step in the box of the second way, "Change the size of this VM",
    // with the link; the box of the first way does not name it.
    const box = (name, title) => { const c = card(name); const i = c.indexOf(`<h5>${title}</h5>`); assert.ok(i > 0, `${name}: ${title}`); return c.slice(i, c.indexOf('</div>', i)); };
    assert.ok(box('contoso-rv1', 'Change the size of this VM').includes(`<b>Preview feature:</b> register VMTempDiskResizePreview on the subscription. <a href="${PREVIEW_PAGE}">`));
    assert.ok(box('contoso-rv1', 'Change the size of this VM').includes('<b>Page file:</b> move it from the temporary disk to C:.'));
    assert.ok(box('contoso-rv2', 'Change the size of this VM').includes(`<b>Preview feature:</b> on a Windows VM, register VMTempDiskResizePreview on the subscription. <a href="${PREVIEW_PAGE}">`));
    for (const name of ['contoso-rv1', 'contoso-rv2']) assert.doesNotMatch(box(name, 'Deploy a new VM in parallel'), /VMTempDiskResizePreview|Page file/, name);
    // The page and the CSV have the whole move, where the same sentence comes first.
    const row = F.targetRows(p, table, NOW).find((r) => r['VM name'] === 'contoso-rv1' && r['Series'] === 'v6');
    assert.ok(row['How to move'].includes(`You can also change the size of the current VM, but that has more steps and more risk. ${FEATURE}`));
});

test('review: ranked sizes - Azure Disk Encryption with no OS, and the sizes that need the feature', async () => {
    // No OS, Azure Disk Encryption: no other size that changes the temporary disk type.
    const e = run('VM name,Current size,Generation,OS,Azure Disk Encryption\ncontoso-rk1,Standard_D4ds_v4,V2,,Yes\n').plan.machines[0];
    const v5 = rowOf(e, 'v5');
    assert.equal(v5.option.targetSize, 'Standard_D4ds_v5');
    assert.ok(!rankedSizes(e.vm, table, v5.option, NOW).some((x) => x.size === 'Standard_D4s_v5'), 'no OS with Azure Disk Encryption: as Windows');
    assert.ok(rankedSizes({ ...e.vm, os: 'Linux' }, table, v5.option, NOW).some((x) => x.size === 'Standard_D4s_v5'), 'the fixture: Linux gets it');
    // An other size that needs the feature when the suggested size does not says so.
    const p = run('VM name,Current size,Generation,OS\ncontoso-rk2,Standard_D4s_v3,V2,Windows\ncontoso-rk3,Standard_D4s_v3,V2,\ncontoso-rk4,Standard_D4s_v3,V2,Linux\n').plan;
    const ranked = (name, s) => F.targetRows(p, table, NOW).find((r) => r['VM name'] === name && r['Series'] === s)['Ranked sizes'];
    assert.match(ranked('contoso-rk2', 'v5'), /\d\. Standard_D4s_v5 \(Same shape, no temporary disk\. A resize to it needs the preview feature VMTempDiskResizePreview\)/);
    assert.match(ranked('contoso-rk3', 'v5'), /\d\. Standard_D4s_v5 \(Same shape, no temporary disk\. On Windows, a resize to it needs the preview feature VMTempDiskResizePreview\)/);
    assert.match(ranked('contoso-rk4', 'v5'), /\d\. Standard_D4s_v5 \(Same shape, no temporary disk\)/);
    assert.doesNotMatch(ranked('contoso-rk2', 'v5'), /Standard_D4ds_v5 \([^)]*preview/, 'the suggested size keeps the temporary disk type');
    // v6 and v7: the move already says that the resize needs it, for every size.
    assert.doesNotMatch(ranked('contoso-rk2', 'v6'), /preview/);
    const rf = F.rankedFor(byName(p, 'contoso-rk2'), rowOf(byName(p, 'contoso-rk2'), 'v5'), table, NOW);
    assert.ok(rf.some((x) => x.why.endsWith('VMTempDiskResizePreview')), 'the page and the report use the same words');
    // A processor change keeps its asterisk at the end.
    const { rankWords } = await import('../js/words.js');
    assert.equal(rankWords('processor', 'AMD', 'needed'), 'Same shape, AMD processor. A resize to it needs the preview feature VMTempDiskResizePreview*');
});

test('review: Azure Disk Encryption when the size table does not give the temporary disk: not checked', () => {
    const head = 'VM name,Current size,Generation,OS,Azure Disk Encryption\n';
    // The current size has no temporary disk reading: its kind comes from the name only.
    const t = tableWith({ Standard_D4s_v3: { MaxResourceVolumeMB: undefined }, Standard_D4ds_v5: null, Standard_B2ms: { MaxResourceVolumeMB: undefined } });
    const p = runWith(`${head}contoso-ru1,Standard_D4s_v3,V2,Windows,Yes\ncontoso-ru2,Standard_D4s_v3,V2,,Yes\ncontoso-ru3,Standard_D4s_v3,V2,Linux,Yes\ncontoso-ru4,Standard_B2ms,V2,Windows,Yes\ncontoso-ru5,Standard_D4s_v3,V2,Windows,No\n`, t);
    for (const name of ['contoso-ru1', 'contoso-ru2']) {
        const r = rowOf(byName(p, name), 'v5');
        assert.deepEqual([r.codes, r.result], [['encryption-temp-disk-unknown'], 'Needs team review'], name);
    }
    assert.equal(rowOf(byName(p, 'contoso-ru4'), 'burstable').result, 'Needs team review', 'Burstable the same');
    assert.deepEqual(rowOf(byName(p, 'contoso-ru4'), 'burstable').codes, ['encryption-temp-disk-unknown']);
    assert.equal(rowOf(byName(p, 'contoso-ru3'), 'v5').result, 'Supported', 'Linux needs no feature');
    assert.equal(rowOf(byName(p, 'contoso-ru5'), 'v5').option.previewFeature, 'unknown', 'no encryption: the resize words say not checked');
    const why = F.targetRows(p, t, NOW).find((r) => r['VM name'] === 'contoso-ru1' && r['Series'] === 'v5')['Reason'];
    assert.match(why, /The size table does not give the temporary disk/);
    // The new size has no reading: the same.
    const nt = tableWith({ Standard_D4ds_v5: { MaxResourceVolumeMB: undefined } });
    const n = runWith(`${head}contoso-rt,Standard_D4s_v3,V2,Windows,Yes\n`, nt).machines[0];
    assert.deepEqual([rowOf(n, 'v5').option.targetSize, rowOf(n, 'v5').codes], ['Standard_D4ds_v5', ['encryption-temp-disk-unknown']]);
    // With the readings (only the d size taken away): the answer of 0.9.5-beta.
    const k = tableWith({ Standard_D4ds_v5: null });
    assert.deepEqual(rowOf(runWith(`${head}contoso-rk,Standard_D4s_v3,V2,Windows,Yes\n`, k).machines[0], 'v5').codes, ['disk-encryption-preview']);
});

test('review: the Burstable reason says that no Bsv2 or Basv2 size has a temporary disk', async () => {
    const { reasonFor } = await import('../js/reasons.js');
    assert.equal(reasonFor('disk-encryption-preview', { series: 'burstable' }), 'This VM has Azure Disk Encryption. The resize to burstable needs the preview feature VMTempDiskResizePreview, because the temporary disk changes type. Lab tests did not use the feature with Azure Disk Encryption, so this tool does not plan it. No Bsv2 or Basv2 size has a temporary disk.');
    assert.match(reasonFor('disk-encryption-preview', { series: 'v5' }), /No v5 size of this shape keeps the temporary disk type\.$/);
    // True in the size table: every Bsv2 and Basv2 size reports no SCSI temporary disk.
    const b = Object.entries(sizes.sizes).filter(([n]) => /^Standard_B\d+a?[lt]?s_v2$/.test(n));
    assert.ok(b.length > 10 && b.every(([, s]) => s.capabilities.MaxResourceVolumeMB === '0'));
});

test('v6 accelerated networking: Required on every D and E v6 size since 2026-10-27; F v6 and v7 stay Supported', async () => {
    const { targetRequiresAcceleratedNetworking } = await import('../js/lifecycle.js');
    for (const s of ['Standard_D4s_v6', 'Standard_D4ds_v6', 'Standard_D4ls_v6', 'Standard_D4as_v6', 'Standard_D4ads_v6', 'Standard_E4s_v6', 'Standard_E4as_v6', 'Standard_E16-4ds_v6']) assert.equal(targetRequiresAcceleratedNetworking(s), true, s);
    for (const s of ['Standard_F4als_v6', 'Standard_D4s_v7', 'Standard_D4as_v7', 'Standard_E4s_v7']) assert.equal(targetRequiresAcceleratedNetworking(s), false, s);
    assert.equal(targetRequiresAcceleratedNetworking('Standard_D4as_v5'), false, 'AMD v5: Supported, as before');
    // The note: off on the VM, so turn it on before the move (it was "The new size does not need it.").
    const head = 'VM name,Current size,Generation,OS,NIC count,Accelerated NICs,Primary NIC accelerated\n';
    const m = run(`${head}contoso-an1,Standard_D4as_v4,V2,Linux,1,0,No\n`).plan.machines[0];
    const v6 = rowOf(m, 'v6');
    assert.equal(v6.option.targetSize, 'Standard_D4ads_v6');
    assert.deepEqual([v6.caveats['Accelerated networking'].state, v6.option.acceleratedNetworking.required], ['problem', true]);
    assert.deepEqual([rowOf(m, 'v7').caveats['Accelerated networking'].state, rowOf(m, 'v7').option.acceleratedNetworking.required], ['', false], 'v7: Supported, no note');
    // The source: the Microsoft size pages, cited, watched and in the snapshot.
    const families = (await import('../data/families.js')).default;
    const { SOURCES } = await import('../tools/sources.mjs');
    const snapshot = JSON.parse(read('tools/source-snapshot.json'));
    for (const page of ['general-purpose/dsv6-series', 'general-purpose/dasv6-series', 'memory-optimized/esv6-series', 'memory-optimized/easv6-series']) {
        assert.ok(families.sources.some((x) => x.url.endsWith(`/sizes/${page}`)), `${page} is cited`);
        const s = SOURCES.find((x) => x.url.endsWith(`/sizes/${page}`));
        assert.ok(s, `${page} is watched`);
        assert.ok(snapshot[s.id].facts.includes('Feature support :: Feature name | Support status = Accelerated Networking | Required'), `${page}: the snapshot says Required`);
    }
});

test('v6 and v7: Azure Disk Encryption is always the plain answer, never "a rebuild"', async () => {
    // The series rules stop Azure Disk Encryption on v6 and v7 before any rebuild. Without
    // that rule, the move still must not say "rebuild": v6 and v7 do not support it at all.
    const version = (await import('../js/version.js')).default;
    const rules = (await import(`../data/series-rules.js?v=${version}`)).default;
    const keep = rules.blockers['disk-encryption-present'].appliesTo;
    const text = 'VM name,Current size,Generation,OS,Azure Disk Encryption\ncontoso-ae1,Standard_D4s_v3,V2,Windows,Yes\n';
    const check = (m) => {
        for (const s of ['v6', 'v7']) {
            const r = rowOf(m, s);
            assert.equal(r.option.supported, false, s);
            assert.deepEqual(r.codes, ['disk-encryption-present'], s);
            assert.equal(m.short[s], 'No - Azure Disk Encryption', s);
        }
        assert.deepEqual(rowOf(m, 'v5').codes, [], 'v5 is a resize: it keeps Azure Disk Encryption');
    };
    check(run(text).plan.machines[0]);
    try {
        rules.blockers['disk-encryption-present'].appliesTo = [];
        check(run(text).plan.machines[0]);
    } finally {
        rules.blockers['disk-encryption-present'].appliesTo = keep;
    }
});

test('the about file and the page: on v6 and v7, a change of the size of the current VM keeps the identity', () => {
    const about = F.aboutText(run(sample).plan, readList(sample), 'sample', NOW).replace(/\r\n/g, '\n');
    assert.match(about, /\n {2}v6 and v7: Deploy a new VM in parallel, move the workload, then delete the old VM\.\n {13}Microsoft highly recommends this\. A move to v6 or v7 is not a normal resize\.\n {13}You can also change the size of the current VM\. The VM then keeps its identity\.\n/);
    // 0.9.5-beta: a move is a resize or a new VM in parallel (no rebuild).
    assert.match(read('index.html'), /<li>A move is a resize or a new VM in parallel\. In a resize, Azure changes the size of the same VM\. For v6 and v7, you deploy a new VM in parallel and move the workload to it\. You can also change the size of the current VM\. A new VM gets a new system-assigned identity\. When Azure changes the size of the same VM, the VM keeps its identity\.<\/li>/);
});

test('workload type: ARO is a pool that the service manages; a SQL Server image is a database; unknown "Managed by" is not E', async () => {
    const { patternOf } = await import('../js/patterns.js');
    const { serviceManaged } = await import('../js/words.js');
    const known = { managedBy: 'None', scaleSet: false, sqlServer: false, sharedDisk: false, sap: false, virtualDesktop: false, imagePublisher: 'Canonical' };
    assert.equal(patternOf(known), 'E');
    assert.equal(patternOf({ ...known, managedBy: 'ARO' }), 'A');
    assert.equal(patternOf({ ...known, imagePublisher: 'MicrosoftSQLServer' }), 'F');
    assert.equal(patternOf({ ...known, managedBy: null }), '');
    assert.equal(serviceManaged({ pattern: 'A', extra: { managedBy: 'ARO' } }), true);
});

test('the CSV formula guard also covers a tab and a carriage return', () => {
    const csv = F.toCsv(['Machine'], [{ Machine: '\tcmd' }, { Machine: '\r=1' }]);
    const cells = csv.replace(/^﻿/, '').split('\r\n').slice(1, 3);
    assert.deepEqual(cells, ['"\'\tcmd"', '"\'\r=1"']);
});

test('the files: no size on an option that is not supported, and "Not checked" is never a no', () => {
    const p = run(sample).plan;
    const rows = F.targetRows(p, table, NOW);
    assert.ok(rowOf(byName(p, 'contoso-sap01'), 'v6').option.targetSize, 'the logic found a size');
    assert.equal(rows.find((r) => r['VM name'] === 'contoso-sap01' && r['Series'] === 'v6')['Target size'], '', 'but it is not supported');
    assert.equal(rows.find((r) => r['VM name'] === 'contoso-app02' && r['Series'] === 'v5')['Series result'], 'Not needed');
    assert.equal(F.summaryRows(p).find((r) => r['VM name'] === 'contoso-odd01')['Move needed'], 'Not checked');
    const e1 = F.targetRows(run('VM name,Current size,Generation\ncontoso-e1,Standard_E16-4s_v3,V2\n').plan, table, NOW);
    assert.equal(e1.find((r) => r['Series'] === 'v7')['Supported'], 'Not checked');
    assert.equal(e1.find((r) => r['Series'] === 'v5')['Rebuild'], 'No', '0.9.5-beta: never a rebuild, whatever the OS');
    const t = tableWith({ Standard_D4ds_v6: { PremiumIO: undefined } });
    const pr = F.targetRows(runWith('VM name,Current size,Generation,OS\ncontoso-p1,Standard_D4s_v3,V2,Linux\n', t), t, NOW);
    assert.equal(pr.find((r) => r['Series'] === 'v6')['Premium SSD on target'], 'Not checked');
});

test('a size this tool cannot identify shows "Not checked" for each series', async () => {
    const { answerWords } = await import('../js/words.js');
    const m = byName(run(sample).plan, 'contoso-odd01');
    assert.deepEqual(['v5', 'v6', 'v7'].map((s) => answerWords(m, s)), ['Not checked', 'Not checked', 'Not checked']);
});

test('a note that applies to every supported series names no series', () => {
    const n = F.allNotes(byName(run(sample).plan, 'contoso-web01'));
    const temp = n.attention.find((x) => x.topic === 'Temporary disk');
    assert.deepEqual(temp.series, []);
    assert.deepEqual(n.actions.find((x) => x.topic === 'Identity').series, ['v6', 'v7']);
});

test('two VMs with the same name: the reason goes to the right VM, whatever the order', () => {
    const head = 'Machine name,Region,Current size,Generation,Resource ID';
    const id = (rg) => `/subscriptions/00000000-0000-0000-0000-000000000000/resourceGroups/${rg}/providers/Microsoft.Compute/virtualMachines/contoso-app09`;
    const { plan: p } = run(`${head}\ncontoso-app09,eastus2,Standard_D4s_v3,V2,${id('rg-a')}\ncontoso-app09,eastus2,Standard_D4s_v3,,${id('rg-b')}\n`);
    const rows = F.notCheckedRows(p, table, NOW);
    assert.ok(rows.length >= 1);
    for (const r of rows) assert.equal(r['Resource group'], 'rg-b');
    assert.ok(rows.some((r) => /generation/i.test(r['Why'])));
});

test('what to do: burstable first for a B VM, the OS note, SAP, and v7 in parallel', async () => {
    const { todo, whyLines } = await import('../js/details.js');
    const b = run('VM name,Current size,Generation\ncontoso-b7,Standard_B2s,V2\n').plan.machines[0];
    const t = todo(b, F.groupOf(b));
    // No OS: on a Windows VM, Burstable (no temporary disk) needs the preview feature (0.9.5-beta).
    assert.match(t.main, /^Resize to Standard_B\d+\w*_v2\. On a Windows VM, first register the preview feature VMTempDiskResizePreview on the subscription\. Without the feature, use the v5 size Standard_\w+_v5\.$/);
    const p = run(sample).plan;
    const sap = byName(p, 'contoso-sap01');
    assert.match(todo(sap, F.groupOf(sap)).main, /^Ask SAP /);
    const gpu = byName(p, 'contoso-gpu01');
    assert.ok(whyLines(gpu, F.groupOf(gpu), table, NOW).includes('This tool gives no target size for GPU sizes (the N family). A D or E size has no GPU.'));
    // No v6 size of the same name: the likely move is v7, a new VM in parallel.
    const v7 = tableWith({ Standard_D4ds_v6: null, Standard_D4s_v6: null });
    const m = runWith('VM name,Current size,Generation,OS\ncontoso-v7,Standard_D4s_v3,V2,Linux\n', v7).machines[0];
    assert.equal(F.likelyRow(m).series, 'v7');
    assert.match(todo(m, F.groupOf(m)).main, /^Deploy a new VM at Standard_D4ds_v7 in parallel\./);
});

test('the list reader: two columns with one name stop; doubled quotes; a semicolon list', () => {
    assert.ok(readList('VM name,Machine name,Current size,Generation\ncontoso-d1,contoso-d2,Standard_D2s_v3,V2\n').stops.some((s) => s.startsWith('Two columns have the name VM name')));
    const list = readList('VM name,Current size,Generation\n"contoso ""x""",Standard_D2s_v3,V2\n');
    assert.equal(list.rows[0][0], 'contoso "x"');
    const semi = readList('VM name;Current size;Generation\ncontoso-s1;Standard_D2s_v3;V2\n');
    assert.deepEqual(semi.stops, []);
    assert.equal(semi.rows[0][1], 'Standard_D2s_v3');
});

test('the report: a card only for a VM to act on, and quotes escaped', async () => {
    const { reportHtml } = await import('../js/report.js');
    const p = run(sample).plan;
    const html = reportHtml(p, table, 'list "a"', NOW);
    assert.ok(!html.includes(`id="vm-${byName(p, 'contoso-app02').read.row}"`), 'a modern size has no card');
    assert.ok(html.includes('list &quot;a&quot;') && !html.includes('list "a"'));
});

test('the source check: duplicates added, a page with only removed lines, and the fingerprint', async () => {
    const { diffFacts } = await import('../tools/sources.mjs');
    const { changeReport } = await import('../tools/watch-sources.mjs');
    assert.deepEqual(diffFacts(['a'], ['a', 'a']), { added: ['a'], removed: [] });
    const s = { id: 'x', name: 'Test page', url: 'https://learn.microsoft.com/en-us/azure/virtual-machines/x' };
    const before = { readUtc: '2026-10-16', pageUpdatedUtc: '2026-09-26', facts: ['A :: one', 'A :: two', 'A :: three', 'A :: four'] };
    assert.ok(changeReport(s, before, { facts: ['A :: one', 'A :: two', 'A :: three'] }, '2026-10-20'), 'a removed line is a change');
    const print = (facts) => /source-check-fingerprint: ([0-9a-f]{16})/.exec(changeReport(s, before, { facts }, '2026-10-20'))[1];
    const same = print(['A :: one', 'A :: two', 'A :: three', 'A :: four', 'A :: new']);
    assert.equal(print(['A :: one', 'A :: two', 'A :: three', 'A :: four', 'A :: new']), same, 'same change, same fingerprint');
    assert.notEqual(print(['A :: one', 'A :: two', 'A :: three', 'A :: new']), same, 'another removed line, another fingerprint');
});

test('the Marketplace check: a reviewed offer is not reported again; vendor words; case of a known publisher', async () => {
    const { catalogFindings } = await import('../tools/azure-sources.mjs');
    assert.deepEqual(catalogFindings({ vendors: [{ vendor: 'Contoso Storage', publisher: 'contoso', offers: ['vault*'] }], reviewed: ['contoso/monitor'] },
        { allPublishers: ['contoso'], offers: { contoso: ['vault-edge', 'monitor'] } }), []);
    assert.deepEqual(catalogFindings({ vendors: [], notVendors: ['fabrikam-backup'] },
        { allPublishers: ['Fabrikam-Backup', 'contosomodell', 'contoso-dell'], offers: {} }), [], 'only at the start: dell, silk, weka');
});

test('README.md has the facts of the data files (node tools/readme-facts.mjs)', async () => {
    // A data change (for example node tools/azure-sources.mjs --update, or a new
    // vendor) that forgets the README fails here.
    const { loadData, factTexts, fillReadme, readFacts, FACTS } = await import('../tools/readme-facts.mjs');
    const data = await loadData();
    assert.equal(sizes.sizeCount, Object.keys(sizes.sizes).length);
    const readme = read('README.md');
    assert.equal(readme, fillReadme(readme, factTexts(data)), 'run node tools/readme-facts.mjs');
    assert.deepEqual(Object.keys(readFacts(readme)).sort(), FACTS.map((f) => f.id).sort());
    assert.match(readme, /a table of <!-- fact:sizes -->\d[\d,]* Azure VM sizes, read from Azure on \d+ \w+ \d{4}<!-- \/fact -->/);
});

test('the README facts: words, counts and marks', async () => {
    const { dates, number, factTexts, fillReadme, readFacts, factsFrom, loadData } = await import('../tools/readme-facts.mjs');
    assert.equal(number(1498), '1,498');
    assert.equal(number(999), '999');
    assert.equal(number(1234567), '1,234,567');
    assert.equal(dates(['2026-10-10', '2026-10-09', '2026-10-09']), '9 and 10 October 2026');
    assert.equal(dates(['2026-10-16']), '16 October 2026');
    assert.equal(dates(['2026-09-30', '2026-10-01', '2026-10-02']), '30 September 2026 and 1 and 2 October 2026');
    assert.equal(dates(['2026-10-03', '2026-10-01', '2026-10-02']), '1, 2 and 3 October 2026');
    assert.throws(() => dates([]), /Not a list of dates/);
    const data = await loadData();
    const t = factTexts(data);
    assert.equal(t.sizes, `${number(sizes.sizeCount)} Azure VM sizes, read from Azure on ${dates([sizes.readUtc])}`);
    // Vendors are companies: Dell with four publishers counts once; WEKA (a gallery) counts.
    const storage = { vendors: [{ vendor: 'NetApp (ONTAP)' }, { vendor: 'Pure Storage Cloud Block Store' }, { vendor: 'Rubrik' }, { vendor: 'Silk' },
        { vendor: 'Nasuni' }, { vendor: 'Dell (APEX)' }, { vendor: 'Dell (Data Domain)' }, { vendor: 'Cohesity DataPlatform' }, { vendor: 'Veeam' },
        { vendor: 'Commvault' }, { vendor: 'Contoso Backup' }, { vendor: 'Contoso Backup (two)' }], galleries: [{ vendor: 'WEKA' }] };
    assert.equal(factTexts({ ...data, storage })['storage-vendors'], '1 more vendor');
    assert.equal(factTexts({ ...data, storage: { ...storage, vendors: [...storage.vendors, { vendor: 'Fabrikam' }] } })['storage-vendors'], '2 more vendors');
    assert.throws(() => factTexts({ ...data, storage: { ...storage, vendors: storage.vendors.filter((v) => v.vendor !== 'Silk') } }), /names Silk/);
    assert.throws(() => factTexts({ ...data, storage: { ...storage, vendors: storage.vendors.slice(0, 10) } }), /No vendor is left/);
    assert.throws(() => factTexts({ ...data, sizes: { ...sizes, sizeCount: sizes.sizeCount + 1 } }), /sizeCount/);
    assert.equal(factTexts({ ...data, capacity: { ...data.capacity, readUtc: '2026-11-02' } })['lifecycle-read'], '9 October 2026 and 2 November 2026');
    // The marks: each fact once, never at the start of a line, the named vendors before the count.
    const readme = read('README.md');
    const now = readFacts(readme);
    const moved = fillReadme(readme, { ...now, sizes: '1,500 Azure VM sizes, read from Azure on 19 October 2026' });
    assert.equal(readFacts(moved).sizes, '1,500 Azure VM sizes, read from Azure on 19 October 2026');
    assert.equal(moved.replace(/<!-- fact:sizes -->.*?<!-- \/fact -->/, ''), readme.replace(/<!-- fact:sizes -->.*?<!-- \/fact -->/, ''), 'only the fact changes');
    assert.throws(() => readFacts(readme.replace('<!-- fact:nvme-read -->', '')), /no mark for nvme-read/);
    assert.throws(() => readFacts(`${readme}\nsee <!-- fact:sizes -->x<!-- /fact -->`), /two times/);
    assert.throws(() => readFacts(`${readme}\nsee <!-- fact:contoso -->x<!-- /fact -->`), /unknown fact/);
    assert.throws(() => readFacts(readme.replace('read on <!-- fact:nvme-read -->', 'read on\n  <!-- fact:nvme-read -->')), /start of a line/);
    assert.throws(() => readFacts(readme.replace('Silk, Nasuni', 'Nasuni')), /text before storage-vendors/);
    for (const page of ['lifecycle', 'end-of-life', 'retirements']) assert.deepEqual(factsFrom(page).map((f) => f.id), ['lifecycle-read'], page);
    assert.deepEqual(factsFrom('nvme').map((f) => f.id), ['nvme-read']);
    assert.deepEqual(factsFrom('azure-sizes').map((f) => f.id), ['sizes']);
    assert.deepEqual(factsFrom('v6-v7-plan'), [], 'cited by data/storage-appliance-images.js, but the vendor count does not come from it');
    assert.deepEqual(factsFrom('azure-catalog').map((f) => f.id), ['storage-vendors']);
    assert.deepEqual(factsFrom('azure-nva'), []);
});

test('each README fact names the sources it comes from, and each source exists', async () => {
    const { FACTS } = await import('../tools/readme-facts.mjs');
    const { SOURCES } = await import('../tools/sources.mjs');
    const { AZURE_SOURCES } = await import('../tools/azure-sources.mjs');
    const ids = new Set([...SOURCES.map((s) => s.id), ...AZURE_SOURCES.map(([id]) => id)]);
    for (const f of FACTS) {
        // The version comes from a release (tools/set-version.mjs), not from a source.
        if (f.id !== 'version') assert.ok(f.sources.length > 0, `${f.id} names a source`);
        for (const s of f.sources) assert.ok(ids.has(s), `${f.id}: ${s} is a source`);
    }
    assert.deepEqual(FACTS.find((f) => f.id === 'version').sources, []);
});

test('a source check issue lists the README facts that come from the source', async () => {
    const { createHash } = await import('node:crypto');
    const { changeReport } = await import('../tools/watch-sources.mjs');
    const { readFacts } = await import('../tools/readme-facts.mjs');
    const now = readFacts(read('README.md'));
    const before = { readUtc: '2026-10-16', pageUpdatedUtc: '2026-09-26', facts: ['A :: one', 'A :: two', 'A :: three', 'A :: four'] };
    const facts = ['A :: one', 'A :: two', 'A :: three', 'A :: four', 'A :: new'];
    // The retirements page: the lifecycle read dates come from it.
    const page = { id: 'retirements', name: 'Retirements', url: 'https://learn.microsoft.com/en-us/azure/virtual-machines/sizes/lifecycle/retirements-and-capacity-restrictions' };
    const body = changeReport(page, before, { facts }, '2026-10-20');
    const section = body.slice(body.indexOf('## README'), body.indexOf('## What to do'));
    assert.match(section, /Sources: lifecycle stages and retirement dates \(from data\/end-of-life\.js, data\/capacity\.js\): the README says `/);
    assert.ok(section.includes(`\`${now['lifecycle-read']}\``), 'the text in the README now');
    assert.ok(!section.includes('nvme-images') && !section.includes('sizes.js'), 'only the facts of this page');
    assert.match(section, /node tools\/readme-facts\.mjs/);
    // The NVMe page.
    const nvme = changeReport({ id: 'nvme', name: 'NVMe', url: 'https://learn.microsoft.com/en-us/azure/virtual-machines/enable-nvme-interface' }, before, { facts }, '2026-10-20');
    assert.ok(nvme.includes(`NVMe support of the OS (from data/nvme-images.js): the README says \`${now['nvme-read']}\`.`));
    // A page that gives no README fact, also when a data file with a fact cites it.
    const plan = changeReport({ id: 'v6-v7-plan', name: 'Plan', url: 'https://learn.microsoft.com/en-us/azure/virtual-machines/sizes/lifecycle/sizes-v6-v7-modernization-plan' }, before, { facts }, '2026-10-20');
    assert.match(plan, /## README\n\nNo README fact comes from this source\.\n/);
    const other = changeReport({ id: 'x', name: 'Test page', url: 'https://learn.microsoft.com/en-us/azure/virtual-machines/x' }, before, { facts }, '2026-10-20');
    assert.match(other, /## README\n\nNo README fact comes from this source\.\n/);
    // The fingerprint is over the added and removed lines only.
    const print = createHash('sha256').update(JSON.stringify([['A :: new'], []])).digest('hex').slice(0, 16);
    for (const b of [body, nvme, other]) assert.ok(b.includes(`source-check-fingerprint: ${print}`));
    // A report too long to list the lines keeps the README section and fits in an issue.
    const many = Array.from({ length: 3000 }, (_, i) => `A :: a long line of text number ${i} that Microsoft changed on the page`);
    const long = changeReport(page, before, { facts: many }, '2026-10-20');
    assert.ok(long.length < 60000 && long.includes('too many to list') && long.includes(`\`${now['lifecycle-read']}\``));
});

test('an Azure source issue lists the README facts, and the new size fact', async () => {
    const { reportText, readmeFor } = await import('../tools/azure-sources.mjs');
    const { readFacts } = await import('../tools/readme-facts.mjs');
    const readme = read('README.md');
    const now = readFacts(readme);
    const more = { ...sizes.sizes, Standard_X2_v9: { family: 'x', capabilities: { vCPUs: '2' } } };
    const s = readmeFor('azure-sizes', readme, more, '2026-10-19').join('\n');
    const count = Object.keys(more).length.toLocaleString('en-US');
    assert.ok(s.includes(`Sources: size facts (from data/sizes.js): the README says \`${now.sizes}\`.`));
    assert.ok(s.includes(`With the data that this check read, the README says \`${count} Azure VM sizes, read from Azure on 19 October 2026\`.`), s);
    assert.ok(!readmeFor('azure-sizes', readme, sizes.sizes, sizes.readUtc).join('\n').includes('With the data'), 'no new text when nothing changes');
    assert.match(readmeFor('azure-nva', readme).join('\n'), /^\n## README\n\nNo README fact comes from this source\.$/);
    const c = readmeFor('azure-catalog', readme).join('\n');
    assert.ok(c.includes(`What the tool shows: storage and backup appliances (from data/storage-appliance-images.js): the README says \`${now['storage-vendors']}\`.`));
    assert.ok(!c.includes('With the data'));
    // The README section does not change the fingerprint: the same difference is not posted twice.
    const print = (t) => /source-check-fingerprint: ([0-9a-f]{16})/.exec(t)[1];
    const a = reportText('T', 'Intro.', ['Added: Standard_X2_v9'], ['1. Do it.'], s.split('\n'));
    const b = reportText('T', 'Intro.', ['Added: Standard_X2_v9'], ['1. Do it.']);
    assert.equal(print(a), print(b));
    assert.notEqual(print(reportText('T', 'Intro.', ['Added: Standard_Y1'], ['1. Do it.'], s.split('\n'))), print(a));
    assert.ok(a.indexOf('## README') > a.indexOf('Added: Standard_X2_v9') && a.indexOf('## README') < a.indexOf('## What to do'));
    // A README with a broken mark: the issue says so, and still lists the fact.
    const broken = readmeFor('azure-catalog', readme.replace('<!-- /fact -->', '')).join('\n');
    assert.match(broken, /cannot read the facts in README\.md/);
    assert.match(broken, /the README says \(not found\)/);
});



// ---- The preview feature on the page, in the files and the report (0.9.2-beta, changed in 0.9.5-beta) ----

// The Microsoft page whose Note names the preview feature VMTempDiskResizePreview, for
// its NVMe conversion script ("Migrate a VM from SCSI to NVMe > 3. Usage").
const PREVIEW_PAGE = 'https://learn.microsoft.com/azure/virtual-machines/nvme-linux';

// One list with each case, on the real size table. In that table the size picker gives
// a v6 or v7 size with another kind of temporary disk only from a SCSI temporary disk
// to an NVMe one (every size, checked 2026-11-06); a VM with no temporary disk gets a
// size with none.
const CASES = 'VM name,Current size,Generation,OS,Azure Disk Encryption\n'
    + 'contoso-pw1,Standard_D4s_v3,V2,Windows,No\n'      // SCSI temporary disk: v6 and v7 change it to NVMe
    + 'contoso-pl1,Standard_D4s_v3,V2,Linux,No\n'        // the same on Linux: no feature
    + 'contoso-pu1,Standard_D4s_v3,V2,,No\n'             // and with no OS: "On a Windows VM"
    + 'contoso-pd1,Standard_D4s_v4,V2,Windows,No\n'      // no temporary disk, and no temporary disk on v6 and v7
    + 'contoso-pb1,Standard_B2s,V2,Windows,No\n'         // B v1: Burstable, v6 and v7 need the feature
    + 'contoso-pb2,Standard_B2s,V2,,No\n'                // B v1, no OS
    + 'contoso-pe1,Standard_D4s_v3,V2,Windows,Yes\n';    // Azure Disk Encryption: no v6 or v7 size

test('the preview feature: the link to the Microsoft page that names it, on v6 and v7 rows that need it', async () => {
    const W = await import('../js/words.js');
    assert.equal(W.GUIDANCE.tempDiskPreview, PREVIEW_PAGE);
    const { SOURCES } = await import('../tools/sources.mjs');
    const s = SOURCES.find((x) => x.url.endsWith('/azure/virtual-machines/nvme-linux'));
    assert.ok(s, 'the nvme-linux page is in tools/sources.mjs');
    const snapshot = JSON.parse(read('tools/source-snapshot.json'));
    assert.ok(snapshot[s.id].facts.some((f) => f.includes('must be registered for the VMTempDiskResizePreview feature') && f.includes('the script exits with an error')), 'the Note is in the snapshot');
    assert.ok(SOURCES.some((x) => x.url.endsWith('/azure/virtual-machines/migration/scsi-to-nvme-migration')), 'the SCSI to NVMe page (its Tip) is watched');
    const p = run(CASES).plan;
    const shows = (m) => Object.fromEntries(m.rows.filter((r) => r.series !== 'gen1Route').map((r) => [r.series, W.tempDiskPreview(m, r)]));
    const no = { v5: false, v6: false, v7: false };
    for (const n of ['contoso-pw1', 'contoso-pu1']) assert.deepEqual(shows(byName(p, n)), { v5: false, v6: true, v7: true }, n);
    for (const n of ['contoso-pl1', 'contoso-pd1', 'contoso-pe1']) assert.deepEqual(shows(byName(p, n)), no, n);
    assert.deepEqual(shows(byName(p, 'contoso-pb1')), { v5: false, v6: true, v7: true, burstable: false }, 'Burstable: the words, no NVMe link');
    const pool = run('VM name,Current size,Generation,OS,Managed by,Resource type\ncontoso-pp1,Standard_D4s_v3,V2,Windows,None,Scale set\n').plan.machines[0];
    assert.ok(POOL(pool));
    assert.deepEqual(shows(pool), no, 'a pool gets the pool advice');
    // Each fact on its own, with made-up facts.
    const row = (series, previewFeature, supported = true) => ({ series, option: { supported, previewFeature } });
    const vm = { vm: { os: 'Windows' }, pattern: 'E' };
    for (const f of ['needed', 'windows']) assert.equal(W.tempDiskPreview(vm, row('v6', f)), true, f);
    for (const f of ['not-needed', 'unknown', null]) assert.equal(W.tempDiskPreview(vm, row('v7', f)), false, String(f));
    assert.equal(W.tempDiskPreview(vm, row('v6', 'needed', false)), false, 'no supported size');
    for (const s of ['v5', 'burstable', 'gen1Route']) assert.equal(W.tempDiskPreview(vm, row(s, 'needed')), false, s);
    assert.equal(W.tempDiskPreview({ vm: null }, row('v6', 'needed')), false);
    assert.equal(W.tempDiskPreview(vm, null), false);
});

test('the preview feature on the page, in the CSV file, the report and the about file', async () => {
    const { reportHtml } = await import('../js/report.js');
    const p = run(CASES).plan;
    const all = F.targetRows(p, table, NOW);
    const how = (name, series) => all.find((r) => r['VM name'] === name && r['Series'] === series)['How to move'];
    const withFeature = all.filter((r) => String(r['How to move'] ?? '').includes('VMTempDiskResizePreview')).map((r) => `${r['VM name']} ${r['Series']}`).sort((a, b) => a.localeCompare(b, 'en'));
    assert.deepEqual(withFeature, ['contoso-pb1 Burstable (Bsv2, Basv2)', 'contoso-pb1 v6', 'contoso-pb1 v7', 'contoso-pb2 Burstable (Bsv2, Basv2)', 'contoso-pb2 v6', 'contoso-pb2 v7', 'contoso-pu1 v6', 'contoso-pu1 v7', 'contoso-pw1 v6', 'contoso-pw1 v7']);
    assert.equal(how('contoso-pw1', 'v6'), `${PARALLEL} ${FEATURE}`);
    assert.equal(how('contoso-pl1', 'v6'), PARALLEL);
    assert.equal(how('contoso-pd1', 'v6'), PARALLEL);
    assert.equal(how('contoso-pu1', 'v5'), RESIZE);
    // The report: the first sentence of the move, then the feature (and the link on v6 and v7) on a line of their own.
    const html = reportHtml(p, table, 'cases', NOW);
    const card = (name) => { const i = html.indexOf(`<h3>${name}</h3>`); assert.ok(i > 0, name); return html.slice(i, html.indexOf('</section>', i)); };
    // 0.9.6-beta: v6 and v7 rows that What to do uses have the feature as a step of the second
    // way, with the link; Burstable has it as a step of its one way, then the size without it.
    for (const name of ['contoso-pw1', 'contoso-pu1', 'contoso-pb1', 'contoso-pb2']) {
        assert.ok(card(name).includes(`href="${PREVIEW_PAGE}"`), `${name}: the link`);
        assert.ok(card(name).includes(`<b>Preview feature:</b> ${name === 'contoso-pw1' || name === 'contoso-pb1' ? '' : 'on a Windows VM, '}register VMTempDiskResizePreview on the subscription.`), name);
    }
    const pb1 = rowOf(byName(p, 'contoso-pb1'), 'v5').option.targetSize;
    assert.ok(card('contoso-pb1').includes(`<p class="muted">${FALLBACK_V5(pb1)}</p>`), 'Burstable: the size without the feature, after the steps');
    // contoso-pb1: What to do uses Burstable, so the v6 and v7 rows of the sizes give both ways
    // and the feature words, with the link.
    assert.equal(card('contoso-pb1').split(`${TWO_WAYS_WORDS} ${FEATURE} <a href="${PREVIEW_PAGE}">`).length - 1, 2);
    // ... and its v5 list names it for the size with no temporary disk (review, 2026-11-06).
    assert.equal(card('contoso-pb1').split('VMTempDiskResizePreview').length - 1, 4);
    for (const name of ['contoso-pl1', 'contoso-pe1']) assert.ok(!card(name).includes('VMTempDiskResizePreview') && !card(name).includes(PREVIEW_PAGE), name);
    // The page: the same rule, and the words and the link in each size card (js/page.js).
    const page = read('js/page.js').replace(/\r\n/g, '\n');
    assert.match(page, /if \(c\.how\) card\.append\(el\('p', \{ class: 'hint' \}, c\.how, c\.link \? ' ' : null, c\.link \? el\('a', \{ href: GUIDANCE\.tempDiskPreview, target: '_blank', rel: 'noopener noreferrer', text: PREVIEW_LINK \}\) : null\)\);/);
    assert.match(page, /x\.link \? el\('a', \{ href: GUIDANCE\.tempDiskPreview, target: '_blank', rel: 'noopener noreferrer', text: PREVIEW_LINK \}\) : null/);
    // The about file, the README and the plan.
    const about = F.aboutText(p, readList('VM name,Current size,Generation\n'), 'cases', NOW).replace(/\r\n/g, '\n');
    for (const line of [
        '  v5:        Resize the current VM, when Azure supports a resize to the new size. Burstable is the same.',
        '  Preview:   A Windows VM needs the preview feature VMTempDiskResizePreview for some resizes.',
        `             ${PREVIEW_PAGE}`,
    ]) assert.ok(about.includes(`${line}\n`), line);
    const readme = read('README.md').replace(/\r\n/g, '\n').replace(/\s*\n\s*/g, ' ');
    assert.ok(readme.includes(FEATURE) && readme.includes(PREVIEW_PAGE), 'README');
    assert.ok(read('PLAN.md').replace(/\r\n/g, '\n').replace(/\s*\n\s*/g, ' ').includes(FEATURE), 'PLAN');
});

// ---- 0.9.4-beta: the availability set note gives both methods on v6 and v7 ----

test('availability set on v6 and v7: both methods; a rebuild-only row (Generation 1, a pool) keeps the new-VM words', () => {
    const head = 'VM name,Current size,Generation,OS,Availability set,Resource type,Managed by\n';
    const p = run(head + 'contoso-av1,Standard_D4s_v3,V2,Linux,Yes,VM,None\ncontoso-av2,Standard_D4s_v3,V2,Windows,Yes,VM,None\n'
        + 'contoso-av3,Standard_D4s_v3,V1,Windows,Yes,VM,None\ncontoso-av4,Standard_D4s_v3,V2,Linux,Yes,Scale set,None\n'
        + 'contoso-av5,Standard_D4s_v3,V2,Linux,No,VM,None\ncontoso-av6,Standard_D4s_v3,V2,Linux,,VM,None\n').plan;
    const note = (name, series) => rowOf(byName(p, name), series).caveats['Availability set'];
    for (const name of ['contoso-av1', 'contoso-av2']) {
        for (const s of ['v6', 'v7']) assert.deepEqual([note(name, s).state, note(name, s).text], ['attention', AVSET_BOTH], `${name} ${s}`);
        assert.equal(note(name, 'v5').text, AVSET_STAYS, `${name} v5: a resize, in the words of the resize method (0.9.5-beta)`);
    }
    // The page shows it once, for v6 and v7.
    const shown = F.allNotes(byName(p, 'contoso-av1')).attention.filter((x) => x.topic === 'Availability set');
    assert.ok(shown.some((x) => x.text === AVSET_BOTH && x.series.join() === 'v6,v7'));
    // Generation 1 needs a new VM for v6 and v7; a pool makes new nodes.
    assert.equal(byName(p, 'contoso-av3').vm.gen, 'V1');
    assert.ok(POOL(byName(p, 'contoso-av4')), 'the fixture is a pool');
    for (const name of ['contoso-av3', 'contoso-av4']) for (const s of ['v6', 'v7']) assert.equal(note(name, s).text, AVSET_NEW_VM, `${name} ${s}`);
    assert.deepEqual(note('contoso-av5', 'v6'), { state: '', text: '' });
    assert.equal(note('contoso-av6', 'v6').state, 'check');
});

// ---- 0.9.6-beta: readiness words, and the ways to move, each with its own steps ----
// Owner, 2026-11-07: the Result says the readiness in Azure Migrate's terms; "What to do"
// shows each way to move in its own box, with all the steps of that way.

const LAYOUT_HEAD = COLUMNS.map((c) => c.name);
// A standalone Windows VM on D4s_v3 with every query column: the likely move is v6.
const LAYOUT_BASE = { 'Region': 'eastus2', 'Current size': 'Standard_D4s_v3', 'Generation': 'V2', 'OS': 'Windows', 'NIC count': '1', 'Data-disk count': '1', 'Security type': 'TrustedLaunch',
    'Image publisher': 'MicrosoftWindowsServer', 'Image offer': 'WindowsServer', 'Image SKU': '2022-datacenter-g2', 'Disk controller': 'SCSI', 'Accelerated NICs': '1', 'Primary NIC accelerated': 'Yes',
    'Azure Disk Encryption': 'No', 'Hibernation': 'No', 'Scale set': 'No', 'Azure Virtual Desktop': 'No', 'SAP': 'No', 'Unmanaged disks': 'No', 'Ephemeral OS disk': 'No', 'System-assigned identity': 'No',
    'Availability set': 'No', 'Zone': '1', 'Resource type': 'VM', 'Managed by': 'None', 'SQL Server': 'No', 'SQL availability group': 'No', 'Shared disk': 'No' };
const layoutCell = (v) => (/[",]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
const layoutList = (rows) => [LAYOUT_HEAD.join(','), ...rows.map((r) => LAYOUT_HEAD.map((h) => layoutCell(String(h in r ? r[h] : LAYOUT_BASE[h] ?? ''))).join(','))].join('\n') + '\n';
const layoutOne = (row) => run(layoutList([{ 'VM name': 'contoso-l1', ...row }])).plan.machines[0];
const AN_OFF = { 'Accelerated NICs': '0', 'Primary NIC accelerated': 'No' };
const LINUX = { 'OS': 'Linux', 'Image publisher': 'Canonical', 'Image offer': '0001-com-ubuntu-server-jammy', 'Image SKU': '22_04-lts-gen2' };
const topics = (way) => way.steps.map((s) => s.topic);

test('the result words: Move needed and the readiness, in Azure Migrate terms', async () => {
    const { GROUPS } = await import('../js/words.js');
    const want = {
        modern: ['Modern size', 'No move needed'],
        ready: ['Move needed', 'Ready'],
        first: ['Move needed', 'Ready with conditions'],
        pool: ['Move needed', 'Change it in the service or pool'],
        gate: ['Move needed', 'Vendor approval first'],
        nopath: ['Move needed', 'Not ready: no supported size'],
        unchecked: ['Readiness unknown', 'This tool cannot read this VM or its size'],
    };
    assert.deepEqual(Object.keys(GROUPS), Object.keys(want), 'the same groups, in the same order');
    for (const [g, [move, readiness]] of Object.entries(want)) {
        assert.deepEqual([GROUPS[g].move, GROUPS[g].readiness, GROUPS[g].short], [move, readiness, `${move} - ${readiness}`], g);
        assert.doesNotMatch(GROUPS[g].long, /Before the move|do this first|\bsteps? \(/i, g);
    }
    // The CSV value and the about file use the single line.
    const r = run(sample);
    const row = F.summaryRows(r.plan).find((x) => x['VM name'] === 'contoso-web02');
    assert.equal(row['Result group'], 'Move needed - Ready with conditions');
    const about = F.aboutText(r.plan, r.list, 'sample', NOW);
    for (const g of Object.values(GROUPS)) assert.ok(about.includes(`\r\n  ${g.short}\r\n    ${g.long}\r\n`), g.short);
    assert.doesNotMatch(about, /do this first/i);
    // The page shows the two lines in the Result pill, and the single line in the counts and the filter.
    const page = read('js/page.js');
    assert.match(page, /el\('span', \{ class: 'pill-move', text: GROUPS\[g\]\.move \}\), el\('span', \{ class: 'pill-readiness', text: GROUPS\[g\]\.readiness \}\)/);
});

test('what to do on v6 and v7: two ways, each with all its steps', async () => {
    const { whatToDo } = await import('../js/details.js');
    const W = await import('../js/words.js');
    // Windows, a SCSI temporary disk, a system-assigned identity, accelerated networking off.
    const m = layoutOne({ ...AN_OFF, 'System-assigned identity': 'Yes' });
    assert.equal(F.likelyRow(m).series, 'v6');
    assert.equal(F.likelyRow(m).option.previewFeature, 'needed');
    const w = whatToDo(m, F.groupOf(m));
    assert.equal(w.lead, `Move to ${F.likelyRow(m).option.targetSize}. Choose one of these two ways.`);
    assert.deepEqual(w.ways.map((x) => x.key), ['parallel', 'resize']);
    const [one, two] = w.ways;
    assert.deepEqual([one.label, one.tag, one.title, one.lines], ['Option 1', 'Microsoft recommends', 'Deploy a new VM in parallel', ['Deploy the new VM, move the workload, then delete the old VM.']]);
    assert.deepEqual([two.label, two.tag, two.title, two.lines], ['Option 2', '', 'Change the size of this VM', ['The VM keeps its identity, disks and extensions.']]);
    assert.deepEqual([one.conditions, two.conditions], [true, true]);
    assert.deepEqual(topics(one), ['Accelerated networking', 'Identity']);
    assert.deepEqual(topics(two), ['Accelerated networking', 'Preview feature', 'Page file']);
    // The full note, with the value from the list. Identity: only the steps of a new VM.
    assert.equal(one.steps[0].text, '"Primary NIC accelerated" is No. Turn on accelerated networking before the move. The new size needs it.');
    assert.equal(two.steps[0].text, one.steps[0].text, 'a step of both ways shows in both boxes');
    assert.equal(one.steps[1].text, IDENTITY_NEW_VM);
    assert.deepEqual(two.steps.slice(1).map((s) => [s.topic, s.text, s.link]), [
        ['Preview feature', 'register VMTempDiskResizePreview on the subscription.', true],
        ['Page file', 'move it from the temporary disk to C:.', false]]);
    assert.deepEqual([W.conditionsWords(one.steps.length), W.conditionsWords(two.steps.length), W.conditionsWords(1), W.NO_CONDITIONS], ['Conditions (2 steps)', 'Conditions (3 steps)', 'Conditions (1 step)', 'No conditions.']);
    // No "Before the move" words, and the steps are in no other section.
    assert.doesNotMatch(JSON.stringify(w), /Before the move/);
    assert.deepEqual(w.otherSteps, []);
    // No OS: the feature on a Windows VM.
    const noOsVm = layoutOne({ 'OS': '' });
    const noOs = whatToDo(noOsVm, F.groupOf(noOsVm));
    assert.deepEqual(noOs.ways[1].steps.map((s) => `${s.topic}: ${s.text}`), [
        'Preview feature: on a Windows VM, register VMTempDiskResizePreview on the subscription.',
        'Page file: on a Windows VM, move it from the temporary disk to C:.']);
    assert.deepEqual(noOs.ways[0].steps, []);
});

test('what to do: Linux on v6 has no preview feature; the availability set splits to each way', async () => {
    const { whatToDo } = await import('../js/details.js');
    const m = layoutOne({ ...LINUX, ...AN_OFF, 'Availability set': 'Yes' });
    assert.equal(F.likelyRow(m).series, 'v6');
    const w = whatToDo(m, F.groupOf(m));
    assert.deepEqual(topics(w.ways[0]), ['Accelerated networking']);
    assert.deepEqual(topics(w.ways[1]), ['Accelerated networking']);
    // Good to know in each box, the words of that way, with the value from the list.
    assert.deepEqual(w.ways.map((x) => x.info.map((i) => [i.topic, i.text])), [
        [['Availability set', `"Availability set" is Yes. P${AVSET_PARALLEL.slice(1)}`]],
        [['Availability set', `"Availability set" is Yes. T${AVSET_IN_PLACE.slice(1)}`]]]);
    // No series in a box (review, 2026-11-07), although the note is for v6 and v7 only.
    assert.deepEqual(w.ways.map((x) => x.info.map((i) => i.series)), [[[]], [[]]]);
    assert.deepEqual(F.allNotes(m).attention.find((x) => x.text === AVSET_BOTH).series, ['v6', 'v7']);
    // Not again in "Good to know"; the v5 words (a resize) stay there, with the series.
    assert.ok(!w.attention.some((x) => x.text === AVSET_BOTH));
    assert.ok(w.attention.some((x) => x.text === AVSET_STAYS && x.series.join() === 'v5'));
    // A Linux VM with nothing to do: no steps in either box.
    const cleanVm = layoutOne(LINUX);
    const clean = whatToDo(cleanVm, F.groupOf(cleanVm));
    assert.deepEqual(clean.ways.map((x) => x.steps.length), [0, 0]);
});

test('what to do: one box for v5, Burstable, a pool, SAP and no supported size', async () => {
    const { whatToDo } = await import('../js/details.js');
    const p = run(sample).plan;
    const box = (m) => { const w = whatToDo(m, F.groupOf(m)); assert.equal(w.ways.length, 1, m.read.name); return { w, b: w.ways[0] }; };
    // v5: a resize.
    const web02 = byName(p, 'contoso-web02');
    assert.equal(F.likelyRow(web02).series, 'v5');
    let { w, b } = box(web02);
    assert.equal(w.lead, `Move to ${F.likelyRow(web02).option.targetSize}.`);
    assert.deepEqual([b.key, b.label, b.tag, b.title, b.lines, b.conditions], ['resize', '', '', 'Change the size of this VM', ['The VM keeps its identity, disks and extensions.'], true]);
    assert.deepEqual(topics(b), ['Accelerated networking']);
    // Burstable with the preview feature: the steps, then the size without the feature.
    const bw = run('VM name,Current size,Generation,OS\ncontoso-bw,Standard_B2s,V2,Windows\n').plan.machines[0];
    ({ w, b } = box(bw));
    assert.equal(F.likelyRow(bw).series, 'burstable');
    assert.deepEqual(topics(b).slice(-2), ['Preview feature', 'Page file']);
    assert.equal(b.steps.find((s) => s.topic === 'Preview feature').link, false, 'the NVMe page is for v6 and v7');
    assert.deepEqual(b.after, [FALLBACK_V5(rowOf(bw, 'v5').option.targetSize)]);
    // A pool: its advice, in one box. A service: nothing to do on the VM.
    ({ w, b } = box(byName(p, 'contoso-aks-np1')));
    assert.deepEqual([w.lead, b.key, b.title, b.lines], ['', 'pool', 'Change the size in the service or the pool', ['Add a new AKS node pool at the new size.', 'This scale set is an AKS node pool. Move the workload to the new node pool, then remove the old node pool. Do not change the VMs.']]);
    assert.deepEqual([b.steps, b.after], [[], ['Nothing to do on the VM. The service manages the image and the disks.']]);
    ({ b } = box(byName(p, 'contoso-vmss01')));
    assert.deepEqual([b.key, b.lines[0], b.after], ['pool', 'Make a new scale set at the new size.', []]);
    // SAP: the vendor advice and the sign.
    ({ w, b } = box(byName(p, 'contoso-sap01')));
    assert.deepEqual([b.key, b.title, b.lines], ['vendor', 'Ask SAP which sizes they certify', ['Do not change the VM before that.', 'This tool gives no size. Only SAP can approve a size.',
        '"SAP sign" is "Image SUSE sles-sap-15-sp5". If this VM does not run SAP, set "SAP" to No in your list.']]);
    assert.equal(b.conditions, false);
    ({ b } = box(byName(p, 'contoso-fw01')));
    assert.equal(b.title, 'Ask the vendor which sizes they certify');
    // No supported size: the reason is in "Why".
    ({ b } = box(byName(p, 'contoso-gpu01')));
    assert.deepEqual([b.key, b.lines, b.conditions], ['nopath', ['This tool has no supported size for this VM.', 'See "Why" for the reason.'], false]);
    // No box: a modern size, and a VM that this tool cannot check.
    for (const n of ['contoso-app01', 'contoso-odd01']) assert.deepEqual(whatToDo(byName(p, n), F.groupOf(byName(p, n))).ways, [], n);
});

test('what to do: a VM ready with conditions only to check says to check first; the cluster advice stays', async () => {
    const { whatToDo } = await import('../js/details.js');
    const m = byName(run('VM name,Current size,Generation\ncontoso-z,Standard_D4s_v3,V2\n').plan, 'contoso-z');
    const w = whatToDo(m, F.groupOf(m));
    assert.ok(w.more.includes('Check the facts in "To check" first.'));
    assert.ok(!w.more.some((x) => /Before the move|Do the steps/.test(x)));
    const fc = byName(run(sample).plan, 'contoso-fc01');
    const wf = whatToDo(fc, F.groupOf(fc));
    assert.ok(wf.more.some((x) => x.startsWith('This VM holds state or is part of a cluster')));
    assert.ok(wf.more.includes('You can also use v5 and v7. See "Sizes".'));
});

test('what to do: a step for other series only stays outside the boxes, with the series', async () => {
    const { whatToDo } = await import('../js/details.js');
    // contoso-b02 moves to Burstable; v5 and v6 need accelerated networking.
    const b02 = byName(run(sample).plan, 'contoso-b02');
    const w = whatToDo(b02, F.groupOf(b02));
    assert.equal(F.likelyRow(b02).series, 'burstable');
    assert.deepEqual(w.ways[0].steps, []);
    assert.deepEqual(w.otherSteps.map((x) => [x.topic, x.series.join()]), [['Accelerated networking', 'v5,v6']]);
});

// Each note of each VM shows: in a box (a step, or good to know), or in "Steps for the
// other sizes", "Good to know" or "To check". The value from the list stays with it.
function notesLost(p, whatToDo) {
    const lost = [];
    for (const m of p.machines) {
        const w = whatToDo(m, F.groupOf(m));
        const inBox = w.ways.flatMap((b) => [...b.steps, ...b.info]);
        const shown = [...inBox, ...w.otherSteps, ...w.attention, ...w.checks];
        const n = F.allNotes(m);
        for (const note of [...n.actions, ...n.attention, ...n.checks]) {
            if (shown.some((x) => x.topic === note.topic && x.text === note.text)) continue;
            // A note in two parts, one for each way: each sentence is in a box.
            const parts = inBox.filter((x) => x.topic === note.topic).map((x) => x.text).join(' ');
            const said = /^"[^"]+" is [^.]+\./.exec(note.text)?.[0] || '';
            const rest = note.text.slice(said.length).trim()
                .replace(/If you deploy a new VM in parallel[,:] (\w)/g, (_, c) => c.toUpperCase())
                // The box of the change of the size says it: "The VM keeps its identity, disks and extensions."
                .replace(/If you change the size of the current VM, the VM keeps its identity\./, '')
                .replace(/If you change the size of the current VM: (\w)/g, (_, c) => c.toUpperCase());
            const missing = rest.split(/(?<=\.)\s+/).filter((s) => s && !parts.includes(s));
            if (!said || !parts.includes(said) || missing.length) lost.push(`${m.read.name}: ${note.topic}: ${note.text}`);
        }
    }
    return lost;
}

test('no note is lost: every note of every VM shows, on the samples and the 4,000-VM list', async () => {
    const { whatToDo } = await import('../js/details.js');
    const lists = [...readdirSync(new URL('../samples/', import.meta.url)).map((f) => read(`samples/${f}`)), largeList(4000, 7)];
    let notes = 0;
    let split = 0;
    for (const text of lists) {
        const r = run(text);
        if (r.list.stops.length) continue;
        assert.deepEqual(notesLost(r.plan, whatToDo), []);
        for (const m of r.plan.machines) {
            const n = F.allNotes(m);
            const all = [...n.actions, ...n.attention, ...n.checks];
            notes += all.length;
            // A part of a note in a box: its text is not the text of a note.
            split += whatToDo(m, F.groupOf(m)).ways.flatMap((b) => [...b.steps, ...b.info]).filter((x) => !all.some((y) => y.text === x.text) && !['Preview feature', 'Page file'].includes(x.topic)).length;
        }
    }
    assert.ok(notes > 500 && split > 10, `${notes} notes, ${split} parts of a note in a box`);
    // The check catches a lost note: a model that drops a note fails.
    const m = layoutOne({ 'System-assigned identity': 'Yes', 'Hibernation': 'Yes' });
    const drop = (topic) => (x, g) => { const w = whatToDo(x, g); return { ...w, ways: w.ways.map((b) => ({ ...b, steps: b.steps.filter((s) => s.topic !== topic) })) }; };
    assert.deepEqual(notesLost({ machines: [m] }, whatToDo), []);
    assert.equal(notesLost({ machines: [m] }, drop('Hibernation')).length, 1);
    assert.equal(notesLost({ machines: [m] }, drop('Identity')).length, 1);
});

test('the size cards: the stage of the series, the size that What to do uses, and the ways', async () => {
    const { sizeCard } = await import('../js/details.js');
    const W = await import('../js/words.js');
    const m = layoutOne({ 'System-assigned identity': 'Yes' });
    const g = F.groupOf(m);
    const card = (s) => sizeCard(m, g, rowOf(m, s));
    assert.deepEqual([card('v6').used, card('v5').used, card('v7').used], [true, false, false]);
    assert.equal(W.SIZE_USED, 'What to do uses this size');
    assert.equal(card('v6').how, 'Two ways: see "What to do".');
    assert.equal(card('v7').how, 'Two ways, as for v6.');
    assert.equal(card('v5').how, 'One way: change the size of this VM.');
    assert.equal(card('v6').link, false, 'the link is in the step');
    // The stage of the target series, from the stage data, never other words.
    for (const s of ['v5', 'v6', 'v7']) assert.equal(card(s).stage, rowOf(m, s).option.targetStage.stage, s);
    assert.ok(['Current', 'Extended'].includes(card('v6').stage));
    assert.equal(W.OTHER_SIZES_FIT, 'The other sizes also fit this VM.');
    // When What to do uses Burstable, a v6 card gives both ways and the preview feature itself;
    // the v5 card is a plain resize.
    const bw = run('VM name,Current size,Generation,OS\ncontoso-bw,Standard_B2s,V2,Windows\n').plan.machines[0];
    assert.equal(sizeCard(bw, F.groupOf(bw), rowOf(bw, 'burstable')).used, true);
    const c6 = sizeCard(bw, F.groupOf(bw), rowOf(bw, 'v6'));
    assert.equal(c6.used, false);
    assert.equal(c6.how, `Two ways: deploy a new VM in parallel (Microsoft recommends this), or change the size of this VM. ${FEATURE}`);
    assert.equal(c6.link, true);
    assert.equal(sizeCard(bw, F.groupOf(bw), rowOf(bw, 'v7')).how, c6.how, 'not "as for v6": What to do does not use v6');
    assert.equal(sizeCard(bw, F.groupOf(bw), rowOf(bw, 'v5')).how, 'One way: change the size of this VM.');
    // A v5 card with the feature, that What to do does not use: the words and the size without it.
    const v5 = { series: 'v5', option: { supported: true, targetSize: 'Standard_D2s_v5', previewFeature: 'needed', featureFallback: { size: 'Standard_D2ds_v5' }, targetStage: { stage: 'Extended' } } };
    assert.deepEqual(sizeCard(bw, F.groupOf(bw), v5), { used: false, stage: 'Extended', how: `One way: change the size of this VM. ${FEATURE} ${FALLBACK_SIZE('Standard_D2ds_v5')}`, link: false });
    assert.equal(sizeCard(bw, F.groupOf(bw), { ...v5, option: { ...v5.option, previewFeature: 'unknown' } }).how, `One way: change the size of this VM. ${FEATURE_UNKNOWN}`);
    // A modern size and a pool: no ways on a card, and no card is "used".
    const p = run(sample).plan;
    for (const n of ['contoso-app03', 'contoso-aks-np1']) {
        const x = byName(p, n);
        for (const r of x.rows.filter((y) => y.option.supported)) assert.deepEqual([sizeCard(x, F.groupOf(x), r).used, sizeCard(x, F.groupOf(x), r).how], [false, ''], `${n} ${r.series}`);
    }
});

test('the page and the report show the ways in boxes with headings, and no "Before the move" section for their steps', async () => {
    const { reportHtml } = await import('../js/report.js');
    const r = run(layoutList([{ 'VM name': 'contoso-l1', ...AN_OFF, 'System-assigned identity': 'Yes' }]));
    const m = r.plan.machines[0];
    const html = reportHtml(r.plan, table, 'test', NOW);
    const i = html.indexOf('<h3>contoso-l1</h3>');
    const card = html.slice(i, html.indexOf('</section>\n', i));
    for (const t of ['<h4>What to do</h4>', 'Option 1', 'Microsoft recommends', '<h5>Deploy a new VM in parallel</h5>', '<h5>Change the size of this VM</h5>', 'Conditions (2 steps)', 'Conditions (3 steps)',
        `Move to ${F.likelyRow(m).option.targetSize}. Choose one of these two ways.`, '<b>Preview feature:</b> register VMTempDiskResizePreview on the subscription.', 'What to do uses this size']) assert.ok(card.includes(t), t);
    assert.doesNotMatch(card, /Before the move|Do the steps in/);
    const at = (h) => card.indexOf(`<h4>${h}</h4>`);
    assert.ok(at('What to do') < at('Why') && at('Why') < at('Workload type') && at('Workload type') < at('Good to know') && at('Good to know') < at('Sizes'), 'the order');
    // The boxes stack on a narrow screen.
    assert.match(html, /@media \(max-width: 600px\) \{[^}]*\.ways \{ grid-template-columns: 1fr; \}/);
    // The page: a labelled region for each way, a real heading, and the boxes stack.
    const page = read('js/page.js');
    assert.match(page, /el\('section', \{ class: `way/);
    assert.match(page, /'aria-labelledby': /);
    assert.match(page, /el\('h4', \{ id[,:] /);
    assert.doesNotMatch(page, /section\('Before the move'/);
    assert.doesNotMatch(page, /moveWords\(/, 'the cards use the words of sizeCard');
    assert.match(read('style.css'), /@media \(max-width: 600px\) \{[^}]*\.ways \{ grid-template-columns: 1fr; \}/);
});

test('what to do: the preview feature not checked, a pool with an identity, and a service with no supported size', async () => {
    const { whatToDo, SERVICE_NOTHING } = await import('../js/details.js');
    // The size table does not give the temporary disk: the words are in the box of the resize, not under it.
    const gone = tableWith({ Standard_D4s_v3: null });
    const q = runWith('VM name,Current size,Generation,OS\ncontoso-gw,Standard_D4s_v3,V2,Windows\ncontoso-gv,Standard_D4s_v3,V1,Windows\n', gone);
    for (const m of q.machines) {
        const w = whatToDo(m, F.groupOf(m));
        assert.equal(F.likelyRow(m).option.previewFeature, 'unknown', m.read.name);
        const resize = w.ways.find((b) => b.key === 'resize');
        assert.ok(resize.after.includes(FEATURE_UNKNOWN), m.read.name);
        assert.ok(!w.more.includes(FEATURE_UNKNOWN), m.read.name);
        assert.ok(!w.ways.some((b) => b.key !== 'resize' && b.after.includes(FEATURE_UNKNOWN)), m.read.name);
    }
    assert.deepEqual(q.machines.map((m) => F.likelyRow(m).series), ['v6', 'v5'], 'the fixture: both kinds of box');
    // A scale set (a pool) on v6 with a system-assigned identity: one box, with the whole note.
    const set = run('VM name,Current size,Generation,OS,System-assigned identity,Resource type,Managed by\ncontoso-ss,Standard_D4s_v3,V2,Linux,Yes,Scale set,None\n').plan.machines[0];
    assert.equal(F.likelyRow(set).series, 'v6');
    const ws = whatToDo(set, F.groupOf(set));
    assert.deepEqual(ws.ways.map((b) => b.key), ['pool']);
    assert.deepEqual(ws.ways[0].steps.map((s) => [s.topic, s.text]), [['Identity', IDENTITY_NEW_VM]], 'a pool makes new VMs (review, 2026-11-07)');
    // A VM that a service manages, with no supported size: nothing to do on the VM, as before.
    const k = run('VM name,Current size,Generation,OS,Managed by,Resource type\ncontoso-k1,Standard_NC6s_v3,V2,Linux,AKS,Scale set\n').plan.machines[0];
    assert.equal(F.groupOf(k), 'nopath');
    assert.deepEqual(whatToDo(k, 'nopath').ways[0].after, [SERVICE_NOTHING]);
    // The same VM, as if this tool could not check it: the line is under "What to do".
    assert.ok(whatToDo(k, 'unchecked').more.includes(SERVICE_NOTHING));
    assert.deepEqual(whatToDo(byName(run(sample).plan, 'contoso-sap01'), 'gate').ways[0].after, []);
    // An AKS node pool that the list says runs SAP: vendor approval first, and nothing to do on the VM.
    const ks = run('VM name,Current size,Generation,OS,Managed by,Resource type,SAP\ncontoso-k2,Standard_D4s_v3,V2,Linux,AKS,Scale set,Yes\n').plan.machines[0];
    assert.equal(F.groupOf(ks), 'gate');
    assert.deepEqual(whatToDo(ks, 'gate').ways[0].after, [SERVICE_NOTHING]);
});

test('the size cards: no card is used when What to do gives no size; other preview words give both ways', async () => {
    const { sizeCard } = await import('../js/details.js');
    const m = layoutOne({ 'System-assigned identity': 'Yes' });
    const six = F.likelyRow(m);
    assert.equal(sizeCard(m, 'unchecked', six).used, false);
    assert.equal(sizeCard(m, 'unchecked', six).how, TWO_WAYS_WORDS + ' ' + FEATURE);
    // A v7 size that needs the feature when the v6 size does not: not "as for v6".
    const v7 = rowOf(m, 'v7');
    const other = { ...v7, option: { ...v7.option, previewFeature: 'not-needed' } };
    assert.equal(sizeCard(m, F.groupOf(m), other).how, TWO_WAYS_WORDS);
});

test('the page and the report show the steps for the other sizes, the stage of each series and the used size', async () => {
    const { reportHtml } = await import('../js/report.js');
    const html = reportHtml(run(sample).plan, table, 'sample', NOW);
    const card = (name) => { const i = html.indexOf(`<h3>${name}</h3>`); return html.slice(i, html.indexOf('</section>\n', i)); };
    // contoso-b02 moves to Burstable; v5 and v6 need accelerated networking.
    assert.match(card('contoso-b02'), /<h4>Steps for the other sizes<\/h4><ul class="act"><li><b>Accelerated networking:<\/b> [^<]+ <span class="muted">\(v5 and v6 only\)<\/span><\/li><\/ul>/);
    const web01 = card('contoso-web01');
    assert.ok(web01.includes('<b>Standard_D4ds_v6</b> <span class="tag muted">Current</span><br><b class="used-note">What to do uses this size</b>'));
    assert.ok(web01.includes('<b>Standard_D4ds_v5</b> <span class="tag muted">Extended</span>'));
    assert.ok(web01.includes('<p class="muted">The other sizes also fit this VM.</p>'));
    assert.ok(!card('contoso-api01').includes('Steps for the other sizes'));
    // The page builds the same parts (js/page.js).
    const page = read('js/page.js');
    assert.match(page, /if \(t\.otherSteps\.length\) section\(t\.ways\.length \? OTHER_STEPS : STEPS, noteList\('act', t\.otherSteps\)\);/);
    assert.match(page, /c\.used \? el\('p', \{ class: 'used-note', text: SIZE_USED \}\) : null/);
    assert.match(page, /c\.stage \? el\('span', \{ class: 'tag-stage' \}, el\('span', \{ class: 'vh', text: 'Lifecycle stage of the series: ' \}\), c\.stage\) : null/);
    assert.match(page, /if \(used && others\) hints\.push\(OTHER_SIZES_FIT\);/);
});

// ---- Review of 0.9.6-beta (2026-11-07) ----

test('review: "Ready" does not say that there are no steps: a resize can still need the preview feature', async () => {
    const { GROUPS } = await import('../js/words.js');
    const { whatToDo } = await import('../js/details.js');
    // Owner, 2026-11-07: plain words, no preview feature and no "no steps" there.
    assert.equal(GROUPS.ready.long, 'A supported size is available.');
    assert.equal(GROUPS.first.long, 'A supported size is available. First, do the conditions in "What to do" or check the facts in "To check".');
    for (const g of Object.values(GROUPS)) assert.doesNotMatch(g.long, /preview feature|no steps|^Move needed\./, g.short);
    const readme = read('README.md');
    assert.ok(readme.includes('| Move needed - Ready | A supported size is available. |'));
    assert.ok(readme.includes(`| Move needed - Ready with conditions | ${GROUPS.first.long} |`));
    // The reason: a VM can be Ready and have the preview feature steps in a box.
    const p = run(largeList(4000, 7)).plan;
    const ready = p.machines.filter((m) => F.groupOf(m) === 'ready');
    const withSteps = ready.filter((m) => whatToDo(m, 'ready').ways.some((b) => b.steps.length));
    assert.ok(withSteps.length > 0, 'the fixture has a Ready VM with steps');
    for (const m of withSteps) for (const b of whatToDo(m, 'ready').ways) assert.ok(b.steps.every((s) => ['Preview feature', 'Page file'].includes(s.topic)), m.read.name);
    for (const f of ['README.md', 'PLAN.md']) assert.doesNotMatch(read(f), /no steps to do/, f);
    const r = run(sample);
    assert.doesNotMatch(F.aboutText(r.plan, r.list, 'sample', NOW), /no steps to do/);
});

test('review: the Azure Migrate readiness categories, cited from the current Learn page', async () => {
    // The code names the page without https://, as a note: tools/sources.mjs watches only the pages behind an answer.
    const page = 'learn.microsoft.com/azure/migrate/tutorial-assess-vmware-azure-vm';
    const flat = (f) => read(f).replace(/\r\n/g, '\n').replace(/\s*\n\s*/g, ' ');
    for (const f of ['README.md', 'js/words.js']) {
        assert.ok(read(f).includes(page), `${f}: the link`);
        for (const term of ['Ready for Azure', 'Ready with conditions', 'Not ready for Azure', 'Readiness unknown']) assert.ok(flat(f).includes(term), `${f}: ${term}`);
        assert.doesNotMatch(read(f), /concepts-assessment-calculation/, f);
    }
    assert.ok(flat('PLAN.md').includes(page));
    assert.ok(flat('README.md').includes('"Ready" and "Not ready: no supported size" are the words of this tool'));
});

test('review: no series tag on a step or a fact inside a box; the steps for the other sizes keep it', async () => {
    const { whatToDo } = await import('../js/details.js');
    const { reportHtml } = await import('../js/report.js');
    const p = run(sample).plan;
    const web01 = byName(p, 'contoso-web01');
    const w = whatToDo(web01, F.groupOf(web01));
    assert.deepEqual(w.ways.flatMap((b) => [...b.steps, ...b.info]).map((x) => x.series), [[], [], []]);
    assert.ok(F.allNotes(web01).actions.find((x) => x.topic === 'Identity').series.length, 'the fixture: the note is for v6 and v7 only');
    const html = reportHtml(p, table, 'sample', NOW);
    const i = html.indexOf('<h3>contoso-web01</h3>');
    assert.doesNotMatch(html.slice(i, html.indexOf('<h4>Why</h4>', i)), /only\)/);
    const b02 = byName(p, 'contoso-b02');
    assert.deepEqual(whatToDo(b02, F.groupOf(b02)).otherSteps[0].series, ['v5', 'v6']);
});

test('review: a pool or a service box has the new-VM words only, never the words of a resize', async () => {
    const { whatToDo } = await import('../js/details.js');
    const set = run('VM name,Current size,Generation,OS,System-assigned identity,Resource type,Managed by\ncontoso-ss,Standard_D4s_v3,V2,Linux,Yes,Scale set,None\n').plan.machines[0];
    assert.deepEqual(whatToDo(set, F.groupOf(set)).ways[0].steps.map((s) => [s.topic, s.text]), [['Identity', IDENTITY_NEW_VM]]);
    // The CSV files keep the note as it was.
    assert.equal(rowOf(set, 'v6').caveats['Identity'].text, IDENTITY_PARALLEL);
    // No box of a pool or a service, in the samples and the 4,000-VM list, says to resize or to change the size of the current VM.
    for (const text of [...readdirSync(new URL('../samples/', import.meta.url)).map((f) => read(`samples/${f}`)), largeList(4000, 7)]) {
        const r = run(text);
        if (r.list.stops.length) continue;
        for (const m of r.plan.machines.filter((x) => F.groupOf(x) === 'pool')) {
            for (const s of whatToDo(m, 'pool').ways.flatMap((b) => [...b.steps, ...b.info])) assert.doesNotMatch(s.text, /change the size of the current VM|the VM keeps its identity|stays in its set/i, `${m.read.name}: ${s.topic}`);
        }
    }
});

test('review: the README and the about file say where the CSV files have each kind of step', () => {
    const flat = read('README.md').replace(/\r\n/g, '\n').replace(/\s*\n\s*/g, ' ');
    assert.ok(flat.includes('In vm-summary.csv, the column "Before the move" has the steps from the facts of the VM. The preview feature and the page file are in the columns "How to move" and "Preview feature" of vm-target-sizes.csv.'));
    const r = run(sample);
    const about = F.aboutText(r.plan, r.list, 'sample', NOW);
    assert.ok(about.includes('  In vm-summary.csv, the column "Before the move" has the steps from the facts of the VM.\r\n'));
    assert.ok(about.includes('  The preview feature and the page file are in "How to move" and "Preview feature" of vm-target-sizes.csv.\r\n'));
});

// ---- 0.9.7-beta: is the Trusted launch upgrade open for the OS of a Generation 1 VM? ----
// Microsoft Learn, "Upgrade Gen1 VMs to Trusted launch" (updated 2026-09-24).

const GEN1_PAGE = 'https://learn.microsoft.com/azure/virtual-machines/trusted-launch-existing-vm-gen-1';
const IN_PLACE_PAGE = 'https://learn.microsoft.com/azure/virtual-machines/windows-in-place-upgrade';
const GEN1_REGISTRATION = 'https://aka.ms/Gen1ToTLUpgrade';
const GALLERY_ID = '/subscriptions/00000000-0000-0000-0000-000000000000/resourceGroups/rg-contoso-images/providers/Microsoft.Compute/galleries/contoso/images/web/versions/1.0.0';
const GEN1_HEAD = 'VM name,Current size,Generation,OS,Image publisher,Image offer,Image SKU,Image ID,Plan publisher,Plan product,Unmanaged disks\n';
const gen1Rows = [
    'contoso-g1-ws16,Standard_D4s_v3,V1,Windows,MicrosoftWindowsServer,WindowsServer,2016-Datacenter,,,,No',
    'contoso-g1-sql16,Standard_D4s_v3,V1,Windows,MicrosoftSQLServer,sql2017-ws2016,enterprise,,,,No',
    'contoso-g1-ws19,Standard_D4s_v3,V1,Windows,MicrosoftWindowsServer,WindowsServer,2019-Datacenter,,,,No',
    'contoso-g1-deb,Standard_D4s_v3,V1,Linux,Debian,debian-11,11,,,,No',
    'contoso-g1-cbl,Standard_D4s_v3,V1,Linux,MicrosoftCBLMariner,cbl-mariner,cbl-mariner-2,,,,No',
    'contoso-g1-azl,Standard_D4s_v3,V1,Linux,MicrosoftCBLMariner,azure-linux-3,azure-linux-3,,,,No',
    `contoso-g1-lnxc,Standard_D4s_v3,V1,Linux,,,,${GALLERY_ID},,,No`,
    `contoso-g1-winc,Standard_D4s_v3,V1,Windows,,,,${GALLERY_ID},,,No`,
    `contoso-g1-noos,Standard_D4s_v3,V1,,,,,${GALLERY_ID},,,No`,
    'contoso-g1-plan,Standard_D4s_v3,V1,Linux,,,,,contosoisv,contoso-app,No',
    'contoso-g1-blank,Standard_D4s_v3,V1,Windows,,,,,,,No',
    'contoso-g1-blnx,Standard_D4s_v3,V1,Linux,,,,,,,No',
    'contoso-g1-ubu,Standard_D4s_v3,V1,Linux,Canonical,0001-com-ubuntu-server-jammy,22_04-lts,,,,No',
    // No supported size at all (unmanaged disks): the reason shows under "Why".
    'contoso-g1-debu,Standard_D4s_v3,V1,Linux,Debian,debian-11,11,,,,Yes',
    // On a v5 size already: no move needed.
    'contoso-g1-v5,Standard_D4s_v5,V1,Linux,,,,,,,No',
];
const gen1Plan = () => run(GEN1_HEAD + gen1Rows.join('\n') + '\n').plan;

test('Generation 1: the image decides if the Trusted launch upgrade is open for the OS', async () => {
    const { gen1Upgrade } = await import('../js/extras.js');
    const code = (x, os) => gen1Upgrade(x, os).code;
    const ws = (sku, offer = 'WindowsServer') => ({ imagePublisher: 'MicrosoftWindowsServer', imageOffer: offer, imageSku: sku });
    // 1. Windows Server 2016, also a SQL Server image on Windows Server 2016.
    for (const sku of ['2016-Datacenter', '2016-Datacenter-smalldisk', '2016-datacenter-with-containers']) assert.equal(code(ws(sku), 'Windows'), 'gen1-windows-server-2016', sku);
    assert.equal(code({ imagePublisher: 'microsoftwindowsserver', imageOffer: 'windowsserver', imageSku: '2016-datacenter' }, ''), 'gen1-windows-server-2016', 'case is ignored, the OS column is not needed');
    for (const offer of ['sql2017-ws2016', 'SQL2016SP2-WS2016']) assert.equal(code({ imagePublisher: 'MicrosoftSQLServer', imageOffer: offer, imageSku: 'enterprise' }, 'Windows'), 'gen1-windows-server-2016', offer);
    assert.equal(code({ imagePublisher: 'MicrosoftSQLServer', imageOffer: 'sql2019-ws2019', imageSku: 'enterprise' }, 'Windows'), 'not-built-yet');
    assert.equal(code({ imagePublisher: 'MicrosoftSQLServer', imageOffer: 'sql2016sp2-ws2019', imageSku: 'enterprise' }, 'Windows'), 'not-built-yet', 'SQL Server 2016 on Windows Server 2019');
    for (const sku of ['2019-Datacenter', '2022-datacenter', '2012-R2-Datacenter']) assert.equal(code(ws(sku), 'Windows'), 'not-built-yet', sku);
    // Any publisher: ws2016 in the offer or the SKU, or an offer or SKU that starts with 2016-, on Windows or with no OS.
    const vs = { imagePublisher: 'MicrosoftVisualStudio', imageOffer: 'visualstudio', imageSku: 'vs-2017-ent-ws2016' };
    assert.equal(code(vs, 'Windows'), 'gen1-windows-server-2016', 'a Visual Studio image on Windows Server 2016');
    assert.equal(code(vs, ''), 'gen1-windows-server-2016', 'no OS');
    assert.equal(code({ imagePublisher: 'contosoisv', imageOffer: 'contoso-app-ws2016', imageSku: 'standard' }, 'Windows'), 'gen1-windows-server-2016', 'ws2016 in the offer');
    assert.equal(code({ imagePublisher: 'contosoisv', imageOffer: 'contoso-app', imageSku: '2016-standard' }, 'Windows'), 'gen1-windows-server-2016', 'a SKU that starts with 2016-');
    assert.equal(code({ imagePublisher: 'contosoisv', imageOffer: '2016-contoso', imageSku: 'standard' }, ''), 'gen1-windows-server-2016', 'an offer that starts with 2016-');
    assert.equal(code({ imagePublisher: 'contosoisv', imageOffer: 'contoso-app-ws2016', imageSku: '2016-standard' }, 'Linux'), 'not-built-yet', 'Linux: not Windows Server');
    assert.equal(code({ imagePublisher: 'contosoisv', imageOffer: 'contoso-app', imageSku: 'v2016-1' }, 'Windows'), 'not-built-yet', '2016 that does not start the SKU');
    assert.equal(code({ imagePublisher: 'MicrosoftWindowsServer', imageOffer: 'WindowsServer', imageSku: '2016-Datacenter' }, 'Linux'), 'gen1-windows-server-2016', 'the Windows Server publisher decides, whatever the OS column says');
    // 2. Debian and Azure Linux (CBL-Mariner is its old name).
    assert.deepEqual(gen1Upgrade({ imagePublisher: 'Debian', imageOffer: 'debian-11', imageSku: '11' }, 'Linux'), { code: 'gen1-os-registration', facts: { os: 'Debian', image: 'Debian / debian-11 / 11', oldName: false } });
    assert.equal(code({ imagePublisher: 'credativ', imageOffer: 'Debian', imageSku: '9' }, 'Linux'), 'gen1-os-registration', 'a Debian image from another publisher');
    assert.equal(code({ imagePublisher: 'Debian', imageOffer: 'contoso-offer', imageSku: '12' }, 'Linux'), 'gen1-os-registration', 'any offer of the Debian publisher');
    assert.deepEqual(gen1Upgrade({ imagePublisher: 'MicrosoftCBLMariner', imageOffer: 'cbl-mariner', imageSku: 'cbl-mariner-2' }, 'Linux').facts, { os: 'Azure Linux', image: 'MicrosoftCBLMariner / cbl-mariner / cbl-mariner-2', oldName: true });
    assert.deepEqual(gen1Upgrade({ imagePublisher: 'MicrosoftCBLMariner', imageOffer: 'azure-linux-3', imageSku: 'azure-linux-3' }, 'Linux').facts, { os: 'Azure Linux', image: 'MicrosoftCBLMariner / azure-linux-3 / azure-linux-3', oldName: false });
    // 3. Linux not from an Azure Marketplace image: a gallery image, or a purchase plan only.
    assert.deepEqual(gen1Upgrade({ imageId: GALLERY_ID }, 'Linux'), { code: 'gen1-linux-custom-image', facts: { imageId: GALLERY_ID } });
    assert.deepEqual(gen1Upgrade({ planPublisher: 'contosoisv', planProduct: 'contoso-app' }, 'Linux'), { code: 'gen1-linux-custom-image', facts: { imageId: '' } });
    // 4. A custom image that is not Linux (Windows, or no OS), and no image at all.
    assert.deepEqual(gen1Upgrade({ imageId: GALLERY_ID }, 'Windows'), { code: 'gen1-custom-image', facts: { imageId: GALLERY_ID, osKnown: true } });
    assert.deepEqual(gen1Upgrade({ imageId: GALLERY_ID }, ''), { code: 'gen1-custom-image', facts: { imageId: GALLERY_ID, osKnown: false } });
    for (const os of ['Windows', 'Linux', '']) assert.deepEqual(gen1Upgrade({ imagePublisher: '', imageOffer: '', imageSku: '' }, os), { code: 'gen1-image-unknown', facts: {} }, os);
    assert.equal(code({}, 'Linux'), 'gen1-image-unknown', 'nothing in the list');
    // 5. Every other Marketplace image: the upgrade, with what the list cannot show.
    assert.deepEqual(gen1Upgrade({ imagePublisher: 'Canonical', imageOffer: '0001-com-ubuntu-server-jammy', imageSku: '22_04-lts' }, 'Linux'), { code: 'not-built-yet', facts: { linux: true } });
    assert.deepEqual(gen1Upgrade(ws('2022-datacenter'), 'Windows'), { code: 'not-built-yet', facts: { linux: false } });
    assert.deepEqual(gen1Upgrade(ws('2022-datacenter'), ''), { code: 'not-built-yet', facts: { linux: false } }, 'no OS: the Windows words stay');
});

test('Generation 1: each OS gets its own code on the Generation 1 to 2 row; the v5, v6 and v7 answers do not change', () => {
    const p = gen1Plan();
    const codes = Object.fromEntries(p.machines.map((m) => [m.read.name, rowOf(m, 'gen1Route').codes]));
    assert.deepEqual(codes, {
        'contoso-g1-ws16': ['gen1-windows-server-2016'], 'contoso-g1-sql16': ['gen1-windows-server-2016'], 'contoso-g1-ws19': ['not-built-yet'],
        'contoso-g1-deb': ['gen1-os-registration'], 'contoso-g1-cbl': ['gen1-os-registration'], 'contoso-g1-azl': ['gen1-os-registration'],
        'contoso-g1-lnxc': ['gen1-linux-custom-image'], 'contoso-g1-winc': ['gen1-custom-image'], 'contoso-g1-noos': ['gen1-custom-image'],
        'contoso-g1-plan': ['gen1-linux-custom-image'], 'contoso-g1-blank': ['gen1-image-unknown'], 'contoso-g1-blnx': ['gen1-image-unknown'],
        'contoso-g1-ubu': ['not-built-yet'], 'contoso-g1-debu': ['gen1-os-registration'], 'contoso-g1-v5': ['gen1-image-unknown'],
    });
    // This tool does not plan the upgrade, for any OS: the row stays "Not in this tool", so
    // the result of the VM, its group and "Needs review" do not change with the image.
    for (const m of p.machines) {
        assert.equal(rowOf(m, 'gen1Route').result, 'Not supported by design', m.read.name);
        assert.equal(rowOf(m, 'gen1Route').option.supported, false, m.read.name);
    }
    const same = gen1Rows.filter((r) => !/debu|v5/.test(r)).map((r) => r.split(',')[0]).map((n) => byName(p, n));
    for (const m of same) {
        for (const s of ['v5', 'v6', 'v7']) {
            assert.deepEqual([rowOf(m, s).result, rowOf(m, s).codes, rowOf(m, s).option.targetSize], [rowOf(same[0], s).result, rowOf(same[0], s).codes, rowOf(same[0], s).option.targetSize], `${m.read.name} ${s}`);
        }
        assert.deepEqual([m.outcome, F.groupOf(m), m.needsReview], [same[0].outcome, F.groupOf(same[0]), same[0].needsReview], m.read.name);
    }
    assert.equal(p.review.filter((r) => r.series === 'Gen1 to Gen2 route').length, 0, 'no Generation 1 row is in vm-not-checked.csv');
    // A Generation 2 VM gets no image rule; a Generation 1 VM without one (not from a list): the image is not known.
    assert.equal(run('VM name,Current size,Generation,OS\ncontoso-g2,Standard_D4s_v3,V2,Linux\n').plan.machines[0].vm.gen1Upgrade, undefined);
    const vm = { ...byName(p, 'contoso-g1-ws16').vm };
    delete vm.gen1Upgrade;
    assert.deepEqual(machineAdvice(vm, table, NOW).options.find((o) => o.option === 'gen1Route').notSupported, ['gen1-image-unknown']);
});

test('Generation 1: the words for each OS, from the Microsoft page, with its links', async () => {
    const { optionReason } = await import('../js/reasons.js');
    const p = gen1Plan();
    const why = (name) => optionReason(rowOf(byName(p, name), 'gen1Route'), table, NOW);
    const v5 = rowOf(byName(p, 'contoso-g1-deb'), 'v5').option.targetSize;
    assert.ok(v5, 'the fixture: a Generation 1 VM on D4s_v3 has a v5 size');
    // 1. Windows Server 2016: the in-place upgrade first.
    assert.equal(why('contoso-g1-ws16'), 'The image MicrosoftWindowsServer / WindowsServer / 2016-Datacenter is Windows Server 2016. '
        + 'Microsoft does not support the Trusted launch upgrade of a Generation 1 VM with Windows Server 2016. '
        + 'First, update the guest OS to Windows Server 2019 or 2022 with an in-place upgrade. '
        + 'Then use the Trusted launch upgrade to change the VM to Generation 2. You cannot undo this upgrade. This tool does not give the steps. '
        + `See the Microsoft pages: ${IN_PLACE_PAGE} and ${GEN1_PAGE}.`);
    assert.ok(why('contoso-g1-sql16').startsWith('The image MicrosoftSQLServer / sql2017-ws2016 / enterprise is Windows Server 2016. '));
    // 2. Debian and Azure Linux: the registration, and the v5 size when there is one. Never a new VM or a rebuild.
    assert.equal(why('contoso-g1-deb'), 'The image Debian / debian-11 / 11 is Debian. '
        + 'Microsoft does not support the Trusted launch upgrade of a Generation 1 VM with Debian. '
        + `Microsoft has a registration for Generation 1 Linux VMs that need this upgrade: ${GEN1_REGISTRATION}. `
        + `Azure lists Generation 1 for the v5 size ${v5}. A move to it does not need the upgrade. `
        + `See the Microsoft page: ${GEN1_PAGE}.`);
    assert.ok(why('contoso-g1-cbl').startsWith('The image MicrosoftCBLMariner / cbl-mariner / cbl-mariner-2 is Azure Linux. CBL-Mariner is the old name of Azure Linux. Microsoft does not support the Trusted launch upgrade of a Generation 1 VM with Azure Linux. '));
    assert.doesNotMatch(why('contoso-g1-azl'), /CBL-Mariner/);
    // No v5 size (unmanaged disks): no v5 sentence.
    const noV5 = why('contoso-g1-debu');
    assert.equal(rowOf(byName(p, 'contoso-g1-debu'), 'v5').option.supported, false, 'the fixture');
    assert.doesNotMatch(noV5, /v5 size/);
    assert.ok(noV5.includes(GEN1_REGISTRATION));
    for (const n of ['contoso-g1-deb', 'contoso-g1-cbl', 'contoso-g1-debu']) assert.doesNotMatch(why(n), /rebuild|new VM|deploy/i, n);
    // 3. Linux from no Azure Marketplace image: "Check:".
    assert.equal(why('contoso-g1-lnxc'), 'Check: this tool cannot tell if Microsoft supports the Trusted launch upgrade for this VM. '
        + `The list gives no Azure Marketplace image for this Linux VM. The image ID is ${GALLERY_ID}. `
        + 'Microsoft supports the upgrade of a Generation 1 Linux VM only when the VM comes from a supported OS image in the Azure Marketplace. '
        + `For other Generation 1 Linux VMs, Microsoft has a registration: ${GEN1_REGISTRATION}. `
        + `See the Microsoft page: ${GEN1_PAGE}.`);
    assert.doesNotMatch(why('contoso-g1-plan'), /image ID/);
    // 4. No image, or a custom image that is not Linux: "Check:", never a yes or a no.
    const listed = 'Microsoft does not support the upgrade for Windows Server 2016, Debian, Azure Linux or an OS version that Trusted launch does not support.';
    assert.equal(why('contoso-g1-blank'), `Check: the list does not give the OS image. This tool cannot tell if Microsoft supports the Trusted launch upgrade for this VM. ${listed} See the Microsoft page: ${GEN1_PAGE}.`);
    assert.equal(why('contoso-g1-blnx'), why('contoso-g1-blank'));
    assert.equal(why('contoso-g1-winc'), `Check: the list gives no Azure Marketplace image for this VM. The image ID is ${GALLERY_ID}. `
        + `This tool cannot tell the OS version. ${listed} For a custom image, the base image must be Trusted launch capable. See the Microsoft page: ${GEN1_PAGE}.`);
    assert.ok(why('contoso-g1-noos').includes(`${listed} For Linux, Microsoft supports the upgrade only from a supported OS image in the Azure Marketplace. For a custom image,`), 'no OS: the Linux rule too');
    assert.doesNotMatch(why('contoso-g1-winc'), /For Linux/);
    for (const n of ['contoso-g1-lnxc', 'contoso-g1-winc', 'contoso-g1-noos', 'contoso-g1-plan', 'contoso-g1-blank']) assert.doesNotMatch(why(n), /You cannot undo|use the Trusted launch upgrade/, `${n}: not a yes`);
    // 5. Every other image: today's sentence, the OS rule, and what the list cannot show.
    const today = 'To change a VM from Generation 1 to Generation 2, use the Trusted launch upgrade from Microsoft. You cannot undo this upgrade. This tool does not give the steps. The OS must be a version that Trusted launch supports.';
    const more = 'The Microsoft page lists more conditions. For example, the VM size must be in a size family that supports Trusted launch.';
    assert.equal(why('contoso-g1-ws19'), `${today} The list does not give the facts for these conditions. `
        + 'If Azure Backup is on, it must use the Enhanced policy. '
        + 'If Windows OS volume encryption, for example BitLocker, is on, turn it off before the upgrade. If Azure Site Recovery is on, turn it off before the upgrade. '
        + `${more} See the Microsoft page: ${GEN1_PAGE}.`);
    assert.equal(why('contoso-g1-ubu'), `${today} The list does not give the facts for these conditions. `
        + 'If Azure Backup is on, it must use the Enhanced policy. '
        + 'If Azure Site Recovery is on, turn it off before the upgrade. '
        + `${more} See the Microsoft page: ${GEN1_PAGE}.`);
    assert.doesNotMatch(why('contoso-g1-ws19') + why('contoso-g1-ubu'), /three|two other/);
    // A VM that does not need to move: the note, with "Check:" as it is.
    assert.ok(why('contoso-g1-v5').startsWith('No move needed. Check: the list does not give the OS image.'), why('contoso-g1-v5'));
});

test('Generation 1: the words show on the page, in the report and in vm-target-sizes.csv, with links', async () => {
    const { GUIDANCE: GUIDANCE_PAGES } = await import('../js/words.js');
    const { reportHtml } = await import('../js/report.js');
    const { linkParts, whyLines } = await import('../js/details.js');
    const { optionReason } = await import('../js/reasons.js');
    const p = gen1Plan();
    // vm-target-sizes.csv: the row "Generation 1 to 2" has the reason.
    const csv = F.targetRows(p, table, NOW).filter((r) => r.Series === 'Generation 1 to 2');
    assert.equal(csv.length, p.machines.length);
    const ws16 = csv.find((r) => r['VM name'] === 'contoso-g1-ws16');
    assert.equal(ws16.Reason, optionReason(rowOf(byName(p, 'contoso-g1-ws16'), 'gen1Route'), table, NOW));
    assert.deepEqual([ws16['Series result'], ws16.Supported], ['Not in this tool', 'No']);
    // "Why" of a VM with no supported size has the Generation 1 line (page and report).
    const debu = byName(p, 'contoso-g1-debu');
    assert.equal(F.groupOf(debu), 'nopath', 'the fixture');
    assert.ok(whyLines(debu, 'nopath', table, NOW).some((l) => l.startsWith('Generation 1 to 2: The image Debian / debian-11 / 11 is Debian.')));
    // The links: each URL in a reason is a link, without the full stop after it.
    assert.deepEqual(linkParts(`See: ${GEN1_PAGE}. Then ${GEN1_REGISTRATION}, and (${IN_PLACE_PAGE}).`),
        ['See: ', { href: GEN1_PAGE }, '. Then ', { href: GEN1_REGISTRATION }, ', and (', { href: IN_PLACE_PAGE }, ').']);
    assert.deepEqual(linkParts('No link here.'), ['No link here.']);
    assert.deepEqual(linkParts('http://example.com is not https.'), ['http://example.com is not https.']);
    // Only the addresses in GUIDANCE: an address from the list (an image ID, an image name) stays text.
    assert.deepEqual(linkParts('The image ID is https://evil.example/x.'), ['The image ID is https://evil.example/x.']);
    assert.deepEqual(linkParts(`${GEN1_PAGE}x and ${GEN1_PAGE}/more`), [`${GEN1_PAGE}x and ${GEN1_PAGE}/more`], 'a longer address is not ours');
    assert.deepEqual(linkParts(`${GUIDANCE_PAGES.endOfLife}.`), [{ href: GUIDANCE_PAGES.endOfLife }, '.'], 'every GUIDANCE address');
    const evil = run(GEN1_HEAD + 'contoso-g1-evil,Standard_D4s_v3,V1,Linux,,,,https://evil.example/x,,,Yes\n').plan;
    const em = byName(evil, 'contoso-g1-evil');
    assert.equal(F.groupOf(em), 'nopath', 'the fixture: the reason shows in "Why"');
    const line = whyLines(em, 'nopath', table, NOW).find((l) => l.startsWith('Generation 1 to 2:'));
    assert.ok(line.includes('The image ID is https://evil.example/x.'), 'the value from the list shows, as text');
    assert.ok(!linkParts(line).some((x) => typeof x !== 'string' && /evil/.test(x.href)), 'the page: no link to it');
    assert.ok(!linkParts(optionReason(rowOf(em, 'gen1Route'), table, NOW)).some((x) => typeof x !== 'string' && /evil/.test(x.href)), 'the card: no link to it');
    const evilHtml = reportHtml(evil, table, 'evil', NOW);
    assert.ok(evilHtml.includes('The image ID is https://evil.example/x.') && !evilHtml.includes('href="https://evil.example'), 'the report: no link to it');
    const html = reportHtml(p, table, 'gen1', NOW);
    assert.ok(html.includes(`<a class="url" href="${GEN1_REGISTRATION}">${GEN1_REGISTRATION}</a>`), 'the report: a link in "Why"');
    assert.ok(html.includes(`<a class="url" href="${GEN1_PAGE}">${GEN1_PAGE}</a>.`));
    // In print, a link whose text is its address does not show the address twice.
    assert.ok(html.includes('a.url::after { content: none; }'));
    // The page: the card and "Why" make links of the URLs in a reason.
    const page = read('js/page.js');
    assert.match(page, /linked\(optionReason\(r, table, now\)\)/);
    assert.match(page, /why\.map\(\(w\) => el\('p', \{ class: 'why' \}, linked\(w\)\)\)/);
});

test('Generation 1: the Microsoft pages behind the words are watched', async () => {
    const { GEN1_PAGES_READ, dateWords } = await import('../js/words.js');
    const snapshot = JSON.parse(read('tools/source-snapshot.json'));
    // A change of a page on Learn changes its date in the snapshot: then read the words again, and change GEN1_PAGES_READ.
    assert.equal(snapshot['gen1-trusted-launch'].pageUpdatedUtc, GEN1_PAGES_READ.gen1Upgrade);
    assert.equal(snapshot['windows-in-place-upgrade'].pageUpdatedUtc, GEN1_PAGES_READ.inPlaceUpgrade);
    for (const id of ['gen1-trusted-launch', 'windows-in-place-upgrade']) assert.ok(snapshot[id].readUtc >= GEN1_PAGES_READ.readUtc, id);
    assert.match(read('js/page.js'), /This tool read them on \$\{dateWords\(GEN1_PAGES_READ\.readUtc\)\}\./);
    assert.doesNotMatch(read('js/page.js'), /read them on \d/);
    assert.ok(read('README.md').replace(/\r?\n\s*/g, ' ').includes(`(https://learn.microsoft.com/azure/virtual-machines/windows-in-place-upgrade), read on ${dateWords(GEN1_PAGES_READ.readUtc)}.`));
    const { SOURCES } = await import('../tools/sources.mjs');
    const urls = SOURCES.map((s) => s.url);
    assert.ok(urls.includes('https://learn.microsoft.com/en-us/azure/virtual-machines/trusted-launch-existing-vm-gen-1'));
    assert.ok(urls.includes('https://learn.microsoft.com/en-us/azure/virtual-machines/windows-in-place-upgrade'));
    const W = await import('../js/words.js');
    assert.deepEqual([W.GUIDANCE.gen1Upgrade, W.GUIDANCE.inPlaceUpgrade, W.GUIDANCE.gen1Registration], [GEN1_PAGE, IN_PLACE_PAGE, GEN1_REGISTRATION]);
});

test('Generation 1: the sample list has a Windows Server 2016 VM and a Debian VM on Generation 1', () => {
    const p = run(sample).plan;
    assert.deepEqual(rowOf(byName(p, 'contoso-web02'), 'gen1Route').codes, ['gen1-windows-server-2016']);
    assert.deepEqual(rowOf(byName(p, 'contoso-lnx01'), 'gen1Route').codes, ['gen1-os-registration']);
    // The about file says what the row means, with the Microsoft page.
    const r = run(sample);
    const about = F.aboutText(r.plan, r.list, 'sample', NOW);
    assert.ok(about.includes('\r\nGENERATION 1 TO 2\r\n'));
    assert.ok(about.includes('the row is always "Not in this tool"'));
    assert.ok(about.includes(`  ${GEN1_PAGE}\r\n`));
});
