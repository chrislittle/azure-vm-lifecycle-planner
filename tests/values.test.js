// Run: node --test
// 0.9.0-beta: the current size beside each new size, the values behind each note,
// the time left to a retirement date, and the vendor of a managed application.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import sizes from '../data/sizes.js';
import capacity from '../data/capacity.js';
import sample from '../js/sample.js';
import { SizeTable, sizeFacts } from '../js/lifecycle.js';
import { COLUMNS, readList } from '../js/input.js';
import { plan, toMachine } from '../js/planner.js';
import { caveats } from '../js/extras.js';
import { reasonFor } from '../js/reasons.js';
import { COMPARE_CAPTION, NOT_IN_TABLE, sizeComparison, whyLines } from '../js/details.js';
import { appliancesByVendor, workloadFound } from '../js/evidence.js';
import { reportHtml } from '../js/report.js';
import { capacityWords, countdownWords, monthDay, stageWords, wholeMonths } from '../js/words.js';
import * as F from '../js/files.js';

const table = new SizeTable(sizes.sizes);
const NOW = new Date('2026-10-17T12:00:00Z');
const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');

// A list with every query column: a standalone Windows VM on D4s_v3, and changes for each row.
const HEAD = COLUMNS.map((c) => c.name);
const BASE = { 'Region': 'eastus2', 'Current size': 'Standard_D4s_v3', 'Generation': 'V2', 'OS': 'Windows', 'NIC count': '1', 'Data-disk count': '1', 'Security type': 'TrustedLaunch',
    'Image publisher': 'MicrosoftWindowsServer', 'Image offer': 'WindowsServer', 'Image SKU': '2022-datacenter-g2', 'Disk controller': 'SCSI', 'Accelerated NICs': '1', 'Primary NIC accelerated': 'Yes',
    'Azure Disk Encryption': 'No', 'Hibernation': 'No', 'Scale set': 'No', 'Azure Virtual Desktop': 'No', 'SAP': 'No', 'Unmanaged disks': 'No', 'Ephemeral OS disk': 'No', 'System-assigned identity': 'No',
    'Availability set': 'No', 'Zone': '1', 'Resource type': 'VM', 'Managed by': 'None', 'SQL Server': 'No', 'SQL availability group': 'No', 'Shared disk': 'No' };
const cell = (v) => (/[",]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
function list(rows, head = HEAD) {
    return [head.join(','), ...rows.map((r) => head.map((h) => cell(String(h in r ? r[h] : BASE[h] ?? ''))).join(','))].join('\n') + '\n';
}
function run(text, now = NOW) {
    const l = readList(text);
    return plan(l.rows.map((r, i) => toMachine(r, l.map, i + 2, table, now)), table, now);
}
const one = (row, now) => run(list([{ 'VM name': 'contoso-t1', ...row }]), now).machines[0];
// The notes of a VM, by topic: the text of each note that the page shows.
const notesOf = (m) => { const n = F.allNotes(m); return Object.fromEntries([...n.actions, ...n.attention, ...n.checks].map((x) => [x.topic, x.text])); };

// ---------------------------------------------------------------------------
// 1. The current size beside each new size
// ---------------------------------------------------------------------------

test('size facts: from the size table, with the temporary disk in GiB (SCSI or NVMe) and "None"', () => {
    assert.deepEqual(sizeFacts(table.get('Standard_D4s_v3')), { name: 'Standard_D4s_v3', vcpus: 4, vcpusActive: 4, memoryGiB: 16, tempGiB: 32, tempKind: 'SCSI', tempDisks: 1,
        maxNics: 2, maxDataDisks: 8, premium: true, generations: ['V1', 'V2'] });
    const v6 = sizeFacts(table.get('Standard_D4ds_v6'));
    assert.deepEqual([v6.tempGiB, v6.tempKind, v6.tempDisks, v6.generations], [220, 'NVMe', 1, ['V2']]);
    assert.deepEqual([sizeFacts(table.get('Standard_D4s_v5')).tempGiB, sizeFacts(table.get('Standard_D4s_v5')).tempKind], [0, null]);
    assert.equal(sizeFacts(table.get('Standard_E16-4s_v3')).vcpusActive, 4);
    assert.equal(sizeFacts(null), null);
});

test('size comparison: the current size and each size shown for the VM, with the values of the size table', () => {
    const m = one({ 'Image SKU': '2016-Datacenter' });
    const c = sizeComparison(m, table);
    assert.equal(c.caption, COMPARE_CAPTION);
    assert.deepEqual(c.columns, [{ label: 'Current size', size: 'Standard_D4s_v3' }, { label: 'v5', size: 'Standard_D4ds_v5' }, { label: 'v6', size: 'Standard_D4ds_v6' }, { label: 'v7', size: 'Standard_D4ds_v7' }]);
    const rows = Object.fromEntries(c.rows.map((r) => [r.label, r.cells.map((x) => x.text)]));
    assert.deepEqual(rows, {
        'vCPUs': ['4', '4', '4', '4'], 'Memory (GiB)': ['16', '16', '16', '16'], 'Temporary disk (GiB)': ['32', '150', '220 (NVMe)', '220 (NVMe)'],
        'Max NICs': ['2 (this VM: 1)', '2', '2', '4'], 'Max data disks': ['8 (this VM: 1)', '8', '12', '12'], 'Premium SSD': ['Yes', 'Yes', 'Yes', 'Yes'], 'Generations': ['1, 2', '1, 2', '2', '2'],
    });
    assert.ok(c.rows.every((r) => r.cells.every((x) => x.less === '')), 'no new size has less here');
});

test('size comparison: a size with no target is left out; no target at all gives no table; an unknown size says "Not in the size table"', () => {
    // A burstable VM: v5 and Burstable only (v6 and v7 are "No" for Generation 1).
    const b = one({ 'Current size': 'Standard_B2ms', 'Generation': 'V1', 'Security type': 'Standard', 'Image SKU': '2019-Datacenter' });
    assert.deepEqual(sizeComparison(b, table).columns.map((x) => x.label), ['Current size', 'v5', 'Burstable']);
    // Vendor approval: no size, so no table.
    assert.equal(sizeComparison(one({ 'SAP': 'Yes' }), table), null);
    // A VM that this tool cannot read: no table.
    assert.equal(sizeComparison(one({ 'Generation': '3', 'Security type': 'Standard', 'Image SKU': '' }), table), null);
    // A size that the table does not have: each of its cells says so.
    const m = one({});
    const fake = { ...m, vm: { ...m.vm, sourceSize: 'Standard_Q4z_v9' } };
    const c = sizeComparison(fake, table);
    assert.ok(c.rows.every((r) => r.cells[0].text === NOT_IN_TABLE && r.cells[0].less === ''));
    assert.ok(c.rows.every((r) => r.cells[1].less === ''), 'no comparison with an unknown size');
    const t = { ...m, rows: m.rows.map((r) => (r.series === 'v5' ? { ...r, option: { ...r.option, targetSize: 'Standard_Q8z_v9' } } : r)) };
    assert.ok(sizeComparison(t, table).rows.every((r) => r.cells[1].text === NOT_IN_TABLE));
});

test('size comparison: each limit that is less than the current size or this VM has a note in words', () => {
    const m = one({ 'Current size': 'Standard_D4s_v3', 'Generation': 'V1', 'Security type': 'Standard', 'Image SKU': '2019-Datacenter', 'NIC count': '3', 'Data-disk count': '9' });
    // A made-up new size of each kind, to reach each note.
    const at = (size) => ({ ...m, rows: [{ series: 'v5', option: { supported: true, targetSize: size } }] });
    const less = (size) => Object.fromEntries(sizeComparison(at(size), table).rows.map((r) => [r.label, r.cells[1].less]));
    assert.deepEqual(less('Standard_D2s_v5'), {
        'vCPUs': 'Less than the current size (4).', 'Memory (GiB)': 'Less than the current size (16).', 'Temporary disk (GiB)': 'Less than the current size (32).',
        'Max NICs': 'Less than the 3 NICs of this VM.', 'Max data disks': 'Less than the 9 data disks of this VM.', 'Premium SSD': '', 'Generations': '',
    });
    assert.equal(less('Standard_A4_v2')['Premium SSD'], 'Less than the current size (Yes).');
    assert.equal(less('Standard_D4s_v6')['Generations'], 'Does not take Generation 1, the generation of this VM.');
    assert.equal(less('Standard_D8s_v5')['vCPUs'], '', 'more is not less');
    // The same value is not less (Standard_D4as_v4: 4 vCPUs, 16 GiB, a 32 GiB temporary disk).
    const same = less('Standard_D4as_v4');
    assert.deepEqual([same['vCPUs'], same['Memory (GiB)'], same['Temporary disk (GiB)']], ['', '', '']);
    // The current size never has a note, also when the VM has more NICs than it allows.
    const over = sizeComparison(one({ 'Current size': 'Standard_D2s_v3', 'NIC count': '3', 'Data-disk count': '6' }), table);
    assert.equal(over.rows.find((r) => r.label === 'Max NICs').cells[0].text, '2 (this VM: 3)');
    assert.ok(over.rows.every((r) => r.cells[0].less === ''));
    assert.equal(less('Standard_D4ds_v5')['Temporary disk (GiB)'], '', 'a larger temporary disk is not less');
    // Constrained vCPUs: the active vCPUs count.
    assert.equal(less('Standard_E16-4s_v3')['vCPUs'], '');
    assert.equal(sizeComparison(at('Standard_E16-4s_v3'), table).rows[0].cells[1].text, '16 (4 active)');
    // NICs and data disks that the list does not give: no note.
    const u = one({ 'NIC count': '', 'Data-disk count': '' });
    const ul = Object.fromEntries(sizeComparison({ ...u, rows: [{ series: 'v5', option: { supported: true, targetSize: 'Standard_D2s_v5' } }] }, table).rows.map((r) => [r.label, r.cells[1].less]));
    assert.deepEqual([ul['Max NICs'], ul['Max data disks']], ['', '']);
});

test('size comparison: the page and the report show it as a table with a caption and headers with scope', () => {
    const page = read('js/page.js');
    assert.match(page, /el\('caption', \{ text: c\.caption \}\)/);
    assert.match(page, /el\('th', \{ scope: 'col', text: 'Fact' \}\)/);
    assert.match(page, /el\('th', \{ scope: 'row', text: r\.label \}\)/);
    assert.match(page, /cell\.less \? el\('strong', \{ class: 'less', text: cell\.less \}\)/);
    assert.match(page, /class: 'compare-wrap', tabindex: '0', role: 'region', 'aria-label': c\.caption/);
    // The details of a VM add it after the size cards.
    assert.match(page, /const cmp = sizeComparison\(m, table\);\s*if \(cmp\) box\.append\(compareTable\(cmp\)\);/);
    const html = reportHtml(run(list([{ 'VM name': 'contoso-t1', 'Current size': 'Standard_B2ms', 'Generation': 'V1', 'Security type': 'Standard', 'Image SKU': '2019-Datacenter' }])), table, 'test', NOW);
    const t = /<table class="compare">[\s\S]*?<\/table>/.exec(html)[0];
    assert.match(t, new RegExp(`<caption>${COMPARE_CAPTION}</caption>`));
    assert.match(t, /<th scope="col">Current size<br><span class="mono">B2ms<\/span><\/th><th scope="col">v5<br><span class="mono">D2ds_v5<\/span><\/th><th scope="col">Burstable<br><span class="mono">B2s_v2<\/span><\/th>/);
    assert.match(t, /<tr><th scope="row">Temporary disk \(GiB\)<\/th><td>16<\/td><td>75<\/td><td>None<br><b class="less">Less than the current size \(16\).<\/b><\/td><\/tr>/);
    // A VM on a modern size has no card in the report, so no table there.
    assert.doesNotMatch(reportHtml(run(list([{ 'VM name': 'contoso-t2', 'Current size': 'Standard_D4s_v5' }])), table, 'test', NOW), /class="compare"/);
});

// ---------------------------------------------------------------------------
// 2. The value behind each note
// ---------------------------------------------------------------------------

test('notes: a problem or a fact to know says the value from the list that gave it', () => {
    const n = (row) => notesOf(one(row));
    assert.equal(n({ 'Image SKU': '2016-Datacenter' })['NVMe'], 'The image MicrosoftWindowsServer / WindowsServer / 2016-Datacenter is not on the Microsoft list of OS images that support NVMe. Update the OS to a version on the Microsoft NVMe list, or rebuild from a newer image.');
    assert.match(n({ 'Azure Disk Encryption': 'Yes', 'OS': 'Linux' })['Disk encryption'], /^"Azure Disk Encryption" is Yes\. /);
    assert.equal(n({ 'Hibernation': 'Yes' })['Hibernation'], '"Hibernation" is Yes. Turn off hibernation before the move.');
    assert.equal(n({ 'Primary NIC accelerated': 'No' })['Accelerated networking'], '"Primary NIC accelerated" is No. Turn on accelerated networking before the move. The new size needs it.');
    assert.equal(n({ 'Primary NIC accelerated': '', 'Accelerated NICs': '0' })['Accelerated networking'], '"Accelerated NICs" is 0. Turn on accelerated networking before the move. The new size needs it.');
    assert.equal(n({ 'System-assigned identity': 'Yes' })['Identity'], '"System-assigned identity" is Yes. Record the role assignments of the system-assigned identity. A new VM gets a new identity: add them to it again.');
    assert.match(n({ 'Availability set': 'Yes' })['Availability set'], /^"Availability set" is Yes\. /);
    assert.equal(n({ 'Azure Virtual Desktop': 'Yes', 'AVD host pool type': 'Personal' })['Scale set / AKS / AVD'], 'A personal desktop: "AVD host pool type" is Personal. The user cannot use it during the move. Tell the user first.');
    assert.equal(n({})['Temporary disk'], 'The current size Standard_D4s_v3 has a temporary disk of 32 GiB. The move deletes the data on the temporary disk. Keep nothing there that you need.');
    assert.equal(notesOf(one({ 'Current size': 'Standard_B2ms', 'Generation': 'V1', 'Security type': 'Standard', 'Image SKU': '2019-Datacenter' }))['Temporary disk'],
        'The current size Standard_B2ms has a temporary disk of 16 GiB. The new size has no temporary disk. The move deletes the data on the current temporary disk.');
});

test('notes: the notes that a blocked VM gets in vm-target-sizes.csv say the value too', () => {
    const cav = (row, series = 'v5') => one(row).rows.find((r) => r.series === series).caveats;
    assert.equal(cav({ 'SAP': 'Yes' })['SAP'].text, '"SAP" is Yes. Confirm that SAP certifies the new size (SAP Note 1928533).');
    assert.equal(cav({ 'Unmanaged disks': 'Yes' })['Unmanaged disks'].text, '"Unmanaged disks" is Yes. Convert the unmanaged disks to managed disks first.');
    assert.match(cav({ 'Ephemeral OS disk': 'Yes' })['Ephemeral OS disk'].text, /^"Ephemeral OS disk" is Yes\. /);
    assert.equal(cav({ 'Image publisher': 'paloaltonetworks', 'Image offer': 'vmseries-flex' })['Network virtual appliance'].text, 'The image is paloaltonetworks / vmseries-flex. Ask the vendor which sizes they certify.');
    assert.equal(cav({ 'Image publisher': '', 'Image offer': '', 'Image SKU': '', 'Plan publisher': 'fortinet', 'Plan product': 'fortinet_fortigate-vm_v5' })['Network virtual appliance'].text,
        'The Marketplace purchase plan is fortinet / fortinet_fortigate-vm_v5. Ask the vendor which sizes they certify.');
    assert.equal(cav({ 'Image publisher': 'cohesity', 'Image offer': 'cohesity-cloudtd-tool' })['Storage or backup appliance'].text, 'The vendor is Cohesity DataPlatform Cloud Edition. Ask the vendor which sizes they certify.');
});

test('notes: "To check" says the value it has, and says when the list does not give it', () => {
    const v6 = (row) => one(row).rows.find((r) => r.series === 'v6').caveats;
    // Intel D v5 needs accelerated networking: the note is on v5.
    const v5 = (row) => one(row).rows.find((r) => r.series === 'v5').caveats;
    assert.equal(v6({ 'Image publisher': 'contosoisv', 'Image offer': 'contoso-app', 'Image SKU': 'v1' })['NVMe'].text, 'Check: this tool cannot tell if the image contosoisv / contoso-app / v1 supports NVMe. The OS must support NVMe.');
    assert.equal(v6({ 'Image publisher': '', 'Image offer': '', 'Image SKU': '' })['NVMe'].text, 'Check: the list does not give the OS image. The OS must support NVMe.');
    assert.equal(v6({ 'Image publisher': '', 'Image offer': '', 'Image SKU': '', 'Image ID': '/subscriptions/00000000-0000-0000-0000-000000000000/resourceGroups/rg-contoso/providers/Microsoft.Compute/galleries/contoso/images/web' })['NVMe'].text,
        'Check: the list does not give the OS image. The OS must support NVMe. The image ID is /subscriptions/00000000-0000-0000-0000-000000000000/resourceGroups/rg-contoso/providers/Microsoft.Compute/galleries/contoso/images/web.');
    assert.equal(v5({ 'Primary NIC accelerated': '', 'Accelerated NICs': '2', 'NIC count': '2' })['Accelerated networking'].text,
        'Check: the list does not say if accelerated networking is on for the primary NIC. "Accelerated NICs" is 2. "NIC count" is 2. The new size needs it.');
    assert.equal(v5({ 'Primary NIC accelerated': '', 'Accelerated NICs': '1', 'NIC count': '' })['Accelerated networking'].text,
        'Check: the list does not say if accelerated networking is on for the primary NIC. "Accelerated NICs" is 1. The list does not give the NIC count. The new size needs it.');
    assert.equal(v5({ 'Primary NIC accelerated': '', 'Accelerated NICs': '' })['Accelerated networking'].text, 'Check: the list does not say if accelerated networking is on. The new size needs it.');
    assert.equal(v6({ 'Azure Virtual Desktop': 'Yes', 'AVD host pool type': 'Shared' })['Scale set / AKS / AVD'].text,
        'Check: the list does not say if the host pool is pooled or personal. "AVD host pool type" is Shared. For a pooled host pool, make new session hosts from the image.');
    assert.equal(v6({ 'Azure Virtual Desktop': 'Yes', 'AVD host pool type': '' })['Scale set / AKS / AVD'].text,
        'Check: the list does not say if the host pool is pooled or personal. For a pooled host pool, make new session hosts from the image.');
    // A size whose temporary disk the table does not give: the size by name.
    const vm = { sourceSize: 'Standard_Q4z_v9', sourceTempDisks: null };
    const c = caveats(vm, {}, { option: 'v5', targetSize: 'Standard_D4s_v5', acceleratedNetworking: {} });
    assert.equal(c['Temporary disk'].text, 'Check: the size table does not give the temporary disk of Standard_Q4z_v9. You lose the data on it when you move.');
});

test('reasons: a value that the tool cannot read is in the reason; an empty value is not', () => {
    const p = run(list([{ 'VM name': 'contoso-r1', 'Generation': '3', 'Security type': 'Standard', 'Image SKU': '' }, { 'VM name': 'contoso-r2', 'Generation': '', 'Security type': 'Standard', 'Image SKU': '' },
        { 'VM name': 'contoso-r3', 'Current size': 'not a size' }]));
    const why = (n) => p.machines.find((m) => m.read.name === n).problems.map((pr) => reasonFor(pr.why, { problem: pr })).join(' ');
    assert.match(why('contoso-r1'), /^The generation is empty or not valid\. The list gives "3"\. Run /);
    assert.match(why('contoso-r2'), /^The generation is empty or not valid\. Run /);
    assert.match(why('contoso-r3'), /^This tool cannot read the current size "not a size"\. Use the Azure name/);
    assert.equal(reasonFor('not-in-region', { series: 'v7', vm: { sourceSize: 'Standard_E16-4s_v3' } }).split('. ')[0], 'Azure has no v7 size with the same name as this size (Standard_E16-4s_v3)');
    assert.equal(reasonFor('not-in-region', { series: 'v7' }).split('. ')[0], 'Azure has no v7 size with the same name as this size');
});

// ---------------------------------------------------------------------------
// 3. The time left to a retirement date
// ---------------------------------------------------------------------------

test('countdown: whole months from the day the list is planned, the same every run', () => {
    assert.equal(wholeMonths('2026-10-17', '2029-11-15'), 36);
    assert.equal(wholeMonths('2026-10-17', '2029-11-17'), 37);
    assert.equal(wholeMonths('2026-10-17', '2026-11-16'), 0);
    assert.equal(wholeMonths('2026-07-01', '2026-10-17'), 3);
    assert.equal(countdownWords('2029-11-15', NOW), 'in 36 months');
    assert.equal(countdownWords('2026-11-17', NOW), 'in 1 month');
    assert.equal(countdownWords('2026-11-16', NOW), 'in less than 1 month');
    assert.equal(countdownWords('2026-10-18', NOW), 'in less than 1 month');
    assert.equal(countdownWords('2026-10-17', NOW), 'less than 1 month ago', 'the day itself is past: Retired');
    assert.equal(countdownWords('2026-09-17', NOW), '1 month ago');
    assert.equal(countdownWords('2025-09-30', NOW), '12 months ago');
    assert.equal(countdownWords('2025-09-30', null), '');
    assert.equal(countdownWords('', NOW), '');
    assert.equal(monthDay('July 2026'), '2026-07-01');
    assert.equal(monthDay('Summer 2026'), null);
});

test('countdown: the stage says how long until the retirement, or since it; the CSV files do not change', () => {
    const eol = { stage: 'End of Life', retiresUtc: '2029-11-15' };
    assert.equal(stageWords(eol, null, NOW), 'End of Life. Microsoft retires this series on 15 November 2029 (in 36 months). Plan a move before that date.');
    assert.equal(stageWords(eol, null), 'End of Life. Microsoft retires this series on 15 November 2029. Plan a move before that date.');
    const gone = { stage: 'Retired', retiresUtc: '2025-09-30' };
    assert.equal(stageWords(gone, null, NOW), 'Retired. Microsoft retired this series on 30 September 2025 (12 months ago). A VM on this size cannot run.');
    assert.equal(stageWords(gone, null), 'Retired on 30 September 2025. A VM on this size cannot run.');
    assert.match(stageWords(eol, capacity, NOW), / From July 2026 \(3 months ago\), Microsoft restricts capacity growth for this series:/);
    assert.match(stageWords(eol, capacity), / From July 2026, Microsoft restricts/);
    // No date, no countdown.
    assert.equal(stageWords({ stage: 'End of Life', retiresUtc: null }, null, NOW), 'End of Life. Plan a move.');
    assert.equal(stageWords({ stage: 'Current' }, null, NOW), 'Current. This is the newest series, and Microsoft fully supports it.');
    // The page and the report ("Why"), and the about file and the report (capacity).
    const m = one({});
    assert.match(whyLines(m, F.groupOf(m), table, NOW)[0], /on 15 November 2029 \(in 36 months\)\./);
    assert.match(whyLines(m, F.groupOf(m), table, new Date('2029-11-01T00:00:00Z'))[0], /\(in less than 1 month\)/);
    assert.equal(capacityWords(capacity, NOW)[0], `From July 2026 (3 months ago), Microsoft restricts capacity growth for ${capacity.names.length} series.`);
    assert.equal(capacityWords(capacity)[0], `From July 2026, Microsoft restricts capacity growth for ${capacity.names.length} series.`);
    const p = run(list([{ 'VM name': 'contoso-t1' }]));
    assert.match(reportHtml(p, table, 'test', NOW), /Microsoft retires this series on 15 November 2029 \(in 36 months\)/);
    assert.match(reportHtml(p, table, 'test', NOW), /<li>Capacity growth restrictions: From July 2026 \(3 months ago\), Microsoft restricts capacity growth for \d+ series\./);
    assert.match(F.aboutText(p, readList(list([{ 'VM name': 'contoso-t1' }])), 'test', NOW), /From July 2026 \(3 months ago\)/);
    // The CSV stage column keeps its words.
    assert.equal(F.summaryRows(p)[0]['Current stage'].includes('months'), false);
    assert.equal(F.targetRows(p, table, NOW)[0]['Current stage'].includes('months'), false);
});

// ---------------------------------------------------------------------------
// 4. The vendor of a managed application
// ---------------------------------------------------------------------------

test('query: the managed application columns are the last three; Resource Graph limits are kept; the page has the same query', () => {
    const q = read('query.kql');
    const project = /\| project\n([\s\S]*?)\n\| order by/.exec(q)[1];
    const names = [...project.matchAll(/^\s{4}(?:\['([^']+)'\]|([A-Za-z]+)) =/gm)].map((x) => x[1] || x[2]);
    assert.deepEqual(names, COLUMNS.map((c) => c.name), 'the query writes the columns in the order of the template');
    assert.deepEqual(names.slice(-3), ['Managed application', 'Application plan publisher', 'Application plan product']);
    const code = q.split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n');
    assert.ok((code.match(/\|\s*(join|union)\b/g) || []).length <= 3, 'at most three join or union');
    assert.ok((code.match(/\|\s*mv-expand\b/g) || []).length <= 3, 'at most three mv-expand');
    // One join gives the host pool and the managed application: the plan is read from the application.
    assert.match(code, /where type in~ \('microsoft\.desktopvirtualization\/hostpools', 'microsoft\.solutions\/applications'\)/);
    assert.match(code, /appPlanPublisher = iff\(isApp, tostring\(plan\.publisher\), ''\)/);
    assert.match(code, /appPlanProduct = iff\(isApp, tostring\(plan\.product\), ''\)/);
    assert.match(code, /linkKey = case\(isnotempty\(hostPoolId\), hostPoolId,\s*managedByType startswith 'microsoft\.solutions\/applications', managedBy, ''\)/);
    assert.equal(read('template.csv').split('\n')[0], COLUMNS.map((c) => c.name).join(','));
});

test('managed application: the plan of the application names the vendor (publisher ID) in the evidence, the Vendor column and the report', () => {
    const p = run(list([
        { 'VM name': 'contoso-ma1', 'Managed by': 'Managed application', 'Managed application': 'contoso-app1', 'Application plan publisher': 'contosoisv', 'Application plan product': 'contoso-storage-app' },
        { 'VM name': 'contoso-ma2', 'Managed by': 'Managed application', 'Managed application': 'contoso-app2' },
        { 'VM name': 'contoso-ma3', 'Managed by': 'Managed application' },
        { 'VM name': 'contoso-ma4', 'Managed by': 'Managed application', 'Managed application': 'contoso-app4', 'Application plan publisher': 'ContosoISV', 'Application plan product': '' },
    ]));
    const w = (n) => workloadFound(p.machines.find((m) => m.read.name === n));
    assert.deepEqual([w('contoso-ma1').vendor, w('contoso-ma1').lead], ['contosoisv', 'Managed application. The publisher ID is contosoisv.']);
    assert.equal(w('contoso-ma1').evidence, '"Managed by" is Managed application. The resource group of this VM belongs to a managed application. Managed application: contoso-app1. The Marketplace plan of the application is contosoisv / contoso-storage-app.');
    // An application that is not from the Marketplace has no plan.
    assert.deepEqual([w('contoso-ma2').vendor, w('contoso-ma2').lead], ['', 'Managed application. The list does not give the vendor.']);
    assert.match(w('contoso-ma2').evidence, /Managed application: contoso-app2\. The list does not give a Marketplace plan for the application\.$/);
    assert.match(w('contoso-ma4').evidence, /The Marketplace plan of the application is ContosoISV \/ No value\.$/);
    const rows = F.summaryRows(p);
    assert.deepEqual(rows.map((r) => r.Vendor), ['contosoisv', '', '', 'ContosoISV']);
    // One row for the vendor, whatever its case; no vendor last.
    assert.deepEqual(appliancesByVendor(p.machines).map((a) => [a.vendor, a.machines.map((x) => x.m.read.name)]), [['contosoisv', ['contoso-ma1', 'contoso-ma4']], ['', ['contoso-ma2', 'contoso-ma3']]]);
    assert.match(reportHtml(p, table, 'test', NOW), /<td>contosoisv <span class="muted">\(publisher ID\)<\/span><\/td><td>Managed application<\/td><td>2<\/td>/);
    // The plan of the application comes before the purchase plan of the VM.
    const both = run(list([{ 'VM name': 'contoso-ma5', 'Managed by': 'Managed application', 'Plan publisher': 'contosovm', 'Plan product': 'contoso-vm', 'Managed application': 'contoso-app5', 'Application plan publisher': 'contosoisv', 'Application plan product': 'contoso-app' }])).machines[0];
    assert.equal(workloadFound(both).vendor, 'contosoisv');
    assert.match(workloadFound(both).evidence, /The Marketplace plan of the application is contosoisv \/ contoso-app\. The Marketplace purchase plan is contosovm \/ contoso-vm\.$/);
});

test('managed application: a list without the new columns works as before, and no answer changes', () => {
    const old = HEAD.slice(0, -3);
    const before = run(list([{ 'VM name': 'contoso-ma1', 'Managed by': 'Managed application' }, { 'VM name': 'contoso-ma2', 'Managed by': 'Managed application', 'Plan publisher': 'contosoisv', 'Plan product': 'contoso-app' }], old));
    const [a, b] = before.machines.map(workloadFound);
    assert.deepEqual([a.vendor, a.lead, a.evidence], ['', 'Managed application. The list does not give the vendor.', '"Managed by" is Managed application. The resource group of this VM belongs to a managed application.']);
    assert.deepEqual([b.vendor, b.lead], ['contosoisv', 'Managed application. The publisher ID is contosoisv.']);
    // The new columns change only the words: the result group and the answers stay.
    const after = run(list([{ 'VM name': 'contoso-ma1', 'Managed by': 'Managed application', 'Managed application': 'contoso-app1', 'Application plan publisher': 'contosoisv', 'Application plan product': 'contoso-app' }]));
    const pick = (m) => [F.groupOf(m), m.pattern, m.short, m.outcome];
    assert.deepEqual(pick(after.machines[0]), pick(before.machines[0]));
    // The sample: the managed application, its plan, and the vendor.
    const s = F.summaryRows(run(sample)).find((r) => r['VM name'] === 'contoso-pure01');
    assert.equal(s.Vendor, 'contosoisv');
});
