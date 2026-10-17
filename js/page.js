// The page: the query and template, the paste box and file, the results
// table, and the downloads. Everything stays in this browser tab: nothing is
// sent anywhere, and nothing is stored.

import sizes from '../data/sizes.js?v=0.7.1-beta';
import endOfLife from '../data/end-of-life.js?v=0.7.1-beta';
import capacity from '../data/capacity.js?v=0.7.1-beta';
import nvme from '../data/nvme-images.js?v=0.7.1-beta';
import query from './query.js?v=0.7.1-beta';
import sample from './sample.js?v=0.7.1-beta';
import { SizeTable } from './lifecycle.js?v=0.7.1-beta';
import { COLUMNS, readList } from './input.js?v=0.7.1-beta';
import { capacityRestricted, plan, toMachine } from './planner.js?v=0.7.1-beta';
import { optionReason, reasonFor } from './reasons.js?v=0.7.1-beta';
import { seriesList, todo, whyLines } from './details.js?v=0.7.1-beta';
import { factsRead, whereWords, workloadFound } from './evidence.js?v=0.7.1-beta';
import { REPORT_NAME, reportHtml } from './report.js?v=0.7.1-beta';
import { GROUPS, GUIDANCE, NOT_FOUND, PATTERNS, POOL_PATTERNS, PROCESSOR_NOTE, poolAdvice, serviceManaged, answerWords, capacityWords, dateWords, moveWords, stageShort, stageWords } from './words.js?v=0.7.1-beta';
import * as F from './files.js?v=0.7.1-beta';
import { makeZip } from './zip.js?v=0.7.1-beta';
import version from './version.js?v=0.7.1-beta';

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

// The tool runs only in its own tab, never inside another site's page: another
// site could put its own controls over this page (review, 2026-10-10). A meta
// Content-Security-Policy cannot set frame-ancestors, so the page checks itself.
if (window.top !== window.self) {
    document.body.replaceChildren(el('main', { class: 'wrap' },
        el('h1', { text: 'VM Lifecycle Planner for Azure' }),
        el('p', { text: 'This tool runs only in its own browser tab. Open it from its own address: ' }),
        el('p', { text: String(document.location.href).split('#')[0] })));
    throw new Error('This tool does not run inside another page.');
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
        b.textContent = 'Press Ctrl+C (Cmd+C on a Mac)';
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
    $('download-status').textContent = '';
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
        const machines = list.rows.map((r, i) => toMachine(r, list.map, r.line ?? i + 2, table, now));
        const p = plan(machines, table, now);
        current = { list, plan: p, now, ...indexOf(p) };
        const msgs = [message('ok', `This tool made the results for ${vms(machines.length)} in your browser. It sent no data.`)];
        if (list.notes.length) msgs.push(message('note', 'Note:', list.notes));
        const missing = COLUMNS.map((c) => c.name).filter((c) => !(c in list.map));
        if (missing.length) msgs.push(message('note', 'Your list does not have all the columns that the Azure Resource Graph query in step 1 gives.', [
            `Columns not in your list: ${missing.join(', ')}.`,
            'The details of each VM show these facts under "To check".',
            'To get all the facts, run the query in step 1 and load its CSV file.',
        ]));
        box.replaceChildren(...msgs);
        filter = 'all'; $('find').value = '';
        showResults();
    }, 20);
}

// ---------------------------------------------------------------------------
// Step 3: results
// ---------------------------------------------------------------------------

const PAGE = 200;
let filter = 'all';
let patternFilter = 'all';
// The rows that the filters and Find select, and how many of them the table shows.
let selected = [];
let shown = 0;
// The colour of each result group. Red only for no supported size; a hard gate
// and "do this first" are amber: they are steps, not dead ends (peer, 2026-10-09).
const PILL = { modern: 'no-move', ready: 'ready', first: 'move', pool: 'pool', gate: 'move', nopath: 'no-suggestion', unchecked: 'not-checked' };

// What the table asks of each VM, made once for each list: its result group, the
// text that Find looks in, and the VMs with the same name. A large list (50,000
// VMs) then filters at once (2026-10-17).
function indexOf(p) {
    const group = new Map();
    const text = new Map();
    const byName = new Map();
    for (const m of p.machines) {
        group.set(m, F.groupOf(m));
        text.set(m, `${m.read.name} ${m.read.size || m.read.sizeAsWritten} ${m.read.resourceId || ''}`.toLowerCase());
        const k = m.read.name.toLowerCase();
        if (!byName.has(k)) byName.set(k, []);
        byName.get(k).push(m);
    }
    return { group, text, byName };
}

function showResults() {
    const p = current.plan;
    $('results-section').hidden = false;

    // Counts, which also filter.
    const n = {};
    for (const g of current.group.values()) n[g] = (n[g] || 0) + 1;
    const counts = $('counts');
    counts.replaceChildren(...Object.keys(GROUPS).map((g) => {
        const b = el('button', { type: 'button', class: `count${filter === g ? ' active' : ''}`, 'aria-pressed': String(filter === g) },
            el('span', { class: 'n', text: String(n[g] || 0) }), el('span', { class: 't', text: GROUPS[g].short }));
        b.addEventListener('click', () => { filter = filter === g ? 'all' : g; showResults(); });
        return b;
    }));
    const sel = $('filter');
    sel.replaceChildren(el('option', { value: 'all', text: `All VMs (${p.machines.length})` }),
        ...Object.keys(GROUPS).map((g) => el('option', { value: g, text: GROUPS[g].short })));
    sel.value = filter;
    // Only the patterns in this list, with their counts.
    const pf = $('pattern-filter');
    const byPattern = {};
    for (const m of p.machines) byPattern[m.pattern || ''] = (byPattern[m.pattern || ''] || 0) + 1;
    const found = Object.keys(PATTERNS).filter((k) => byPattern[k]);
    if (patternFilter !== 'all' && !found.includes(patternFilter)) patternFilter = 'all';
    pf.replaceChildren(el('option', { value: 'all', text: 'All types' }),
        ...found.map((k) => el('option', { value: k, text: `${PATTERNS[k].name} (${byPattern[k]})` })));
    pf.value = patternFilter;
    renderTable();
}

$('filter').addEventListener('change', (e) => { filter = e.target.value; showResults(); });
// The theme menu: light, dark, or follow the system. The page keeps no data, so
// the choice lasts until the page closes (owner, 2026-10-10).
$('theme').addEventListener('change', (e) => {
    const v = e.target.value;
    if (v === 'light' || v === 'dark') document.documentElement.setAttribute('data-theme', v);
    else document.documentElement.removeAttribute('data-theme');
});
$('pattern-filter').addEventListener('change', (e) => { patternFilter = e.target.value; renderTable(); });
$('not-found').textContent = NOT_FOUND;
$('find').addEventListener('input', () => renderTable());
$('more').addEventListener('click', () => addRows());

const HEADERS = [...document.querySelectorAll('#table thead th')].map((th) => th.textContent);

// Select the rows again, and show the first ones.
function renderTable() {
    const p = current.plan;
    const q = $('find').value.trim().toLowerCase();
    selected = p.machines.filter((m) => {
        if (filter !== 'all' && current.group.get(m) !== filter) return false;
        if (patternFilter !== 'all' && (m.pattern || '') !== patternFilter) return false;
        if (q && !current.text.get(m).includes(q)) return false;
        return true;
    });
    $('table').tBodies[0].replaceChildren();
    shown = 0;
    addRows();
    $('shown').textContent = selected.length === p.machines.length ? '' : `The table shows ${selected.length} of ${vms(p.machines.length)}.`;
}

// Show the next rows below the rows that the table shows now. Open rows stay open.
function addRows() {
    const part = document.createDocumentFragment();
    for (const m of selected.slice(shown, shown + PAGE)) part.append(machineRow(m));
    $('table').tBodies[0].append(part);
    shown = Math.min(selected.length, shown + PAGE);
    $('more').hidden = selected.length <= shown;
}

// One VM in the table. The button on the VM name opens and closes its details
// (Enter or Space). A click on the row does the same.
function machineRow(m) {
    const tr = el('tr', { class: 'machine' });
    const answer = (s) => {
        const t = m.short[s] || '';
        if (!t) return el('td', {});
        return /^(Standard|Basic)_/.test(t) ? el('td', {}, el('span', { class: 'ans-ok', title: t, text: shortSize(t) })) : el('td', {}, el('span', { class: 'ans-no', text: answerWords(m, s) }));
    };
    const g = current.group.get(m);
    const same = current.byName.get(m.read.name.toLowerCase());
    const id = `details-${m.read.row}`;
    const button = el('button', { type: 'button', class: 'name', 'aria-expanded': 'false', text: m.read.name });
    tr.append(
        el('th', { class: 'vm', scope: 'row' }, button,
            same.length > 1 ? el('span', { class: 'sub where', text: whereWords(m, same) }) : null,
            el('span', { class: 'sub', text: vmSub(m) })),
        el('td', { class: 'size', title: m.read.size || m.read.sizeAsWritten || '', text: shortSize(m.read.size || m.read.sizeAsWritten || '') }),
        stageCell(m),
        el('td', {}, el('span', { class: `pill ${PILL[g]}`, text: GROUPS[g].short })),
        answer('v5'), answer('v6'), answer('v7'), answer('burstable'),
    );
    // On a narrow screen each row shows as a card; each cell gets its column name.
    [...tr.children].forEach((td, i) => { td.dataset.label = HEADERS[i]; });
    const toggle = () => {
        const open = tr.nextSibling && tr.nextSibling.classList && tr.nextSibling.classList.contains('details');
        if (open) {
            tr.nextSibling.remove();
            tr.classList.remove('open');
            button.setAttribute('aria-expanded', 'false');
            button.removeAttribute('aria-controls');
            return;
        }
        const d = details(m);
        d.id = id;
        tr.after(d);
        tr.classList.add('open');
        button.setAttribute('aria-expanded', 'true');
        button.setAttribute('aria-controls', id);
    };
    button.addEventListener('click', (e) => { e.stopPropagation(); toggle(); });
    // A click that selects text in the row does not close it.
    tr.addEventListener('click', () => { if (!String(getSelection())) toggle(); });
    return tr;
}

// Under the VM name: a scale set and its instances, and the workload type.
function vmSub(m) {
    const set = m.read.resourceType === 'Scale set' ? `Scale set${m.read.instances !== null && m.read.instances !== undefined ? `, ${m.read.instances} instance${m.read.instances === 1 ? '' : 's'}` : ''}. ` : '';
    return `${set}${m.pattern ? PATTERNS[m.pattern].name : PATTERNS[''].name}`;
}

// The stage, short: the name, the date, and a tag when Microsoft restricts capacity growth.
function stageCell(m) {
    if (!m.stage) return el('td', {});
    const s = stageShort(m.stage, capacityRestricted(m.vm.sourceSize));
    return el('td', { class: 'stage' }, el('strong', { text: s.name }), s.detail ? el('span', { class: 'sub', text: s.detail }) : null,
        s.capacity ? el('span', { class: 'tag-limit', text: 'Capacity growth restricted', title: 'Microsoft restricts capacity growth for this series. Select the VM to read more.' }) : null);
}

// The details of one VM, in the same order for every VM (owner, 2026-10-10):
// what to do, why, the notes - before the move, good to know, to check - and
// last the sizes, which are long. Each note shows once, with its series.
function details(m) {
    const { now } = current;
    const td = el('td', { colspan: '8' });
    const box = el('div', { class: 'd' });
    td.append(box);
    const g = F.groupOf(m);
    const section = (title, ...content) => box.append(el('h3', { class: 'sec', text: title }), ...content);
    const pool = POOL_PATTERNS.includes(m.pattern);

    if (m.read.resourceId) box.append(el('p', { class: 'hint rid', text: `Resource ID: ${m.read.resourceId}` }));

    // What to do.
    const t = todo(m, g);
    section('What to do', el('p', { class: 'todo', text: t.main }), ...t.more.filter((x) => x).map((x) => el('p', { class: 'todo-sub', text: x })));

    // Why.
    const why = whyLines(m, g, table, now);
    const noSize = g === 'nopath';
    if (why.length) section('Why', ...why.map((w) => el('p', { class: 'why', text: w })));
    if (m.vm && (g === 'gate' || g === 'nopath')) {
        box.append(el('p', { class: 'hint' }, 'Microsoft guidance: ', el('a', { href: GUIDANCE.endOfLife, target: '_blank', rel: 'noopener noreferrer', text: 'End of Life sizes' }), ', ',
            el('a', { href: GUIDANCE.retirements, target: '_blank', rel: 'noopener noreferrer', text: 'retirements' }), '.'));
    }

    // The workload type, and the facts that this tool found it from.
    const w = workloadFound(m);
    section('Workload type', el('p', { class: 'why' }, el('strong', { text: w.lead })), w.shown ? el('p', { class: 'why', text: w.shown }) : null);

    // The notes.
    if (m.vm && m.moveRequired === 'Yes') {
        const n = F.allNotes(m);
        const only = (x) => (x.series.length ? ` (${seriesList(x.series)} only)` : '');
        const list = (cls, items, strip) => el('ul', { class: `list ${cls}` }, items.map((x) => el('li', {},
            el('span', { class: 'topic', text: `${x.topic}: ` }), strip ? x.text.replace(/^Check: /, '') : x.text, el('span', { class: 'only', text: only(x) }))));
        if (serviceManaged(m)) section('Before the move', el('p', { class: 'none', text: 'Nothing to do on the VM. The service manages the image and the disks.' }));
        else if (n.actions.length) section('Before the move', list('act', n.actions));
        if (n.attention.length) section('Good to know', list('att', n.attention));
        if (n.checks.length) section('To check', el('p', { class: 'hint', text: 'The list does not give these facts.' }), list('chk', n.checks, true));
    }
    // Sizes.
    // A hard gate has no size: "Why" gives the reason once.
    if (m.vm && m.rows.length && g !== 'gate' && !noSize) {
        const grid = el('div', { class: 'series' });
        let processorChange = false;
        for (const r of m.rows) {
            const o = r.option;
            const name = r.series === 'gen1Route' ? 'Generation 1 to 2' : r.series === 'burstable' ? 'Burstable (Bsv2, Basv2)' : r.series;
            const title = o.supported ? `${name}: ${o.targetSize}` : r.series === 'gen1Route' ? name : m.moveRequired === 'No' ? `${name}: not needed` : `${name}: no size`;
            const card = el('div', {}, el('h4', { class: o.supported ? '' : 'no', text: title }));
            if (!o.supported || r.result !== 'Supported') card.append(el('p', { class: o.supported ? '' : 'no', text: optionReason(r, table, now) }));
            if (o.supported && m.moveRequired === 'Yes' && !pool) card.append(el('p', { class: 'hint', text: moveWords(r.series, o.rebuild, Boolean(m.vm.os)) }));
            if (o.supported) {
                const ranked = F.rankedFor(m, r, table, now);
                if (ranked.some((x) => x.why.endsWith('*'))) processorChange = true;
                if (ranked.length > 1) card.append(el('ol', { class: 'ranked' }, ranked.map((x) => el('li', {}, el('span', { class: 'size-name', text: x.size }), ` ${x.why}`))));
                if (o.targetStage) card.append(el('p', { class: 'hint', text: `Lifecycle stage of ${o.targetSize}: ${o.targetStage.stage}.` }));
            }
            grid.append(card);
        }
        section(g === 'pool' ? 'Sizes to look for in the service or pool' : 'Sizes', grid);
        const hints = [];
        if (g === 'pool' && serviceManaged(m)) hints.push('Use a size that the service offers.');
        if (processorChange) hints.push(PROCESSOR_NOTE);
        if (hints.length) box.append(el('p', { class: 'hint', text: hints.join(' ') }));
    }

    if (m.notes.length) box.append(el('p', { class: 'hint', text: `Notes about the list: ${m.notes.join(' ')}` }));

    // Every fact that the answer used, as the list gives it. Closed at first.
    const groups = factsRead(m);
    if (groups.length) {
        box.append(el('details', { class: 'facts' },
            el('summary', { text: 'Facts we read' }),
            el('p', { class: 'hint', text: 'These are the values in your list that this tool used for this VM. "Not in the list" means that the list has no such column. "No value" means that the cell is empty.' }),
            el('div', { class: 'fact-groups' }, groups.map((gr) => el('div', { class: 'fact-group' },
                el('h4', { text: gr.group }),
                el('dl', {}, gr.facts.flatMap((f) => [el('dt', { text: f.column }), el('dd', { class: f.given ? '' : 'missing', text: f.value })])))))));
    }
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
    const button = $('download');
    const status = $('download-status');
    // A large list takes some seconds: say so, and let the message show first.
    button.disabled = true;
    status.textContent = 'This tool makes the zip file. Wait.';
    setTimeout(async () => {
        try {
            const zip = await makeZip([
                { name: 'vm-summary.csv', text: F.toCsv(F.SUMMARY_COLUMNS, F.summaryRows(p)) },
                { name: 'vm-target-sizes.csv', text: F.toCsv(F.TARGET_COLUMNS, F.targetRows(p, table, now)) },
                { name: 'vm-not-checked.csv', text: F.toCsv(F.NOT_CHECKED_COLUMNS, F.notCheckedRows(p, table, now)) },
                { name: REPORT_NAME, text: reportHtml(p, table, sourceName, now) },
                { name: 'about-these-results.txt', text: F.aboutText(p, list, sourceName, now) },
            ], now);
            const stamp = now.toISOString().slice(0, 16).replace(/[-:]/g, '').replace('T', '-');
            save(`vm-lifecycle-results-${stamp}.zip`, zip, 'application/zip');
            status.textContent = 'Your browser saves the zip file.';
        } catch (e) {
            // For example, the browser has no memory left for a very large list.
            status.textContent = 'This tool could not make the zip file. Close other tabs and try again.';
            console.error(e);
        } finally {
            button.disabled = false;
        }
    }, 20);
});

// ---------------------------------------------------------------------------
// Where the answers come from
// ---------------------------------------------------------------------------

const link = (href, text) => el('a', { href, target: '_blank', rel: 'noopener noreferrer', text });
$('version').textContent = `Version ${version}.`;
$('sources').replaceChildren(
    el('li', {}, `Size facts: this tool has a table of ${sizes.sizeCount} Azure VM sizes. It read the table from Azure on ${dateWords(sizes.readUtc)}. The page does not connect to Azure.`),
    el('li', {}, 'Lifecycle stages and retirement dates: the Microsoft ', link(GUIDANCE.lifecycle, 'lifecycle overview'), ', ',
        link(GUIDANCE.endOfLife, 'End of Life list'), ' and ', link(GUIDANCE.retirements, 'retirements and capacity growth restrictions'),
        `. This tool read them on ${dateWords(endOfLife.sources[0].readUtc)}.`),
    el('li', {}, 'NVMe support of the OS: the Microsoft ', link(nvme.source, 'list of OS images that support NVMe'), `. This tool read it on ${dateWords(nvme.readUtc)}.`),
    el('li', {}, 'Capacity growth restrictions: ', capacityWords(capacity).join(' ')),
);
