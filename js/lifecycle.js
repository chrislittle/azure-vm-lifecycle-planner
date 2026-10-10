// The target logic: for one machine and one series (v5, v6, v7), the size it can
// move to, or why not; and Microsoft's lifecycle stage of a size.
//
// Rules this file keeps:
//   - Unknown is never a pass and never a fail. A fact the size table does not
//     give is "cannot tell" (null), and a caller turns it into "not checked".
//   - Same list, same answer: the size table is walked in name order.
//   - Size names are compared ignoring case, as Azure does, except where a rule
//     says otherwise (family letters, which are capitals).

import families from '../data/families.js?v=0.4.3-beta';
import seriesRules from '../data/series-rules.js?v=0.4.3-beta';

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

const lower = (s) => String(s ?? '').toLowerCase();
const blank = (s) => s === null || s === undefined || String(s).trim() === '';
// "x is in the list", ignoring case.
const hasI = (list, x) => (list || []).some((v) => lower(v) === lower(x));
const eqI = (a, b) => lower(a) === lower(b);

function parseIntStrict(text) {
    const t = String(text ?? '').trim();
    return /^[+-]?\d+$/.test(t) ? parseInt(t, 10) : null;
}
function parseFloatStrict(text) {
    const t = String(text ?? '').trim();
    return /^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/.test(t) ? parseFloat(t) : null;
}

// ---------------------------------------------------------------------------
// The size table
// ---------------------------------------------------------------------------

// Size name -> entry, looked up ignoring case, walked in name order (ordinal),
// so several equal sizes always give the same first one.
export class SizeTable {
    constructor(sizes) {
        this.byLower = new Map();
        for (const [name, v] of Object.entries(sizes)) {
            this.byLower.set(name.toLowerCase(), { name, family: v.family, caps: v.capabilities || {} });
        }
        this.names = [...this.byLower.values()].map((e) => e.name).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
    }
    get count() { return this.byLower.size; }
    has(name) { return this.byLower.has(lower(name)); }
    get(name) { return this.byLower.get(lower(name)) || null; }
    keys() { return this.names; }
}

// A capability's value as text, or null when the entry does not report it.
function cap(entry, name) {
    if (!entry) return null;
    for (const [k, v] of Object.entries(entry.caps)) if (eqI(k, name)) return String(v);
    return null;
}
function capInt(entry, name) {
    const v = cap(entry, name);
    return v === null ? null : parseIntStrict(v);
}

// ---------------------------------------------------------------------------
// Reading a size name
// ---------------------------------------------------------------------------

// Standard_D2ds_v5 -> 'v5'; null for a name with no version.
export function sizeGeneration(sizeName) {
    if (blank(sizeName)) return null;
    const m = /^Standard_[A-Za-z]+\d+.*_v(\d+)$/i.exec(sizeName);
    return m ? `v${m[1]}` : null;
}

// Standard_D2ds_v4 -> 'D', Standard_E8-4ds_v5 -> 'E', Standard_NC6s_v3 -> 'NC'.
export function sizeFamily(sizeName) {
    const m = /^Standard_([A-Za-z]+?)\d/i.exec(String(sizeName ?? ''));
    return m ? m[1].toUpperCase() : '';
}

// A series as Microsoft's tables write it: Standard_D4s_v3 -> 'Dsv3'.
function sizeSeriesName(sizeName) {
    const m = /^Standard_([A-Z]+)\d+(?:-\d+)?([a-z]*)_(v\d+)$/i.exec(String(sizeName ?? ''));
    return m ? m[1] + m[2] + m[3] : null;
}

// Intel, AMD or Arm64, from the letters after the size number ('a' AMD, 'p' Arm).
// null when the name cannot be read, or carries two platform letters.
export function sizeProcessor(sizeName) {
    if (blank(sizeName)) return null;
    const m = /^Standard_[A-Za-z]+\d+(?:-\d+)?([a-z]*)/i.exec(sizeName);
    if (!m) return null;
    const letters = m[1];
    const found = [];
    for (const [letter, processor] of Object.entries(families.processorLetters)) {
        if (letters.indexOf(letter) >= 0 && !found.includes(processor)) found.push(processor);
    }
    if (found.length > 1) return null;
    if (found.length === 1) return found[0];
    return families.defaultProcessor;
}

function generationTraits(generation) {
    if (blank(generation)) return null;
    for (const [k, v] of Object.entries(families.generations)) if (eqI(k, generation)) return v;
    return null;
}

// The disk controller of a series: v5 SCSI, v6 and v7 NVMe.
export function generationController(generation) {
    const t = generationTraits(generation);
    return t ? String(t.controller) : null;
}

// scsi-temp | nvme-temp | diskless.
export function diskArchitecture(sizeName, maxResourceVolumeMB) {
    const apiHasDisk = maxResourceVolumeMB !== null && maxResourceVolumeMB !== undefined && maxResourceVolumeMB > 0;
    let nameHasDisk = false;
    let version = null;
    const m = /_[A-Za-z]+\d+(?:-\d+)?([a-z]*)_[vV](\d+)/i.exec(sizeName);
    if (m) {
        nameHasDisk = lower(m[1]).includes('d');
        version = parseInt(m[2], 10);
    }
    if (apiHasDisk) return 'scsi-temp';
    // With no table reading, a 'd' name at v5 or older is a SCSI temporary disk.
    if (nameHasDisk && (maxResourceVolumeMB === null || maxResourceVolumeMB === undefined) && version !== null && version <= 5) return 'scsi-temp';
    if (nameHasDisk) return 'nvme-temp';
    return 'diskless';
}

function maxResourceMB(entry) {
    const v = cap(entry, 'MaxResourceVolumeMB');
    return v === null ? null : Number(v);
}

// How many temporary disks a size has; null when the table cannot tell.
export function tempDiskCount(entry, sizeName) {
    if (!entry) return null;
    const maxMb = capInt(entry, 'MaxResourceVolumeMB');
    const nvmeTotal = capInt(entry, 'NvmeDiskSizeInMiB');
    const nvmePer = capInt(entry, 'NvmeSizePerDiskInMiB');
    if (maxMb !== null && maxMb > 0) return 1;
    if (nvmeTotal !== null && nvmeTotal > 0) {
        if (nvmePer === null || nvmePer <= 0) return null;
        return Math.floor(nvmeTotal / nvmePer);
    }
    if (!sizeName) return null;
    if (diskArchitecture(sizeName, null) !== 'diskless') return null;
    return 0;
}

// The replacement row for a size's series (the v3 and v4 series), or null.
export function sizeReplacement(sizeName) {
    const series = sizeSeriesName(sizeName);
    if (!series) return null;
    for (const row of families.replacements.bySeries) if (hasI(row.sourceSeries, series)) return row;
    return null;
}

// ---------------------------------------------------------------------------
// Lifecycle stage and retirement
// ---------------------------------------------------------------------------

// Microsoft's stage for a size from the lifecycle table, or null when the table
// does not cover it: { stage, basis, source }.
export function sizeLifecycleStage(sizeName) {
    if (blank(sizeName)) return null;
    sizeName = String(sizeName).replace(/^Basic_/i, 'Standard_');
    let generation = sizeGeneration(sizeName);
    // The first sizes carry no version (Standard_D2): for the stage they are v1.
    if (!generation && /^Standard_[A-Z]+\d+[a-z]*$/.test(sizeName)) generation = 'v1';
    const series = sizeFamily(sizeName);
    if (!generation || !series) return null;
    for (const row of families.lifecycle.bySeries) {
        if (String(row.family) === series && hasI(row.generations, generation)) {
            return { stage: String(row.stage), basis: String(row.basis), source: String(row.source) };
        }
    }
    return null;
}

// A retirement from the lifecycle table: { series, retiresUtc, source } or null.
export function sizeRetirement(sizeName) {
    if (blank(sizeName)) return null;
    const m = /^(?:Standard|Basic)_([A-Z]+)\d+(?:-\d+)?([a-z]*?)(?:_(v\d+))?(?:_Promo)?$/i.exec(sizeName);
    if (!m) return null;
    const read = m[1] + m[2] + (m[3] || '');
    for (const row of families.lifecycle.retirements) {
        const names = row.sizeSeries || row.series;
        if (hasI(names, read)) return { series: row.series, retiresUtc: String(row.retiresUtc), source: String(row.source) };
    }
    return null;
}

function utcDay(text) {
    const [y, mo, d] = text.split('-').map((x) => parseInt(x, 10));
    return Date.UTC(y, mo - 1, d);
}

// 'none' | 'warn' | 'refused' against a size's retirement date.
function retirementState(sizeName, now) {
    const r = sizeRetirement(sizeName);
    if (!r) return { state: 'none', retiresUtc: null };
    const day = utcDay(r.retiresUtc);
    const warnFrom = new Date(day); warnFrom.setUTCMonth(warnFrom.getUTCMonth() - 12);
    const t = now.getTime();
    const state = t >= day ? 'refused' : t >= warnFrom.getTime() ? 'warn' : 'none';
    return { state, retiresUtc: r.retiresUtc };
}

// From one day before Microsoft retires a size, a machine on it is outside the
// scope of this tool.
export function sizeRetiredForTool(sizeName, now = new Date()) {
    return retirementState(sizeName, new Date(now.getTime() + 86400000)).state === 'refused';
}

// The retired-size reason, or null for any other size.
export function retiredScopeDetail(sizeName, now = new Date()) {
    if (!sizeRetiredForTool(sizeName, now)) return null;
    const r = retirementState(sizeName, now);
    const words = r.state === 'refused' ? `Microsoft retired ${sizeName} on ${r.retiresUtc}.` : `Microsoft retires ${sizeName} on ${r.retiresUtc}.`;
    return `${words} From one day before that date, a machine on that size is outside the scope of this tool. ` +
        'Resize the machine to a size that Microsoft supports, then assess it again.';
}

// 'up' | 'same' | 'down' | 'unknown': End of Life, then Extended, then Current.
// v4 to v5 is 'same' - both Extended.
export function lifecycleChange(fromSize, toSize) {
    const rank = { 'End of Life': 0, 'Extended': 1, 'Current': 2 };
    const from = sizeLifecycleStage(fromSize);
    const to = sizeLifecycleStage(toSize);
    if (!from || !to || !(from.stage in rank) || !(to.stage in rank)) return 'unknown';
    const delta = rank[to.stage] - rank[from.stage];
    return delta > 0 ? 'up' : delta < 0 ? 'down' : 'same';
}

function adviceStage(sizeName) {
    const s = sizeLifecycleStage(sizeName);
    return s ? { stage: s.stage, basis: s.basis } : null;
}

// ---------------------------------------------------------------------------
// Families and sizes this tool does not move
// ---------------------------------------------------------------------------

// HPC and FPGA, the End of Life L storage series, and G / Gs: the reason code,
// or null for every other size.
export function unsupportedFamilyCode(sizeName) {
    if (/^Standard_(NP|HB|HC|HX|H)\d/i.test(sizeName)) return 'hpc-or-fpga-size';
    if (/^Standard_L\d+s(_v2)?$/i.test(sizeName)) return 'local-nvme-storage-size';
    if (/^Standard_GS?\d/i.test(sizeName)) return 'l-series-replacement';
    return null;
}

function burstableSize(sizeName) {
    if (blank(sizeName)) return false;
    const family = sizeFamily(sizeName);
    return Boolean(family) && families.burstableFamilies.includes(family);
}

function targetSizeFacts(sizeName) {
    if (blank(sizeName)) return null;
    const traits = generationTraits(sizeGeneration(sizeName));
    const series = sizeFamily(sizeName);
    const processor = sizeProcessor(sizeName);
    if (!traits || !series || !processor) return null;
    return { traits, series, processor };
}

// Does Microsoft say this target size requires accelerated networking?
// true / false, or null when the size cannot be read.
export function targetRequiresAcceleratedNetworking(sizeName) {
    const f = targetSizeFacts(sizeName);
    if (!f) return null;
    for (const rule of f.traits.acceleratedNetworkingRequired || []) {
        if (String(rule.series) === f.series && eqI(rule.processor, f.processor)) return true;
    }
    return false;
}

function targetMayUseMana(sizeName) {
    const f = targetSizeFacts(sizeName);
    if (!f) return null;
    return hasI(f.traits.manaProcessors, f.processor);
}

// May a machine move ONTO this size? { approved, why }.
function sizeApprovedTarget(sizeName, targetGeneration) {
    const series = sizeFamily(sizeName);
    const processor = sizeProcessor(sizeName);
    if (!series || !processor) {
        return { approved: false, why: `unreadable: this product cannot read a series and a processor from the size name '${sizeName}'` };
    }
    if (!hasI(families.seriesByGeneration[targetGeneration], series)) {
        return { approved: false, why: `series: Microsoft does not list the ${series} family among its ${targetGeneration} targets` };
    }
    if (!hasI(families.approvedProcessors, processor)) {
        return { approved: false, why: `processor: ${sizeName} has an ${processor} processor, and Microsoft lists only ${families.approvedProcessors.join(' and ')} sizes as ${targetGeneration} targets` };
    }
    return { approved: true, why: null };
}

// ---------------------------------------------------------------------------
// Size facts from the table
// ---------------------------------------------------------------------------

function skuHyperVGenerations(entry) {
    const v = cap(entry, 'HyperVGenerations');
    if (v === null || blank(v)) return null;
    return v.split(',').map((x) => x.trim()).filter((x) => x);
}
const skuMaxNics = (entry) => capInt(entry, 'MaxNetworkInterfaces');
const skuMaxDataDisks = (entry) => capInt(entry, 'MaxDataDiskCount');

function diskPremiumCapable(entry) {
    const v = cap(entry, 'PremiumIO');
    if (v === null) return null;
    return eqI(v, 'True');
}

// vCPUs the machine can use (vCPUsAvailable, else vCPUs) and memory.
function skuShape(entry) {
    const read = (name) => { const v = cap(entry, name); return v === null ? null : parseFloatStrict(v); };
    let vcpus = read('vCPUsAvailable');
    if (vcpus === null) vcpus = read('vCPUs');
    return { vcpus, memoryGB: read('MemoryGB') };
}

// 'smaller' | 'fits' | 'unknown'.
function sizeSmaller(source, target) {
    let known = true;
    for (const dim of ['vcpus', 'memoryGB']) {
        if (source[dim] === null || source[dim] === undefined || target[dim] === null || target[dim] === undefined) { known = false; continue; }
        if (target[dim] < source[dim]) return 'smaller';
    }
    return known ? 'fits' : 'unknown';
}

// D v1, DS v1, Dv2, DSv2 and the Av2 memory sizes: the number is not the vCPU count.
function sizeNameIsNotVcpus(sizeName) {
    return /^Standard_DS?\d+(-\d+)?(_v2)?(_Promo)?$/i.test(sizeName) || /^Standard_A\d+m_v2$/i.test(sizeName);
}

function sourceHasTempDisk(sourceSize, table) {
    let maxMb = null;
    if (table.has(sourceSize)) maxMb = maxResourceMB(table.get(sourceSize));
    return diskArchitecture(sourceSize, maxMb) !== 'diskless';
}

// Does Azure offer any size of this family on v6 or v7 (and v5, when asked)?
function familyHasGeneration(sourceSize, table, targetGeneration) {
    if (table.count === 0) return null;
    const family = sizeFamily(sourceSize);
    if (!family) return null;
    for (const n of table.keys()) {
        const l = lower(n);
        if (!l.endsWith('_v6') && !l.endsWith('_v7') && !(targetGeneration === 'v5' && l.endsWith('_v5'))) continue;
        if (sizeFamily(n) === family) return true;
    }
    return false;
}

function smallestSizeFor(kind, sourceSize, required, table, targetGeneration, sourceShape) {
    const m = /^Standard_([A-Za-z]+)\d+(?:-\d+)?([a-z]*)_v[2-6]$/i.exec(sourceSize);
    if (!m) return null;
    const re = new RegExp(`^Standard_${m[1]}(\\d+)(?:-\\d+)?${m[2]}_${targetGeneration}$`, 'i');
    let best = null;
    for (const name of table.keys()) {
        const mm = re.exec(name);
        if (!mm) continue;
        const vcpuGuess = parseInt(mm[1], 10);
        const entry = table.get(name);
        const max = kind === 'disks' ? skuMaxDataDisks(entry) : skuMaxNics(entry);
        if (max === null || max < required) continue;
        if (sourceShape && sizeSmaller(sourceShape, skuShape(entry)) === 'smaller') continue;
        if (!best || vcpuGuess < best.vcpus) best = { name, max, vcpus: vcpuGuess };
    }
    return best;
}

// ---------------------------------------------------------------------------
// Choosing a target size
// ---------------------------------------------------------------------------

// The sizes tried, in order, when nothing names one: the name with its version
// changed, and before it the d size when the machine has a temporary disk.
function defaultSizeCandidates(sourceSize, table, targetGeneration) {
    const m = /^(Standard_[A-Za-z]+\d+(?:-\d+)?)([a-z]*)_v[2-6]$/i.exec(sourceSize);
    if (!m) return [];
    const stem = m[1];
    const letters = m[2];
    const replacement = sizeReplacement(sourceSize);
    const named = replacement ? (replacement.targets[targetGeneration] || []) : [];

    let hasTemp = sourceHasTempDisk(sourceSize, table);
    if (!hasTemp && replacement && replacement.everySizeHasTemporaryDisk === true) {
        const reading = table.has(sourceSize) && cap(table.get(sourceSize), 'MaxResourceVolumeMB') !== null;
        if (!reading) hasTemp = true;
    }

    const wanted = [];
    if ((targetGeneration === 'v5' || replacement) && !lower(letters).includes('d') && hasTemp) {
        wanted.push(lower(letters).endsWith('s') ? letters.slice(0, -1) + 'ds' : letters + 'd');
    }
    wanted.push(letters);

    const out = [];
    const family = sizeFamily(sourceSize);
    for (const l of wanted) {
        let use = l;
        if (named.length && !hasI(named, `${family}${l}${targetGeneration}`) && hasI(named, `${family}${l}s${targetGeneration}`)) use = `${l}s`;
        const size = `${stem}${use}_${targetGeneration}`;
        if (!out.includes(size)) out.push(size);
    }
    return out;
}

// Map a source size to its target on one series.
// { target, alternates, reason, code }. code: mapped, mapped-unverified,
// not-in-region, family-not-in-region, not-approved, gen1-no-size, too-few-nics,
// too-few-data-disks, processor-unreadable, processor-not-approved,
// smaller-than-source, shape-unknown.
export function targetSize({ sourceSize, sizeMap = null, table, requiredNics = 1, requiredDataDisks = 0, targetGeneration = 'v6', hyperVGeneration = null }) {
    const candidates = [];
    const explicit = (sizeMap || []).find((e) => e && eqI(e.source, sourceSize)) || null;
    if (explicit) {
        candidates.push(explicit.target);
        for (const alt of explicit.alternates || []) candidates.push(alt);
    } else {
        candidates.push(...defaultSizeCandidates(sourceSize, table, targetGeneration));
    }

    const approvedList = families.approvedProcessors.join(' and ');
    const sourceProcessor = sizeProcessor(sourceSize);
    if (sourceProcessor === null) {
        return { target: null, alternates: [], code: 'processor-unreadable',
            reason: `this product cannot read the processor from the size name '${sourceSize}', so it cannot tell whether this machine is in the migration path - a person must look at it` };
    }
    if (!hasI(families.approvedProcessors, sourceProcessor)) {
        return { target: null, alternates: [], code: 'processor-not-approved', facts: { processor: sourceProcessor },
            reason: `this machine has an ${sourceProcessor} processor, and Microsoft lists only ${approvedList} sizes as v5, v6 and v7 targets. ` +
                (targetGeneration === 'v5' ? 'It has no v5 target and needs a plan of its own' : 'It is not in the v6/v7 migration path and needs a plan of its own') };
    }

    const tooSmall = [];
    const notApproved = [];
    const notGen1 = [];
    const sourceShape = skuShape(table.has(sourceSize) ? table.get(sourceSize) : null);
    const smaller = [];
    const shapeUnknown = [];
    for (const candidate of candidates) {
        const inTable = table.has(candidate);
        if (table.count !== 0 && !inTable) continue;
        const entry = inTable ? table.get(candidate) : null;

        const approval = sizeApprovedTarget(candidate, targetGeneration);
        if (!approval.approved) { notApproved.push(`${candidate} (${approval.why})`); continue; }

        let unverified = false;
        const unverifiedWhat = [];
        if (eqI(hyperVGeneration, 'V1')) {
            const gens = inTable ? skuHyperVGenerations(entry) : null;
            if (gens === null) { unverified = true; unverifiedWhat.push('which machine generations it takes (this machine is Generation 1)'); }
            else if (!hasI(gens, 'V1')) { notGen1.push(candidate); continue; }
        }

        const maxNics = inTable ? skuMaxNics(entry) : null;
        if (requiredNics > 1) {
            if (maxNics === null) { unverified = true; unverifiedWhat.push(`a network interface limit (the machine has ${requiredNics})`); }
            else if (maxNics < requiredNics) { tooSmall.push(`${candidate} holds ${maxNics}`); continue; }
        }

        if (requiredDataDisks > 0) {
            const maxDisks = inTable ? skuMaxDataDisks(entry) : null;
            if (maxDisks === null) { unverified = true; unverifiedWhat.push(`a data disk limit (the machine has ${requiredDataDisks})`); }
            else if (maxDisks < requiredDataDisks) { tooSmall.push(`${candidate} holds ${maxDisks} data disks`); continue; }
        }

        const targetShape = skuShape(entry);
        const fit = sizeSmaller(sourceShape, targetShape);
        if (fit === 'smaller' && !explicit) {
            smaller.push(`${candidate} has ${num(targetShape.vcpus)} vCPUs and ${num(targetShape.memoryGB)} GiB`);
            continue;
        }
        if (fit === 'unknown' && !explicit && sizeNameIsNotVcpus(sourceSize)) { shapeUnknown.push(candidate); continue; }

        let reason = explicit ? 'explicit-map' : 'default-transform';
        if (explicit && fit === 'smaller') {
            reason += ` (smaller than the machine: ${sourceSize} has ${num(sourceShape.vcpus)} vCPUs and ${num(sourceShape.memoryGB)} GiB, ${candidate} has ${num(targetShape.vcpus)} and ${num(targetShape.memoryGB)}; a size map names it)`;
        }
        if (unverified) reason += ` (capacity could not be verified: Azure reported no ${unverifiedWhat.join(', and no ')} for ${candidate})`;
        return { target: candidate, alternates: candidates.filter((c) => !eqI(c, candidate)), reason, code: unverified ? 'mapped-unverified' : 'mapped' };
    }

    if (notApproved.length) {
        return { target: null, alternates: [], code: 'not-approved', facts: { family: sizeFamily(sourceSize) },
            reason: `no target size for this machine is one Microsoft lists as a ${targetGeneration} target: ` + notApproved.join('; ') };
    }
    if (smaller.length && !tooSmall.length && !notGen1.length) {
        return { target: null, alternates: [], code: 'smaller-than-source', facts: { vcpus: sourceShape.vcpus, memoryGB: sourceShape.memoryGB },
            reason: `every target size for this machine is smaller than it: ${sourceSize} has ${num(sourceShape.vcpus)} vCPUs and ${num(sourceShape.memoryGB)} GiB, and ` +
                smaller.join('; ') + '. The product does not plan a smaller size.' };
    }
    if (shapeUnknown.length && !smaller.length && !tooSmall.length && !notGen1.length) {
        return { target: null, alternates: [], code: 'shape-unknown',
            reason: `the size number of ${sourceSize} is not its vCPU count, and this region's catalog does not give the vCPUs and memory of ` +
                `${sourceSize} or ${shapeUnknown.join(', ')}. The product cannot check that the target is not smaller, so it does not plan one.` };
    }
    if (notGen1.length && !tooSmall.length) {
        const advice = targetGeneration !== 'v5' ? ' v5 takes Generation 1 machines. Choose it in the Choose each target step.' : '';
        return { target: null, alternates: [], code: 'gen1-no-size', facts: { sizes: notGen1 },
            reason: 'this machine is Generation 1, and no target size for it takes Generation 1 machines: ' + notGen1.join(', ') + '.' + advice };
    }
    if (tooSmall.length) {
        if (tooSmall.some((t) => /data disks/i.test(t))) {
            const s = smallestSizeFor('disks', sourceSize, requiredDataDisks, table, targetGeneration, sourceShape);
            const advice = s ? `use ${s.name} instead (it holds ${s.max})` : 'choose a larger size for it, or detach some disks';
            return { target: null, alternates: [], code: 'too-few-data-disks', facts: { required: requiredDataDisks, suggestion: s },
                reason: `no target size can hold this machine's ${requiredDataDisks} data disks (${tooSmall.join('; ')}) - ${advice}` };
        }
        const s = smallestSizeFor('nics', sourceSize, requiredNics, table, targetGeneration, sourceShape);
        const advice = s ? `use ${s.name} instead (it holds ${s.max})` : 'choose a larger size for it, or reduce its network interfaces';
        return { target: null, alternates: [], code: 'too-few-nics', facts: { required: requiredNics, suggestion: s },
            reason: `no target size can hold this machine's ${requiredNics} network interfaces (${tooSmall.join('; ')}) - ${advice}` };
    }
    if (familyHasGeneration(sourceSize, table, targetGeneration) === false) {
        const family = sizeFamily(sourceSize);
        return { target: null, alternates: [], code: 'family-not-in-region', facts: { family },
            reason: targetGeneration === 'v5'
                ? `Azure offers no v5 size in the ${family} family in this region, so there is nothing for this machine to move to on v5.`
                : `Azure offers no v6 or v7 size in the ${family} family in this region, so there is nothing for this machine to move to. It is not part of the v6/v7 migration path and needs a plan of its own.` };
    }
    let reason = `no candidate available in region (tried: ${candidates.join(', ')})`;
    if (targetGeneration === 'v7' && table.count > 0) {
        const v6 = defaultSizeCandidates(sourceSize, table, 'v6').find((c) => table.has(c));
        if (v6) reason += ` - this region has ${v6}, so this machine can move if the wave is set back to v6`;
    }
    return { target: null, alternates: [], reason, code: 'not-in-region', facts: { tried: candidates } };
}

// Numbers as PowerShell writes them: 8 not 8.0, 3.5 as 3.5.
function num(v) { return v === null || v === undefined ? '' : String(v); }

// Generation 1 machines and old sizes choose their size by shape.
function shapeChoiceSource(generation, sourceSize) {
    if (eqI(generation, 'V1')) return true;
    return /^Standard_((A|D|DS)\d+(-\d+)?m?(_v2)?(_Promo)?|B\d+(ls|s|ms)|F\d+s?(_v2)?)$/i.test(String(sourceSize ?? ''));
}

// For each family (Dl, D, E): the smallest size with at least the machine's
// vCPUs and memory, and E's constrained sizes of that size. The best keeps both
// with the fewest vCPUs, then least memory, then D before Dl before E.
function shapeSizeChoices({ sourceSize, table, requiredNics, requiredDataDisks, hyperVGeneration, targetGeneration }) {
    const source = skuShape(table.has(sourceSize) ? table.get(sourceSize) : null);
    if (source.vcpus === null || source.memoryGB === null) return [];
    const letters = sourceHasTempDisk(sourceSize, table) ? 'ds' : 's';
    const passes = (size) => {
        const m = targetSize({ sourceSize, sizeMap: [{ source: sourceSize, target: size }], table, requiredNics, requiredDataDisks, targetGeneration, hyperVGeneration });
        return String(m.target ?? '') === size;
    };
    const out = [];
    const familyNames = [['Dl', 'D', 'l'], ['D', 'D', ''], ['E', 'E', '']];
    // Microsoft's retired-sizes guide names Falsv6 for F, Fs and Fsv2 (owner,
    // 2026-10-09: follow the guide). Falsv6 has no d size, so it is offered
    // without one when there is none.
    if (sizeFamily(sourceSize) === 'F') familyNames.splice(1, 0, ['Fal', 'F', 'al']);
    for (const [family, prefix, infix] of familyNames) {
        const find = (l) => {
            const re = new RegExp(`^Standard_${prefix}(\\d+)${infix}${l}_${targetGeneration}$`, 'i');
            const found = [];
            for (const name of table.keys()) { const m = re.exec(name); if (m) found.push({ size: name, base: parseInt(m[1], 10) }); }
            return found;
        };
        let plain = find(letters);
        if (!plain.length && family === 'Fal' && letters === 'ds') plain = find('s');
        plain.sort((a, b) => a.base - b.base);
        for (const p of plain) {
            const shape = skuShape(table.get(p.size));
            if (shape.vcpus === null || shape.memoryGB === null) continue;
            if (shape.vcpus < source.vcpus || shape.memoryGB < source.memoryGB) continue;
            if (!passes(p.size)) continue;
            out.push({ size: p.size, family, variant: 'default', vcpus: Math.trunc(shape.vcpus), activeVcpus: Math.trunc(shape.vcpus), memoryGB: shape.memoryGB, best: false });
            if (family === 'E') {
                const cre = new RegExp(`^Standard_E${p.base}-(\\d+)${letters}_${targetGeneration}$`, 'i');
                const constrained = [];
                for (const name of table.keys()) { const m = cre.exec(name); if (m) constrained.push({ size: name, active: parseInt(m[1], 10) }); }
                constrained.sort((a, b) => a.active - b.active);
                for (const c of constrained) {
                    if (!passes(c.size)) continue;
                    out.push({ size: c.size, family: 'E', variant: 'constrained', vcpus: Math.trunc(shape.vcpus), activeVcpus: c.active, memoryGB: shape.memoryGB, best: false });
                }
            }
            break;
        }
    }
    const rank = { D: 0, Dl: 1, Fal: 2, E: 3 };
    const defaults = out.filter((c) => c.variant === 'default')
        .sort((a, b) => (a.vcpus - b.vcpus) || (a.memoryGB - b.memoryGB) || (rank[a.family] - rank[b.family]));
    if (defaults.length) defaults[0].best = true;
    return out;
}

// A v3 or v4 machine with a replacement row: the d size, and the size without a
// temporary disk. One size left is no choice.
function replacementSizeChoices({ sourceSize, mapping, table, requiredNics, requiredDataDisks, hyperVGeneration, targetGeneration }) {
    if (!mapping.target) return [];
    const source = skuShape(table.has(sourceSize) ? table.get(sourceSize) : null);
    const out = [];
    const seen = [];
    for (const raw of [mapping.target, ...(mapping.alternates || [])]) {
        if (seen.includes(raw)) continue;
        seen.push(raw);
        const size = String(raw);
        if (!table.has(size)) continue;
        const m = targetSize({ sourceSize, sizeMap: [{ source: sourceSize, target: size }], table, requiredNics, requiredDataDisks, targetGeneration, hyperVGeneration });
        if (String(m.target ?? '') !== size) continue;
        const entry = table.get(size);
        const shape = skuShape(entry);
        if (shape.vcpus === null || shape.memoryGB === null) continue;
        if (sizeSmaller(source, shape) === 'smaller') continue;
        let ownVcpus = capInt(entry, 'vCPUs');
        if (ownVcpus === null) ownVcpus = Math.trunc(shape.vcpus);
        out.push({ size, family: sizeFamily(size), variant: /^Standard_[A-Za-z]+\d+-\d+/i.test(size) ? 'constrained' : 'default',
            vcpus: ownVcpus, activeVcpus: Math.trunc(shape.vcpus), memoryGB: shape.memoryGB, best: size === String(mapping.target) });
    }
    if (out.length < 2 || !out.some((c) => c.best)) return [];
    return out;
}

// ---------------------------------------------------------------------------
// One machine, one series
// ---------------------------------------------------------------------------

// The blockers and prep that apply to a series. A reason the rules do not list
// applies to every series: an unknown reason is not a pass.
function entryClassification(vm, targetGeneration) {
    const applies = (group, code) => {
        const g = seriesRules[group] || {};
        const key = Object.keys(g).find((k) => eqI(k, code));
        if (!key || !g[key].appliesTo) return true;
        return hasI(g[key].appliesTo, targetGeneration);
    };
    const blockers = (vm.blockers || []).filter((c) => c && applies('blockers', c));
    const prep = (vm.prepNeeded || []).filter((c) => c && applies('prep', c));
    const own = String(vm.classification ?? '');
    let classification;
    if (eqI(own, 'Excluded') || vm.platformManaged) classification = 'Excluded';
    else if (blockers.length) classification = 'Blocked';
    else if (eqI(own, 'Blocked')) classification = eqI(vm.diskController, 'NVMe') ? 'ReadyNow' : 'ReadyAfterPrep';
    else classification = own;
    return { classification, blockers, prep };
}

// A: in place. B: a rebuild (Windows changing disk category). MANUAL, EXCLUDED.
function pathSelection(vm, targetDiskArch, targetGeneration, classification) {
    const cls = classification || String(vm.classification ?? '');
    if (vm.platformManaged || eqI(cls, 'Excluded')) return 'EXCLUDED';
    if (eqI(cls, 'Blocked')) return 'MANUAL';
    if (generationController(targetGeneration) === 'NVMe') {
        if (eqI(vm.diskController, 'NVMe')) return 'EXCLUDED';
    } else if (eqI(sizeGeneration(vm.sourceSize), targetGeneration)) return 'EXCLUDED';
    if (!eqI(vm.os, 'Windows')) return 'A';
    if (eqI(vm.sourceDiskArch, targetDiskArch)) return 'A';
    return 'B';
}

// Everything about a machine's target on one series.
function entryTarget(vm, table, targetGeneration, chosenSize, now) {
    const nicCount = vm.nicCount !== undefined && vm.nicCount > 0 ? vm.nicCount : 1;
    const dataDiskCount = vm.dataDiskCount !== undefined ? vm.dataDiskCount : 0;
    const judged = entryClassification(vm, targetGeneration);
    const hyperV = vm.gen ? String(vm.gen) : (vm.hyperVGeneration ?? null);
    const ask = (sizeMap) => targetSize({ sourceSize: vm.sourceSize, sizeMap, table, requiredNics: nicCount, requiredDataDisks: dataDiskCount, targetGeneration, hyperVGeneration: hyperV });

    let mapping = ask(null);
    let sizeChoices = [];
    if ((targetGeneration === 'v5' || !eqI(hyperV, 'V1')) && shapeChoiceSource(hyperV, vm.sourceSize)) {
        const choicesFor = (nics, disks) => shapeSizeChoices({ sourceSize: vm.sourceSize, table, requiredNics: nics, requiredDataDisks: disks, hyperVGeneration: hyperV, targetGeneration });
        sizeChoices = choicesFor(nicCount, dataDiskCount);
        const byShape = (size, why) => {
            const m = ask([{ source: vm.sourceSize, target: size }]);
            if (m.target && m.reason.startsWith('explicit-map')) m.reason = why + m.reason.substring('explicit-map'.length).split('; a size map names it').join('');
            return m;
        };
        const twin = String(mapping.target ?? '');
        const listed = sizeChoices.filter((c) => eqI(c.size, twin));
        let tm;
        if (twin && listed.length) {
            for (const c of sizeChoices) c.best = eqI(c.size, twin);
        } else if (twin && (tm = /^Standard_([DE])\d+(-\d+)?/i.exec(twin))) {
            const letter = tm[1].toUpperCase();
            const constrained = Boolean(tm[2]);
            const entryOf = table.get(twin);
            const twinShape = skuShape(entryOf);
            const own = capInt(entryOf, 'vCPUs');
            if (cap(entryOf, 'vCPUs') !== null && own !== null && twinShape.vcpus !== null && twinShape.memoryGB !== null) {
                for (const c of sizeChoices) c.best = false;
                sizeChoices = [{ size: twin, family: letter, variant: constrained ? 'constrained' : 'default', vcpus: own,
                    activeVcpus: Math.trunc(twinShape.vcpus), memoryGB: twinShape.memoryGB, best: true }, ...sizeChoices];
            }
        }
        if (chosenSize && !eqI(chosenSize, twin)) {
            mapping = sizeChoices.some((c) => eqI(c.size, chosenSize))
                ? byShape(chosenSize, 'chosen-size (chosen for this machine on the targets step)')
                : { target: null, alternates: [], code: 'chosen-size-gone',
                    reason: `The size chosen for this machine, ${chosenSize}, is no longer one of its ${targetGeneration} choices. Choose its target again.` };
        } else if (!mapping.target && !sizeChoices.length && ['family-not-in-region', 'not-in-region'].includes(mapping.code)) {
            const shape = skuShape(table.has(vm.sourceSize) ? table.get(vm.sourceSize) : null);
            if (shape.vcpus !== null && shape.memoryGB !== null) {
                mapping = { target: null, alternates: [], code: 'no-shape-fit', facts: { vcpus: shape.vcpus, memoryGB: shape.memoryGB },
                    reason: `Azure offers no ${targetGeneration} Dl, D or E size in this region with at least ${num(shape.vcpus)} vCPUs and ${num(shape.memoryGB)} GiB that this machine can take.` };
                const fitsWith = (nics, disks) => choicesFor(nics, disks).length > 0;
                if (dataDiskCount > 0 && fitsWith(nicCount, 0)) {
                    mapping = { target: null, alternates: [], code: 'too-few-data-disks', facts: { required: dataDiskCount, suggestion: null },
                        reason: `Azure offers ${targetGeneration} Dl, D or E sizes in this region with at least ${num(shape.vcpus)} vCPUs and ${num(shape.memoryGB)} GiB, but none of the sizes this tool chooses from takes ${dataDiskCount} data disks.` };
                } else if (nicCount > 1 && fitsWith(1, dataDiskCount)) {
                    mapping = { target: null, alternates: [], code: 'too-few-nics', facts: { required: nicCount, suggestion: null },
                        reason: `Azure offers ${targetGeneration} Dl, D or E sizes in this region with at least ${num(shape.vcpus)} vCPUs and ${num(shape.memoryGB)} GiB, but none of the sizes this tool chooses from takes ${nicCount} network interfaces.` };
                }
            }
        } else if (!mapping.target) {
            const best = sizeChoices.find((c) => c.best);
            if (best) mapping = byShape(best.size, `shape-choice (the best ${targetGeneration} size for the vCPUs and the memory of this machine)`);
        }
    } else if (mapping.target && sizeReplacement(vm.sourceSize)) {
        sizeChoices = replacementSizeChoices({ sourceSize: vm.sourceSize, mapping, table, requiredNics: nicCount, requiredDataDisks: dataDiskCount, hyperVGeneration: hyperV, targetGeneration });
        if (chosenSize && !eqI(chosenSize, mapping.target)) {
            if (sizeChoices.some((c) => eqI(c.size, chosenSize))) {
                const m = ask([{ source: vm.sourceSize, target: chosenSize }]);
                if (m.target && m.reason.startsWith('explicit-map')) m.reason = 'chosen-size (chosen for this machine on the targets step)' + m.reason.substring('explicit-map'.length);
                mapping = m;
            } else {
                mapping = { target: null, alternates: [], code: 'chosen-size-gone',
                    reason: `The size chosen for this machine, ${chosenSize}, is no longer one of its ${targetGeneration} choices. Choose its target again.` };
            }
        }
    }

    let diskArch = null;
    let tempDisks = null;
    if (mapping.target) {
        const targetEntry = table.has(mapping.target) ? table.get(mapping.target) : null;
        diskArch = diskArchitecture(mapping.target, targetEntry ? maxResourceMB(targetEntry) : null);
        tempDisks = tempDiskCount(targetEntry, mapping.target);
    }

    let path = (!mapping.target && (!['Excluded', 'Blocked'].includes(judged.classification) || mapping.code === 'chosen-size-gone'))
        ? 'MANUAL' : pathSelection(vm, diskArch, targetGeneration, judged.classification);

    // A move that keeps Azure Disk Encryption must be in place; a rebuild is refused.
    let blockers = [...judged.blockers];
    let classification = judged.classification;
    let refusedRebuild = false;
    if (path === 'B' && hasI(vm.blockers, 'disk-encryption-present')) {
        blockers.push('disk-encryption-rebuild');
        classification = 'Blocked';
        refusedRebuild = true;
        path = pathSelection(vm, diskArch, targetGeneration, classification);
        mapping = { target: null, alternates: [], code: 'disk-encryption-rebuild',
            reason: `This machine uses Azure Disk Encryption, and its move to ${targetGeneration} is a rebuild. The tool does not rebuild an encrypted machine, so it does not move it.` };
        diskArch = null;
        tempDisks = null;
    }

    const retiredScope = retiredScopeDetail(String(vm.sourceSize ?? ''), now);
    if ((retiredScope || hasI(blockers, 'size-retired')) && classification !== 'Excluded') {
        if (!hasI(blockers, 'size-retired')) blockers.push('size-retired');
        classification = 'Blocked';
        path = 'MANUAL';
        mapping = { target: null, alternates: [], code: 'size-retired',
            reason: retiredScope || `Microsoft retires ${vm.sourceSize}. A machine on a retired size is outside the scope of this tool.` };
        diskArch = null;
        tempDisks = null;
        sizeChoices = [];
    }

    return { mapping, diskArch, tempDisks, path, nicCount, classification, blockers, prep: judged.prep,
        controller: generationController(targetGeneration), refusedRebuild, sizeChoices };
}

// The mapping's reason, for a code that comes from choosing a size.
export function mappingFor(vm, table, series, now = new Date()) {
    return entryTarget(vm, table, series, null, now).mapping;
}

// One series for one machine: whether it is supported, and the facts about it.
export function adviceOption(vm, series, table, chosenSize = null, now = new Date()) {
    const option = {
        option: series, supported: false, notSupported: [],
        targetSize: null, sizeUnverified: false, path: null, blockers: [], prep: [],
        move: generationController(series) === 'NVMe' ? 'nvme-conversion' : 'scsi-resize',
        rebuild: false,
        tempDisksFrom: vm.sourceTempDisks !== undefined && vm.sourceTempDisks !== null ? vm.sourceTempDisks : null,
        tempDisksTo: null, targetStage: null, stageChange: 'unknown',
        acceleratedNetworking: { required: null, mayUseMana: null, turnsOn: null },
        stops: [], sizeChoices: [], premiumDisks: null, burstableEnds: null,
    };
    if (table === null) { option.notSupported = ['region-not-read']; return option; }

    const t = entryTarget(vm, table, series, chosenSize, now);
    const size = String(t.mapping.target ?? '');
    option.blockers = [...t.blockers];
    option.prep = [...t.prep];
    option.path = t.path;
    option.rebuild = t.path === 'B' || t.refusedRebuild;
    option.sizeChoices = t.sizeChoices;
    const sourceGeneration = sizeGeneration(vm.sourceSize);

    let why;
    if (t.classification === 'Excluded') why = ['excluded'];
    else if (t.blockers.length) why = [...t.blockers];
    else if (series === 'v5' && ['v6', 'v7'].includes(lower(sourceGeneration))) why = ['source-is-newer'];
    else if (!size) why = [String(t.mapping.code ?? '')];
    else if (t.path === 'EXCLUDED') why = [generationController(series) === 'NVMe' ? 'already-on-nvme' : 'already-on-series'];
    else if (!['A', 'B'].includes(t.path)) why = ['no-path'];
    else why = [];
    option.notSupported = why.filter((c) => c);

    if (size) {
        option.targetSize = size;
        option.premiumDisks = diskPremiumCapable(table.has(size) ? table.get(size) : null);
        option.sizeUnverified = t.mapping.code === 'mapped-unverified';
        option.tempDisksTo = t.tempDisks;
        option.move = t.controller === 'NVMe' ? 'nvme-conversion' : sizeGeneration(size) === 'v5' ? 'scsi-resize' : 'scsi-reversion';
        option.targetStage = adviceStage(size);
        option.stageChange = lifecycleChange(vm.sourceSize, size);
        option.burstableEnds = burstableSize(vm.sourceSize) && !burstableSize(size);

        // Accelerated networking, by the target size. Unknown is never a no.
        const required = targetRequiresAcceleratedNetworking(size);
        const count = vm.acceleratedNicCount !== undefined && vm.acceleratedNicCount !== null ? vm.acceleratedNicCount : null;
        const nics = vm.nicCount !== undefined && vm.nicCount > 0 ? vm.nicCount : 1;
        const primary = vm.primaryNicAccelerated !== undefined && vm.primaryNicAccelerated !== null ? Boolean(vm.primaryNicAccelerated) : null;
        let turnsOn;
        if (required === false) turnsOn = false;
        else if (required === true && primary !== null) turnsOn = !primary;
        else if (required === true && count !== null && count === 0) turnsOn = true;
        else if (required === true && count !== null && nics === 1) turnsOn = false;
        else turnsOn = null;
        option.acceleratedNetworking = { required, mayUseMana: targetMayUseMana(size), turnsOn };
        if (turnsOn === true) option.stops = ['acceleratedNetworkingRequired'];
    }
    option.supported = option.notSupported.length === 0;

    // Each size choice carries the facts that follow from its own size; a
    // choice this machine cannot take is not offered.
    if (!chosenSize && option.sizeChoices.length) {
        const kept = [];
        for (const c of option.sizeChoices) {
            const sub = adviceOption(vm, series, table, c.size, now);
            if (!sub.supported || String(sub.targetSize ?? '') !== c.size) continue;
            const item = { ...c };
            for (const k of ['path', 'rebuild', 'tempDisksTo', 'sizeUnverified', 'acceleratedNetworking', 'stops', 'premiumDisks']) item[k] = sub[k];
            kept.push(item);
        }
        option.sizeChoices = kept;
        if (sizeReplacement(vm.sourceSize) && (option.sizeChoices.length < 2 || !option.sizeChoices.some((c) => c.best))) option.sizeChoices = [];
    }
    return option;
}

// Every option for one machine (v5, v6, v7, and the Generation 1 route), and
// the two defaults: Current (v6, v7, v5) and Extended (v5, v6, v7).
export function machineAdvice(vm, table, now = new Date()) {
    const options = ['v5', 'v6', 'v7'].map((s) => adviceOption(vm, s, table, null, now));
    let outOfScope = (vm.blockers || []).some((b) => ['hpc-or-fpga-size', 'local-nvme-storage-size', 'l-series-replacement', 'size-retired'].includes(b));
    if (sizeRetiredForTool(String(vm.sourceSize ?? ''), now)) outOfScope = true;
    if (burstableSource(vm.sourceSize)) options.push(burstableOption(vm, table, now));
    if (eqI(vm.gen, 'V1') && !outOfScope) {
        options.push({
            option: 'gen1Route', supported: false, notSupported: ['not-built-yet'],
            targetSize: null, sizeUnverified: false, path: null, blockers: [], prep: [],
            move: 'gen1-route', rebuild: false, tempDisksFrom: null, tempDisksTo: null,
            targetStage: null, stageChange: 'unknown',
            acceleratedNetworking: { required: null, mayUseMana: null, turnsOn: null },
            stops: [], sizeChoices: [], premiumDisks: null, burstableEnds: null,
        });
    }
    const supported = options.filter((o) => o.supported).map((o) => o.option);
    const first = (order) => order.find((o) => supported.includes(o)) || null;
    return {
        sourceStage: adviceStage(vm.sourceSize),
        options,
        start: { current: first(['v6', 'v7', 'v5']), extended: first(['v5', 'v6', 'v7']) },
    };
}

// ---------------------------------------------------------------------------
// The burstable option (owner, 2026-10-09: follow Microsoft's guide)
// ---------------------------------------------------------------------------

// Microsoft's Retired VM sizes modernization guide (updated 2026-09-25): B v1,
// Av2 and Amv2 go to Bsv2 or Basv2 - burstable sizes on CPU credits - as well
// as to the D and E sizes. They are a "v2" series, so they are an option of
// their own beside v5, v6 and v7.
export function burstableSource(sizeName) {
    return /^Standard_B\d+(ls|s|ms)$/i.test(String(sizeName ?? '')) || /^Standard_A\d+m?_v2$/i.test(String(sizeName ?? ''));
}

const burstableStage = { stage: 'Current or Extended', basis: "not on Microsoft's End of Life or retirement lists" };

// The smallest Bsv2 or Basv2 size with at least the machine's vCPUs and memory
// that takes its generation, NICs and data disks; Intel before AMD at the same shape.
export function burstableOption(vm, table, now = new Date()) {
    const option = {
        option: 'burstable', supported: false, notSupported: [],
        targetSize: null, sizeUnverified: false, path: null, blockers: [], prep: [],
        move: 'scsi-resize', rebuild: false,
        tempDisksFrom: vm.sourceTempDisks !== undefined && vm.sourceTempDisks !== null ? vm.sourceTempDisks : null,
        tempDisksTo: null, targetStage: null, stageChange: 'unknown',
        acceleratedNetworking: { required: null, mayUseMana: null, turnsOn: null },
        stops: [], sizeChoices: [], premiumDisks: null, burstableEnds: null, facts: null,
    };
    // The reasons that apply to a SCSI move (as on v5): Bsv2 takes Generation 1.
    const judged = entryClassification(vm, 'v5');
    const blockers = [...judged.blockers];
    if (retiredScopeDetail(String(vm.sourceSize ?? ''), now) && !blockers.includes('size-retired')) blockers.push('size-retired');
    option.blockers = blockers;
    if (blockers.length) { option.notSupported = blockers; return option; }

    const source = skuShape(table.has(vm.sourceSize) ? table.get(vm.sourceSize) : null);
    if (source.vcpus === null || source.memoryGB === null) { option.notSupported = ['shape-unknown']; return option; }
    const nics = vm.nicCount !== undefined && vm.nicCount > 0 ? vm.nicCount : 1;
    const disks = vm.dataDiskCount !== undefined ? vm.dataDiskCount : 0;
    const fits = [];
    for (const name of table.keys()) {
        // Bsv2 and Basv2, with their smaller-memory sizes (B2ts_v2, B2ls_v2); not the Arm Bpsv2.
        const m = /^Standard_B(\d+)(a?)[lt]?s_v2$/i.exec(name);
        if (!m) continue;
        const entry = table.get(name);
        const shape = skuShape(entry);
        if (shape.vcpus === null || shape.memoryGB === null || shape.vcpus < source.vcpus || shape.memoryGB < source.memoryGB) continue;
        if (eqI(vm.gen, 'V1')) { const g = skuHyperVGenerations(entry); if (!g || !hasI(g, 'V1')) continue; }
        const maxNics = skuMaxNics(entry);
        if (nics > 1 && (maxNics === null || maxNics < nics)) continue;
        const maxDisks = skuMaxDataDisks(entry);
        if (disks > 0 && (maxDisks === null || maxDisks < disks)) continue;
        fits.push({ size: name, vcpus: shape.vcpus, memoryGB: shape.memoryGB, amd: m[2] !== '' });
    }
    fits.sort((a, b) => (a.vcpus - b.vcpus) || (a.memoryGB - b.memoryGB) || (Number(a.amd) - Number(b.amd)));
    if (!fits.length) { option.notSupported = ['no-burstable-fit']; option.facts = { vcpus: source.vcpus, memoryGB: source.memoryGB }; return option; }

    const best = fits[0];
    const entry = table.get(best.size);
    const targetArch = diskArchitecture(best.size, maxResourceMB(entry));
    const rebuild = eqI(vm.os, 'Windows') && !eqI(vm.sourceDiskArch, targetArch);
    // A rebuild loses Azure Disk Encryption: refused, as on v5.
    if (rebuild && hasI(vm.blockers, 'disk-encryption-present')) { option.notSupported = ['disk-encryption-rebuild']; option.rebuild = true; return option; }
    option.targetSize = best.size;
    option.path = rebuild ? 'B' : 'A';
    option.rebuild = rebuild;
    option.tempDisksTo = tempDiskCount(entry, best.size);
    option.premiumDisks = diskPremiumCapable(entry);
    option.targetStage = { ...burstableStage };
    option.stageChange = sizeLifecycleStage(vm.sourceSize) ? 'up' : 'unknown';
    option.burstableEnds = false;
    option.acceleratedNetworking = { required: false, mayUseMana: null, turnsOn: false };
    // The same shape on the other processor is the other choice.
    option.sizeChoices = fits.filter((f) => f.vcpus === best.vcpus && f.memoryGB === best.memoryGB)
        .map((f) => ({ size: f.size, family: f.amd ? 'Basv2' : 'Bsv2', variant: 'default', vcpus: f.vcpus, activeVcpus: f.vcpus, memoryGB: f.memoryGB, best: f.size === best.size }));
    option.supported = true;
    return option;
}

// ---------------------------------------------------------------------------
// Ranked sizes (Microsoft's capacity resilience guidance: "Prefer fungible VM
// deployments ... support multiple compatible VM SKUs")
// ---------------------------------------------------------------------------

// Up to five sizes for one supported option, best first: the option's own size,
// then the same shape on the other processor (AMD or Intel), with or without a
// temporary disk, the next family up for more memory, and the shape choices.
// Each must pass every check that the option's own size passed, and must not be
// smaller than the VM. [{ size, why }], why: 'closest' | 'processor' |
// 'temp-disk-added' | 'temp-disk-removed' | 'more-memory' | 'other-shape'.
export function rankedSizes(vm, table, option, now = new Date()) {
    if (!option.supported || !option.targetSize || option.option === 'gen1Route') return [];
    const best = option.targetSize;
    const out = [{ size: best, why: 'closest' }];
    const m = /^Standard_([A-Z]+)(\d+)(-\d+)?([a-z]*)_(v\d+)$/.exec(best);
    const candidates = [];
    if (m && option.option !== 'burstable') {
        const [, fam, num, con = '', letters, ver] = m;
        const name = (f, l) => `Standard_${f}${num}${con}${l}_${ver}`;
        // The other processor: 'a' is AMD (it comes first in the letters).
        candidates.push({ size: name(fam, letters.startsWith('a') ? letters.slice(1) : `a${letters}`), why: 'processor' });
        // With or without a temporary disk ('d' comes before the last 's').
        if (letters.includes('d')) candidates.push({ size: name(fam, letters.replace('d', '')), why: 'temp-disk-removed' });
        else if (letters.endsWith('s')) candidates.push({ size: name(fam, `${letters.slice(0, -1)}ds`), why: 'temp-disk-added' });
        // More memory: Dl to D, D to E.
        if (fam === 'D' && letters.includes('l')) candidates.push({ size: name('D', letters.replace('l', '')), why: 'more-memory' });
        else if (fam === 'D') candidates.push({ size: name('E', letters), why: 'more-memory' });
    }
    for (const c of option.sizeChoices || []) {
        if (c.size === best) continue;
        // The burstable choices are the same shape on the other processor.
        candidates.push({ size: c.size, why: option.option === 'burstable' ? 'processor' : 'other-shape' });
    }

    const source = skuShape(table.has(vm.sourceSize) ? table.get(vm.sourceSize) : null);
    const series = option.option === 'burstable' ? 'v5' : option.option;
    for (const c of candidates) {
        if (out.length >= 5) break;
        if (out.some((o) => eqI(o.size, c.size)) || !table.has(c.size)) continue;
        const size = table.get(c.size).name;
        if (sizeSmaller(source, skuShape(table.get(size))) !== 'fits') continue;
        if (option.option === 'burstable') { out.push({ size, why: c.why }); continue; }
        // The same checks as the option's own size: target family, processor,
        // generation, NIC and data-disk limits.
        const nics = vm.nicCount !== undefined && vm.nicCount > 0 ? vm.nicCount : 1;
        const disks = vm.dataDiskCount !== undefined ? vm.dataDiskCount : 0;
        const mp = targetSize({ sourceSize: vm.sourceSize, sizeMap: [{ source: vm.sourceSize, target: size }], table,
            requiredNics: nics, requiredDataDisks: disks, targetGeneration: series, hyperVGeneration: vm.gen });
        if (!eqI(mp.target, size) || mp.code !== 'mapped') continue;
        // A Windows rebuild (the temporary disk changes type) removes Azure Disk Encryption.
        const arch = diskArchitecture(size, maxResourceMB(table.get(size)));
        if (eqI(vm.os, 'Windows') && !eqI(vm.sourceDiskArch, arch) && hasI(vm.blockers, 'disk-encryption-present')) continue;
        out.push({ size, why: c.why });
    }
    return out;
}
