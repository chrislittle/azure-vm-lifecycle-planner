// Run: node --test
// The generation of each VM, the same everywhere: the results table on the page, the
// report (its tables, the summary count and each VM card) and the three CSV files.
// The list gives it (1 or 2), this tool found it (2*: from the image SKU or the
// security type), the list does not give it ("Not given"), or a service does not
// need it ("Set by the service"). A value that this tool found never looks like a value
// that the list gave.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import sizes from '../data/sizes.js';
import sample from '../js/sample.js';
import { SizeTable } from '../js/lifecycle.js';
import { readList } from '../js/input.js';
import { plan, toMachine } from '../js/planner.js';
import { GENERATION_GROUPS, GENERATION_HINT, generationHint, generationShown } from '../js/evidence.js';
import { reportHtml } from '../js/report.js';
import * as F from '../js/files.js';

const table = new SizeTable(sizes.sizes);
const NOW = new Date('2026-10-27T12:00:00Z');
const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');

function run(text) {
    const list = readList(text);
    return plan(list.rows.map((r, i) => toMachine(r, list.map, i + 2, table, NOW)), table, NOW);
}
const byName = (p, name) => p.machines.find((m) => m.read.name === name);

const HEAD = ['VM name', 'Region', 'Current size', 'Generation', 'OS', 'Security type', 'Image SKU', 'Resource type', 'Managed by', 'Scale set',
    'Azure Virtual Desktop', 'SAP', 'SQL Server', 'Shared disk', 'Resource ID'];
const STANDALONE = { 'Region': 'eastus2', 'Current size': 'Standard_D4s_v3', 'Generation': 'V2', 'OS': 'Linux', 'Security type': 'Standard', 'Resource type': 'VM',
    'Managed by': 'None', 'Scale set': 'No', 'Azure Virtual Desktop': 'No', 'SAP': 'No', 'SQL Server': 'No', 'Shared disk': 'No' };
const rid = (name) => `/subscriptions/00000000-0000-0000-0000-000000000000/resourceGroups/rg-contoso/providers/Microsoft.Compute/virtualMachines/${name}`;
function list(rows) {
    return [HEAD.join(','), ...rows.map((r) => HEAD.map((h) => (h === 'Resource ID' ? rid(r['VM name']) : h in r ? r[h] : STANDALONE[h] ?? '')).join(','))].join('\n') + '\n';
}

// Each rule: the row, then what the page and report show, and what the CSV files show.
const CASES = [
    [{ 'VM name': 'contoso-g1', 'Generation': 'V1' }, '1', 'Generation 1'],
    [{ 'VM name': 'contoso-g2', 'Generation': 'Gen 2' }, '2', 'Generation 2'],
    [{ 'VM name': 'contoso-g2b', 'Generation': 'Hyper-V Gen2' }, '2', 'Generation 2'],
    [{ 'VM name': 'contoso-g2c', 'Generation': '2' }, '2', 'Generation 2'],
    [{ 'VM name': 'contoso-blank', 'Generation': '' }, 'Not given', 'Not given'],
    [{ 'VM name': 'contoso-bad', 'Generation': '3' }, 'Not given', 'Not given'],
    [{ 'VM name': 'contoso-sku', 'Generation': '', 'Image SKU': '22_04-lts-gen2' }, '2*', 'Generation 2 (from the image SKU)'],
    [{ 'VM name': 'contoso-tl', 'Generation': '', 'Security type': 'TrustedLaunch' }, '2*', 'Generation 2 (from the security type)'],
    [{ 'VM name': 'contoso-cvm', 'Generation': '', 'Security type': 'ConfidentialVM' }, '2*', 'Generation 2 (from the security type)'],
    [{ 'VM name': 'contoso-tl-bad', 'Generation': '3', 'Security type': 'TrustedLaunch' }, '2*', 'Generation 2 (from the security type)'],
    [{ 'VM name': 'contoso-conflict', 'Generation': '1', 'Security type': 'TrustedLaunch' }, '1', 'Generation 1'],
    [{ 'VM name': 'contoso-aks', 'Generation': '', 'Managed by': 'AKS', 'Resource type': 'Scale set' }, 'Set by the service', 'Set by the service'],
    [{ 'VM name': 'contoso-dbx', 'Generation': '', 'Managed by': 'Databricks' }, 'Set by the service', 'Set by the service'],
    [{ 'VM name': 'contoso-aks-v1', 'Generation': 'V1', 'Managed by': 'AKS', 'Resource type': 'Scale set' }, '1', 'Generation 1'],
    [{ 'VM name': 'contoso-ss', 'Generation': '', 'Resource type': 'Scale set' }, 'Not given', 'Not given'],
    [{ 'VM name': 'contoso-ss-sku', 'Generation': '', 'Resource type': 'Scale set', 'Image SKU': '0001-gen2' }, '2*', 'Generation 2 (from the image SKU)'],
];
const ALL = run(list(CASES.map(([row]) => row)));

test('generation: each rule gives one value for the page and the report, and one for the CSV files', () => {
    for (const [row, shown, csv] of CASES) {
        const g = generationShown(byName(ALL, row['VM name']));
        assert.equal(g.value, shown, `${row['VM name']}: page and report`);
        assert.equal(g.csv, csv, `${row['VM name']}: CSV`);
        assert.equal(g.found, shown === '2*', `${row['VM name']}: found by this tool`);
    }
});

test('generation: a value that this tool found points to the note that says why, and the note stays in the notes', () => {
    const sku = byName(ALL, 'contoso-sku');
    assert.equal(generationShown(sku).note, "The generation is empty. The image SKU '22_04-lts-gen2' is a Generation 2 image, so this tool uses Generation 2.");
    assert.ok(sku.notes.includes(generationShown(sku).note));
    const tl = byName(ALL, 'contoso-tl');
    assert.equal(generationShown(tl).note, 'The generation is empty. Trusted launch needs Generation 2, so this tool uses Generation 2.');
    assert.ok(tl.notes.includes(generationShown(tl).note));
    assert.match(generationShown(byName(ALL, 'contoso-cvm')).note, /A confidential VM needs Generation 2/);
    // A value that this tool cannot read is not "empty": the note says what the list gives.
    assert.equal(generationShown(byName(ALL, 'contoso-tl-bad')).note, "This tool cannot read the generation '3'. Trusted launch needs Generation 2, so this tool uses Generation 2.");
    const aks = byName(ALL, 'contoso-aks');
    assert.match(generationShown(aks).note, /does not need the generation/);
    assert.ok(aks.notes.includes(generationShown(aks).note));
    // A value from the list, or none, has no note of its own.
    for (const n of ['contoso-g1', 'contoso-g2', 'contoso-blank', 'contoso-bad', 'contoso-ss']) assert.equal(generationShown(byName(ALL, n)).note, '', n);
});

test('generation: "Not given" is not checked (never a pass or a fail), and the reason stays', () => {
    assert.deepEqual(byName(ALL, 'contoso-blank').problems.map((x) => x.why), ['generation-missing']);
    assert.deepEqual(byName(ALL, 'contoso-bad').problems.map((x) => x.why), ['generation-missing']);
    assert.deepEqual(byName(ALL, 'contoso-ss').problems.map((x) => x.why), ['scale-set-generation-missing']);
    for (const n of ['contoso-blank', 'contoso-bad', 'contoso-ss']) assert.equal(F.groupOf(byName(ALL, n)), 'unchecked', n);
    assert.deepEqual(byName(ALL, 'contoso-conflict').problems.map((x) => x.why), ['generation-conflicts-with-security-type']);
    // The planner works with what it found: Generation 2 for 2*, nothing for "Set by the service".
    assert.equal(byName(ALL, 'contoso-sku').vm.gen, 'V2');
    assert.equal(byName(ALL, 'contoso-tl').vm.gen, 'V2');
    assert.equal(byName(ALL, 'contoso-aks').read.generation, null);
});

test('generation: the CSV files show it after "Current size", vm-not-checked.csv too', () => {
    for (const cols of [F.SUMMARY_COLUMNS, F.TARGET_COLUMNS, F.NOT_CHECKED_COLUMNS]) assert.equal(cols[cols.indexOf('Current size') + 1], 'Generation');
    const summary = new Map(F.summaryRows(ALL).map((r) => [r['VM name'], r['Generation']]));
    for (const [row, , csv] of CASES) assert.equal(summary.get(row['VM name']), csv, `vm-summary.csv ${row['VM name']}`);
    for (const r of F.targetRows(ALL, table, NOW)) assert.equal(r['Generation'], CASES.find(([row]) => row['VM name'] === r['VM name'])[2], `vm-target-sizes.csv ${r['VM name']}`);
    const notChecked = F.notCheckedRows(ALL, table, NOW);
    const names = new Set(notChecked.map((r) => r['VM name']));
    for (const n of ['contoso-blank', 'contoso-bad', 'contoso-ss', 'contoso-conflict']) assert.ok(names.has(n), n);
    for (const r of notChecked) assert.equal(r['Generation'], CASES.find(([row]) => row['VM name'] === r['VM name'])[2], `vm-not-checked.csv ${r['VM name']}`);
    const csv = F.toCsv(F.NOT_CHECKED_COLUMNS, notChecked);
    assert.match(csv.split('\r\n')[0], /"Current size","Generation","Series"/);
    assert.match(csv, /"contoso-blank","eastus2","00000000-0000-0000-0000-000000000000","rg-contoso","Standard_D4s_v3","Not given",/);
});

test('generation: the page table has a Generation column after "Current size", and the cell uses the shared value', () => {
    const html = read('index.html');
    const head = /<table id="table">[\s\S]*?<thead>([\s\S]*?)<\/thead>/.exec(html)[1];
    const names = [...head.matchAll(/<th\b[^>]*>([^<]*)<\/th>/g)].map((m) => m[1]);
    assert.equal(names[names.indexOf('Current size') + 1], 'Generation');
    const page = read('js/page.js');
    // The row: the size cell, then the generation cell, then the stage.
    assert.match(page, /el\('td', \{ class: 'size'[^\n]*\n\s*generationCell\(m\),\n\s*stageCell\(m\),/);
    // The cell shows the shared value, and gives the note that says why as its title.
    assert.match(page.replace(/\r\n/g, '\n'), /function generationCell\(m\) \{\n\s*const g = generationShown\(m\);\n\s*return el\('td', \{ class: [^\n]*, title: g\.note \|\| null, text: g\.value \}\);/);
    // The details row spans every column.
    assert.equal(Number(/el\('td', \{ colspan: '(\d+)' \}\)/.exec(page)[1]), names.length);
    // The hint under the table says what 2* and the other words mean (see below).
    assert.match(GENERATION_HINT, /2\*/);
});

test('generation: the report shows it in the VM tables, in each VM card and as a count in the summary', () => {
    const html = reportHtml(ALL, table, 'test', NOW);
    // The tables of section 2: "Generation" right after "Size".
    const heads = [...html.matchAll(/<thead><tr><th scope="col">VM<\/th>([\s\S]*?)<\/tr><\/thead>/g)].map((m) => [...m[1].matchAll(/<th scope="col">([^<]*)<\/th>/g)].map((x) => x[1]));
    assert.ok(heads.length > 1);
    for (const h of heads) assert.deepEqual(h.slice(1, 3), ['Size', 'Generation']);
    for (const [row, shown] of CASES) {
        const name = row['VM name'];
        const m = byName(ALL, name);
        if (F.groupOf(m) === 'modern') continue;
        assert.match(html, new RegExp(`<tr><td><a href="#vm-${m.read.row}">${name}</a></td><td class="muted">[^<]*</td><td>[^<]*</td><td>${shown.replace('*', '\\*')}</td>`), `table row ${name}`);
        const card = new RegExp(`<section class="vm" id="vm-${m.read.row}">[\\s\\S]*?</header>\\s*<p class="meta">[^\\n]*</p>\\s*<p class="meta">Generation: ${shown.replace('*', '\\*')}`);
        assert.match(html, card, `card ${name}`);
    }
    // A card with 2* gives the note that says why; "Set by the service" too.
    const sku = byName(ALL, 'contoso-sku');
    assert.match(html, new RegExp(`<p class="meta">Generation: 2\\* <span class="muted">\\* The generation is empty\\. The image SKU '22_04-lts-gen2'`));
    assert.match(html, /<p class="meta">Generation: Set by the service <span class="muted">The generation is empty\. The service makes the new nodes/);
    assert.ok(sku);
    // The summary: one count for each value, always in the same order, and the hint.
    const sum = /<h3 class="label">Generation<\/h3><table><thead><tr><th scope="col">Generation<\/th><th scope="col">VMs<\/th><\/tr><\/thead><tbody>([\s\S]*?)<\/tbody><\/table>/.exec(html);
    assert.ok(sum, 'a Generation table in the summary');
    const rows = [...sum[1].matchAll(/<tr><td>([^<]*)<\/td><td>(\d+)<\/td><\/tr>/g)].map((m) => [m[1], Number(m[2])]);
    assert.deepEqual(rows, [['Generation 1', 3], ['Generation 2', 3], ['Generation 2*', 5], ['Not given', 3], ['Set by the service', 2]]);
    // The hint is under the summary count, and under each VM table that has such a value.
    const hint = `<p class="muted">${GENERATION_HINT.replace(/"/g, '&quot;')}</p>`;
    assert.ok(html.includes(`${sum[0]}${hint}`), 'the hint under the summary count');
    assert.ok(html.includes(`</tbody></table>${hint}`.replace('</tbody></table>', '\n    </tbody></table>')), 'the hint under a VM table');
});

test('generation: the summary count keeps its order for any order of the rows, and leaves out a value with no VM', () => {
    const counts = (p) => /<h3 class="label">Generation<\/h3>[\s\S]*?<tbody>([\s\S]*?)<\/tbody>/.exec(reportHtml(p, table, 'test', NOW))[1];
    const rows = CASES.map(([row]) => row);
    assert.equal(counts(run(list([...rows].reverse()))), counts(ALL));
    const few = counts(run(list([{ 'VM name': 'contoso-n1', 'Generation': '' }, { 'VM name': 'contoso-n2', 'Generation': 'V2' }])));
    assert.equal(few, '<tr><td>Generation 2</td><td>1</td></tr><tr><td>Not given</td><td>1</td></tr>');
    assert.deepEqual(GENERATION_GROUPS, ['Generation 1', 'Generation 2', 'Generation 2*', 'Not given', 'Set by the service']);
    // No 2* in the list: no hint about 2*.
    assert.ok(!reportHtml(run(list([{ 'VM name': 'contoso-n2', 'Generation': 'V2' }])), table, 'test', NOW).includes(GENERATION_HINT.replace(/"/g, '&quot;')));
});

test('generation: the sample shows each kind of value', () => {
    const p = run(sample);
    assert.equal(generationShown(byName(p, 'contoso-vmss01')).value, '2*');
    assert.equal(generationShown(byName(p, 'contoso-vmss01')).csv, 'Generation 2 (from the image SKU)');
    assert.equal(generationShown(byName(p, 'contoso-aks-np1')).value, 'Set by the service');
    assert.equal(generationShown(byName(p, 'contoso-dbx01')).value, '2');
});

// The value for a service that makes its own nodes is "Set by the service", so that
// it does not clash with "Not needed" in the 'Series result' column (owner, 2026-10-27).
test('generation: a service that makes its own nodes shows "Set by the service" on every surface, never "Not needed"', () => {
    for (const name of ['contoso-aks', 'contoso-dbx']) {
        const g = generationShown(byName(ALL, name));
        assert.deepEqual([g.value, g.group, g.csv, g.found], ['Set by the service', 'Set by the service', 'Set by the service', false], name);
    }
    assert.match(GENERATION_HINT, /"Set by the service" means that the service makes the new nodes from its own image\./);
    assert.ok(!/Not needed/.test(GENERATION_HINT));
    assert.ok(!GENERATION_GROUPS.includes('Not needed'));
    // The report: no generation value, count or card line says "Not needed".
    const html = reportHtml(ALL, table, 'test', NOW);
    assert.ok(!/Generation: Not needed|<td>Not needed<\/td>/.test(html));
    // The CSV files: the Generation column never says "Not needed".
    for (const rows of [F.summaryRows(ALL), F.targetRows(ALL, table, NOW), F.notCheckedRows(ALL, table, NOW)]) {
        for (const r of rows) assert.notEqual(r['Generation'], 'Not needed', r['VM name']);
    }
    // "Not needed" in the 'Series result' column keeps its own meaning.
    const aksRows = F.targetRows(ALL, table, NOW).filter((r) => r['VM name'] === 'contoso-aks');
    assert.ok(aksRows.length && aksRows.every((r) => r['Generation'] === 'Set by the service'));
    // README: the table of values.
    const readme = read('README.md');
    assert.match(readme, /\n {2}\| Set by the service \| A service \(AKS, Azure Red Hat OpenShift or Azure Databricks\) makes the new nodes/);
    assert.ok(!/\n {2}\| Not needed \| A service/.test(readme));
});

// The hint says what 2*, "Not given" and "Set by the service" mean. The page and the
// report show it only when a VM in the results has one of these values.
test('generation: the hint is needed only when a VM shows 2*, "Not given" or "Set by the service"', () => {
    for (const [row, shown] of CASES) {
        const one = run(list([row])).machines;
        assert.equal(generationHint(one), /^[12]$/.test(shown) ? '' : GENERATION_HINT, row['VM name']);
    }
    assert.equal(generationHint([]), '');
    assert.equal(generationHint(ALL.machines), GENERATION_HINT);
    // One such VM among VMs with 1 or 2 is enough, in any place in the list.
    const mixed = [{ 'VM name': 'contoso-a', 'Generation': 'V1' }, { 'VM name': 'contoso-b', 'Generation': 'V2' }, { 'VM name': 'contoso-c', 'Generation': '', 'Managed by': 'AKS', 'Resource type': 'Scale set' }];
    assert.equal(generationHint(run(list(mixed)).machines), GENERATION_HINT);
    assert.equal(generationHint(run(list([...mixed].reverse())).machines), GENERATION_HINT);
    // The report: the hint for a list that needs it, no hint for one that does not.
    const esc = (t) => t.replace(/"/g, '&quot;');
    for (const [row, shown] of CASES) {
        const html = reportHtml(run(list([row])), table, 'test', NOW);
        assert.equal(html.includes(esc(GENERATION_HINT)), !/^[12]$/.test(shown), `report ${row['VM name']}`);
    }
});

test('generation: the page shows the hint only when the results need it, and sets it again for each new list', () => {
    // Empty and hidden until a list needs it: no empty bullet.
    assert.match(read('index.html'), /<li id="generation-hint" hidden><\/li>/);
    const page = read('js/page.js');
    // Not set once at load, and not from the hint text: from the shared rule.
    assert.ok(!/^\$\('generation-hint'\)/m.test(page), 'the hint is not set at load');
    assert.ok(!/GENERATION_HINT/.test(page), 'the page uses the shared rule');
    // Each time the results show, from the VMs of this list.
    const body = /\nfunction showResults\(\) \{\n([\s\S]*?)\n\}\n/.exec(page)[1];
    assert.match(body, /^\s*const p = current\.plan;\n/);
    assert.match(body, /\n\s*const hint = generationHint\(p\.machines\);\n\s*\$\('generation-hint'\)\.textContent = hint;\n\s*\$\('generation-hint'\)\.hidden = !hint;\n/);
    // The report uses the same rule.
    assert.match(read('js/report.js'), /const genHint = \(ms\) => \(generationHint\(ms\) \? /);
});
