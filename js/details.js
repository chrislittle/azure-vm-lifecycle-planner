// What to do for one VM, in words: the same for the page and the report.

import { capacityRestricted } from './planner.js?v=0.9.0-beta';
import { likelyRow, signals } from './files.js?v=0.9.0-beta';
import { optionReason, reasonFor } from './reasons.js?v=0.9.0-beta';
import { PATTERNS, POOL_PATTERNS, poolAdvice, stageWords } from './words.js?v=0.9.0-beta';
import { sizeFacts } from './lifecycle.js?v=0.9.0-beta';
import { gibWords } from './extras.js?v=0.9.0-beta';

// ---------------------------------------------------------------------------
// The current size beside each new size (0.9.0-beta)
// ---------------------------------------------------------------------------

export const NOT_IN_TABLE = 'Not in the size table';
export const COMPARE_CAPTION = 'The current size and each new size, from the size table';
export const COMPARE_HINT = 'A note under a value shows where the new size has less than the current size or this VM.';

// The current size and each size that this tool shows for the VM (v5, v6, v7,
// burstable), side by side: { caption, columns: [{ label, size }], rows: [{ label,
// cells: [{ text, less }] }] }. less: words that say what the new size has less of,
// or ''. null when the VM has no new size to show. Facts from data/sizes.js only.
export function sizeComparison(m, table) {
    if (!m.vm) return null;
    const shown = m.rows.filter((r) => r.series !== 'gen1Route' && r.option.supported && r.option.targetSize);
    if (!shown.length) return null;
    const facts = (size) => (table.has(size) ? sizeFacts(table.get(size)) : null);
    const cur = facts(m.vm.sourceSize);
    const nics = m.vm.nicCount;
    const disks = m.vm.dataDiskCount;
    // The generation as the list gives it (none for a VM in AKS, ARO or Azure Databricks).
    const gen = m.read.generation || null;
    const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
    const num = (v) => (v === null || v === undefined ? 'Not given' : String(v));
    const active = (f) => (f.vcpusActive !== null && f.vcpusActive !== f.vcpus ? f.vcpusActive : f.vcpus);
    const temp = (f) => (f.tempGiB === null ? 'Not given' : f.tempGiB === 0 ? 'None'
        : `${gibWords(f.tempGiB)}${f.tempKind === 'NVMe' ? ` (NVMe${f.tempDisks > 1 ? `, ${f.tempDisks} disks` : ''})` : ''}`);
    const gens = (f) => (f.generations ? f.generations.map((g) => g.replace(/^V/i, '')).join(', ') : 'Not given');
    const yesNo = (v) => (v === null ? 'Not given' : v ? 'Yes' : 'No');
    // Each row: its label, its value for a size, and what a new size has less of.
    const ROWS = [
        ['vCPUs', (f) => (f.vcpusActive !== null && f.vcpusActive !== f.vcpus ? `${f.vcpus} (${f.vcpusActive} active)` : num(f.vcpus)),
            (f) => (cur && active(cur) !== null && active(f) !== null && active(f) < active(cur) ? `Less than the current size (${active(cur)}).` : '')],
        ['Memory (GiB)', (f) => num(f.memoryGiB),
            (f) => (cur && cur.memoryGiB !== null && f.memoryGiB !== null && f.memoryGiB < cur.memoryGiB ? `Less than the current size (${cur.memoryGiB}).` : '')],
        ['Temporary disk (GiB)', temp,
            (f) => (cur && cur.tempGiB > 0 && f.tempGiB !== null && f.tempGiB < cur.tempGiB ? `Less than the current size (${gibWords(cur.tempGiB)}).` : '')],
        ['Max NICs', (f) => num(f.maxNics),
            (f) => (nics !== undefined && f.maxNics !== null && f.maxNics < nics ? `Less than the ${plural(nics, 'NIC', 'NICs')} of this VM.` : '')],
        ['Max data disks', (f) => num(f.maxDataDisks),
            (f) => (disks !== undefined && f.maxDataDisks !== null && f.maxDataDisks < disks ? `Less than the ${plural(disks, 'data disk', 'data disks')} of this VM.` : '')],
        ['Premium SSD', (f) => yesNo(f.premium),
            (f) => (cur && cur.premium === true && f.premium === false ? 'Less than the current size (Yes).' : '')],
        ['Generations', gens,
            (f) => (gen && f.generations && !f.generations.some((g) => g.toUpperCase() === gen.toUpperCase()) ? `Does not take Generation ${gen.replace(/^V/i, '')}, the generation of this VM.` : '')],
    ];
    // The current size: its own values, and the NICs and data disks of this VM.
    const own = { 'Max NICs': nics, 'Max data disks': disks };
    const columns = [{ label: 'Current size', size: m.vm.sourceSize, facts: cur },
        ...shown.map((r) => ({ label: r.series === 'burstable' ? 'Burstable' : r.series, size: r.option.targetSize, facts: facts(r.option.targetSize) }))];
    const rows = ROWS.map(([label, value, less]) => ({
        label,
        cells: columns.map((c, i) => {
            if (!c.facts) return { text: NOT_IN_TABLE, less: '' };
            let text = value(c.facts);
            if (i === 0 && own[label] !== undefined) text += ` (this VM: ${own[label]})`;
            return { text, less: i === 0 ? '' : less(c.facts) };
        }),
    }));
    return { caption: COMPARE_CAPTION, columns: columns.map(({ label, size }) => ({ label, size })), rows };
}

// 'v6', 'v7' -> 'v6 and v7'.
export function seriesList(list) {
    const names = list.map((s) => (s === 'burstable' ? 'Burstable' : s));
    return names.length < 2 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

// The hard gate, in words: SAP, or the vendor of an appliance.
export function gateReasons(m) {
    const codes = ['sap-needs-a-certified-size', 'nva-requires-parallel-deployment', 'storage-appliance-requires-vendor', 'managed-application-requires-vendor'];
    return (m.vm.blockers || []).filter((b) => codes.includes(b)).map((b) => reasonFor(b, {}));
}

// The main thing to do for a VM: { main, more: [] }.
export function todo(m, g) {
    const pool = POOL_PATTERNS.includes(m.pattern);
    if (!m.vm) {
        if (pool) { const a = poolAdvice(m); return { main: a.todo, more: [a.more, 'This tool cannot check the sizes. See "Why".'] }; }
        return { main: 'This tool cannot check this VM.', more: ['See "Why". Correct the list, then load it again.'] };
    }
    if (g === 'modern') return { main: 'No move needed.', more: ['This is a modern size: Microsoft fully supports it.'] };
    if (g === 'unchecked') return { main: 'This tool cannot check this VM.', more: ['See "Why" and "Sizes".'] };
    if (g === 'pool') { const a = poolAdvice(m); return { main: a.todo, more: [a.more] }; }
    if (g === 'gate') {
        const sap = (m.vm.blockers || []).includes('sap-needs-a-certified-size');
        return { main: sap ? 'Ask SAP which sizes they certify. Do not change the VM before that.' : 'Ask the vendor which sizes they certify. Do not change the VM before that.', more: [`This tool gives no size. Only ${sap ? 'SAP' : 'the vendor'} can approve a size.`] };
    }
    if (g === 'nopath') return { main: 'This tool has no supported size for this VM.', more: ['See "Why" for the reason.'] };
    const r = likelyRow(m);
    const o = r.option;
    const main = r.series === 'v6' || r.series === 'v7' ? `Deploy a new VM at ${o.targetSize} in parallel. Then move the workload.`
        : o.rebuild ? `Rebuild at ${o.targetSize} from a current image.` : `Resize to ${o.targetSize}.`;
    const more = [];
    // "Do this first" is steps, facts to check, or both (review, 2026-10-10).
    if (g === 'first') {
        const s = signals(m);
        more.push(s.actions.length && s.checks.length ? 'First, do the steps in "Before the move" and check the facts in "To check".'
            : s.actions.length ? 'Do the steps in "Before the move" first.' : 'Check the facts in "To check" first.');
    }
    // A resize on Linux can be a rebuild on Windows (the temporary disk changes type).
    if (!m.vm.os && !o.rebuild && r.series !== 'v6' && r.series !== 'v7') more.push('The list does not give the OS. For a Windows VM, a rebuild can be necessary.');
    if (m.pattern === 'F') more.push(PATTERNS.F.advice);
    const others = m.rows.filter((x) => x !== r && x.option.supported && x.series !== 'gen1Route').map((x) => x.series);
    if (others.length) more.push(`You can also use ${seriesList(others)}. See "Sizes".`);
    return { main, more };
}

// "Why", as lines: the lifecycle stage; for a VM that cannot be read, the problems;
// for vendor approval, the reason; for no supported size, each reason once.
export function whyLines(m, g, table, now = new Date()) {
    const why = [];
    // With the time left to a retirement date, or since it, from the day the list is planned.
    if (m.stage) why.push(stageWords(m.stage, capacityRestricted(m.vm.sourceSize), now));
    if (!m.vm) why.push(...m.problems.map((pr) => reasonFor(pr.why, { problem: pr })));
    if (g === 'gate') why.push(...gateReasons(m));
    // No supported size: the reasons go here, each once, not in size cards.
    if (g === 'nopath') {
        // The sentences that every series gives show once; then what is left for
        // each series, with the series that give the same words.
        const split = (text) => text.split(/(?<=\.)\s+(?=[A-Z])/);
        const series = m.rows.filter((r) => r.series !== 'gen1Route').map((r) => ({ name: r.series === 'burstable' ? 'Burstable' : r.series, sentences: split(optionReason(r, table, now)) }));
        const common = series.length ? series[0].sentences.filter((x) => series.every((r) => r.sentences.includes(x))) : [];
        if (common.length) why.push(common.join(' '));
        const rest = new Map();
        for (const r of series) {
            const text = r.sentences.filter((x) => !common.includes(x)).join(' ');
            if (!text) continue;
            if (!rest.has(text)) rest.set(text, []);
            rest.get(text).push(r.name);
        }
        for (const [text, names] of rest) why.push(`${seriesList(names)}: ${text}`);
        const gen1 = m.rows.find((r) => r.series === 'gen1Route');
        if (gen1) why.push(`Generation 1 to 2: ${optionReason(gen1, table, now)}`);
    }
    return why;
}
