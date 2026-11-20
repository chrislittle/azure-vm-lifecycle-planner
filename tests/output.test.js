// Run: node --test
// 0.9.9-beta: the same answer on every surface. The page, the report and the CSV files say
// the same thing for each VM, with no blank cell where a value belongs and no "null",
// "undefined" or "NaN" text. Each test names the item of the audit of 2026-11-20 that it holds.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import sizes from '../data/sizes.js';
import storage from '../data/storage-appliance-images.js';
import endOfLife from '../data/end-of-life.js';
import ultra from '../data/premium-v2-ultra-limits.js';
import sample from '../js/sample.js';
import { SizeTable, sizeFacts } from '../js/lifecycle.js';
import { COLUMNS, readList } from '../js/input.js';
import { plan, toMachine } from '../js/planner.js';
import { COMPARE_HINT, MBPS_NOTE, cardNotes, cardTitle, sizeComparison, whatToDo, whyLines } from '../js/details.js';
import { diskWords } from '../js/disks.js';
import { reportHtml } from '../js/report.js';
import { optionReason } from '../js/reasons.js';
import * as F from '../js/files.js';
import * as W from '../js/words.js';
import { installFakeDom } from './fake-dom.js';

const table = new SizeTable(sizes.sizes);
const NOW = new Date('2026-11-20T12:00:00Z');
const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');

function run(text) {
    const l = readList(text);
    return { list: l, p: plan(l.rows.map((r, i) => toMachine(r, l.map, i + 2, table, NOW)), table, NOW) };
}
const { list: sampleList, p: S } = run(sample);
const vm = (name, rg) => {
    const m = S.machines.find((x) => x.read.name === name && (!rg || x.read.resourceGroup === rg));
    assert.ok(m, `${name} is in the sample`);
    return m;
};
const summary = F.summaryRows(S);
const targets = F.targetRows(S, table, NOW);
const sumOf = (m) => summary[S.machines.indexOf(m)];
const targetsOf = (m) => targets.filter((r) => r['Resource ID'] === m.read.resourceId && r['VM name'] === m.read.name);
const report = reportHtml(S, table, 'sample', NOW);
const about = F.aboutText(S, sampleList, 'sample', NOW);
// The card of one VM in the report.
const card = (m) => { const at = report.indexOf(`id="vm-${m.read.row}"`); assert.ok(at > 0, `${m.read.name} has a card`); return report.slice(at, report.indexOf('</section>', at)); };

// A list in the columns of the query.
const HEAD = COLUMNS.map((c) => c.name);
const BASE = { 'Region': 'eastus2', 'Current size': 'Standard_D4s_v3', 'Generation': 'V2', 'OS': 'Linux', 'NIC count': '1', 'Data-disk count': '0', 'Security type': 'TrustedLaunch',
    'Image publisher': 'Canonical', 'Image offer': 'ubuntu-24_04-lts', 'Image SKU': 'server', 'Disk controller': 'SCSI', 'Accelerated NICs': '1', 'Primary NIC accelerated': 'Yes',
    'Azure Disk Encryption': 'No', 'Hibernation': 'No', 'Scale set': 'No', 'Azure Virtual Desktop': 'No', 'SAP': 'No', 'Unmanaged disks': 'No', 'Ephemeral OS disk': 'No', 'System-assigned identity': 'No',
    'Availability set': 'No', 'Zone': '1', 'Resource type': 'VM', 'Managed by': 'None', 'SQL Server': 'No', 'SQL availability group': 'No', 'Shared disk': 'No',
    'Disk types': 'Premium_LRS', 'Disk types (uncached disks)': 'Premium_LRS', 'Disk IOPS (uncached disks)': '500', 'Disk MBps (uncached disks)': '100', 'Disk IOPS (cached disks)': '500', 'Disk MBps (cached disks)': '100' };
const cell = (v) => (/[",]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
const csv = (rows) => [HEAD.join(','), ...rows.map((r) => HEAD.map((h) => cell(String(h in r ? r[h] : BASE[h] ?? ''))).join(','))].join('\n') + '\n';

// ---------------------------------------------------------------------------
// The page, in a stand-in DOM (tests/fake-dom.js)
// ---------------------------------------------------------------------------

const HEADERS = ['VM', 'Current size', 'Generation', 'Lifecycle stage', 'Result', 'v5', 'v6', 'v7', 'Burstable'];
const doc = installFakeDom(HEADERS);
await import('../js/page.js');
const wait = (ms) => new Promise((r) => { setTimeout(r, ms); });
// Load a list in the page, as "Show results" does, and open the details of every VM.
async function showOnPage(text) {
    doc.getElementById('paste').value = text;
    doc.getElementById('run').click();
    await wait(60);
    const rows = doc.getElementById('table').tBodies[0].children.filter((tr) => tr.classList.contains('machine'));
    for (const tr of rows) tr.byClass('name')[0].click();
    return doc.getElementById('table').tBodies[0].children;
}
const pageRows = await showOnPage(sample);
const machineRows = pageRows.filter((tr) => tr.classList.contains('machine'));
const detailsOf = (name, rg) => {
    const i = pageRows.findIndex((tr) => tr.classList.contains('machine') && tr.byClass('name')[0].textContent === name && (!rg || tr.textContent.includes(rg)));
    assert.ok(i >= 0, `${name} is on the page`);
    return { row: pageRows[i], details: pageRows[i + 1] };
};

test('item 1: the page never shows "null", "undefined" or "NaN" (the sample, every VM open)', () => {
    assert.equal(machineRows.length, S.machines.length);
    const bad = [];
    for (const tr of pageRows) {
        const t = tr.textContent;
        for (const w of ['null', 'undefined', 'NaN']) if (new RegExp(`\\b${w}\\b`).test(t)) bad.push(`${w}: ${t.slice(0, 120)}`);
    }
    assert.deepEqual(bad, []);
    // The "What to do" section of a VM on a modern size has its lead text and nothing more.
    const { details } = detailsOf('contoso-app02');
    assert.ok(details.textContent.startsWith('Resource ID:') && details.textContent.includes('What to doNo move needed.This is a modern size'), details.textContent.slice(0, 300));
});

test('items 4, 5, 20: no blank cell in the results table where a value belongs', () => {
    const blank = [];
    for (const tr of machineRows) {
        tr.children.forEach((td, i) => { if (!td.textContent.trim()) blank.push(`${tr.byClass('name')[0].textContent}: ${HEADERS[i]}`); });
    }
    assert.deepEqual(blank, []);
    const cells = (name) => detailsOf(name).row.children.map((td) => td.textContent);
    // A VM with no generation in the list: the stage of its size, and "Not checked" for each series.
    assert.deepEqual(cells('contoso-nogen01').slice(3), ['End of LifeRetires 15 Nov 2029Capacity growth restricted', 'Readiness unknownThis tool cannot read this VM or its size', 'Not checked', 'Not checked', 'Not checked', W.BURSTABLE_ONLY]);
    // A size that this tool does not know: "Not checked" everywhere, Burstable too.
    assert.deepEqual(cells('contoso-odd01').slice(5), ['Not checked', 'Not checked', 'Not checked', 'Not checked']);
    // A VM that is not a B v1, Av2 or Amv2 VM: Burstable says so.
    assert.equal(cells('contoso-web02')[8], W.BURSTABLE_ONLY);
});

test('item 5: a size card of a VM that this tool cannot check says "not checked", never "no size"', () => {
    const m = vm('contoso-odd01');
    for (const r of m.rows) assert.equal(cardTitle(m, r), `${r.series}: not checked`);
    assert.doesNotMatch(detailsOf('contoso-odd01').details.textContent, /no size/);
    // A VM that must move: a blocked series says "no size"; a VM on a modern size: "not needed".
    const web02 = vm('contoso-web02');
    assert.equal(cardTitle(web02, web02.rows.find((r) => r.series === 'v6')), 'v6: no size');
    const app01 = vm('contoso-app01');
    assert.equal(cardTitle(app01, app01.rows.find((r) => r.series === 'v6')), 'v6: not needed');
    assert.equal(cardTitle(app01, app01.rows.find((r) => r.series === 'v5')), 'v5: Standard_D2ds_v5');
});

test('item 6: a VM whose name is in the list twice shows its workload type, then where it is, with a label', () => {
    const { row } = detailsOf('contoso-web01', 'rg-contoso-dr');
    const subs = row.children[0].byClass('sub').map((s) => s.textContent);
    assert.deepEqual(subs, ['Standalone VM', 'Resource group: rg-contoso-dr']);
    // A name that is in the list once: only the workload type.
    assert.deepEqual(detailsOf('contoso-web02').row.children[0].byClass('sub').map((s) => s.textContent), ['Standalone VM']);
});

test('item 10: on the page, a size of a VM that needs no move is for reference, not a move', () => {
    const { row, details } = detailsOf('contoso-app03');
    const v5 = row.children[5].children[0];
    assert.ok(v5.classList.contains('ans-ref') && !v5.classList.contains('ans-ok'));
    assert.match(v5.getAttribute('title'), /For reference/);
    assert.ok(details.textContent.includes('Newer sizes, for reference'));
    // A VM that must move: the size is the answer.
    assert.ok(detailsOf('contoso-web02').row.children[5].children[0].classList.contains('ans-ok'));
});

test('item 12: the page gives the capacity growth restrictions with the time since they started, as the report does', () => {
    const t = doc.getElementById('sources').textContent;
    assert.ok(t.includes('From July 2026 (4 months ago)'), t);
    assert.ok(report.includes('From July 2026 (4 months ago)'));
});

test('item 20: the row of a scale set does not say "scale set" twice', () => {
    assert.deepEqual(detailsOf('contoso-aks-np1').row.children[0].byClass('sub').map((s) => s.textContent), ['3 instances. Node pool or scale set']);
});

// ---------------------------------------------------------------------------
// The size table
// ---------------------------------------------------------------------------

test('item 2: the size table shows "this VM" only when the VM has disks of that kind', () => {
    const rows = (m) => Object.fromEntries(sizeComparison(m, table).rows.map((r) => [r.label, r.cells[0].text]));
    const f01 = rows(vm('contoso-f01'));
    // No uncached disks (0): the limit of the size only. Cached disks: the values of this VM.
    assert.equal(f01['Max disk IOPS (uncached)'], '6,400');
    assert.equal(f01['Max disk MBps (uncached)'], '96');
    assert.equal(f01['Max disk IOPS (cached)'], '8,000 (this VM: 500)');
    // No data disks: no "this VM: 0".
    assert.equal(f01['Max data disks'], '8');
    assert.equal(f01['Max NICs'], '2 (this VM: 1)');
    // "up to 0" never shows.
    for (const m of S.machines) {
        const c = m.vm ? sizeComparison(m, table) : null;
        if (c) for (const r of c.rows) assert.doesNotMatch(r.cells[0].text, /this VM: (up to )?0\)/, `${m.read.name} ${r.label}`);
    }
});

test('item 3: the MBps of a size: the divisor that gives a whole number, in whole MBps', () => {
    const f = (size) => sizeFacts(table.get(size));
    // 131,072,000 bytes per second (a whole multiple of 1,024,000): 128 MBps, as the Microsoft page says.
    assert.equal(f('Standard_D8s_v3').cachedMbps, 128);
    // 145,000,000 (a whole multiple of 10^6): 145.
    assert.equal(f('Standard_D4s_v5').uncachedMbps, 145);
    // 167,772,160 (a whole multiple of 1,048,576): 160.
    assert.equal(f('Standard_L8s_v2').uncachedMbps, 160);
    // 536,870,912: 512.
    assert.equal(f('Standard_F32s_v2').cachedMbps, 512);
    // None of the three: 10^6, rounded to a whole number.
    const made = (bytes) => sizeFacts({ name: 'Standard_Q2_v9', caps: { UncachedDiskBytesPerSecond: String(bytes) } }).uncachedMbps;
    assert.equal(made(22_500_000), 23);
    assert.equal(made(1_234_567), 1);
    assert.equal(made(2_048_000), 2);
    // Every MBps in the size table is a whole number.
    for (const name of table.keys()) {
        const x = f(name);
        for (const k of ['uncachedMbps', 'cachedMbps']) if (x[k] !== null) assert.ok(Number.isInteger(x[k]), `${name} ${k} ${x[k]}`);
    }
    // Numbers in words are whole numbers.
    assert.equal(diskWords(131.072), '131');
    assert.equal(diskWords(12800.4), '12,800');
});

test('item 3: the page, the report and the about file say where the MBps values come from', () => {
    assert.equal(MBPS_NOTE, 'The MBps values come from the Azure size list. They can differ a little from the Microsoft size pages.');
    assert.ok(detailsOf('contoso-web02').details.textContent.includes(MBPS_NOTE));
    assert.ok(card(vm('contoso-web02')).includes(MBPS_NOTE));
    assert.ok(about.includes(`  ${MBPS_NOTE.split('. ')[0]}.`));
});

test('item 18: the hint under the size table says what each note compares', () => {
    assert.equal(COMPARE_HINT, 'A note under a value of a new size shows where the new size has less than this VM needs. For vCPUs, memory, the temporary disk, Premium SSD and the generation, this tool compares the new size with the current size. For NICs and data disks, it compares with this VM. For the disk limits, it compares with what the disks of this VM can do now.');
});

// ---------------------------------------------------------------------------
// A VM with no generation, and a size that this tool does not know (items 4, 5)
// ---------------------------------------------------------------------------

test('item 4: a VM with no generation gets the stage of its size; its sizes stay "Not checked"', () => {
    const m = vm('contoso-nogen01');
    assert.equal(m.stage.stage, 'End of Life');
    assert.equal(m.moveRequired, 'Yes');
    assert.equal(F.groupOf(m), 'unchecked');
    const s = sumOf(m);
    assert.match(s['Current stage'], /^End of Life\. Microsoft retires this series on 15 November 2029\./);
    assert.equal(s['Move needed'], 'Yes');
    assert.deepEqual([s.v5, s.v6, s.v7, s.Burstable], ['Not checked', 'Not checked', 'Not checked', W.BURSTABLE_ONLY]);
    for (const c of ['Suggested - Current stage', 'Suggested - Extended stage', 'What to do uses']) assert.equal(s[c], 'Not checked');
    const t = targetsOf(m);
    assert.deepEqual(t.map((r) => r.Series), ['v5', 'v6', 'v7']);
    for (const r of t) {
        assert.equal(r['Series result'], 'Not checked');
        assert.equal(r.Supported, 'Not checked');
        assert.match(r['Current stage'], /^End of Life/);
        assert.match(r.Reason, /generation/);
    }
    // The report: the stage, not "Not checked".
    assert.match(card(m), /End of Life\. Microsoft retires this series on 15 November 2029/);
    assert.match(whyLines(m, 'unchecked', table, NOW)[0], /^End of Life/);
    // A B v1 VM with no generation: Burstable is "Not checked" too, and it has a Burstable row.
    const b = run(csv([{ 'VM name': 'contoso-x4', 'Current size': 'Standard_B2s', 'Generation': '', 'Security type': 'Standard' }]));
    assert.equal(F.summaryRows(b.p)[0].Burstable, 'Not checked');
    assert.deepEqual(F.targetRows(b.p, table, NOW).map((r) => r.Series), ['v5', 'v6', 'v7', 'Burstable (Bsv2, Basv2)']);
    // A row with no size: no stage, as before.
    const { p } = run(csv([{ 'VM name': 'contoso-x1', 'Current size': '', 'Generation': '' }]));
    assert.equal(p.machines[0].stage, null);
    assert.equal(F.summaryRows(p)[0]['Current stage'], 'Not checked. This tool cannot identify this size.');
});

test('item 5: a size that this tool does not know is "Not checked" in vm-target-sizes.csv, never a "No"', () => {
    for (const r of targetsOf(vm('contoso-odd01'))) {
        assert.equal(r['Series result'], 'Not checked');
        assert.equal(r.Supported, 'Not checked');
    }
    assert.equal(sumOf(vm('contoso-odd01')).Burstable, 'Not checked');
});

// ---------------------------------------------------------------------------
// vm-target-sizes.csv (items 8, 9)
// ---------------------------------------------------------------------------

test('item 8: a row with no target size has no target facts and no move notes, only the note of its reason', () => {
    const facts = ['Target stage', 'Lifecycle change', 'Rebuild', 'Region availability', 'Premium SSD on target', 'Burstable ends', 'How to move', 'Ranked sizes', 'Preview feature', ...F.CAVEAT_TOPICS];
    let seen = 0;
    for (const r of targets) {
        if (r['Target size']) continue;
        seen++;
        // A VM on a modern size keeps its own facts (item 11): only the Azure Disk Encryption note.
        // A blocked row keeps the note of its reason (the SAP column has the SAP note: 0.9.4-beta).
        const allowed = r['Move needed'] === 'No' ? ['Disk encryption'] : ['SAP', 'Network virtual appliance', 'Storage or backup appliance', 'Unmanaged disks', 'Ephemeral OS disk', 'Disk encryption'];
        for (const c of facts) if (!allowed.includes(c)) assert.equal(r[c] || '', '', `${r['VM name']} ${r.Series} ${c}`);
    }
    assert.ok(seen > 20);
    // A row with a size keeps them.
    const v5 = targetsOf(vm('contoso-web02')).find((r) => r.Series === 'v5');
    assert.equal(v5['Target stage'], 'Extended');
    assert.match(v5['Accelerated networking'], /Turn on accelerated networking/);
    // A blocked row: the note of its reason, and no other note (fw01 v7: no NVMe, temporary disk or availability set note).
    const fw = targetsOf(vm('contoso-fw01')).find((r) => r.Series === 'v7');
    assert.match(fw['Network virtual appliance'], /Ask the vendor/);
    for (const c of ['NVMe', 'Temporary disk', 'Availability set', 'Target stage']) assert.equal(fw[c], '', c);
    // web02 (Generation 1) on v6: no note at all (the reason is the generation).
    const w6 = targetsOf(vm('contoso-web02')).find((r) => r.Series === 'v6');
    for (const c of F.CAVEAT_TOPICS) assert.equal(w6[c], '', c);
    // sap01: the SAP note on every row (0.9.4-beta), no temporary disk note.
    for (const r of targetsOf(vm('contoso-sap01'))) { assert.match(r.SAP, /^"SAP" is Yes/); assert.equal(r['Temporary disk'], ''); }
});

test('item 9: a VM that a service manages has no notes in vm-target-sizes.csv, as the page and the about file say', () => {
    for (const name of ['contoso-aks-np1', 'contoso-dbx01']) {
        for (const r of targetsOf(vm(name))) for (const c of F.CAVEAT_TOPICS) assert.equal(r[c], '', `${name} ${r.Series} ${c}`);
    }
    assert.ok(about.includes('A VM that a service manages (AKS, Azure Red Hat OpenShift, Azure Databricks) has no notes.'));
    // A scale set of the customer's own keeps its notes.
    assert.ok(targetsOf(vm('contoso-vmss01')).some((r) => r['Temporary disk']));
});

// ---------------------------------------------------------------------------
// One recommendation (item 7) and a VM that needs no move (items 10, 11)
// ---------------------------------------------------------------------------

test('item 7: vm-summary.csv names the size that "What to do" uses, and its notes are the notes of that size', () => {
    const m = vm('contoso-b02');
    const s = sumOf(m);
    assert.equal(s['What to do uses'], 'Burstable - Standard_B2ls_v2');
    assert.equal(F.SUMMARY_COLUMNS[F.SUMMARY_COLUMNS.length - 1], 'What to do uses');
    // The report and the page use the same size.
    assert.ok(report.includes('Burstable: B2ls_v2'));
    assert.match(whatToDo(m, F.groupOf(m)).lead, /Standard_B2ls_v2/);
    // The notes are those of Burstable: no accelerated networking step (Bsv2 does not need it).
    assert.equal(s['Before the move'], '');
    assert.match(s['Good to know'], /The new size has no temporary disk/);
    // The stage columns hold sizes of that stage only.
    assert.equal(s['Suggested - Current stage'], 'v6 - Standard_D2lds_v6');
    assert.equal(s['Suggested - Extended stage'], 'v5 - Standard_D2lds_v5');
    const t = targetsOf(m);
    assert.deepEqual(t.map((r) => [r.Series, r.Suggested]), [['v5', 'Extended stage'], ['v6', 'Current stage'], ['v7', ''], ['Burstable (Bsv2, Basv2)', 'What to do']]);
});

test('items 7, 10: the about file says what "What to do uses" and the two Suggested columns hold', () => {
    for (const line of [
        '                         The column "What to do uses" gives the size that "What to do" uses, as on the page and in the report.',
        '                         "Before the move", "Good to know" and "To check" give the notes of that size.',
        '                         "Suggested - Current stage" gives a v6 or v7 size. "Suggested - Extended stage" gives a v5 size.',
        '                         With no size of that stage, they say why, for example "No supported Current size".',
        '                         They can also say "Not needed", "Vendor approval first", "No supported size" or "Not checked".',
    ]) assert.ok(about.includes(`${line}\r\n`), line);
});

test('owner, 2026-11-20: "Good to know" and "To check" give the notes of the size that "What to do" uses; the other sizes have theirs in their card', () => {
    const m = vm('contoso-b02');
    const g = F.groupOf(m);
    const burstable = 'Temporary disk: The current size Standard_B2s has a temporary disk of 8 GiB. The new size has no temporary disk. The move deletes the data on the current temporary disk.';
    const d = 'The current size Standard_B2s has a temporary disk of 8 GiB. The move deletes the data on the temporary disk. Keep nothing there that you need.';
    const t = whatToDo(m, g);
    assert.deepEqual(t.attention.map((x) => `${x.topic}: ${x.text}`), [burstable]);
    assert.ok(t.attention.every((x) => x.series.length === 0));
    // The same as vm-summary.csv.
    assert.equal(sumOf(m)['Good to know'], burstable);
    // The D sizes: their own note in their card. The card of "What to do" has none.
    const row = (s) => m.rows.find((r) => r.series === s);
    for (const s of ['v5', 'v6', 'v7']) assert.deepEqual(cardNotes(m, g, row(s)).map((x) => [x.topic, x.text, x.state]), [['Temporary disk', d, 'attention']], s);
    assert.deepEqual(cardNotes(m, g, row('burstable')), []);
    // "Steps for the other sizes" stays (owner, 0.9.6-beta): accelerated networking for v5 and v6.
    assert.deepEqual(t.otherSteps.map((x) => [x.topic, x.series]), [['Accelerated networking', ['v5', 'v6']]]);
    // The page and the report.
    const { details } = detailsOf('contoso-b02');
    const good = details.textContent.split('Good to know')[1].split('Sizes')[0];
    assert.ok(good.includes(burstable.replace('Temporary disk: ', '')) && !good.includes(d), good);
    const cards = details.byClass('series')[0].children;
    assert.ok(cards.find((c) => c.textContent.startsWith('v5:')).textContent.includes(`Temporary disk: ${d}`));
    assert.ok(!cards.find((c) => c.textContent.startsWith('Burstable')).textContent.includes(d));
    const c = card(m);
    assert.equal(c.split(d).length, 4, 'the report: the note of each D size, in its row of the sizes table');
    assert.ok(!c.split('<h4>Good to know</h4>')[1].split('</ul>')[0].includes(d));
    // A disk note of another size only: in the card of that size (mq01: v5 lowers the ceiling, What to do uses v6).
    const mq = vm('contoso-mq01');
    const mt = whatToDo(mq, F.groupOf(mq));
    assert.ok(!mt.attention.some((x) => x.topic === 'Disk limits'));
    assert.match(cardNotes(mq, F.groupOf(mq), mq.rows.find((r) => r.series === 'v5')).find((x) => x.topic === 'Disk limits').text, /^The disks of this VM can do more than the new size allows\./);
    // A VM whose notes are the same on each size: nothing in the cards.
    const w = vm('contoso-web01', 'rg-contoso-prod');
    for (const r of w.rows) assert.deepEqual(cardNotes(w, F.groupOf(w), r), []);
    // A fact to check of another size only: in its card, not in "To check" (a B VM with no
    // accelerated networking facts: Burstable does not need it, v5 and v6 do).
    const { p: cp } = run(csv([{ 'VM name': 'contoso-x7', 'Current size': 'Standard_B2s', 'Accelerated NICs': '', 'Primary NIC accelerated': '' }]));
    const ck = cp.machines[0];
    const ckt = whatToDo(ck, F.groupOf(ck));
    assert.ok(!ckt.checks.some((x) => x.topic === 'Accelerated networking'), JSON.stringify(ckt.checks));
    assert.ok(cardNotes(ck, F.groupOf(ck), ck.rows.find((r) => r.series === 'v5')).some((x) => x.topic === 'Accelerated networking' && x.state === 'check'));
    // A scale set of the customer's own on a B size: the notes of all its sizes, as before.
    const { p: sp } = run(csv([{ 'VM name': 'contoso-x6', 'Current size': 'Standard_B2s', 'Resource type': 'Scale set', 'Scale set': 'Yes', 'Generation': 'V2' }]));
    const ss = sp.machines[0];
    assert.equal(F.groupOf(ss), 'pool');
    assert.equal(whatToDo(ss, 'pool').attention.filter((x) => x.topic === 'Temporary disk').length, 2);
    // A pool, a service and a VM that stays keep their notes as before.
    for (const name of ['contoso-vmss01', 'contoso-sql01']) {
        const x = vm(name);
        assert.deepEqual(whatToDo(x, F.groupOf(x)).attention, F.allNotes(x).attention.filter((n) => !whatToDo(x, F.groupOf(x)).ways.some((b) => b.info.includes(n))), name);
        for (const r of x.rows) assert.deepEqual(cardNotes(x, F.groupOf(x), r), [], name);
    }
});

test('item 10: the stage columns of vm-summary.csv hold only sizes of that stage', () => {
    for (const m of S.machines) {
        const s = sumOf(m);
        for (const [col, stage] of [['Suggested - Current stage', 'Current'], ['Suggested - Extended stage', 'Extended']]) {
            const r = m.rows.find((x) => x.option.supported && `${x.series} - ${x.option.targetSize}` === s[col]);
            if (r) assert.equal(r.option.targetStage.stage, stage, `${m.read.name} ${col}`);
            else assert.ok(['Not needed', 'Not checked', 'Vendor approval first', 'No supported size', `No supported ${stage} size`].includes(s[col]), `${m.read.name} ${col}: ${s[col]}`);
        }
    }
    // A Generation 1 VM: v6 and v7 need Generation 2, so no Current size.
    const web02 = sumOf(vm('contoso-web02'));
    assert.equal(web02['Suggested - Current stage'], 'No supported Current size');
    assert.equal(web02['Suggested - Extended stage'], 'v5 - Standard_D4ds_v5');
    assert.equal(web02['What to do uses'], 'v5 - Standard_D4ds_v5');
});

test('item 10: a VM that needs no move: no suggestion, no move notes and no move advice on any surface', () => {
    for (const name of ['contoso-app01', 'contoso-app03', 'contoso-avd01']) {
        const m = vm(name);
        const s = sumOf(m);
        assert.deepEqual([s['Suggested - Current stage'], s['Suggested - Extended stage'], s['What to do uses']], ['Not needed', 'Not needed', 'Not needed'], name);
        assert.equal(s['Workload type advice'], 'No move needed.', name);
        assert.deepEqual([s['Before the move'], s['To check']], ['', ''], name);
        for (const r of targetsOf(m)) {
            assert.equal(r.Suggested, '', `${name} ${r.Series}`);
            for (const c of F.CAVEAT_TOPICS) assert.equal(r[c], '', `${name} ${r.Series} ${c}`);
        }
    }
    // app03 has hibernation on: a step for a move, so it shows nowhere for a VM that stays.
    // ("Facts from your list" still gives the value as the list gives it.)
    assert.doesNotMatch(detailsOf('contoso-app03').details.textContent, /Hibernation: /);
});

test('item 11: Azure Disk Encryption on a VM that needs no move shows as a fact to know, on every surface', () => {
    const m = vm('contoso-sql01');
    const text = '"Azure Disk Encryption" is Yes. Microsoft retires Azure Disk Encryption on 15 September 2028. Move to encryption at host with the Microsoft migration steps. They make new disks and a new VM.';
    assert.deepEqual(whatToDo(m, 'modern').attention.map((x) => `${x.topic}: ${x.text}`), [`Disk encryption: ${text}`]);
    assert.equal(sumOf(m)['Good to know'], `Disk encryption: ${text}`);
    for (const r of targetsOf(m)) assert.equal(r['Disk encryption'], text);
    assert.ok(detailsOf('contoso-sql01').details.textContent.includes(`Good to knowDisk encryption: ${text}`));
    // The report has no card for a VM that stays: the fact is under the VMs on a modern size.
    assert.ok(report.includes(`<li><b>contoso-sql01</b>: Disk encryption: ${text.replace(/"/g, '&quot;')}</li>`));
    // The sentences are those of the Microsoft migration page (reasons.js, disk-encryption-present).
    assert.ok(optionReason(m.rows.find((r) => r.series === 'v6'), table, NOW).includes('Microsoft retires Azure Disk Encryption on 15 September 2028. Move to encryption at host with the Microsoft migration steps. They make new disks and a new VM'));
    // No Azure Disk Encryption: no note. A blank value is not a Yes: no note either.
    assert.equal(sumOf(vm('contoso-app02'))['Good to know'], '');
    const { p } = run(csv([{ 'VM name': 'contoso-x2', 'Current size': 'Standard_D4s_v5', 'Azure Disk Encryption': '' }, { 'VM name': 'contoso-x3', 'Azure Disk Encryption': 'Yes' }]));
    assert.equal(p.machines[0].moveRequired, 'No');
    assert.deepEqual(F.stayNotes(p.machines[0]), []);
    assert.equal(F.summaryRows(p)[0]['Good to know'], '');
    // A VM that must move: its notes come from its sizes, never from stayNotes.
    assert.equal(p.machines[1].moveRequired, 'Yes');
    assert.deepEqual(F.stayNotes(p.machines[1]), []);
});

// ---------------------------------------------------------------------------
// The page and the report say the same (item 12)
// ---------------------------------------------------------------------------

test('item 12: the report gives the Microsoft guidance for vendor approval and no supported size, as the page does', () => {
    for (const name of ['contoso-fw01', 'contoso-gpu01']) {
        assert.ok(card(vm(name)).includes('Microsoft guidance: <a href="https://learn.microsoft.com/azure/virtual-machines/sizes/lifecycle/end-of-life-sizes-list">End of Life sizes</a>'), name);
        assert.ok(detailsOf(name).details.textContent.includes('Microsoft guidance: End of Life sizes, retirements.'), name);
    }
});

test('item 12: the report gives the notes about the list, as the page does', () => {
    const m = vm('contoso-odd01');
    assert.ok(card(m).includes('Notes about the list: Standard_Q4z_v9 is not in the size table.'));
    assert.ok(detailsOf('contoso-odd01').details.textContent.includes('Notes about the list: Standard_Q4z_v9 is not in the size table.'));
});

test('item 12: "Why" of a vendor appliance gives every reason of vm-target-sizes.csv, the vendor first', () => {
    const m = vm('contoso-weka01');
    const why = whyLines(m, 'gate', table, NOW).join(' ');
    assert.ok(why.indexOf('This VM is a storage or backup appliance.') < why.indexOf('This tool gives no target size for the Ls and Lsv2 storage sizes.'));
    for (const r of targetsOf(m)) for (const s of r.Reason.split(/(?<=\.)\s+/)) assert.ok(why.includes(s), s);
    // Each sentence once.
    assert.equal(why.split('This VM is a storage or backup appliance.').length, 2);
});

test('item 12: the counts are in the same order on the page, in the report and in the about file', () => {
    const order = Object.keys(W.GROUPS).map((g) => W.GROUPS[g].short);
    const pageOrder = doc.getElementById('counts').children.map((b) => b.children[1].textContent);
    assert.deepEqual(pageOrder, order);
    const tiles = [...report.matchAll(/<div class="tile"><b>\d+<\/b><span class="tag \w+">([^<]+)<\/span>/g)].map((x) => x[1]);
    assert.deepEqual(tiles, order);
    const aboutOrder = about.split('\r\n').filter((l) => order.some((o) => l.startsWith(`  ${o}: `))).map((l) => l.trim().replace(/: \d+$/, ''));
    assert.deepEqual(aboutOrder, order);
});

// ---------------------------------------------------------------------------
// Text slips (items 13 to 19)
// ---------------------------------------------------------------------------

test('item 13: the about file writes each date in full, and the lifecycle pages with the date that the page gives', () => {
    const dates = [...new Set(ultra.pages.map((x) => x.readUtc))].sort().map((d) => W.dateWords(d));
    assert.ok(about.includes(`This tool read these pages on ${dates.join(' and ')}.`));
    assert.doesNotMatch(about, /\d (Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) \d{4}/);
    const lifecycle = W.datesWords(endOfLife.sources.map((x) => x.readUtc));
    assert.ok(about.includes(`read on ${lifecycle}.`));
    assert.ok(doc.getElementById('sources').textContent.includes(`This tool read them on ${lifecycle}.`));
    assert.equal(W.datesWords(['2026-11-20', '2026-11-06', '2026-11-20']), '6 November 2026 and 20 November 2026');
});

test('item 14: the report writes 2* once', () => {
    assert.doesNotMatch(report, /2\* \*|\* <span class="muted">\*/);
    assert.match(report, /Generation: 2\* <span class="muted">The generation is empty\./);
});

test('item 15: the report gives the stage and its date apart, as the page does', () => {
    assert.doesNotMatch(report, /Retired On|End of Life Retires/);
    assert.match(report, /<td>Retired<br><span class="muted">On 30 Sep 2025<\/span><\/td>/);
});

test('item 16: a reason for one series does not name the series twice', () => {
    const why = whyLines(vm('contoso-old01'), 'nopath', table, NOW);
    assert.ok(why.includes('v6 sizes support only Generation 2 VMs. This VM is Generation 1.'), why.join(' | '));
    for (const m of S.machines) for (const w of whyLines(m, F.groupOf(m), table, NOW)) assert.doesNotMatch(w, /^(v\d|Burstable): \1 /, w);
});

test('item 17: each ranked size says how it differs: the family, the processor and the temporary disk', () => {
    const m = vm('contoso-f01');
    const words = (series) => F.rankedFor(m, m.rows.find((r) => r.series === series), table, NOW).map((x) => `${x.size} (${x.why})`);
    assert.ok(words('v6').includes('Standard_F4als_v6 (Same shape, other family, AMD processor, no temporary disk*)'), words('v6').join('; '));
    assert.ok(words('v7').includes('Standard_F4alds_v7 (Same shape, other family, AMD processor*)'), words('v7').join('; '));
    assert.ok(words('v6').includes('Standard_D4alds_v6 (Same shape, AMD processor*)'));
    assert.equal(W.rankWords('same-shape', 'Intel', null, { processor: false, tempDisk: 'added' }), 'Same shape, other family, with a temporary disk');
    assert.equal(W.rankWords('same-shape', 'Intel'), 'Same shape, other family');
});

test('item 19: each storage vendor of our list is a company name, with its products in brackets', () => {
    for (const v of [...storage.vendors, ...storage.galleries]) assert.match(v.vendor, /^[A-Z][\w.-]*(?: [A-Z][\w.-]*)?(?: \([^()]+\))?$/, v.vendor);
    assert.equal(storage.vendors.find((v) => v.publisher === 'cohesity').vendor, 'Cohesity (DataPlatform Cloud Edition)');
    assert.equal(sumOf(vm('contoso-rbk01')).Vendor, 'Rubrik');
    const { p } = run(csv([{ 'VM name': 'contoso-x5', 'Image publisher': 'cohesity', 'Image offer': 'cohesity-cloudtd-tool', 'Image SKU': 'cohesity-dataplatform-cloud-edition-2021' }]));
    assert.equal(F.summaryRows(p)[0].Vendor, 'Cohesity (DataPlatform Cloud Edition)');
});

test('item 20: the about file leaves out the workload types with no VM', () => {
    assert.doesNotMatch(about, /: 0\. /);
    assert.ok(about.includes('  Standalone VM: '));
});

test('item 20: the advice for a cluster gives both ways for v6 and v7, as "What to do" does', () => {
    assert.match(W.PATTERNS.F.advice, /For v6 and v7, add a new node at the new size, then remove the old node\. You can also change the size of the node\./);
    const t = whatToDo(vm('contoso-fc01'), 'ready');
    assert.deepEqual(t.ways.map((w) => w.title), ['Deploy a new VM in parallel', 'Change the size of this VM']);
});

test('item 20: the Burstable column says when Burstable does not apply', () => {
    assert.equal(W.BURSTABLE_ONLY, 'Only for B v1, Av2 and Amv2 VMs');
    for (const m of S.machines) {
        const s = sumOf(m);
        assert.notEqual(s.Burstable, '', m.read.name);
        if (m.rows && m.rows.some((r) => r.series === 'burstable')) assert.notEqual(s.Burstable, W.BURSTABLE_ONLY);
    }
});
