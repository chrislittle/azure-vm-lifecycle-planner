// The disk limits of a VM and of each new size (0.9.8-beta).
//
// Microsoft, "Virtual machine and disk performance"
// (https://learn.microsoft.com/azure/virtual-machines/disks-performance, updated 2026-09-16):
// "Managed OS disks and data disks have their own IOPS and throughput limits", and the VM
// size limits what they can deliver; "A virtual machine's cached limits are separate from its
// uncached limits." So the disk ceiling of a VM is the lower of what its disks can do in total
// and the disk limit of its size, for the uncached disks (host caching None) and the cached
// disks apart. A new size is a problem only when it lowers that ceiling (owner, 2026-11-20):
// then a note says so, and names the next size up in the same series that keeps it. The
// note never changes the recommended size.
//
// Not counted: bursting. Microsoft, "Managed disk bursting"
// (https://learn.microsoft.com/azure/virtual-machines/disk-bursting): credit-based bursting
// "operates on a best effort basis and isn't guaranteed", and the size table has no burst
// values. Standard HDD and Standard SSD give "up to" values (Microsoft, "Azure managed disk
// types", https://learn.microsoft.com/azure/virtual-machines/disks-types): the words say "up to".
//
// Unknown is never a pass and never a fail: a value that the list does not give is no
// "lower" note, only a "Check:" where the new size allows less than the current size.

import { sizeFacts } from './lifecycle.js?v=0.9.8-beta';

const GROUPS = ['uncached', 'cached'];
const VALUES = ['iops', 'mbps'];
const UNIT = { iops: 'IOPS', mbps: 'MBps' };
const GROUP_WORDS = { uncached: 'uncached disks', cached: 'cached disks' };
const none = () => ({ state: '', text: '' });

// A number from the list: '20000', '20,000' or '12.5'. null for a blank, a negative number
// or anything else: no value is made up.
export function readAmount(text) {
    const t = String(text ?? '').trim();
    if (/^\d+(\.\d+)?$/.test(t)) return Number(t);
    if (/^\d{1,3}(,\d{3})+(\.\d+)?$/.test(t)) return Number(t.replace(/,/g, ''));
    return null;
}

// A number in words, with no locale (the same text on every computer): 12800 -> '12,800',
// 131.072 -> '131.1'.
export function diskWords(n) {
    const [whole, part] = String(Math.round(n * 10) / 10).split('.');
    return `${whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}${part ? `.${part}` : ''}`;
}

// The disk values that the list gives for a VM (extras.js, readExtras): { uncached: { iops,
// mbps }, cached: { iops, mbps }, types, uncachedTypes, ultra, ultraOnly, mix, upTo }. Each value
// is null when the list does not give it, 0 when the VM has no disk of that kind. types and
// uncachedTypes: Azure's names (Premium_LRS), or null. ultra: a Premium SSD v2 or Ultra Disk.
// ultraOnly: every uncached disk is a Premium SSD v2 or Ultra Disk (the separate column of the
// size page applies). mix: Premium SSD v2 or Ultra Disk and other uncached disks, or other disks
// when the list does not give "Disk types (uncached disks)": Microsoft does not say which limit
// applies to such a mix (owner, 2026-11-20). upTo: a Standard HDD or Standard SSD.
const isUltra = (t) => /^(PremiumV2_LRS|UltraSSD_LRS)$/i.test(t);
const typeList = (v) => (v ? String(v).split(/[,;]/).map((s) => s.trim()).filter((s) => s) : null);
export function diskTotals(x) {
    const types = typeList(x && x.diskTypes);
    const uncachedTypes = typeList(x && x.diskTypesUncached);
    const decide = uncachedTypes || types;
    const ultra = Boolean([...(types || []), ...(uncachedTypes || [])].some(isUltra));
    const ultraOnly = Boolean(decide && decide.length && decide.every(isUltra));
    return {
        uncached: { iops: readAmount(x && x.diskIopsUncached), mbps: readAmount(x && x.diskMbpsUncached) },
        cached: { iops: readAmount(x && x.diskIopsCached), mbps: readAmount(x && x.diskMbpsCached) },
        types, uncachedTypes, ultra, ultraOnly,
        mix: !ultraOnly && Boolean(decide && decide.some(isUltra)),
        upTo: Boolean(types && types.some((t) => /^Standard(SSD)?_/i.test(t))),
    };
}

// The disk limits of a size from the size table, or null when the table does not have it.
// columns: the column for Premium SSD v2 and Ultra Disk by size name, in place of the Microsoft
// size pages (only a test gives it, with a made-up table).
function limitsOf(size, table, columns) {
    const f = size && table.has(size) ? sizeFacts(table.get(size)) : null;
    if (!f) return null;
    const u = columns ? columns[size] || { iops: null, mbps: null } : { iops: f.ultraIops, mbps: f.ultraMbps };
    return { uncached: { iops: f.uncachedIops, mbps: f.uncachedMbps }, cached: { iops: f.cachedIops, mbps: f.cachedMbps }, ultra: u };
}

// The limit of a size for one group and one value: { value, column }. column: the value is the
// separate column for Premium SSD v2 and Ultra Disk of the Microsoft size page, which applies
// when every uncached disk of the VM is such a disk (they are always uncached).
function limitFor(l, group, k, ultra) {
    if (!l) return { value: null, column: false };
    if (group === 'uncached' && ultra && l.ultra[k] !== null) return { value: l.ultra[k], column: true };
    return { value: l[group][k], column: false };
}

// For a mix of uncached disks: both limits of each size. { cs, cu, ns, nu, curHigh, newLow }:
// the Premium SSD limit and the column (null when the size has none) of the current and the new
// size, the higher limit of the current size and the lower limit of the new size. null when the
// size table does not give a limit.
function mixLimits(cur, neu, k) {
    if (!cur || !neu || cur.uncached[k] === null || neu.uncached[k] === null) return null;
    const cs = cur.uncached[k], cu = cur.ultra[k], ns = neu.uncached[k], nu = neu.ultra[k];
    return { cs, cu, ns, nu, curHigh: Math.max(cs, cu ?? cs), newLow: Math.min(ns, nu ?? ns) };
}

// The sizes of one series (the family of the size table), each once, from small to large:
// vCPUs, then memory, then the name. Made once for each table.
const bySeries = new WeakMap();
function seriesSizes(table, family) {
    let all = bySeries.get(table);
    if (!all) {
        all = new Map();
        for (const name of table.keys()) {
            const e = table.get(name);
            const f = sizeFacts(e);
            if (!all.has(e.family)) all.set(e.family, []);
            all.get(e.family).push({ name: e.name, f });
        }
        for (const list of all.values()) {
            list.sort((a, b) => (a.f.vcpus ?? 0) - (b.f.vcpus ?? 0) || (a.f.memoryGiB ?? 0) - (b.f.memoryGiB ?? 0) || a.name.localeCompare(b.name, 'en'));
        }
        bySeries.set(table, all);
    }
    return all.get(family) || [];
}

// The next size up in the series of the new size that keeps every disk ceiling that the list
// gives, or null. Not a size with fewer active vCPUs than vCPUs (a constrained size).
function nextKeeping(target, t, cur, table, columns) {
    const e = table.get(target);
    const tf = e ? sizeFacts(e) : null;
    if (!tf || tf.vcpus === null || tf.memoryGiB === null) return null;
    const keeps = (l) => GROUPS.every((g) => VALUES.every((k) => {
        const T = t[g][k];
        if (T === null || T === 0) return true;
        // A mix: the size must keep the ceiling with either limit.
        if (g === 'uncached' && t.mix) {
            const m = mixLimits(cur, l, k);
            return Boolean(m) && Math.min(T, m.newLow) >= Math.min(T, m.curHigh);
        }
        const c = limitFor(cur, g, k, t.ultraOnly);
        const n = limitFor(l, g, k, t.ultraOnly);
        if (c.value === null) return true;
        // A Premium SSD v2 or Ultra Disk with no column for this size: this tool cannot tell.
        if (n.value === null || (g === 'uncached' && t.ultraOnly && !n.column)) return false;
        return Math.min(T, n.value) >= Math.min(T, c.value);
    }));
    for (const s of seriesSizes(table, e.family)) {
        const f = s.f;
        if (f.vcpus === null || f.memoryGiB === null || (f.vcpusActive !== null && f.vcpusActive !== f.vcpus)) continue;
        if (f.memoryGiB < tf.memoryGiB || !(f.vcpus > tf.vcpus || (f.vcpus === tf.vcpus && f.memoryGiB > tf.memoryGiB))) continue;
        if (keeps(limitsOf(s.name, table, columns))) return s.name;
    }
    return null;
}

// The note "Disk limits" for one option of one VM: { state, text }. state: 'attention' (a fact
// to know: the new size lowers the ceiling), 'check' (the list does not give a value that this
// tool needs, or this tool cannot tell the limit), or '' (nothing to say).
export function diskNote(vm, x, option, table, columns = null) {
    // Only a size that this tool shows: a blocked option shows no size.
    if (!option || !option.supported || !option.targetSize || option.option === 'gen1Route') return none();
    const t = diskTotals(x);
    const cur = limitsOf(vm.sourceSize, table, columns);
    const neu = limitsOf(option.targetSize, table, columns);
    const blank = { uncached: [], cached: [] };
    const lower = { uncached: [], cached: [] };
    const guess = [];
    const noTypes = [];
    const mixed = [];
    const unknown = [];
    for (const g of GROUPS) {
        for (const k of VALUES) {
            const T = t[g][k];
            if (T === 0) continue;
            // A mix of uncached disks: never a "lower" note on a guess. Both limits with "Check:",
            // only where a limit of the new size can lower the ceiling (owner, 2026-11-20).
            if (g === 'uncached' && t.mix && T !== null) {
                const m = mixLimits(cur, neu, k);
                if (!m) {
                    for (const [l, size] of [[cur, vm.sourceSize], [neu, option.targetSize]]) if ((!l || l.uncached[k] === null) && !unknown.includes(size)) unknown.push(size);
                } else if (Math.min(T, m.newLow) < Math.min(T, m.curHigh)) mixed.push({ k, T, ...m });
                continue;
            }
            const c = limitFor(cur, g, k, t.ultraOnly);
            const n = limitFor(neu, g, k, t.ultraOnly);
            if (T === null) {
                // No value from the list: a "Check:" only where the new size allows less.
                if (c.value !== null && n.value !== null && n.value < c.value) blank[g].push({ k, c, n });
                continue;
            }
            if (c.value === null || n.value === null) {
                for (const [l, size] of [[c, vm.sourceSize], [n, option.targetSize]]) if (l.value === null && !unknown.includes(size)) unknown.push(size);
                continue;
            }
            const cc = Math.min(T, c.value);
            if (Math.min(T, n.value) >= cc) continue;
            const e = { k, T, c, n };
            if (g === 'uncached' && t.ultraOnly && !n.column) guess.push(e);
            else if (g === 'uncached' && t.types === null) {
                // The list does not give the disk types: sure only when the column for Premium
                // SSD v2 and Ultra Disk of the new size is lower too.
                const u = neu.ultra[k];
                if (u === null || Math.min(T, u) >= cc) noTypes.push({ ...e, u });
                else lower[g].push(e);
            } else lower[g].push(e);
        }
    }
    const vals = (list, pick) => list.map((e) => `${diskWords(pick(e))} ${UNIT[e.k]}`).join(' and ');
    const upTo = t.upTo ? 'up to ' : '';
    const checks = [];
    for (const g of GROUPS) {
        const b = blank[g];
        if (b.length) checks.push(`The list does not give the ${b.map((e) => UNIT[e.k]).join(' and ')} of the ${GROUP_WORDS[g]}. The current size allows ${vals(b, (e) => e.c.value)}. The new size allows ${vals(b, (e) => e.n.value)}.`);
    }
    const did = (list) => `The uncached disks of this VM can do ${upTo}${vals(list, (e) => e.T)} in total. The current size allows ${vals(list, (e) => e.c.value)}.`;
    if (guess.length) {
        checks.push(`This VM uses Premium SSD v2 or Ultra Disk. ${did(guess)} For the new size, this tool has no separate limit for Premium SSD v2 and Ultra Disk. The size table gives ${vals(guess, (e) => e.n.value)}.`);
    }
    if (noTypes.length) {
        const withColumn = noTypes.filter((e) => e.u !== null);
        const without = noTypes.filter((e) => e.u === null);
        const parts = [];
        if (withColumn.length) parts.push(`The new size allows ${vals(withColumn, (e) => e.n.value)} for Premium SSD and ${vals(withColumn, (e) => e.u)} for Premium SSD v2 and Ultra Disk.`);
        if (without.length) parts.push(`The new size allows ${vals(without, (e) => e.n.value)} for Premium SSD. This tool has no separate limit of the new size for Premium SSD v2 and Ultra Disk.`);
        checks.push(`The list does not give the disk types. ${did(noTypes)} ${parts.join(' ')}`);
    }
    if (mixed.length) {
        // The limits of one size for a mix: the Premium SSD limit, and the column when the size has it.
        const allows = (label, single, column) => {
            const withColumn = mixed.filter((e) => e[column] !== null);
            const without = mixed.filter((e) => e[column] === null);
            const parts = [];
            if (withColumn.length) parts.push(`The ${label} allows ${vals(withColumn, (e) => e[single])} for Premium SSD and ${vals(withColumn, (e) => e[column])} for Premium SSD v2 and Ultra Disk.`);
            if (without.length) parts.push(`The ${label} allows ${vals(without, (e) => e[single])} for Premium SSD. This tool has no separate limit of the ${label} for Premium SSD v2 and Ultra Disk.`);
            return parts.join(' ');
        };
        checks.push(`This VM has Premium SSD v2 or Ultra Disk disks and other uncached disks. Microsoft does not say which limit applies to this mix. `
            + `The uncached disks of this VM can do ${upTo}${vals(mixed, (e) => e.T)} in total. ${allows('current size', 'cs', 'cu')} ${allows('new size', 'ns', 'nu')}`);
    }
    if (unknown.length) checks.push(`The size table does not give the disk limits of ${unknown.join(' and ')}.`);

    const lowers = [];
    let count = 0;
    for (const g of GROUPS) {
        const l = lower[g];
        if (!l.length) continue;
        count += l.length;
        lowers.push(`The ${GROUP_WORDS[g]} of this VM can do ${upTo}${vals(l, (e) => e.T)} in total. The current size allows ${vals(l, (e) => e.c.value)}. The new size allows ${vals(l, (e) => e.n.value)}.`);
        const onCur = l.some((e) => e.c.column);
        const onNew = l.some((e) => e.n.column);
        if (onCur || onNew) lowers.push(`For ${onCur && onNew ? 'both sizes' : onNew ? 'the new size' : 'the current size'}, this tool uses the limit for Premium SSD v2 and Ultra Disk.`);
    }
    if (lowers.length) {
        const next = nextKeeping(option.targetSize, t, cur, table, columns);
        if (next) lowers.push(`${next} keeps the current limit${count > 1 ? 's' : ''}.`);
    }
    if (!checks.length && !lowers.length) return none();
    if (!checks.length) return { state: 'attention', text: lowers.join(' ') };
    const all = checks.join(' ');
    return { state: 'check', text: [`Check: ${all[0].toLowerCase()}${all.slice(1)}`, ...lowers].join(' ') };
}
