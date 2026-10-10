// What to do for one VM, in words: the same for the page and the report.

import { capacityRestricted } from './planner.js?v=0.5.1-beta';
import { likelyRow, signals } from './files.js?v=0.5.1-beta';
import { optionReason, reasonFor } from './reasons.js?v=0.5.1-beta';
import { PATTERNS, POOL_PATTERNS, poolAdvice, stageWords } from './words.js?v=0.5.1-beta';

// 'v6', 'v7' -> 'v6 and v7'.
export function seriesList(list) {
    const names = list.map((s) => (s === 'burstable' ? 'Burstable' : s));
    return names.length < 2 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

// The hard gate, in words: SAP, or the vendor of an appliance.
export function gateReasons(m) {
    const codes = ['sap-needs-a-certified-size', 'nva-requires-parallel-deployment', 'storage-appliance-requires-vendor'];
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
    if (m.stage) why.push(stageWords(m.stage, capacityRestricted(m.vm.sourceSize)));
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
