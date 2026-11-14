// What to do for one VM, in words: the same for the page and the report.

import { capacityRestricted } from './planner.js?v=0.9.7-beta';
import { CAVEAT_TOPICS, allNotes, likelyRow, signals } from './files.js?v=0.9.7-beta';
import { optionReason, reasonFor } from './reasons.js?v=0.9.7-beta';
import { CHOOSE_WAY, FEATURE_WORDS_UNKNOWN, LINK_NAMES, ONE_WAY, PATTERNS, POOL_PATTERNS, TWO_WAYS, TWO_WAYS_USED, WAYS, fallbackWords, featureSteps, featureWords, poolAdvice, serviceManaged, stageWords, tempDiskPreview, twoWaysAsFor } from './words.js?v=0.9.7-beta';
import { sizeFacts } from './lifecycle.js?v=0.9.7-beta';
import { gibWords, sapClear, sapSignWords } from './extras.js?v=0.9.7-beta';

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
    // The SAP reason says the sign that the list gives (0.9.4-beta).
    return (m.vm.blockers || []).filter((b) => codes.includes(b)).map((b) => reasonFor(b, { sapSign: m.extra && m.extra.sapSign }));
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
        const more = [`This tool gives no size. Only ${sap ? 'SAP' : 'the vendor'} can approve a size.`];
        // SAP: the sign that the list gives, and how to clear it for a VM that does
        // not run SAP (owner, 2026-11-06). Nothing more when the list gives no sign.
        if (sap && sapClear(m.extra)) more.push(`${sapSignWords(m.extra)} ${sapClear(m.extra)}`);
        return { main: `${askVendor(sap)}. ${NO_CHANGE}`, more };
    }
    if (g === 'nopath') return { main: NO_SIZE, more: ['See "Why" for the reason.'] };
    const r = likelyRow(m);
    const o = r.option;
    // v5 and Burstable are always a resize (0.9.5-beta). The preview feature first, where
    // the resize needs it, with the size to use without it (words.js, fallbackWords).
    const fallback = fallbackWords(r.series, o.previewFeature, o.featureFallback);
    const main = r.series === 'v6' || r.series === 'v7' ? `Deploy a new VM at ${o.targetSize} in parallel. Then move the workload.`
        : o.previewFeature === 'needed' ? `Resize to ${o.targetSize}. First register the preview feature VMTempDiskResizePreview on the subscription.${fallback ? ` ${fallback}` : ''}`
        : o.previewFeature === 'windows' ? `Resize to ${o.targetSize}. On a Windows VM, first register the preview feature VMTempDiskResizePreview on the subscription.${fallback ? ` ${fallback}` : ''}`
        : `Resize to ${o.targetSize}.`;
    const more = [];
    // "Ready with conditions" is steps, facts to check, or both (review, 2026-10-10). The
    // steps show in the boxes of each way (0.9.6-beta, whatToDo): only the facts to check
    // need a line here.
    if (g === 'first' && signals(m).checks.length) more.push(CHECK_FIRST);
    // The size table does not give the temporary disk: this tool cannot tell if a Windows
    // VM needs the preview feature (unknown is never a pass, 0.9.5-beta).
    if (o.previewFeature === 'unknown' && r.series !== 'v6' && r.series !== 'v7') more.push(FEATURE_WORDS_UNKNOWN);
    if (m.pattern === 'F') more.push(PATTERNS.F.advice);
    const others = m.rows.filter((x) => x !== r && x.option.supported && x.series !== 'gen1Route').map((x) => x.series);
    if (others.length) more.push(`You can also use ${seriesList(others)}. See "Sizes".`);
    return { main, more };
}

// ---------------------------------------------------------------------------
// "What to do": the ways to move, each with its own steps (0.9.6-beta)
// ---------------------------------------------------------------------------

const NO_CHANGE = 'Do not change the VM before that.';
const askVendor = (sap) => (sap ? 'Ask SAP which sizes they certify' : 'Ask the vendor which sizes they certify');
const NO_SIZE = 'This tool has no supported size for this VM.';
const CHECK_FIRST = 'Check the facts in "To check" first.';
export const SERVICE_NOTHING = 'Nothing to do on the VM. The service manages the image and the disks.';
const POOL_TITLE = 'Change the size in the service or the pool';
const NO_SIZE_TITLE = 'No supported size';
const nvmeSeries = (s) => s === 'v6' || s === 'v7';

// What to do for one VM, for the page and the report (owner, 2026-11-07): a line to lead,
// the ways in boxes, more lines, and the notes that are not in a box.
//   lead: 'Move to Standard_D4ds_v6. Choose one of these two ways.', or the main thing to
//     do for a VM with no box (a modern size, a VM that this tool cannot check), or ''.
//   ways: [{ key, label, tag, title, lines, conditions, steps, info, after }]. key:
//     'parallel' and 'resize' (v6 and v7), 'resize' (v5 and Burstable), 'pool', 'vendor' or
//     'nopath'. conditions: the box shows its steps ("Conditions (2 steps)", or "No
//     conditions."). steps: [{ topic, text, series, link }], all the steps of that way;
//     a step of both ways is in both boxes. info: [{ topic, text, series }], a fact to know
//     for that way (the availability set). after: lines after the steps (the size to use
//     without the preview feature).
//   otherSteps, attention, checks: the notes (allNotes in files.js) that no box shows,
//     each [{ topic, text, series }]. "Good to know" and "To check" show as before.
// Each step is the full note, with the value from the list: a short form would drop facts.
// A note that has a part for each way (extras.js, ways) shows its part in each box.
export function whatToDo(m, g) {
    const n = allNotes(m);
    const t = todo(m, g);
    const out = { lead: '', ways: [], more: [], otherSteps: n.actions, attention: n.attention, checks: n.checks };
    const box = (key, title, lines, more = {}) => ({ key, label: '', tag: '', title, lines: lines.filter((x) => x), conditions: true, steps: [], info: [], after: [], ...more });
    const pool = POOL_PATTERNS.includes(m.pattern);
    // A VM that a service manages and that must move: nothing to do on the VM (as "Before the
    // move" said for every such VM before 0.9.6-beta).
    const service = m.vm && m.moveRequired === 'Yes' && serviceManaged(m) ? [SERVICE_NOTHING] : [];
    if (!m.vm || g === 'modern' || g === 'unchecked') return { ...out, lead: t.main, more: [...t.more, ...service] };
    if (g === 'gate') {
        const sap = (m.vm.blockers || []).includes('sap-needs-a-certified-size');
        return { ...out, ways: [box('vendor', askVendor(sap), [NO_CHANGE, ...t.more], { conditions: false, after: service })] };
    }
    if (g === 'nopath') return { ...out, ways: [box('nopath', NO_SIZE_TITLE, [t.main, ...t.more], { conditions: false, after: service })] };

    const r = likelyRow(m);
    const o = r.option;
    const two = nvmeSeries(r.series) && !pool;
    const keys = pool ? ['pool'] : two ? ['parallel', 'resize'] : ['resize'];
    // The note of allNotes that is this note of the likely row (allNotes keeps one note for
    // each topic and text, so the topic and the text find it).
    const noteOf = (list, topic, text) => list.find((x) => x.topic === topic && x.text === text);
    const placed = new Set();
    const ways = keys.map((key) => {
        const a = pool ? poolAdvice(m) : null;
        const w = key === 'pool' ? box('pool', POOL_TITLE, [a.todo, a.more])
            : key === 'parallel' ? box('parallel', WAYS.parallel.title, [WAYS.parallel.line], { label: WAYS.parallel.label, tag: WAYS.parallel.tag })
            : box('resize', WAYS.resize.title, [WAYS.resize.line], two ? { label: WAYS.resize.label, tag: WAYS.resize.tag } : {});
        for (const topic of CAVEAT_TOPICS) {
            const c = r.caveats && r.caveats[topic];
            if (!c || (c.state !== 'problem' && c.state !== 'attention')) continue;
            // A fact to know goes in a box only when it has a part for each way.
            if (c.state === 'attention' && !(two && c.ways)) continue;
            const note = noteOf(c.state === 'problem' ? n.actions : n.attention, topic, c.text);
            if (!note) continue;
            placed.add(note);
            // A pool or a service makes new VMs: a note with a part for each way gives only the
            // part for a new VM there, never the words of a resize (review, 2026-11-07).
            // (A note has ways only on v6 and v7, so a box with no two ways is a pool there.)
            const text = c.ways ? c.ways[two ? key : 'parallel'] : c.text;
            if (!text) continue;
            // In a box, no series: the box is for the size that "What to do" uses (review, 2026-11-07).
            if (c.state === 'problem') w.steps.push({ topic, text, series: [], link: false });
            else w.info.push({ topic, text, series: [] });
        }
        if (key === 'resize') {
            // The preview feature, where the resize needs it (0.9.5-beta); on v6 and v7 with
            // the link to the Microsoft page that names it.
            w.steps.push(...featureSteps(o.previewFeature).map((s) => ({ ...s, series: [], link: s.topic === 'Preview feature' && tempDiskPreview(m, r) })));
            w.after.push(fallbackWords(r.series, o.previewFeature, o.featureFallback));
            // Unknown is never a pass (0.9.5-beta).
            if (o.previewFeature === 'unknown') w.after.push(FEATURE_WORDS_UNKNOWN);
        }
        if (key === 'pool') w.after.push(...service);
        w.after = w.after.filter((x) => x);
        return w;
    });
    return {
        ...out,
        lead: pool ? '' : `Move to ${o.targetSize}.${two ? ` ${CHOOSE_WAY}` : ''}`,
        ways,
        // The preview feature words are in the box of the resize.
        more: pool ? [] : t.more.filter((x) => x !== FEATURE_WORDS_UNKNOWN),
        otherSteps: n.actions.filter((x) => !placed.has(x)),
        attention: n.attention.filter((x) => !placed.has(x)),
    };
}

// The words of one size card (0.9.6-beta): { used, stage, how, link }. used: "What to do"
// uses this size. stage: Microsoft's lifecycle stage of the target series, from the stage
// data. how: the ways to move to it. link: show the link to the Microsoft page that names
// the preview feature. A pool, a service and a VM that stays get no ways (as before).
export function sizeCard(m, g, r) {
    const o = r.option;
    const card = { used: false, stage: o.supported && o.targetStage && o.targetStage.stage ? o.targetStage.stage : '', how: '', link: false };
    if (!o.supported || !m.vm || m.moveRequired !== 'Yes' || POOL_PATTERNS.includes(m.pattern)) return card;
    const likely = g === 'ready' || g === 'first' ? likelyRow(m) : null;
    if (r === likely) return { ...card, used: true, how: nvmeSeries(r.series) ? TWO_WAYS_USED : ONE_WAY };
    const join = (...parts) => parts.filter((x) => x).join(' ');
    if (nvmeSeries(r.series)) {
        if (likely && nvmeSeries(likely.series) && likely.option.previewFeature === o.previewFeature) return { ...card, how: twoWaysAsFor(likely.series) };
        return { ...card, how: join(TWO_WAYS, featureWords(o.previewFeature)), link: tempDiskPreview(m, r) };
    }
    return { ...card, how: join(ONE_WAY, featureWords(o.previewFeature), fallbackWords(r.series, o.previewFeature, o.featureFallback)) };
}

// A text with named links in it, in parts: a plain text, or { href, text } for a link, so that
// the page and the report show the name as the link and never the address (owner,
// 2026-11-13). A link is "name (address)", with an address of GUIDANCE and its name from
// LINK_NAMES (words.js). Anything else stays text: a reason can carry a value from the list
// (an image ID or an image name), and the page never makes a link from what a list gives
// (review, 2026-11-13). LINK_NAMES has only addresses of GUIDANCE (a test checks it).
export function linkParts(text) {
    const out = [];
    let at = 0;
    for (const m of String(text ?? '').matchAll(/([^()]*?) \((https:\/\/[^\s()]+)\)/g)) {
        const href = m[2];
        const name = LINK_NAMES[href];
        if (!name || !m[1].endsWith(name)) continue;
        const start = m.index + m[1].length - name.length;
        if (start > at) out.push(text.slice(at, start));
        out.push({ href, text: name });
        at = m.index + m[0].length;
    }
    if (at < String(text ?? '').length) out.push(String(text).slice(at));
    return out;
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
        // No "Generation 1 to 2" line (owner, 2026-11-13): the v6 and v7 reasons say it.
    }
    return why;
}
