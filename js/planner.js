// The results: each row of the list -> the machine the target logic reads, its
// lifecycle stage, whether it must move, and one result per option.
//
// The values here are the plain labels the logic works with ('Supported',
// 'Needs team review', ...). The customer's words for them are in words.js.
//
// Rules this file keeps:
//   - Unknown is never a pass and never a fail: it is "not checked".
//   - Generation is never guessed. A blank or odd value: that row is not
//     checked, and the other rows still run.

import endOfLife from '../data/end-of-life.js?v=0.4.5-beta';
import capacity from '../data/capacity.js?v=0.4.5-beta';
import {
    diskArchitecture, generationController, machineAdvice, sizeGeneration,
    sizeLifecycleStage, sizeReplacement, sizeRetiredForTool, sizeRetirement, tempDiskCount,
    unsupportedFamilyCode,
} from './lifecycle.js?v=0.4.5-beta';
import { caveats, extraBlockers, readExtras } from './extras.js?v=0.4.5-beta';
import { patternOf } from './patterns.js?v=0.4.5-beta';

// ---------------------------------------------------------------------------
// Values
// ---------------------------------------------------------------------------

const headerKey = (text) => String(text ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');

// 1, 2, V1, V2, Gen1, Gen 2, Generation 2, Hyper-V Gen2 -> 'V1' / 'V2'.
export function readGeneration(text) {
    const m = /^\s*(?:hyper-?v\s*)?(?:gen(?:eration)?\s*|v)?([12])\s*$/i.exec(String(text ?? ''));
    return m ? `V${m[1]}` : null;
}

// 'Standard' / 'TrustedLaunch' / 'ConfidentialVM', or null.
export function readSecurityType(text) {
    const t = headerKey(text);
    if (!t) return null;
    if (t.startsWith('confidential')) return 'ConfidentialVM';
    if (t.startsWith('trusted')) return 'TrustedLaunch';
    if (t === 'standard') return 'Standard';
    return null;
}

// 'Windows' / 'Linux', or null.
export function readOs(text) {
    const t = String(text ?? '').trim();
    if (!t) return null;
    if (/windows/i.test(t)) return 'Windows';
    if (/linux|ubuntu|red\s*hat|rhel|suse|sles|centos|debian|oracle|alma|rocky|mariner/i.test(t)) return 'Linux';
    return null;
}

// 'East US 2' -> 'eastus2'.
export const readRegion = (text) => String(text ?? '').toLowerCase().replace(/\s/g, '');

// A whole number 0 or more: { value, note }.
export function readCount(text) {
    const t = String(text ?? '').trim();
    if (!t) return { value: null, note: null };
    if (/^[+-]?\d+$/.test(t)) { const n = parseInt(t, 10); if (n >= 0 && n <= 2147483647) return { value: n, note: null }; }
    if (/^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/.test(t)) {
        const d = parseFloat(t);
        if (d >= 0 && d === Math.floor(d)) return { value: d, note: null };
    }
    return { value: null, note: `'${t}' is not a number` };
}

// A size as Azure writes it: { size, note }; size null when it cannot be read.
export function readSizeName(text, table) {
    let t = String(text ?? '').trim().replace(/\s+/g, '');
    let note = null;
    if (!t) return { size: null, note: null };
    if (!/^(standard|basic)_/i.test(t)) {
        if (!/^[A-Za-z]+\d/.test(t)) return { size: null, note: null };
        note = `This tool reads the size as Standard_${t}.`;
        t = `Standard_${t}`;
    }
    t = t.replace(/^standard_/i, 'Standard_').replace(/^basic_/i, 'Basic_');
    // A Promo size is the same size at a promotional price: plan it as that size.
    const promo = /^(.+)_promo$/i.exec(t);
    if (promo) {
        note = [note, `This tool uses ${promo[1]} in place of the Promo size. A Promo size is the same size at a lower price.`].filter((x) => x).join(' ');
        t = promo[1];
    }
    if (!/^(Standard|Basic)_[A-Za-z]+\d/.test(t)) return { size: null, note: null };
    if (table && table.has(t)) t = table.get(t).name;
    return { size: t, note };
}

// ---------------------------------------------------------------------------
// Machines
// ---------------------------------------------------------------------------

// One row -> { vm, read, problems: [{ what, why }], notes: [] }. vm is null when
// the row cannot be planned. Facts not in the list are left out of vm, so the
// logic reads them as unknown.
export function toMachine(row, map, rowNumber, table, now = new Date()) {
    const cell = (column) => {
        const i = map[column];
        if (i === undefined || i >= row.length) return '';
        return String(row[i] ?? '').trim();
    };
    const problems = [];
    const notes = [];

    let name = cell('Machine name');
    if (!name) { name = `(row ${rowNumber})`; problems.push({ what: 'Machine name', why: 'machine-name-empty' }); }
    const region = readRegion(cell('Region'));

    const sizeText = cell('Current size');
    const size = readSizeName(sizeText, table);
    if (!size.size) problems.push({ what: `Current size '${sizeText}'`, why: sizeText ? 'size-unreadable' : 'size-empty' });
    if (size.note) notes.push(size.note);

    const securityText = cell('Security type');
    const security = readSecurityType(securityText);
    if (securityText && !security) notes.push(`This tool cannot identify the security type '${securityText}'. It does not check it.`);
    // Trusted launch and confidential VMs run on Generation 2 only.
    const needsGen2 = security === 'TrustedLaunch' || security === 'ConfidentialVM';
    const securityWords = security === 'TrustedLaunch' ? 'Trusted Launch' : 'a confidential VM';

    // The facts the query adds, and the workload pattern: also for a row that
    // cannot be planned, because the pattern says how to move it.
    const extra = readExtras(cell);
    const pattern = patternOf(extra);

    const genText = cell('Generation');
    let gen = readGeneration(genText);
    let genNotNeeded = false;
    // A Generation 2 marketplace image says so in its SKU (for example 22_04-lts-gen2).
    const gen2Image = /(^|[-_])(gen2|g2)($|[-_])|gensecond/i.test(extra.imageSku || '');
    if (!gen && needsGen2) {
        gen = 'V2';
        notes.push(`The generation is empty. ${securityWords[0].toUpperCase() + securityWords.slice(1)} needs Generation 2, so this tool uses Generation 2.`);
    } else if (!gen && gen2Image) {
        gen = 'V2';
        notes.push(`The generation is empty. The image SKU '${extra.imageSku}' is a Generation 2 image, so this tool uses Generation 2.`);
    } else if (!gen && (pattern === 'C' || (pattern === 'A' && /^(aks|aro)$/i.test(extra.managedBy || '')))) {
        // A service (AKS, ARO, Databricks) makes the new nodes from its own image:
        // the generation of the current nodes does not change the move (owner,
        // 2026-10-10). The sizes are for Generation 2, as on every v6 and v7 size.
        gen = 'V2';
        genNotNeeded = true;
        notes.push('The generation is empty. The service makes the new nodes from its own image, so this tool does not need the generation.');
    } else if (!gen) {
        // Azure Resource Graph does not give the generation of a scale set.
        problems.push({ what: `Generation '${genText}'`, why: extra.resourceType === 'Scale set' ? 'scale-set-generation-missing' : 'generation-missing' });
    } else if (gen === 'V1' && needsGen2) {
        problems.push({ what: `Generation '${genText}' with security type '${securityText}'`, why: 'generation-conflicts-with-security-type', securityWords });
    }

    const osText = cell('OS');
    const os = readOs(osText);
    if (osText && !os) notes.push(`This tool cannot identify the OS '${osText}'. It does not check it.`);

    const nic = readCount(cell('NIC count'));
    if (nic.note) notes.push(`The NIC count ${nic.note}. This tool does not check it.`);
    const disks = readCount(cell('Data-disk count'));
    if (disks.note) notes.push(`The data-disk count ${disks.note}. This tool does not check it.`);

    const read = {
        row: rowNumber, name, region, regionAsWritten: cell('Region'), sizeAsWritten: sizeText, size: size.size,
        generation: genNotNeeded ? null : gen, generationAsWritten: genText, securityType: security, os, nicCount: nic.value, dataDiskCount: disks.value,
        resourceType: extra.resourceType, instances: extra.instances,
    };
    if (problems.length) return { vm: null, read, extra, pattern, problems, notes };

    const sourceSize = size.size;
    const entry = table.has(sourceSize) ? table.get(sourceSize) : null;
    if (!entry) notes.push(`${sourceSize} is not in the size table.`);

    // The source disk architecture: the table's MaxResourceVolumeMB, the name
    // when there is none, and a series whose replacement row says every size
    // has a temporary disk.
    let maxMb = null;
    if (entry) {
        const k = Object.keys(entry.caps).find((c) => c.toLowerCase() === 'maxresourcevolumemb');
        if (k !== undefined) maxMb = Number(entry.caps[k]);
    }
    let sourceDiskArch = diskArchitecture(sourceSize, maxMb);
    let sourceTempDisks = tempDiskCount(entry, sourceSize);
    if (maxMb === null) {
        const r = sizeReplacement(sourceSize);
        if (r && r.everySizeHasTemporaryDisk === true) { sourceDiskArch = 'scsi-temp'; sourceTempDisks = 1; }
    }

    const controller = generationController(sizeGeneration(sourceSize));

    const blockers = [];
    const family = unsupportedFamilyCode(sourceSize);
    if (family) blockers.push(family);
    // GPU sizes (the N family) are outside the scope: a D or E size would drop
    // the GPU. NP is FPGA, which the line above covers.
    else if (/^Standard_N(?!P\d)[A-Z]*\d/.test(sourceSize)) blockers.push('gpu-size');
    if (sizeRetiredForTool(sourceSize, now)) blockers.push('size-retired');
    if (gen === 'V1') blockers.push('gen1-requires-redeploy');
    if (security === 'ConfidentialVM') blockers.push('confidential-vm-requires-manual');
    // The confidential computing families (DC, EC) by their name, when the list
    // does not give a security type that says so.
    else if (/^Standard_(DC|EC)\d/i.test(sourceSize)) blockers.push('confidential-family');
    // The facts the query adds: Azure Disk Encryption, SAP, unmanaged disks,
    // an ephemeral OS disk.
    blockers.push(...extraBlockers(extra));

    const vm = {
        vmId: `row-${rowNumber}`, name, location: region, sourceSize, gen, hyperVGeneration: gen,
        os: os || '', osVersion: '',
        classification: blockers.length ? 'Blocked' : controller === 'NVMe' ? 'ReadyNow' : 'ReadyAfterPrep',
        blockers, prepNeeded: [], platformManaged: false,
        diskController: controller || '', sourceDiskArch, sourceTempDisks,
    };
    if (nic.value !== null) vm.nicCount = nic.value;
    if (disks.value !== null) vm.dataDiskCount = disks.value;
    if (extra.acceleratedNicCount !== null) vm.acceleratedNicCount = extra.acceleratedNicCount;
    if (extra.primaryNicAccelerated !== null) vm.primaryNicAccelerated = extra.primaryNicAccelerated;
    return { vm, read, extra, pattern, problems: [], notes };
}

// ---------------------------------------------------------------------------
// The current size's lifecycle stage
// ---------------------------------------------------------------------------

// How a size name reads as a series, for Microsoft's lists:
// Standard_NV12ads_A10_v5 -> NVadsA10v5. A memory-tier number is part of the
// size, not the series: Standard_M128bds_3_v3 -> Mbdsv3. null when the name
// does not read.
function seriesReading(sizeName) {
    const m = /^(?:Standard|Basic)_([A-Z]+)\d+(?:-\d+)?([a-z]*)((?:_(?:[A-Za-z][A-Za-z0-9]*?|\d+))*?)(?:_(v\d+))?$/.exec(String(sizeName ?? ''));
    return m ? m[1] + m[2] + (m[3] || '').replace(/_\d+(?=_|$)/g, '').replace(/_/g, '') + (m[4] || '') : null;
}

const todayUtc = (now) => now.toISOString().slice(0, 10);

// { stage: 'Current'|'Extended'|'Current or Extended'|'End of Life'|'Retired'|null,
//   retiresUtc, mustMove: true|false|null, basis }. In order: the lifecycle
// table; Microsoft's End of Life and retirement lists; and a size in neither
// list but in the size table is Current or Extended (Microsoft: End of Life is
// a series with an announced retirement). Anything else is unknown, never a guess.
export function currentStage(size, table, now = new Date()) {
    const today = todayUtc(now);
    const retiredBy = (day) => Boolean(day) && day <= today;

    const s = sizeLifecycleStage(size);
    if (s) {
        const r = sizeRetirement(size);
        const day = r ? r.retiresUtc : null;
        const stage = s.stage === 'End of Life' && retiredBy(day) ? 'Retired' : s.stage;
        return { stage, retiresUtc: day, mustMove: stage === 'End of Life' || stage === 'Retired', basis: 'lifecycle table' };
    }
    const reading = seriesReading(size);
    for (const row of endOfLife.series) {
        if (reading && row.sizeSeries.includes(reading)) {
            const stage = retiredBy(row.retiresUtc) ? 'Retired' : 'End of Life';
            return { stage, retiresUtc: row.retiresUtc, mustMove: true, basis: `Microsoft's list: ${row.names}` };
        }
    }
    for (const row of endOfLife.sizes) {
        if (row.sizes.some((x) => x.toLowerCase() === String(size).toLowerCase())) {
            const stage = retiredBy(row.retiresUtc) ? 'Retired' : 'End of Life';
            return { stage, retiresUtc: row.retiresUtc, mustMove: true, basis: `Microsoft's list: ${row.names}` };
        }
    }
    if (reading && table && table.has(size)) {
        return { stage: 'Current or Extended', retiresUtc: null, mustMove: false, basis: "not on Microsoft's End of Life or retirement lists" };
    }
    return { stage: null, retiresUtc: null, mustMove: null, basis: null };
}

// Microsoft's capacity growth restrictions on old series: the data, or null.
export function capacityRestricted(sizeName) {
    const m = /^(?:Standard|Basic)_([A-Z]+)\d+(?:-\d+)?([a-z]*?)(?:_(v\d+))?(?:_Promo)?$/i.exec(String(sizeName ?? ''));
    if (!m) return null;
    const read = m[1] + m[2] + (m[3] || '');
    return capacity.sizeSeries.includes(read) ? capacity : null;
}

// ---------------------------------------------------------------------------
// Results
// ---------------------------------------------------------------------------

// Refusals outside what this tool covers on purpose. Every other refusal, and
// every code not listed, is "not checked": unknown is not a "no".
export const BY_DESIGN = [
    'excluded', 'source-is-newer', 'already-on-series', 'already-on-nvme', 'not-built-yet',
    'hpc-or-fpga-size', 'local-nvme-storage-size', 'l-series-replacement', 'size-retired',
    'gen1-requires-redeploy', 'processor-not-approved', 'not-approved', 'confidential-vm-requires-manual',
    'gpu-size',
    // From the query's extra columns (owner, 2026-10-09: a real problem makes the option a no).
    'disk-encryption-present', 'sap-needs-a-certified-size', 'unmanaged-os-disk', 'ephemeral-os-disk',
    // Owner's audit, 2026-10-09: a family with no v5, v6 or v7 size at all (M, for
    // example) is outside this tool - said as such, not as "not checked".
    'family-not-in-region', 'confidential-family',
    'nva-requires-parallel-deployment', 'storage-appliance-requires-vendor',
];
// The logic could not judge these: a person must.
const CANNOT_JUDGE = ['processor-unreadable', 'shape-unknown', 'mapped-unverified', 'no-path', 'chosen-size-gone'];
// Codes that are a plain fact (no fitting size), with the label for the review list.
export const FACT_LABELS = {
    'not-in-region': 'New size not in the size table', 'family-not-in-region': 'No size of this family in the size table',
    'too-few-data-disks': 'Data-disk limit', 'too-few-nics': 'NIC limit', 'no-shape-fit': 'No size of this shape',
    'smaller-than-source': 'New size smaller than the current size', 'shape-unknown': 'vCPUs and memory not known',
    'processor-unreadable': 'Processor type not known', 'gen1-no-size': 'No size takes Generation 1', 'mapped-unverified': 'New size not in the size table',
    'disk-encryption-rebuild': 'Rebuild with Azure Disk Encryption',
    'no-burstable-fit': 'No burstable size of this shape',
};

// One option in a few words, for the one-row-per-machine summary.
export function shortAnswer(result, codes, targetSize) {
    const first = codes[0];
    if (result === 'Supported') return targetSize;
    if (result === 'Needs team review') return 'Review - see needs-review.csv';
    if (result === 'No fitting size') {
        if (codes.includes('too-few-data-disks')) return 'No fitting size (data disks)';
        if (codes.includes('too-few-nics')) return 'No fitting size (NICs)';
        if (codes.includes('disk-encryption-rebuild')) return 'No - a rebuild cannot keep Azure Disk Encryption';
        return 'No fitting size';
    }
    const by = {
        'gen1-requires-redeploy': 'No - needs Gen2', 'source-is-newer': 'Not needed - already newer',
        'already-on-series': 'Not needed - already on it', 'already-on-nvme': 'Not needed - already on NVMe',
        'not-built-yet': 'No - not planned by this tool', 'hpc-or-fpga-size': 'No - HPC/FPGA out of scope',
        'gpu-size': 'No - GPU out of scope', 'processor-not-approved': 'No - Arm64 out of scope',
        'confidential-vm-requires-manual': 'No - confidential VM out of scope', 'size-retired': 'No - retired size out of scope',
        'not-approved': 'No - family is not a target',
        'disk-encryption-present': 'No - Azure Disk Encryption', 'sap-needs-a-certified-size': 'No - SAP',
        'unmanaged-os-disk': 'No - unmanaged disks', 'ephemeral-os-disk': 'No - ephemeral OS disk',
        'family-not-in-region': 'No - no size in this family', 'confidential-family': 'No - confidential VM out of scope',
        'nva-requires-parallel-deployment': 'No - network virtual appliance',
        'storage-appliance-requires-vendor': 'No - storage or backup appliance',
    };
    return by[first] || 'No - out of scope';
}

// The whole list -> { machines, results, review }.
//   machines: one per row, in row order - { read, vm, notes, problems, stage,
//             moveRequired 'Yes'|'No'|'Review', outcome, options, short, defaults, needsReview }
//   results:  one per machine and option - { machine, option, result, codes, ... }
//   review:   what a person must look at - { machine, region, size, series, what, why }
export function plan(machines, table, now = new Date()) {
    const results = [];
    const review = [];
    const out = [];
    const addReview = (m, size, series, what, why) => review.push({ machine: m.read.name, region: m.read.region || '', size, series, what, why });

    for (const m of machines) {
        if (m.vm) continue;
        const size = m.read.size || m.read.sizeAsWritten;
        results.push({ machine: m, series: '', result: 'Needs team review', moveRequired: 'Review', codes: m.problems.map((p) => p.why) });
        for (const p of m.problems) addReview(m, size, '', p.what, p.why);
        out.push({ ...m, stage: null, moveRequired: 'Review', outcome: 'Needs team review', rows: [], short: { v5: '', v6: '', v7: '', burstable: '' }, shortCodes: { v5: [], v6: [], v7: [], burstable: [] }, defaults: { current: '', extended: '' }, needsReview: true });
    }

    for (const m of machines) {
        if (!m.vm) continue;
        const vm = m.vm;
        const advice = machineAdvice(vm, table, now);
        const stage = currentStage(vm.sourceSize, table, now);
        const moveRequired = stage.mustMove === null ? 'Review' : stage.mustMove ? 'Yes' : 'No';
        const reviewBefore = review.length;
        if (stage.mustMove === null) addReview(m, vm.sourceSize, '', 'Lifecycle stage of the current size', 'stage-unknown');

        // No Generation 1 route for a machine out of scope (as for HPC).
        const options = advice.options.filter((o) => !(o.option === 'gen1Route' && vm.blockers.includes('gpu-size')));
        const rows = [];
        for (const o of options) {
            const series = o.option;
            const codes = [...o.notSupported];
            const known = [...BY_DESIGN, ...Object.keys(FACT_LABELS)];
            let result;
            if (o.supported) result = 'Supported';
            else if (codes.length && !codes.some((c) => !BY_DESIGN.includes(c))) result = 'Not supported by design';
            else if (codes.some((c) => CANNOT_JUDGE.includes(c) || !known.includes(c))) result = 'Needs team review';
            else result = 'No fitting size';

            // Supported, but something it rests on is unknown: not checked, with what.
            const reviewWhy = [];
            if (o.supported) {
                if (!o.targetStage) reviewWhy.push('target-stage-unknown');
                if (o.sizeUnverified) reviewWhy.push('target-not-in-table');
                if (reviewWhy.length) result = 'Needs team review';
            }
            const row = {
                machine: m, option: o, series, result, codes, reviewWhy, moveRequired, stage,
                isDefault: [advice.start.current === series ? 'Current default' : null, advice.start.extended === series ? 'Extended default' : null].filter((x) => x),
                otherSizes: o.sizeChoices.filter((c) => c.size !== String(o.targetSize ?? '')).map((c) => c.size),
                caveats: caveats(vm, m.extra, o),
            };
            results.push(row);
            rows.push(row);
            if (result === 'Needs team review') {
                const what = reviewWhy.length ? 'Lifecycle stage or size limits'
                    : codes.map((c) => FACT_LABELS[c] || `Unknown reason: ${c}`).join(', ');
                addReview(m, vm.sourceSize, series === 'gen1Route' ? 'Gen1 to Gen2 route' : series, what, reviewWhy.length ? reviewWhy.join(' ') : codes.join(' '));
            }
        }

        // A machine that must move and has nothing it can move to - unless that
        // is out of scope on every option, which the rows already say.
        const supported = rows.filter((r) => r.result === 'Supported');
        const byDesignOnly = !rows.some((r) => r.result !== 'Not supported by design');
        let outcome;
        if (moveRequired === 'No') outcome = 'No move required';
        else if (moveRequired === 'Review') outcome = 'Needs team review';
        else if (supported.length) outcome = 'Must move - supported target';
        else if (byDesignOnly) outcome = 'Must move - outside the scope of this tool';
        else outcome = 'Needs team review';
        if (moveRequired === 'Yes' && !supported.length && !byDesignOnly) {
            if (rows.some((r) => r.result !== 'Needs team review')) addReview(m, vm.sourceSize, '', 'No size fits', 'must-move-no-target');
        }

        const short = {};
        const shortCodes = {};
        for (const s of ['v5', 'v6', 'v7', 'burstable']) {
            const r = rows.find((x) => x.series === s);
            short[s] = r ? shortAnswer(r.result, r.codes, String(r.option.targetSize ?? '')) : '';
            shortCodes[s] = r ? r.codes : [];
        }
        const defaultOf = (s) => { const r = rows.find((x) => x.series === s && x.result === 'Supported'); return r ? `${s} - ${r.option.targetSize}` : ''; };
        out.push({ ...m, advice, stage, moveRequired, outcome, rows, short, shortCodes,
            defaults: { current: defaultOf(String(advice.start.current ?? '')), extended: defaultOf(String(advice.start.extended ?? '')) },
            needsReview: review.length > reviewBefore });
    }
    out.sort((a, b) => a.read.row - b.read.row);
    return { machines: out, results, review };
}
