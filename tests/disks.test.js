// Run: node --test
// 0.9.8-beta: the disk limits. A new size is a problem only when it lowers the disk
// ceiling of the VM: the lower of what its disks can do in total and the disk limit of
// the size, for IOPS and MBps, for the uncached and the cached disks apart.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import sizes from '../data/sizes.js';
import ultra from '../data/premium-v2-ultra-limits.js';
import sample from '../js/sample.js';
import { SizeTable, sizeFacts, rankedSizes } from '../js/lifecycle.js';
import { COLUMNS, readList } from '../js/input.js';
import { plan, toMachine } from '../js/planner.js';
import { diskNote, diskTotals, diskWords, vmDiskNote } from '../js/disks.js';
import { sizeComparison } from '../js/details.js';
import { reportHtml } from '../js/report.js';
import { FACT_GROUPS } from '../js/evidence.js';
import * as F from '../js/files.js';

const table = new SizeTable(sizes.sizes);
const NOW = new Date('2026-11-20T12:00:00Z');
const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');

const HEAD = COLUMNS.map((c) => c.name);
// A standalone Linux VM on Standard_DS3_v2 (End of Life). Its size allows 12,800 uncached IOPS
// and 192 MBps; the v5 size Standard_D4ds_v5 allows 6,400 IOPS and 145 MBps.
const BASE = { 'Region': 'eastus2', 'Current size': 'Standard_DS3_v2', 'Generation': 'V2', 'OS': 'Linux', 'NIC count': '1', 'Data-disk count': '2', 'Security type': 'TrustedLaunch',
    'Image publisher': 'Canonical', 'Image offer': 'ubuntu-24_04-lts', 'Image SKU': 'server', 'Disk controller': 'SCSI', 'Accelerated NICs': '1', 'Primary NIC accelerated': 'Yes',
    'Azure Disk Encryption': 'No', 'Hibernation': 'No', 'Scale set': 'No', 'Azure Virtual Desktop': 'No', 'SAP': 'No', 'Unmanaged disks': 'No', 'Ephemeral OS disk': 'No', 'System-assigned identity': 'No',
    'Availability set': 'No', 'Zone': '1', 'Resource type': 'VM', 'Managed by': 'None', 'SQL Server': 'No', 'SQL availability group': 'No', 'Shared disk': 'No' };
const DISKS = { 'Disk types': 'Premium_LRS', 'Disk IOPS (uncached disks)': '20000', 'Disk MBps (uncached disks)': '100', 'Disk IOPS (cached disks)': '500', 'Disk MBps (cached disks)': '100',
    'Disks': 'OS disk: Premium_LRS P10, 128 GiB, 500 IOPS, 100 MBps, caching ReadWrite' };
const cell = (v) => (/[",]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
const list = (rows, head = HEAD) => [head.join(','), ...rows.map((r) => head.map((h) => cell(String(h in r ? r[h] : BASE[h] ?? ''))).join(','))].join('\n') + '\n';
function run(text) {
    const l = readList(text);
    return plan(l.rows.map((r, i) => toMachine(r, l.map, i + 2, table, NOW)), table, NOW);
}
const one = (row) => run(list([{ 'VM name': 'contoso-db01', ...row }])).machines[0];
const note = (m, series) => { const c = m.rows.find((r) => r.series === series).caveats['Disk limits']; return { state: c.state, text: c.text }; };
// A note without its parts (the short sentences that vmDiskNote joins).
const st = (n) => ({ state: n.state, text: n.text });

// ---------------------------------------------------------------------------
// The size table and the Microsoft size pages
// ---------------------------------------------------------------------------

test('disk limits: the size facts give the uncached and cached limits, in IOPS and MBps (Azure gives bytes per second)', () => {
    const f = sizeFacts(table.get('Standard_DS3_v2'));
    assert.deepEqual([f.uncachedIops, f.uncachedMbps, f.cachedIops, f.cachedMbps, f.ultraIops, f.ultraMbps], [12800, 192, 16000, 128, null, null]);
    // The cached MBps: the lower of the read and the write limit (Standard_D4_v3: 98,304,000 and 49,152,000
    // bytes per second, whole multiples of 1,024,000: 96 and 48 MBps; lifecycle.js, bytesToMbps).
    assert.equal(sizeFacts(table.get('Standard_D4_v3')).cachedMbps, 48);
    // A v6 size: Azure gives the Premium SSD column; the Microsoft size page gives the column
    // for Premium SSD v2 and Ultra Disk.
    const v6 = sizeFacts(table.get('Standard_D2s_v6'));
    assert.deepEqual([v6.uncachedIops, v6.uncachedMbps, v6.ultraIops, v6.ultraMbps], [3750, 106, 4167, 124]);
    // No value from the table: null, never a guess.
    const bare = sizeFacts({ name: 'Standard_Q2_v9', caps: { vCPUs: '2' } });
    assert.deepEqual([bare.uncachedIops, bare.uncachedMbps, bare.cachedIops, bare.cachedMbps], [null, null, null, null]);
});

test('disk limits: every size has the two uncached limits; 23 HPC, GPU and FPGA sizes have no cached limits, which is no value', () => {
    const cachedKeys = ['CombinedTempDiskAndCachedIOPS', 'CombinedTempDiskAndCachedReadBytesPerSecond', 'CombinedTempDiskAndCachedWriteBytesPerSecond'];
    const noUncached = Object.entries(sizes.sizes).filter(([, s]) => !('UncachedDiskIOPS' in s.capabilities) || !('UncachedDiskBytesPerSecond' in s.capabilities)).map(([n]) => n);
    assert.deepEqual(noUncached, [], 'Azure gives the uncached limits for every size');
    const noCached = Object.entries(sizes.sizes).filter(([, s]) => cachedKeys.some((k) => !(k in s.capabilities))).map(([n]) => n);
    assert.deepEqual(noCached, ['Standard_HB120rs_v2', 'Standard_HB176-144rs_v4', 'Standard_HB176-24rs_v4', 'Standard_HB176-48rs_v4', 'Standard_HB176-96rs_v4', 'Standard_HB176rs_v4',
        'Standard_HC44rs', 'Standard_HX176-144rs', 'Standard_HX176-24rs', 'Standard_HX176-48rs', 'Standard_HX176-96rs', 'Standard_HX176rs', 'Standard_NC24rs_v3', 'Standard_NC24s_v3',
        'Standard_ND40rs_v2', 'Standard_ND96asr_v4', 'Standard_ND96is_MI300X_v5', 'Standard_ND96isr_H100_v5', 'Standard_ND96isr_H200_v5', 'Standard_ND96isr_MI300X_v5', 'Standard_NP40s',
        'Standard_NV24s_v2', 'Standard_NV48s_v3']);
    // They have none of the three: the code reads no cached limit (unknown, never a guess).
    for (const n of noCached) assert.ok(cachedKeys.every((k) => !(k in sizes.sizes[n].capabilities)), n);
    const f = sizeFacts(table.get('Standard_HC44rs'));
    assert.deepEqual([f.cachedIops, f.cachedMbps, f.uncachedIops > 0], [null, null, true]);
    assert.match(sizes.how, /lower limit/);
});

test('the Premium SSD v2 and Ultra Disk limits are what tools/premium-v2-ultra.mjs reads from the snapshot, page by page', async () => {
    const { PAGE_IDS, limitsData, limitsText, ultraLimits } = await import('../tools/premium-v2-ultra.mjs');
    const { SOURCES } = await import('../tools/sources.mjs');
    const snapshot = JSON.parse(read('tools/source-snapshot.json'));
    // The data file is what the tool writes from the snapshot: the values and the dates of each page.
    assert.equal(read('data/premium-v2-ultra-limits.js'), limitsText(limitsData(snapshot)));
    assert.deepEqual(ultra.pages.map((p) => p.id), PAGE_IDS);
    for (const p of ultra.pages) {
        const s = SOURCES.find((x) => x.id === p.id);
        assert.ok(s, `${p.id} is watched (tools/sources.mjs)`);
        assert.equal(p.url, s.url.replace('/en-us/', '/'));
        assert.equal(p.updatedUtc, snapshot[p.id].pageUpdatedUtc, `${p.id}: the date of the page is the date in the snapshot`);
        assert.equal(p.readUtc, snapshot[p.id].readUtc);
        assert.match(p.updatedUtc, /^\d{4}-\d{2}-\d{2}$/);
    }
    assert.deepEqual(ultra.pages.find((p) => p.id === 'dsv6').sizes.Standard_D2s_v6, { iops: 4167, mbps: 124 });
    // The page layouts: "MBps" or "MB/s", numbers with or without a comma; a cell with no number is no value.
    const head = 'Size Name | Max Remote Storage Disks (Qty.) | Uncached Premium SSD IOPS | Uncached Premium SSD Throughput (MB/s) | Uncached Ultra Disk and Premium SSD v2 IOPS | Uncached Ultra Disk and Premium SSD v2 Throughput (MB/s)';
    assert.deepEqual(ultraLimits([
        `Sizes in series > tab sizestorageremote :: ${head} = Standard_E2s_v6 | 8 | 3750 | 106 | 4,167 | 124`,
        `Sizes in series > tab sizestorageremote :: ${head} = Standard_E4s_v6 | 12 | 6400 | 212 | N/A | 248`,
        `Sizes in series > tab sizestorageremote :: ${head} = Standard_E8s_v6 | 24 | 12800 | 424 | - | -`,
        `Sizes in series > tab sizestoragelocal :: ${head} = Standard_E16s_v6 | 32 | 1 | 2 | 3 | 4`,
        'Sizes in series :: Some other line',
    ]), { Standard_E2s_v6: { iops: 4167, mbps: 124 }, Standard_E4s_v6: { iops: null, mbps: 248 } });
});

test('the Premium SSD v2 and Ultra Disk column covers every v6 and v7 size that this tool suggests', () => {
    // A size with constrained vCPUs takes the column of its base size (Microsoft: it keeps the
    // storage and I/O bandwidth of the base size).
    assert.deepEqual([sizeFacts(table.get('Standard_E16-4s_v6')).ultraIops, sizeFacts(table.get('Standard_E16s_v6')).ultraIops].map((v) => v > 0), [true, true]);
    assert.equal(sizeFacts(table.get('Standard_E16-4s_v6')).ultraIops, sizeFacts(table.get('Standard_E16s_v6')).ultraIops);
    assert.equal(sizeFacts(table.get('Standard_E16-4s_v5')).ultraIops, null, 'v5 has no such column');
    const have = { has: (s) => sizeFacts(table.get(s)).ultraIops !== null && sizeFacts(table.get(s)).ultraMbps !== null };
    const rows = ['VM name,Current size,Generation,OS,NIC count,Data-disk count'];
    let i = 0;
    for (const n of Object.keys(sizes.sizes)) for (const [nics, dd] of [['1', '0'], ['4', '16']]) rows.push(`vm${i++},${n},2,Linux,${nics},${dd}`);
    const p = run(rows.join('\n'));
    const missing = new Set();
    for (const m of p.machines) for (const r of m.rows || []) {
        if ((r.series !== 'v6' && r.series !== 'v7') || !r.option.supported || !r.option.targetSize) continue;
        for (const s of [r.option.targetSize, ...rankedSizes(m.vm, table, r.option, NOW).map((x) => x.size)]) if (!have.has(s)) missing.add(s);
    }
    assert.deepEqual([...missing].sort(), []);
});

// ---------------------------------------------------------------------------
// The list
// ---------------------------------------------------------------------------

test('disk limits: the new columns are read; a blank or an unreadable value is no value', () => {
    const t = diskTotals(one({ ...DISKS, 'Disk types': 'Premium_LRS, PremiumV2_LRS', 'Disk IOPS (uncached disks)': '20,000', 'Disk MBps (uncached disks)': '12.5', 'Disk IOPS (cached disks)': 'many', 'Disk MBps (cached disks)': '' }).extra);
    assert.deepEqual(t, { uncached: { iops: 20000, mbps: 12.5 }, cached: { iops: null, mbps: null }, types: ['Premium_LRS', 'PremiumV2_LRS'], uncachedTypes: null, ultra: true, ultraOnly: false, mix: true, upTo: false });
    const none = diskTotals(one({}).extra);
    assert.deepEqual(none, { uncached: { iops: null, mbps: null }, cached: { iops: null, mbps: null }, types: null, uncachedTypes: null, ultra: false, ultraOnly: false, mix: false, upTo: false });
    // Which uncached disks: only Premium SSD v2 or Ultra Disk, or a mix with other disks (owner, 2026-11-20).
    const only = diskTotals(one({ ...DISKS, 'Disk types': 'Premium_LRS, PremiumV2_LRS', 'Disk types (uncached disks)': 'PremiumV2_LRS' }).extra);
    assert.deepEqual([only.ultraOnly, only.mix, only.uncachedTypes], [true, false, ['PremiumV2_LRS']]);
    const mix = diskTotals(one({ ...DISKS, 'Disk types': 'Premium_LRS, PremiumV2_LRS', 'Disk types (uncached disks)': 'Premium_LRS, UltraSSD_LRS' }).extra);
    assert.deepEqual([mix.ultraOnly, mix.mix], [false, true]);
    // No "Disk types (uncached disks)": only Premium SSD v2 or Ultra Disk in the list is "only"; else a mix.
    assert.deepEqual(['UltraSSD_LRS', 'PremiumV2_LRS, UltraSSD_LRS'].map((d) => diskTotals(one({ ...DISKS, 'Disk types': d }).extra).ultraOnly), [true, true]);
    assert.deepEqual(['Premium_LRS', 'Standard_LRS'].map((d) => diskTotals(one({ ...DISKS, 'Disk types': d }).extra).mix), [false, false]);
    assert.equal(diskTotals(one({ ...DISKS, 'Disk types': 'StandardSSD_LRS; Premium_LRS' }).extra).upTo, true);
    assert.equal(diskTotals(one({ ...DISKS, 'Disk types': 'Standard_LRS' }).extra).upTo, true);
    assert.equal(diskTotals(one({ ...DISKS, 'Disk types': 'UltraSSD_LRS' }).extra).ultra, true);
    assert.equal(diskTotals(one({ ...DISKS, 'Disk IOPS (uncached disks)': '-5' }).extra).uncached.iops, null);
    assert.equal(diskTotals(one({ ...DISKS, 'Disk IOPS (uncached disks)': '1,00' }).extra).uncached.iops, null);
    // The columns are optional, at the end, in the order of the query; "Facts from your list" shows them.
    const names = COLUMNS.map((c) => c.name);
    assert.deepEqual(names.slice(-7), ['Disk types', 'Disk types (uncached disks)', 'Disk IOPS (uncached disks)', 'Disk MBps (uncached disks)', 'Disk IOPS (cached disks)', 'Disk MBps (cached disks)', 'Disks']);
    assert.ok(COLUMNS.slice(-7).every((c) => !c.required));
    const disksGroup = FACT_GROUPS.find(([g]) => g === 'Disks and network')[1];
    for (const c of names.slice(-7)) assert.ok(disksGroup.includes(c), c);
});

// ---------------------------------------------------------------------------
// The ceiling rule
// ---------------------------------------------------------------------------

test('disk limits: a new size that lowers the ceiling gives a note, with the next size up that keeps it', () => {
    const m = one(DISKS);
    assert.deepEqual(note(m, 'v5'), { state: 'attention', text: 'The disks of this VM can do more than the new size allows. The uncached disks of this VM can do 20,000 IOPS in total. The current size allows 12,800 IOPS. The new size allows 6,400 IOPS. Standard_D8ds_v5 keeps the current limit.' });
    assert.equal(note(m, 'v6').text, 'The disks of this VM can do more than the new size allows. The uncached disks of this VM can do 20,000 IOPS in total. The current size allows 12,800 IOPS. The new size allows 6,400 IOPS. Standard_D8ds_v6 keeps the current limit.');
    assert.equal(note(m, 'v7').text, 'The disks of this VM can do more than the new size allows. The uncached disks of this VM can do 20,000 IOPS in total. The current size allows 12,800 IOPS. The new size allows 8,000 IOPS. Standard_D8ds_v7 keeps the current limit.');
    // The owner's rule: a note, not a different recommendation.
    const plain = one({});
    for (const s of ['v5', 'v6', 'v7']) assert.equal(m.rows.find((r) => r.series === s).option.targetSize, plain.rows.find((r) => r.series === s).option.targetSize);
    assert.equal(F.likelyRow(m).option.targetSize, 'Standard_D4ds_v6');
    // A fact to know: it does not stop the VM from being ready.
    assert.equal(F.groupOf(m), 'ready');
    assert.ok(F.signals(m).attention.some((a) => a.topic === 'Disk limits'));
    // IOPS and MBps both lower: one sentence for each value, and "limits".
    const both = one({ ...DISKS, 'Disk MBps (uncached disks)': '180' });
    assert.equal(note(both, 'v5').text, 'The disks of this VM can do more than the new size allows. The uncached disks of this VM can do 20,000 IOPS and 180 MBps in total. The current size allows 12,800 IOPS and 192 MBps. The new size allows 6,400 IOPS and 145 MBps. Standard_D8ds_v5 keeps the current limits.');
    // Standard HDD and Standard SSD give "up to" values.
    assert.match(note(one({ ...DISKS, 'Disk types': 'Premium_LRS, StandardSSD_LRS' }), 'v5').text, /^The disks of this VM can do more than the new size allows\. The uncached disks of this VM can do up to 20,000 IOPS in total\./);
});

test('disk limits: no note when the ceiling stays or goes up', () => {
    // The disks can do less than both sizes allow: the ceiling is the disks.
    assert.deepEqual(note(one({ ...DISKS, 'Disk IOPS (uncached disks)': '5000' }), 'v5'), { state: '', text: '' });
    // Equal to the new limit: not lower.
    assert.deepEqual(note(one({ ...DISKS, 'Disk IOPS (uncached disks)': '6400' }), 'v5'), { state: '', text: '' });
    // One more than the new limit: lower.
    assert.equal(note(one({ ...DISKS, 'Disk IOPS (uncached disks)': '6401' }), 'v5').state, 'attention');
    // A new size with a higher limit: no note (Standard_D4s_v3 allows 6,400 IOPS and 96 MBps).
    assert.deepEqual(note(one({ ...DISKS, 'Current size': 'Standard_D4s_v3' }), 'v5'), { state: '', text: '' });
    // No disks in a group (0): nothing to compare.
    assert.deepEqual(note(one({ ...DISKS, 'Disk IOPS (uncached disks)': '0', 'Disk MBps (uncached disks)': '0' }), 'v5'), { state: '', text: '' });
});

test('disk limits: the uncached and the cached disks are compared apart, each with its own limit', () => {
    // Standard_D4_v4 allows 38,500 cached IOPS; Standard_D4_v5 allows 19,000. No uncached disks.
    const m = one({ ...DISKS, 'Current size': 'Standard_D4_v4', 'Disk IOPS (uncached disks)': '0', 'Disk MBps (uncached disks)': '0', 'Disk IOPS (cached disks)': '30000', 'Disk MBps (cached disks)': '100' });
    assert.equal(note(m, 'v5').text, 'The disks of this VM can do more than the new size allows. The cached disks of this VM can do 30,000 IOPS in total. The current size allows 38,500 IOPS. The new size allows 19,000 IOPS. Standard_D8_v5 keeps the current limit.');
    // The same IOPS on uncached disks: the uncached limits (6,400 on both sizes) give no note.
    const u = one({ ...DISKS, 'Current size': 'Standard_D4_v4', 'Disk IOPS (uncached disks)': '30000', 'Disk MBps (uncached disks)': '50', 'Disk IOPS (cached disks)': '0', 'Disk MBps (cached disks)': '0' });
    assert.deepEqual(note(u, 'v5'), { state: '', text: '' });
    // Cached disks that can do more than the current cached limit: the ceiling is the limit
    // (16,000 on Standard_DS3_v2); Standard_D4ds_v6 allows 18,000, so no note for them.
    assert.equal(note(one({ ...DISKS, 'Disk IOPS (cached disks)': '18000' }), 'v6').text, 'The disks of this VM can do more than the new size allows. The uncached disks of this VM can do 20,000 IOPS in total. The current size allows 12,800 IOPS. The new size allows 6,400 IOPS. Standard_D8ds_v6 keeps the current limit.');
});

test('disk limits: blank totals give no "lower" note, only a "Check:" where the new size allows less', () => {
    // The list gives no disk values: the new size allows less, so "Check:".
    const m = one({});
    assert.deepEqual(note(m, 'v5'), { state: 'check', text: 'Check: the list does not give the disk IOPS and MBps. For the uncached disks, the current size allows 12,800 IOPS and 192 MBps. The new size allows 6,400 IOPS and 145 MBps.' });
    // Owner, 2026-11-20: a disk "Check:" is a note only. It does not change the readiness.
    assert.equal(F.groupOf(m), 'ready', 'still ready');
    assert.equal(F.summaryRows(run(list([{ 'VM name': 'contoso-db01' }])))[0]['Result group'], 'Move needed - Ready');
    // Another fact to check still makes "Ready with conditions".
    assert.equal(F.groupOf(one({ 'Hibernation': '' })), 'first');
    assert.ok(F.signals(m).checks.some((c) => c.topic === 'Disk limits'));
    // The new size allows as much or more: nothing (Standard_D4s_v3 to Standard_D4ds_v5).
    assert.deepEqual(note(one({ 'Current size': 'Standard_D4s_v3' }), 'v5'), { state: '', text: '' });
    // Only one value blank: only that value.
    assert.equal(note(one({ ...DISKS, 'Disk MBps (uncached disks)': '', 'Disk IOPS (uncached disks)': '5000' }), 'v5').text,
        'Check: the list does not give the disk MBps. For the uncached disks, the current size allows 192 MBps. The new size allows 145 MBps.');
    // A blank value and a lower value: the "Check:" first, then the fact.
    assert.equal(note(one({ ...DISKS, 'Disk MBps (uncached disks)': '' }), 'v5').text,
        'Check: the list does not give the disk MBps. For the uncached disks, the current size allows 192 MBps. The new size allows 145 MBps. '
        + 'The disks of this VM can do more than the new size allows. The uncached disks of this VM can do 20,000 IOPS in total. The current size allows 12,800 IOPS. The new size allows 6,400 IOPS. Standard_D8ds_v5 keeps the current limit.');
    // The cached disks blank: Standard_D4_v4 (38,500 cached IOPS) to Standard_D4_v5 (19,000).
    assert.equal(note(one({ ...DISKS, 'Current size': 'Standard_D4_v4', 'Disk IOPS (cached disks)': '', 'Disk IOPS (uncached disks)': '0', 'Disk MBps (uncached disks)': '0' }), 'v5').text,
        'Check: the list does not give the disk IOPS. For the cached disks, the current size allows 38,500 IOPS. The new size allows 19,000 IOPS.');
});

test('disk limits: Premium SSD v2 and Ultra Disk use the column of the size page; with no column, "Check:", never "lower"', () => {
    // Every uncached disk is a Premium SSD v2 (the OS disk, Premium SSD, is cached).
    const v2 = { ...DISKS, 'Disk types': 'Premium_LRS, PremiumV2_LRS', 'Disk types (uncached disks)': 'PremiumV2_LRS' };
    // 8,000 IOPS: Standard_D4ds_v6 allows 8,333 for Premium SSD v2 and Ultra Disk (6,400 for Premium SSD).
    const m = one({ ...v2, 'Disk IOPS (uncached disks)': '8000' });
    assert.deepEqual(note(m, 'v6'), { state: '', text: '' });
    assert.deepEqual(note(m, 'v7'), { state: '', text: '' });
    // The column is for the uncached disks only: the cached disks keep the cached limit
    // (Standard_D4ds_v6: 18,000 cached IOPS, more than the 10,000 that the disks can do).
    assert.deepEqual(note(one({ ...v2, 'Disk IOPS (uncached disks)': '8000', 'Disk IOPS (cached disks)': '10000' }), 'v6'), { state: '', text: '' });
    // v5 has no such column: the single limit of the size table is lower, but that is a guess.
    assert.deepEqual(note(m, 'v5'), { state: 'check', text: 'Check: this tool has no limit for Premium SSD v2 and Ultra Disk for Standard_D4ds_v5. The uncached disks of this VM can do 8,000 IOPS in total. The current size allows 12,800 IOPS. '
        + 'The size table gives 6,400 IOPS for Premium SSD.' });
    // 12,000 IOPS: the column is lower too, so the note says so, with the limit that it used.
    const h = one({ ...v2, 'Disk IOPS (uncached disks)': '12000' });
    assert.deepEqual(note(h, 'v6'), { state: 'attention', text: 'The disks of this VM can do more than the new size allows. The uncached disks of this VM can do 12,000 IOPS in total. The current size allows 12,800 IOPS. The new size allows 8,333 IOPS. '
        + 'For the new size, this tool uses the limit for Premium SSD v2 and Ultra Disk. Standard_D8ds_v6 keeps the current limit.' });
    // Without Premium SSD v2 or Ultra Disk, the column is not used: 8,000 IOPS is lower on v6 (6,400).
    assert.equal(note(one({ ...DISKS, 'Disk IOPS (uncached disks)': '8000' }), 'v6').state, 'attention');
    // The list does not give the disk types: the column would not be lower, so "Check:".
    assert.deepEqual(note(one({ ...DISKS, 'Disk types': '', 'Disk IOPS (uncached disks)': '8000' }), 'v6'), { state: 'check', text: 'Check: the list does not give the disk types. '
        + 'The uncached disks of this VM can do 8,000 IOPS in total. The current size allows 12,800 IOPS. The new size allows 6,400 IOPS for Premium SSD and 8,333 IOPS for Premium SSD v2 and Ultra Disk.' });
    // ... and when the column is lower too, the note is sure.
    assert.equal(note(one({ ...DISKS, 'Disk types': '', 'Disk IOPS (uncached disks)': '12000' }), 'v6').state, 'attention');
});

test('disk limits: a mix of Premium SSD v2 or Ultra Disk and other uncached disks gives both limits with "Check:", never "lower"', () => {
    const mix = { ...DISKS, 'Disk types': 'Premium_LRS, PremiumV2_LRS', 'Disk types (uncached disks)': 'Premium_LRS, PremiumV2_LRS', 'Disk IOPS (uncached disks)': '8000' };
    const m = one(mix);
    // v6: 6,400 for Premium SSD can lower the ceiling of 8,000; the column (8,333) cannot. Microsoft does not say which applies.
    assert.deepEqual(note(m, 'v6'), { state: 'check', text: 'Check: this VM has more than one kind of disk. Microsoft does not say which disk limit applies. '
        + 'The uncached disks of this VM can do 8,000 IOPS in total. The current size allows 12,800 IOPS for Premium SSD. This tool has no separate limit of the current size for Premium SSD v2 and Ultra Disk. '
        + 'The new size allows 6,400 IOPS for Premium SSD and 8,333 IOPS for Premium SSD v2 and Ultra Disk.' });
    // v5: no column for the new size either.
    assert.match(note(m, 'v5').text, / The new size allows 6,400 IOPS for Premium SSD\. This tool has no separate limit of the new size for Premium SSD v2 and Ultra Disk\.$/);
    // v7: both limits of Standard_D4ds_v7 (8,000 and 10,000) keep the ceiling of 8,000: no note.
    assert.deepEqual(note(m, 'v7'), { state: '', text: '' });
    // Both limits lower too: still "Check:", never "lower".
    const high = one({ ...mix, 'Disk IOPS (uncached disks)': '12000' });
    assert.equal(note(high, 'v6').state, 'check');
    assert.equal(note(high, 'v7').state, 'check');
    // Disks that can do less than every limit: no note on any series.
    for (const s of ['v5', 'v6', 'v7']) assert.deepEqual(note(one({ ...mix, 'Disk IOPS (uncached disks)': '5000' }), s), { state: '', text: '' }, s);
    // A current size with a column: its higher limit gives the current ceiling (made-up columns).
    const x = { diskTypes: 'Premium_LRS, PremiumV2_LRS', diskTypesUncached: 'Premium_LRS, PremiumV2_LRS', diskIopsUncached: '15000', diskMbpsUncached: '100', diskIopsCached: '0', diskMbpsCached: '0' };
    const cols = { Standard_DS3_v2: { iops: 20000, mbps: 500 }, Standard_D4ds_v6: { iops: 8333, mbps: 248 } };
    assert.match(diskNote({ sourceSize: 'Standard_DS3_v2' }, x, { option: 'v6', supported: true, targetSize: 'Standard_D4ds_v6' }, table, cols).text,
        /The current size allows 12,800 IOPS for Premium SSD and 20,000 IOPS for Premium SSD v2 and Ultra Disk\. The new size allows 6,400 IOPS for Premium SSD and 8,333 IOPS/);
    // 14,000: below the Premium SSD limit of the current size, but the higher limit counts: still a note.
    assert.equal(diskNote({ sourceSize: 'Standard_DS3_v2' }, { ...x, diskIopsUncached: '14000' }, { option: 'v6', supported: true, targetSize: 'Standard_D4ds_v6' }, table, { ...cols, Standard_D4ds_v6: { iops: 13000, mbps: 248 } }).state, 'check');
    // The higher limit of the current size: 18,000 IOPS on 12,800 (Premium SSD) and 20,000 (column) is a
    // ceiling of 18,000; Standard_D8ds_v7 allows 16,000 for Premium SSD, so it can lower it.
    const v7 = { option: 'v7', supported: true, targetSize: 'Standard_D8ds_v7' };
    assert.equal(diskNote({ sourceSize: 'Standard_DS3_v2' }, { ...x, diskIopsUncached: '18000' }, v7, table, { ...cols, Standard_D8ds_v7: { iops: 25000, mbps: 500 } }).state, 'check');
    // The lower limit of the new size: a column of 10,000 under the Premium SSD limit of 16,000 can lower a ceiling of 12,000.
    assert.equal(diskNote({ sourceSize: 'Standard_DS3_v2' }, { ...x, diskIopsUncached: '12000' }, v7, table, { Standard_D8ds_v7: { iops: 10000, mbps: 500 } }).state, 'check');
    // When the new size has a column that keeps the ceiling, and a Premium SSD limit that keeps it too: no note.
    assert.deepEqual(st(diskNote({ sourceSize: 'Standard_DS3_v2' }, { ...x, diskIopsUncached: '6000' }, { option: 'v6', supported: true, targetSize: 'Standard_D4ds_v6' }, table, cols)), { state: '', text: '' });
    // The note is a fact to check: the readiness does not change.
    assert.equal(F.groupOf(m), F.groupOf(one({ ...mix, 'Disk IOPS (uncached disks)': '5000' })));
});

test('disk limits: the next size up is in the same series, keeps every limit, and is not a size with fewer active vCPUs', () => {
    const fake = new SizeTable({
        Standard_C8_v1: { family: 'c', capabilities: { vCPUs: '8', vCPUsAvailable: '8', MemoryGB: '32', UncachedDiskIOPS: '15000', UncachedDiskBytesPerSecond: '200000000', CombinedTempDiskAndCachedIOPS: '9000', CombinedTempDiskAndCachedReadBytesPerSecond: '200000000', CombinedTempDiskAndCachedWriteBytesPerSecond: '200000000' } },
        Standard_C4_v1: { family: 'c', capabilities: { vCPUs: '4', vCPUsAvailable: '4', MemoryGB: '16', UncachedDiskIOPS: '9000', UncachedDiskBytesPerSecond: '200000000', CombinedTempDiskAndCachedIOPS: '9000', CombinedTempDiskAndCachedReadBytesPerSecond: '200000000', CombinedTempDiskAndCachedWriteBytesPerSecond: '200000000' } },
        Standard_X4_v9: { family: 'x', capabilities: { vCPUs: '4', vCPUsAvailable: '4', MemoryGB: '16', UncachedDiskIOPS: '3000', UncachedDiskBytesPerSecond: '200000000', CombinedTempDiskAndCachedIOPS: '4000', CombinedTempDiskAndCachedReadBytesPerSecond: '200000000', CombinedTempDiskAndCachedWriteBytesPerSecond: '200000000' } },
        'Standard_X8-4_v9': { family: 'x', capabilities: { vCPUs: '8', vCPUsAvailable: '4', MemoryGB: '32', UncachedDiskIOPS: '9000', UncachedDiskBytesPerSecond: '200000000', CombinedTempDiskAndCachedIOPS: '9000', CombinedTempDiskAndCachedReadBytesPerSecond: '200000000', CombinedTempDiskAndCachedWriteBytesPerSecond: '200000000' } },
        Standard_X8_v9: { family: 'x', capabilities: { vCPUs: '8', vCPUsAvailable: '8', MemoryGB: '32', UncachedDiskIOPS: '6000', UncachedDiskBytesPerSecond: '200000000', CombinedTempDiskAndCachedIOPS: '9000', CombinedTempDiskAndCachedReadBytesPerSecond: '200000000', CombinedTempDiskAndCachedWriteBytesPerSecond: '200000000' } },
        Standard_X16_v9: { family: 'x', capabilities: { vCPUs: '16', vCPUsAvailable: '16', MemoryGB: '64', UncachedDiskIOPS: '12000', UncachedDiskBytesPerSecond: '200000000', CombinedTempDiskAndCachedIOPS: '9000', CombinedTempDiskAndCachedReadBytesPerSecond: '200000000', CombinedTempDiskAndCachedWriteBytesPerSecond: '200000000' } },
        Standard_Y16_v9: { family: 'y', capabilities: { vCPUs: '16', vCPUsAvailable: '16', MemoryGB: '64', UncachedDiskIOPS: '12000', UncachedDiskBytesPerSecond: '200000000', CombinedTempDiskAndCachedIOPS: '9000', CombinedTempDiskAndCachedReadBytesPerSecond: '200000000', CombinedTempDiskAndCachedWriteBytesPerSecond: '200000000' } },
    });
    const vm = { sourceSize: 'Standard_C4_v1' };
    const x = { diskTypes: 'Premium_LRS', diskIopsUncached: '8000', diskMbpsUncached: '100', diskIopsCached: '0', diskMbpsCached: '0' };
    // X8-4 has fewer active vCPUs; X8 does not keep 8,000; X16 keeps it. Y16 is another series.
    assert.match(diskNote(vm, x, { option: 'v5', supported: true, targetSize: 'Standard_X4_v9' }, fake).text, / Standard_X16_v9 keeps the current limit\.$/);
    // Both groups lower: a sentence for each, then one size that keeps every limit.
    assert.equal(diskNote(vm, { ...x, diskIopsCached: '6000', diskMbpsCached: '50' }, { option: 'v5', supported: true, targetSize: 'Standard_X4_v9' }, fake).text,
        'The disks of this VM can do more than the new size allows. The uncached disks of this VM can do 8,000 IOPS in total. The current size allows 9,000 IOPS. The new size allows 3,000 IOPS. '
        + 'The cached disks of this VM can do 6,000 IOPS in total. The current size allows 9,000 IOPS. The new size allows 4,000 IOPS. Standard_X16_v9 keeps the current limits.');
    // No size of the series keeps it: no sentence about a size.
    assert.equal(diskNote({ sourceSize: 'Standard_C8_v1' }, { ...x, diskIopsUncached: '20000' }, { option: 'v5', supported: true, targetSize: 'Standard_X4_v9' }, fake).text,
        'The disks of this VM can do more than the new size allows. The uncached disks of this VM can do 20,000 IOPS in total. The current size allows 15,000 IOPS. The new size allows 3,000 IOPS.');
    // Premium SSD v2 or Ultra Disk: the next size must have the column too. X8 keeps the limit
    // only with its single value, which may not apply to these disks; X16 has the column.
    const columns = { Standard_X4_v9: { iops: 3000, mbps: 200 }, Standard_X16_v9: { iops: 12000, mbps: 200 } };
    const u = { ...x, diskTypes: 'PremiumV2_LRS', diskIopsUncached: '8000' };
    const wide = new SizeTable({ ...Object.fromEntries(fake.keys().map((n) => [n, { family: fake.get(n).family, capabilities: fake.get(n).caps }])),
        Standard_X8_v9: { family: 'x', capabilities: { ...fake.get('Standard_X8_v9').caps, UncachedDiskIOPS: '9000' } } });
    assert.match(diskNote(vm, u, { option: 'v5', supported: true, targetSize: 'Standard_X4_v9' }, wide, columns).text, / Standard_X16_v9 keeps the current limit\.$/);
    assert.match(diskNote(vm, { ...u, diskTypes: 'Premium_LRS' }, { option: 'v5', supported: true, targetSize: 'Standard_X4_v9' }, wide, columns).text, / Standard_X8_v9 keeps the current limit\.$/);
    // A mix of uncached disks: the next size must keep the uncached ceiling with either limit.
    // X8 has no column, so its Premium SSD limit (6,000) counts: it does not keep 8,000.
    const mixed = { ...x, diskTypes: 'Premium_LRS, PremiumV2_LRS', diskTypesUncached: 'Premium_LRS, PremiumV2_LRS', diskIopsCached: '6000', diskMbpsCached: '50' };
    const mixNote = diskNote(vm, mixed, { option: 'v5', supported: true, targetSize: 'Standard_X4_v9' }, fake, columns);
    assert.equal(mixNote.state, 'check');
    assert.match(mixNote.text, / Standard_X16_v9 keeps the current limit\.$/);
    // A blocked option (no size shows), no size, or the Generation 1 row: no note.
    assert.deepEqual(st(diskNote(vm, x, { option: 'v5', supported: false, targetSize: 'Standard_X4_v9' }, fake)), { state: '', text: '' });
    // In a plan: a VM already on v6 has a v5 size that is not supported ("already newer"): no note there.
    const newer = one({ 'Current size': 'Standard_D16ads_v6' });
    assert.equal(newer.rows.find((r) => r.series === 'v5').option.supported, false);
    assert.deepEqual(note(newer, 'v5'), { state: '', text: '' });
    assert.deepEqual(st(diskNote(vm, x, { option: 'v5', supported: true, targetSize: null }, fake)), { state: '', text: '' });
    assert.deepEqual(st(diskNote(vm, x, { option: 'gen1Route', supported: true, targetSize: 'Standard_X4_v9' }, fake)), { state: '', text: '' });
    // A size that the size table does not have: "Check:" when the list gives the disk values.
    assert.deepEqual(st(diskNote({ sourceSize: 'Standard_Q4_v9' }, x, { option: 'v5', supported: true, targetSize: 'Standard_X4_v9' }, fake)), { state: 'check', text: 'Check: the size table does not give the disk limits of Standard_Q4_v9.' });
    assert.deepEqual(st(diskNote({ sourceSize: 'Standard_Q4_v9' }, { ...x, diskIopsUncached: '', diskMbpsUncached: '' }, { option: 'v5', supported: true, targetSize: 'Standard_X4_v9' }, fake)), { state: '', text: '' });
});

test('disk limits: numbers in words, with no locale', () => {
    assert.equal(diskWords(1234567), '1,234,567');
    assert.equal(diskWords(131.072), '131');
    assert.equal(diskWords(65.536), '66');
    assert.equal(diskWords(12800), '12,800');
    assert.equal(diskWords(0), '0');
});

// ---------------------------------------------------------------------------
// Where the note and the limits show
// ---------------------------------------------------------------------------

test('disk limits: the note is a note of the VM: the page, the report, vm-target-sizes.csv and vm-summary.csv', () => {
    // A new topic after "Data disks"; its column is the last of vm-target-sizes.csv, so that the other columns keep their place.
    assert.equal(F.CAVEAT_TOPICS[F.CAVEAT_TOPICS.indexOf('Data disks') + 1], 'Disk limits');
    assert.equal(F.TARGET_COLUMNS.at(-1), 'Disk limits');
    assert.equal(F.TARGET_COLUMNS.indexOf('Disk limits'), F.TARGET_COLUMNS.length - 1);
    assert.deepEqual(F.TARGET_COLUMNS.slice(0, -1).slice(-4), ['Notes', 'Resource ID', 'SAP sign', 'Preview feature']);
    assert.deepEqual(F.TARGET_COLUMNS.slice(25, 41), ['NVMe', 'Disk encryption', 'Temporary disk', 'Accelerated networking', 'NICs', 'Data disks', 'Hibernation',
        'Scale set / AKS / AVD', 'SAP', 'Unmanaged disks', 'Ephemeral OS disk', 'Identity', 'Availability set', 'Network virtual appliance', 'Storage or backup appliance', 'Zone']);
    const p = run(list([{ 'VM name': 'contoso-db01', ...DISKS }]));
    const rows = F.targetRows(p, table, NOW);
    assert.equal(rows.find((r) => r.Series === 'v5')['Disk limits'], note(p.machines[0], 'v5').text);
    // vm-summary.csv: the short sentence and the numbers, of the size that "What to do" uses.
    assert.match(F.summaryRows(p)[0]['Good to know'], /Disk limits: The disks of this VM can do more than the new size allows\. The uncached disks of this VM can do 20,000 IOPS in total\./);
    // The page and the report: one note for the VM, short, for all its sizes (owner, 2026-11-20).
    const VM_NOTE = 'The disks of this VM can do more than the new size allows. Compare the disk rows in the size table. Standard_D8ds_v5 keeps the current limit. Standard_D8ds_v6 keeps the current limit. Standard_D8ds_v7 keeps the current limit.';
    const n = F.allNotes(p.machines[0]);
    assert.deepEqual([...n.actions, ...n.attention, ...n.checks].filter((x) => x.topic === 'Disk limits'), [{ topic: 'Disk limits', text: VM_NOTE, series: [] }]);
    const html = reportHtml(p, table, 'test', NOW);
    assert.equal(html.split('<b>Disk limits:</b>').length, 2, 'one note in the report');
    assert.ok(html.includes(`<b>Disk limits:</b> ${VM_NOTE}</li>`), 'no series after it');
    // The blank case is in "To check" (vm-summary.csv names the topic).
    assert.match(F.summaryRows(run(list([{ 'VM name': 'contoso-db02' }])))[0]['To check'], /Disk limits/);
});

test('disk limits: the size comparison has the uncached IOPS and MBps of each size, with the values of this VM', () => {
    const m = one(DISKS);
    const c = sizeComparison(m, table);
    const rows = Object.fromEntries(c.rows.map((r) => [r.label, r.cells]));
    assert.deepEqual(rows['Max disk IOPS (uncached)'].map((x) => x.text), ['12,800 (this VM: 20,000)', '6,400', '6,400 (8,333 for Premium SSD v2 and Ultra Disk)', '8,000 (10,000 for Premium SSD v2 and Ultra Disk)']);
    assert.deepEqual(rows['Max disk MBps (uncached)'].map((x) => x.text), ['192 (this VM: 100)', '145', '212 (248 for Premium SSD v2 and Ultra Disk)', '236 (270 for Premium SSD v2 and Ultra Disk)']);
    assert.deepEqual(rows['Max disk IOPS (uncached)'].map((x) => x.less), ['', 'Less than the current size (12,800).', 'Less than the current size (12,800).', 'Less than the current size (12,800).']);
    // 100 MBps: less than every limit, so no new size lowers the ceiling.
    assert.deepEqual(rows['Max disk MBps (uncached)'].map((x) => x.less), ['', '', '', '']);
    // The cached rows: the VM gives cached values.
    assert.deepEqual(rows['Max disk IOPS (cached)'].map((x) => x.text), ['16,000 (this VM: 500)', '19,000', '18,000', '18,000']);
    assert.deepEqual(rows['Max disk MBps (cached)'].map((x) => x.text), ['128 (this VM: 100)', '250', '250', '250']);
    // A total under the current limit is the ceiling: the note names the value of this VM.
    const v = Object.fromEntries(sizeComparison(one({ ...DISKS, 'Disk IOPS (uncached disks)': '7500' }), table).rows.map((r) => [r.label, r.cells.map((x) => x.less)]));
    assert.deepEqual(v['Max disk IOPS (uncached)'], ['', 'Less than the 7,500 IOPS of this VM.', 'Less than the 7,500 IOPS of this VM.', '']);
    // No uncached disks (0): nothing to lower, no note under a value.
    const z = Object.fromEntries(sizeComparison(one({ ...DISKS, 'Disk IOPS (uncached disks)': '0', 'Disk MBps (uncached disks)': '0' }), table).rows.map((r) => [r.label, r.cells.map((x) => x.less)]));
    assert.deepEqual([...z['Max disk IOPS (uncached)'], ...z['Max disk MBps (uncached)']], ['', '', '', '', '', '', '', '']);
    // No cached disks (0): no cached rows; no values: no cached rows either.
    const nc = sizeComparison(one({ ...DISKS, 'Disk IOPS (cached disks)': '0', 'Disk MBps (cached disks)': '0' }), table).rows.map((r) => r.label);
    assert.ok(!nc.includes('Max disk IOPS (cached)'));
    assert.ok(!sizeComparison(one({}), table).rows.some((r) => /cached\)$/.test(r.label) && !/uncached/.test(r.label)));
    // Only Premium SSD v2 and Ultra Disk uncached: the column of the size counts for the note.
    const u = Object.fromEntries(sizeComparison(one({ ...DISKS, 'Disk types': 'Premium_LRS, PremiumV2_LRS', 'Disk types (uncached disks)': 'PremiumV2_LRS', 'Disk IOPS (uncached disks)': '8000' }), table).rows.map((r) => [r.label, r.cells.map((x) => x.less)]));
    assert.deepEqual(u['Max disk IOPS (uncached)'], ['', 'Less than the 8,000 IOPS of this VM.', '', '']);
    // Standard HDD and Standard SSD: "up to"; no values from the list: no "this VM".
    const s = Object.fromEntries(sizeComparison(one({ ...DISKS, 'Disk types': 'Standard_LRS' }), table).rows.map((r) => [r.label, r.cells[0].text]));
    assert.equal(s['Max disk IOPS (uncached)'], '12,800 (this VM: up to 20,000)');
    const b = Object.fromEntries(sizeComparison(one({}), table).rows.map((r) => [r.label, r.cells[0].text]));
    assert.equal(b['Max disk IOPS (uncached)'], '12,800');
    // The rows come after "Max data disks".
    assert.deepEqual(c.rows.map((r) => r.label).slice(4, 7), ['Max data disks', 'Max disk IOPS (uncached)', 'Max disk MBps (uncached)']);
});

test('disk limits: the real row of the test build as a Standard_DS2_v2 VM: one short note, the numbers in the size table', () => {
    // contoso-disk01 of the test build (2026-11-20): one disk of each type. Current size changed to Standard_DS2_v2.
    const m = one({ 'Current size': 'Standard_DS2_v2', 'Data-disk count': '4', 'Disk controller': 'SCSI', 'Disk types': 'PremiumV2_LRS, Premium_LRS, StandardSSD_LRS, Standard_LRS, UltraSSD_LRS',
        'Disk types (uncached disks)': 'PremiumV2_LRS, Standard_LRS, UltraSSD_LRS', 'Disk IOPS (uncached disks)': '4700', 'Disk MBps (uncached disks)': '235', 'Disk IOPS (cached disks)': '620', 'Disk MBps (cached disks)': '125' });
    const n = F.allNotes(m);
    assert.deepEqual(n.checks.filter((x) => x.topic === 'Disk limits'), [{ topic: 'Disk limits', text: 'Check: this VM has more than one kind of disk. Microsoft does not say which disk limit applies. Compare the disk rows in the size table.', series: [] }]);
    const rows = Object.fromEntries(sizeComparison(m, table).rows.map((r) => [r.label, r.cells]));
    // A mix: a mark only when every limit that may apply is lower (v7: 5,000 is more than 4,700).
    assert.deepEqual(rows['Max disk IOPS (uncached)'].map((x) => [x.text, x.less]), [['6,400 (this VM: up to 4,700)', ''], ['3,750', 'Less than the 4,700 IOPS of this VM.'],
        ['3,750 (4,167 for Premium SSD v2 and Ultra Disk)', 'Less than the 4,700 IOPS of this VM.'], ['4,000 (5,000 for Premium SSD v2 and Ultra Disk)', '']]);
    assert.deepEqual(rows['Max disk MBps (uncached)'].map((x) => [x.text, x.less]), [['96 (this VM: up to 235)', ''], ['85', 'Less than the current size (96).'],
        ['106 (124 for Premium SSD v2 and Ultra Disk)', ''], ['118 (135 for Premium SSD v2 and Ultra Disk)', '']]);
    assert.deepEqual(rows['Max disk IOPS (cached)'].map((x) => x.text), ['8,000 (this VM: up to 620)', '9,000', '9,000', '9,000']);
    assert.deepEqual(rows['Max disk MBps (cached)'].map((x) => x.text), ['64 (this VM: up to 125)', '125', '125', '125']);
});

test('disk limits: the size table marks for a mix compare every limit that may apply, of both sizes', () => {
    // The current size: its lowest limit that may apply. Standard_D4ds_v6 allows 6,400 for Premium SSD and
    // 8,333 for Premium SSD v2 and Ultra Disk; a new size of 7,000 is not lower than every limit now (blank total).
    const mixVm = one({ ...DISKS, 'Disk types': 'Premium_LRS, PremiumV2_LRS', 'Disk types (uncached disks)': 'Premium_LRS, PremiumV2_LRS', 'Disk IOPS (uncached disks)': '', 'Disk MBps (uncached disks)': '' });
    const xCaps = (iops) => ({ family: 'x', capabilities: { vCPUs: '4', vCPUsAvailable: '4', MemoryGB: '16', UncachedDiskIOPS: String(iops), UncachedDiskBytesPerSecond: '300000000' } });
    const t6 = new SizeTable({ Standard_D4ds_v6: sizes.sizes.Standard_D4ds_v6, Standard_X4_v9: xCaps(7000), Standard_X6_v9: xCaps(6000) });
    const markOf = (target) => sizeComparison({ ...mixVm, vm: { ...mixVm.vm, sourceSize: 'Standard_D4ds_v6' }, rows: [{ series: 'v7', option: { supported: true, targetSize: target } }] }, t6)
        .rows.find((r) => r.label === 'Max disk IOPS (uncached)').cells[1].less;
    assert.equal(markOf('Standard_X4_v9'), '');
    assert.equal(markOf('Standard_X6_v9'), 'Less than the current size (6,400).');
    const x = { 'Disk types': 'Premium_LRS, PremiumV2_LRS', 'Disk types (uncached disks)': 'Premium_LRS, PremiumV2_LRS' };
    const less = (row) => Object.fromEntries(sizeComparison(one({ ...DISKS, ...x, ...row }), table).rows.map((r) => [r.label, r.cells.map((c) => c.less)]));
    // 20,000 IOPS on Standard_DS3_v2 (12,800, no column): the current size is the ceiling. D4ds_v6 (6,400 and 8,333) and
    // D4ds_v7 (8,000 and 10,000) are lower with every limit: marked.
    assert.deepEqual(less({})['Max disk IOPS (uncached)'], ['', 'Less than the current size (12,800).', 'Less than the current size (12,800).', 'Less than the current size (12,800).']);
    // 9,000 IOPS: v6 (8,333 at most) is lower; v7 (10,000) may not be.
    assert.deepEqual(less({ 'Disk IOPS (uncached disks)': '9000' })['Max disk IOPS (uncached)'], ['', 'Less than the 9,000 IOPS of this VM.', 'Less than the 9,000 IOPS of this VM.', '']);
    // The same disks, but only Premium SSD (no mix): v7 (8,000) is lower.
    const plain = Object.fromEntries(sizeComparison(one({ ...DISKS, 'Disk IOPS (uncached disks)': '9000' }), table).rows.map((r) => [r.label, r.cells.map((c) => c.less)]));
    assert.deepEqual(plain['Max disk IOPS (uncached)'], ['', 'Less than the 9,000 IOPS of this VM.', 'Less than the 9,000 IOPS of this VM.', 'Less than the 9,000 IOPS of this VM.']);
});

test('disk limits: the query leaves the disk values blank by design for a scale set: no "Check:" there', () => {
    const blankNote = (row) => one({ ...row }).rows.map((r) => r.caveats && r.caveats['Disk limits'] && r.caveats['Disk limits'].state).filter((x) => x);
    // A standalone VM with blank values: "Check:".
    assert.ok(blankNote({}).includes('check'));
    // A scale set row, an AKS node pool: nothing to fix in the list, so no note.
    assert.deepEqual(blankNote({ 'Resource type': 'Scale set', 'Scale set': 'Yes', 'Generation': 'V2' }), []);
    assert.deepEqual(blankNote({ 'Resource type': 'Scale set', 'Scale set': 'Yes', 'Managed by': 'AKS', 'Generation': '' }), []);
    // A scale set in a list without the workload columns: the same.
    const bare = run('VM name,Current size,Generation,OS,NIC count,Data-disk count,Resource type\ncontoso-ss1,Standard_DS3_v2,V2,Linux,1,2,Scale set\n').machines[0];
    assert.deepEqual(bare.rows.map((r) => r.caveats && r.caveats['Disk limits'] && r.caveats['Disk limits'].state).filter((x) => x), []);
    // A VM in a pool (a pooled AVD host is a VM: the query gives its disks): blank values still give "Check:".
    assert.ok(blankNote({ 'Azure Virtual Desktop': 'Yes', 'AVD host pool type': 'Pooled' }).includes('check'));
    // Unmanaged disks: no supported size, so no note at all.
    assert.deepEqual(blankNote({ 'Unmanaged disks': 'Yes' }), []);
    // With values, a scale set still gets a note that the values give.
    assert.ok(blankNote({ ...DISKS, 'Resource type': 'Scale set', 'Scale set': 'Yes' }).includes('attention'));
});

test('vm-summary.csv points to vm-target-sizes.csv when only another size has a disk note', () => {
    // 7,500 IOPS on Standard_DS3_v2: the likely size (v6) lowers the ceiling.
    const p = run(list([{ 'VM name': 'contoso-db04', ...DISKS, 'Disk IOPS (uncached disks)': '7500', 'Current size': 'Standard_DS3_v2' }]));
    const m = p.machines[0];
    const likely = F.likelyRow(m);
    assert.equal(likely.series, 'v6');
    const row = F.summaryRows(p)[0];
    // v6 (the likely size) lowers it: the note itself.
    assert.match(row['Good to know'], /Disk limits: The disks of this VM can do more than the new size allows\./);
    assert.ok(!row['Good to know'].includes(F.DISK_POINTER) && !row['To check'].includes(F.DISK_POINTER), 'no pointer when the note is there');
    // A VM whose likely size has no note: a short pointer.
    const q = run(list([{ 'VM name': 'contoso-db05', ...DISKS, 'Disk types': 'Premium_LRS, PremiumV2_LRS', 'Disk types (uncached disks)': 'PremiumV2_LRS', 'Disk IOPS (uncached disks)': '8000' }]));
    const r = F.summaryRows(q)[0];
    assert.equal(F.likelyRow(q.machines[0]).caveats['Disk limits'].state, '');
    assert.match(r['To check'], /(^|, )Disk limits: see vm-target-sizes\.csv\.$/);
    assert.doesNotMatch(r['Good to know'], /Disk limits/);
    // With no disk note at all: no pointer.
    assert.doesNotMatch(F.summaryRows(run(list([{ 'VM name': 'contoso-db06', ...DISKS, 'Disk IOPS (uncached disks)': '5000' }])))[0]['To check'], /Disk limits/);
});

test('disk limits: one short note for the VM: each kind of sentence once, the sizes named when not every size lowers it', () => {
    const allOf = (m) => { const n = F.allNotes(m); return [...n.actions, ...n.attention, ...n.checks].filter((x) => x.topic === 'Disk limits'); };
    // 7,500 IOPS: v5 and v6 (6,400) lower it, v7 (8,000) does not.
    assert.deepEqual(allOf(one({ ...DISKS, 'Disk IOPS (uncached disks)': '7500' })), [{ topic: 'Disk limits', series: [],
        text: 'The disks of this VM can do more than Standard_D4ds_v5 and Standard_D4ds_v6 allow. Compare the disk rows in the size table. Standard_D8ds_v5 keeps the current limit. Standard_D8ds_v6 keeps the current limit.' }]);
    // No values: one "Check:" for all sizes, also when the rows differ (IOPS and MBps on v5, IOPS on v6 and v7).
    assert.deepEqual(allOf(one({})), [{ topic: 'Disk limits', series: [], text: 'Check: the list does not give the disk IOPS and MBps. Compare the disk rows in the size table.' }]);
    // Only Premium SSD v2 or Ultra Disk, no separate limit for the v5 size.
    assert.deepEqual(allOf(one({ ...DISKS, 'Disk types': 'Premium_LRS, PremiumV2_LRS', 'Disk types (uncached disks)': 'PremiumV2_LRS', 'Disk IOPS (uncached disks)': '8000' })),
        [{ topic: 'Disk limits', series: [], text: 'Check: this tool has no limit for Premium SSD v2 and Ultra Disk for Standard_D4ds_v5. Compare the disk rows in the size table.' }]);
    // A "Check:" and a lower size together: one note, "Check:" first, the comparison once.
    assert.deepEqual(allOf(one({ ...DISKS, 'Disk types': 'Premium_LRS, PremiumV2_LRS', 'Disk types (uncached disks)': 'PremiumV2_LRS', 'Disk IOPS (uncached disks)': '12000' })),
        [{ topic: 'Disk limits', series: [], text: 'Check: this tool has no limit for Premium SSD v2 and Ultra Disk for Standard_D4ds_v5. The disks of this VM can do more than Standard_D4ds_v6 and Standard_D4ds_v7 allow. '
            + 'Compare the disk rows in the size table. Standard_D8ds_v6 keeps the current limit. Standard_D8ds_v7 keeps the current limit.' }]);
    // Nothing to say: no note.
    assert.deepEqual(allOf(one({ ...DISKS, 'Disk IOPS (uncached disks)': '5000' })), []);
    // The size table has no limits: the sentence stays, with no comparison.
    const fake = new SizeTable({ Standard_X4_v9: { family: 'x', capabilities: { vCPUs: '4', vCPUsAvailable: '4', MemoryGB: '16', UncachedDiskIOPS: '3000', UncachedDiskBytesPerSecond: '200000000', CombinedTempDiskAndCachedIOPS: '9000', CombinedTempDiskAndCachedReadBytesPerSecond: '200000000', CombinedTempDiskAndCachedWriteBytesPerSecond: '200000000' } } });
    const row = { series: 'v5', option: { option: 'v5', supported: true, targetSize: 'Standard_X4_v9' } };
    row.caveats = { 'Disk limits': diskNote({ sourceSize: 'Standard_Q4_v9' }, { diskTypes: 'Premium_LRS', diskIopsUncached: '8000', diskMbpsUncached: '100', diskIopsCached: '0', diskMbpsCached: '0' }, row.option, fake) };
    assert.deepEqual(vmDiskNote([row]), { state: 'check', text: 'Check: the size table does not give the disk limits of Standard_Q4_v9.' });
});

test('disk limits: the about file says how the tool compares the disk limits, with the Microsoft pages', () => {
    const p = run(list([{ 'VM name': 'contoso-db01', ...DISKS }]));
    const l = readList(list([{ 'VM name': 'contoso-db01', ...DISKS }]));
    const about = F.aboutText(p, l, 'test.csv', NOW);
    assert.match(about, /\r\nDISK LIMITS\r\n/);
    for (const s of ['A new size is a problem only when it lowers the disk ceiling of the VM.',
        'The ceiling is the lower of two values: what the disks of the VM can do in total, and the disk limit of the size.',
        'Microsoft: the cached limits of a VM are separate from its uncached limits.',
        'This tool does not count disk bursting. Microsoft says that credit-based bursting is best effort and not guaranteed.',
        'Standard HDD and Standard SSD give "up to" values.',
        'An ephemeral OS disk is not a managed disk. The query leaves it out.',
        'The recommended size does not change.',
        'A note "Disk limits" never changes the readiness of the VM, also when it is in "To check".',
        'For a scale set, a blank value gives no "Check:". The query cannot give these values.',
        'This tool uses it when every uncached disk of the VM is Premium SSD v2 or Ultra Disk.',
        'Some VMs have Premium SSD v2 or Ultra Disk disks and other uncached disks. Microsoft does not say which limit applies to this mix.',
        'For such a VM, the note is "Check:". It shows only where a limit of the new size can lower the ceiling.',
        'On the page and in the report, the note is short and shows once for the VM. The size table of the VM gives the numbers.',
        'https://learn.microsoft.com/azure/virtual-machines/disks-performance',
        'https://learn.microsoft.com/azure/virtual-machines/disk-bursting',
        'https://learn.microsoft.com/azure/virtual-machines/disks-types']) assert.ok(about.includes(s), s);
});

// ---------------------------------------------------------------------------
// The query, the template and the samples
// ---------------------------------------------------------------------------

test('the query reads the disks of each VM in the disk pass it already has: no new join', () => {
    const q = read('query.kql');
    const code = q.split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');
    for (const f of ['properties.diskIOPSReadWrite', 'properties.diskMBpsReadWrite', 'diskType = anyif(tostring(sku.name)', 'properties.diskSizeGB', 'properties.tier',
        'properties.storageProfile.osDisk', 'k.caching', 'k.lun', "'PremiumV2_LRS', 'UltraSSD_LRS'"]) assert.ok(code.includes(f), f);
    for (const c of ['Disk types', 'Disk types (uncached disks)', 'Disk IOPS (uncached disks)', 'Disk MBps (uncached disks)', 'Disk IOPS (cached disks)', 'Disk MBps (cached disks)', 'Disks']) assert.match(code, new RegExp(`\\['${c.replace(/[()]/g, '\\$&')}'\\] =`), c);
    // Resource Graph limits: three joins, and no more than three mv-expand.
    assert.equal((code.match(/\| join /g) || []).length, 3);
    assert.ok((code.match(/\| mv-expand /g) || []).length <= 3);
    // An ephemeral OS disk is not a managed disk: it is not a key of the VM.
    assert.match(code, /diffDiskSettings\.option\) =~ 'Local', dynamic\(\[\]\), pack_array\(properties\.storageProfile\.osDisk\)\)/);
    // The caching and the LUN of each VM on the disk, read for that VM after the second mv-expand.
    assert.ok(code.includes("diskOnVm = make_bag_if(pack(tolower(id), pack('caching', tostring(k.caching), 'lun', tostring(k.lun))), isVm and tolower(id) != key)"));
    assert.ok(code.includes('| mv-expand key2 = key2s to typeof(string)\n| extend diskCaching = tostring(diskOnVm[key2].caching), diskLun = tostring(diskOnVm[key2].lun)'));
    // Blank for a scale set, unmanaged disks, a disk with no value or no caching setting.
    assert.match(code, /isVmss == 1 or unmanaged or unknownDisks > 0/);
    // The page shows the same query; the template has the columns, blank.
    assert.equal(read('js/query.js').includes('diskIOPSReadWrite'), true);
    const t = read('template.csv').split('\n')[0];
    for (const c of ['Disk types', 'Disk types (uncached disks)', 'Disk IOPS (uncached disks)', 'Disk MBps (uncached disks)', 'Disk IOPS (cached disks)', 'Disk MBps (cached disks)', 'Disks']) assert.ok(t.includes(c), c);
});

test('the sample has VMs whose new size lowers the disk ceiling, and one with disk values that does not', () => {
    const p = run(sample);
    const lower = p.machines.filter((m) => m.rows && m.rows.some((r) => r.caveats && r.caveats['Disk limits'] && r.caveats['Disk limits'].state === 'attention'));
    // 0.9.9-beta: the larger sample has four (P40, two P30 and three disks on a v2 size).
    assert.deepEqual(lower.map((m) => m.read.name), ['contoso-web02', 'contoso-file01', 'contoso-mq01', 'contoso-sql02']);
    const given = p.machines.find((m) => m.read.name === 'contoso-web01' && m.extra.diskIopsUncached !== null);
    assert.ok(given, 'contoso-web01 gives disk values');
    assert.ok(given.rows.every((r) => !r.caveats || !r.caveats['Disk limits'] || r.caveats['Disk limits'].state === ''), 'no note');
    // The recommended sizes are the same as with no disk columns.
    const head = sample.split('\n')[0].split(',');
    const keep = head.map((h, i) => (/^(Disk types|Disk IOPS|Disk MBps|Disks)/.test(h.replace(/"/g, '')) ? -1 : i)).filter((i) => i >= 0);
    const strip = sample.split('\n').map((line) => { const cells = []; let cur = '', q = false; for (const ch of line) { if (ch === '"') q = !q; if (ch === ',' && !q) { cells.push(cur); cur = ''; } else cur += ch; } cells.push(cur); return keep.map((i) => cells[i] ?? '').join(','); }).join('\n');
    const q = run(strip);
    p.machines.forEach((m, i) => assert.deepEqual((m.rows || []).map((r) => r.option.targetSize), (q.machines[i].rows || []).map((r) => r.option.targetSize), m.read.name));
});
