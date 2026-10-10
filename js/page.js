// The page: the query and template, the paste box and file, the results
// table, and the downloads. Everything stays in this browser tab: nothing is
// sent anywhere, and nothing is stored.

import sizes from '../data/sizes.js?v=0.3.0-beta';
import endOfLife from '../data/end-of-life.js?v=0.3.0-beta';
import capacity from '../data/capacity.js?v=0.3.0-beta';
import nvme from '../data/nvme-images.js?v=0.3.0-beta';
import query from './query.js?v=0.3.0-beta';
import sample from './sample.js?v=0.3.0-beta';
import { SizeTable } from './lifecycle.js?v=0.3.0-beta';
import { COLUMNS, readList } from './input.js?v=0.3.0-beta';
import { capacityRestricted, plan, toMachine } from './planner.js?v=0.3.0-beta';
import { optionReason, reasonFor } from './reasons.js?v=0.3.0-beta';
import { GROUPS, GUIDANCE, NOT_FOUND, PATTERNS, POOL_PATTERNS, PROCESSOR_NOTE, answerWords, capacityWords, dateWords, moveWords, stageShort, stageWords } from './words.js?v=0.3.0-beta';
import * as F from './files.js?v=0.3.0-beta';
import { makeZip } from './zip.js?v=0.3.0-beta';
import version from './version.js?v=0.3.0-beta';

const table = new SizeTable(sizes.sizes);
const vms = (n) => `${n} ${n === 1 ? 'VM' : 'VMs'}`;
// In the table, a size without its 'Standard_' start: D4ds_v6. The full name is in the details and the files.
const shortSize = (size) => String(size).replace(/^Standard_/, '');
const $ = (id) => document.getElementById(id);

// Build an element; text is always set as text, never as HTML.
function el(tag, attrs = {}, ...children) {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
        if (v === null || v === undefined || v === false) continue;
        if (k === 'class') e.className = v;
        else if (k === 'text') e.textContent = v;
        else e.setAttribute(k, v === true ? '' : v);
    }
    for (const c of children.flat()) if (c !== null && c !== undefined) e.append(c instanceof Node ? c : document.createTextNode(String(c)));
    return e;
}

// ---------------------------------------------------------------------------
// Step 1: the query
// ---------------------------------------------------------------------------

$('query').textContent = query;
$('copy-query').addEventListener('click', async () => {
    const b = $('copy-query');
    try {
        await navigator.clipboard.writeText(query);
        b.textContent = 'Copied';
    } catch {
        // Clipboard not allowed: select the text so it can be copied by hand.
        const r = document.createRange(); r.selectNodeContents($('query'));
        const s = getSelection(); s.removeAllRanges(); s.addRange(r);
        b.textContent = 'Push Ctrl+C';
    }
    setTimeout(() => { b.textContent = 'Copy query'; }, 2500);
});

// ---------------------------------------------------------------------------
// Step 2: the list
// ---------------------------------------------------------------------------

let sourceName = 'pasted list';
const paste = $('paste');

function loadFile(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => { paste.value = String(reader.result); sourceName = file.name; run(); };
    reader.readAsText(file);
}
$('file').addEventListener('change', (e) => { loadFile(e.target.files[0]); e.target.value = ''; });
const drop = $('drop');
drop.addEventListener('dragover', (e) => { e.preventDefault(); drop.classList.add('over'); });
drop.addEventListener('dragleave', () => drop.classList.remove('over'));
drop.addEventListener('drop', (e) => { e.preventDefault(); drop.classList.remove('over'); loadFile(e.dataTransfer.files[0]); });
paste.addEventListener('input', () => { sourceName = 'pasted list'; });
$('sample').addEventListener('click', () => { paste.value = sample; sourceName = 'sample list (contoso)'; run(); });
$('clear').addEventListener('click', () => {
    paste.value = ''; sourceName = 'pasted list'; current = null;
    $('messages').replaceChildren(); $('results-section').hidden = true;
});
$('run').addEventListener('click', () => run());

// ---------------------------------------------------------------------------
// Planning
// ---------------------------------------------------------------------------

let current = null;   // { list, plan, now }

function message(kind, title, items = []) {
    return el('div', { class: `msg ${kind}` }, el('strong', { text: title }), items.length ? el('ul', {}, items.map((i) => el('li', { text: i }))) : null);
}

function run() {
    const box = $('messages');
    const list = readList(paste.value);
    if (list.stops.length) {
        current = null;
        $('results-section').hidden = true;
        box.replaceChildren(message('stop', 'This tool cannot read the list:', [
            ...list.stops,
            'Use the columns from the Azure Resource Graph query in step 1, or from the template.',
            'Run the query in step 1 again. Or, use the template.',
            list.headers.length ? `The columns in your list: ${list.headers.map((h) => `'${h}'`).join(', ')}.` : '',
        ].filter((x) => x)));
        return;
    }
    if (!list.rows.length) {
        box.replaceChildren(message('stop', 'The list has a header row, but it has no VMs.'));
        return;
    }
    box.replaceChildren(message('note', `Wait until this tool shows the results for ${vms(list.rows.length)}.`));
    // Let the message paint before the work starts.
    setTimeout(() => {
        const now = new Date();
        const machines = list.rows.map((r, i) => toMachine(r, list.map, i + 2, table, now));
        current = { list, plan: plan(machines, table, now), now };
        const msgs = [message('ok', `This tool made the results for ${vms(machines.length)} in your browser. It sent no data.`)];
        if (list.notes.length) msgs.push(message('note', 'Note:', list.notes));
        const missing = COLUMNS.map((c) => c.name).filter((c) => !(c in list.map));
        if (missing.length) msgs.push(message('note', 'Your list does not have all the columns that the Azure Resource Graph query in step 1 gives.', [
            `Columns not in your list: ${missing.join(', ')}.`,
            'For these facts, the notes show "Check:".',
            'To get all the facts, run the query in step 1 and load its CSV file.',
        ]));
        box.replaceChildren(...msgs);
        filter = 'all'; $('find').value = ''; limit = PAGE;
        showResults();
    }, 20);
}

// ---------------------------------------------------------------------------
// Step 3: results
// ---------------------------------------------------------------------------

const PAGE = 200;
let filter = 'all';
let patternFilter = 'all';
let limit = PAGE;
// The colour of each result group. Red only for no supported size; a hard gate
// and "do this first" are amber: they are steps, not dead ends (peer, 2026-10-09).
const PILL = { modern: 'no-move', ready: 'ready', first: 'move', gate: 'move', nopath: 'no-suggestion', unchecked: 'not-checked' };

function showResults() {
    const p = current.plan;
    $('results-section').hidden = false;

    // Counts, which also filter.
    const counts = $('counts');
    counts.replaceChildren(...Object.keys(GROUPS).map((g) => {
        const n = p.machines.filter((m) => F.groupOf(m) === g).length;
        const b = el('button', { type: 'button', class: `count${filter === g ? ' active' : ''}`, 'aria-pressed': String(filter === g) },
            el('span', { class: 'n', text: String(n) }), el('span', { class: 't', text: GROUPS[g].short }));
        b.addEventListener('click', () => { filter = filter === g ? 'all' : g; limit = PAGE; showResults(); });
        return b;
    }));
    const sel = $('filter');
    sel.replaceChildren(el('option', { value: 'all', text: `All VMs (${p.machines.length})` }),
        ...Object.keys(GROUPS).map((g) => el('option', { value: g, text: GROUPS[g].short })));
    sel.value = filter;
    // Only the patterns in this list, with their counts.
    const pf = $('pattern-filter');
    const found = Object.keys(PATTERNS).filter((k) => p.machines.some((m) => (m.pattern || '') === k));
    if (patternFilter !== 'all' && !found.includes(patternFilter)) patternFilter = 'all';
    pf.replaceChildren(el('option', { value: 'all', text: 'All patterns' }),
        ...found.map((k) => el('option', { value: k, text: `${PATTERNS[k].name} (${p.machines.filter((m) => (m.pattern || '') === k).length})` })));
    pf.value = patternFilter;
    renderTable();
}

$('filter').addEventListener('change', (e) => { filter = e.target.value; limit = PAGE; showResults(); });
$('pattern-filter').addEventListener('change', (e) => { patternFilter = e.target.value; limit = PAGE; renderTable(); });
$('not-found').textContent = NOT_FOUND;
$('find').addEventListener('input', () => { limit = PAGE; renderTable(); });
$('more').addEventListener('click', () => { limit += PAGE; renderTable(); });

const HEADERS = [...document.querySelectorAll('#table thead th')].map((th) => th.textContent);

// The readiness signals of a VM, as small tags: an amber tag for each recommended
// action, a blue tag for each fact to know, and one grey tag for the facts to check.
function signalsCell(m) {
    const s = F.signals(m);
    const tags = s.actions.map((a) => el('span', { class: 'tag-action', title: a.text, text: a.topic }));
    for (const a of s.attention) tags.push(el('span', { class: 'tag-note', title: a.text, text: a.topic }));
    if (s.checks.length) tags.push(el('span', { class: 'tag-check', title: s.checks.map((c) => c.text).join('\n'), text: `${s.checks.length} to check` }));
    return el('td', { class: 'warn' }, tags.length ? el('span', { class: 'tags' }, tags) : null);
}

function renderTable() {
    const p = current.plan;
    const q = $('find').value.trim().toLowerCase();
    const rows = p.machines.filter((m) => {
        if (filter !== 'all' && F.groupOf(m) !== filter) return false;
        if (patternFilter !== 'all' && (m.pattern || '') !== patternFilter) return false;
        if (q && !`${m.read.name} ${m.read.size || m.read.sizeAsWritten}`.toLowerCase().includes(q)) return false;
        return true;
    });
    const tbody = $('table').tBodies[0];
    tbody.replaceChildren();
    for (const m of rows.slice(0, limit)) {
        const tr = el('tr', { class: 'machine', tabindex: '0', 'aria-expanded': 'false' });
        const answer = (s) => {
            const t = m.short[s] || '';
            if (!t) return el('td', {});
            return /^(Standard|Basic)_/.test(t) ? el('td', {}, el('span', { class: 'ans-ok', title: t, text: shortSize(t) })) : el('td', {}, el('span', { class: 'ans-no', text: answerWords(m, s) }));
        };
        const g = F.groupOf(m);
        tr.append(
            el('td', { class: 'vm' }, el('span', { class: 'name', text: m.read.name }), el('span', { class: 'sub', text: vmSub(m) })),
            el('td', { class: 'size', title: m.read.size || m.read.sizeAsWritten || '', text: shortSize(m.read.size || m.read.sizeAsWritten || '') }),
            stageCell(m),
            el('td', {}, el('span', { class: `pill ${PILL[g]}`, text: GROUPS[g].short })),
            answer('v5'), answer('v6'), answer('v7'), answer('burstable'),
            signalsCell(m),
        );
        // On a narrow screen each row shows as a card; each cell gets its column name.
        [...tr.children].forEach((td, i) => { td.dataset.label = HEADERS[i]; });
        const toggle = () => {
            const open = tr.nextSibling && tr.nextSibling.classList && tr.nextSibling.classList.contains('details');
            if (open) { tr.nextSibling.remove(); tr.setAttribute('aria-expanded', 'false'); return; }
            tr.after(details(m));
            tr.setAttribute('aria-expanded', 'true');
        };
        tr.addEventListener('click', toggle);
        tr.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); } });
        tbody.append(tr);
    }
    $('shown').textContent = rows.length === p.machines.length ? '' : `The table shows ${rows.length} of ${vms(p.machines.length)}.`;
    $('more').hidden = rows.length <= limit;
}

// Under the VM name: a scale set and its instances, and the workload pattern.
function vmSub(m) {
    const set = m.read.resourceType === 'Scale set' ? `Scale set${m.read.instances !== null && m.read.instances !== undefined ? `, ${m.read.instances} instance${m.read.instances === 1 ? '' : 's'}` : ''}. ` : '';
    return `${set}${m.pattern ? PATTERNS[m.pattern].name : 'Pattern not checked'}`;
}

// The stage, short: the name, the date, and a tag when Microsoft limits capacity.
function stageCell(m) {
    if (!m.stage) return el('td', {});
    const s = stageShort(m.stage, capacityRestricted(m.vm.sourceSize));
    return el('td', { class: 'stage' }, el('strong', { text: s.name }), s.detail ? el('span', { class: 'sub', text: s.detail }) : null,
        s.capacity ? el('span', { class: 'tag-limit', text: 'Capacity limited', title: 'Microsoft limits new capacity for this series. Select the VM to read more.' }) : null);
}

// The reason, how to move, the ranked sizes and the readiness signals for each
// series of one VM.
function details(m) {
    const { now } = current;
    const td = el('td', { colspan: '9' });
    const g = F.groupOf(m);
    td.append(el('p', {}, el('strong', { text: GROUPS[g].long })));
    const pat = PATTERNS[m.pattern || ''];
    // The advice only for a VM that must move, or when the pattern is not known.
    td.append(el('p', {}, el('strong', { text: `Workload pattern: ${m.pattern ? pat.name : 'not checked'}. ` }), m.moveRequired === 'Yes' || !m.pattern ? pat.advice : ''));
    if (m.stage) td.append(el('p', { text: `Lifecycle stage: ${stageWords(m.stage, capacityRestricted(m.vm.sourceSize))}` }));
    if (!m.vm) {
        td.append(el('ul', {}, m.problems.map((pr) => el('li', { text: reasonFor(pr.why, { problem: pr }) }))));
    } else {
        const grid = el('div', { class: 'series' });
        let processorChange = false;
        for (const r of m.rows) {
            const o = r.option;
            const name = r.series === 'gen1Route' ? 'Generation 1 to 2' : r.series === 'burstable' ? 'Burstable (Bsv2, Basv2)' : r.series;
            const box = el('div', {},
                el('h4', { text: o.supported ? `${name}: ${o.targetSize}` : name }),
                el('p', { text: optionReason(r, table, now) }));
            // For a pool or a service, the pattern above says how to move.
            if (o.supported && m.moveRequired === 'Yes' && !POOL_PATTERNS.includes(m.pattern)) box.append(el('p', {}, el('strong', { text: 'How to move: ' }), moveWords(r.series, o.rebuild, Boolean(m.vm.os))));
            if (o.supported) {
                const ranked = F.rankedFor(m, r, table, now);
                if (ranked.some((x) => x.why.endsWith('*'))) processorChange = true;
                if (ranked.length > 1) {
                    box.append(el('p', { class: 'label-small', text: 'Ranked sizes' }),
                        el('ol', { class: 'ranked' }, ranked.map((x) => el('li', {}, el('span', { class: 'size-name', text: x.size }), ` ${x.why}`))));
                }
                if (o.targetStage) box.append(el('p', { class: 'hint', text: `Lifecycle stage of ${o.targetSize}: ${o.targetStage.stage}.` }));
            }
            const notes = Object.entries(r.caveats || {}).filter(([, c]) => c.state);
            if (o.supported && m.moveRequired === 'Yes' && notes.length) {
                box.append(el('p', { class: 'label-small', text: 'Readiness signals' }),
                    el('ul', { class: 'caveats' }, notes.map(([topic, c]) => el('li', { class: c.state === 'problem' ? 'action' : c.state }, el('span', { class: 'topic', text: `${topic}: ` }), c.text))));
            }
            grid.append(box);
        }
        td.append(grid);
        if (processorChange) td.append(el('p', { class: 'hint', text: PROCESSOR_NOTE }));
        if (g === 'gate' || g === 'nopath') {
            td.append(el('p', { class: 'hint' }, 'Microsoft guidance: ', el('a', { href: GUIDANCE.endOfLife, target: '_blank', rel: 'noopener noreferrer', text: 'End of Life sizes' }), ', ',
                el('a', { href: GUIDANCE.retirements, target: '_blank', rel: 'noopener noreferrer', text: 'retirements' }), '.'));
        }
    }
    if (m.notes.length) td.append(el('p', { class: 'hint', text: `Notes: ${m.notes.join('; ')}` }));
    return el('tr', { class: 'details' }, td);
}

// ---------------------------------------------------------------------------
// Downloads: made here, saved by the browser
// ---------------------------------------------------------------------------

function save(name, bytes, type) {
    const url = URL.createObjectURL(new Blob([bytes], { type }));
    const a = el('a', { href: url, download: name });
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}
$('download').addEventListener('click', () => {
    if (!current) return;
    const { plan: p, list, now } = current;
    const zip = makeZip([
        { name: 'vm-summary.csv', text: F.toCsv(F.SUMMARY_COLUMNS, F.summaryRows(p)) },
        { name: 'vm-target-sizes.csv', text: F.toCsv(F.TARGET_COLUMNS, F.targetRows(p, table, now)) },
        { name: 'vm-not-checked.csv', text: F.toCsv(F.NOT_CHECKED_COLUMNS, F.notCheckedRows(p, table, now)) },
        { name: 'about-these-results.txt', text: F.aboutText(p, list, sourceName, now) },
    ], now);
    const stamp = now.toISOString().slice(0, 16).replace(/[-:]/g, '').replace('T', '-');
    save(`vm-lifecycle-results-${stamp}.zip`, zip, 'application/zip');
});

// ---------------------------------------------------------------------------
// Where the answers come from
// ---------------------------------------------------------------------------

const link = (href, text) => el('a', { href, target: '_blank', rel: 'noopener noreferrer', text });
$('version').textContent = `Version ${version}.`;
$('sources').replaceChildren(
    el('li', {}, `Size facts: this tool has a table of ${sizes.sizeCount} Azure VM sizes. It read the table from Azure on ${dateWords(sizes.readUtc)}. The page does not connect to Azure.`),
    el('li', {}, 'Lifecycle stages and retirement dates: the Microsoft ', link(GUIDANCE.lifecycle, 'lifecycle overview'), ', ',
        link(GUIDANCE.endOfLife, 'End of Life list'), ' and ', link(GUIDANCE.retirements, 'retirements and capacity restrictions'),
        `. This tool read them on ${dateWords(endOfLife.sources[0].readUtc)}.`),
    el('li', {}, 'NVMe support of the OS: the Microsoft ', link(nvme.source, 'list of OS images that support NVMe'), `. This tool read it on ${dateWords(nvme.readUtc)}.`),
    el('li', {}, 'Capacity restrictions: ', capacityWords(capacity).join(' ')),
);
