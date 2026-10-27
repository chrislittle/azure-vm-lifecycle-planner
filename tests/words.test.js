// Run: node --test
// The words a customer sees follow ASD-STE100 Simplified Technical English (PLAN.md,
// "Words for a customer"). This test collects every text that the page, the files
// and the report show for the sample lists (and every reason, with made-up facts),
// and checks the rules a computer can check: no contractions, no semicolons, a
// sentence length limit and a short list of words that STE does not approve.
// A person still reads each changed line: this test does not check meaning.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import sizes from '../data/sizes.js';
import capacity from '../data/capacity.js';
import sample from '../js/sample.js';
import { SizeTable } from '../js/lifecycle.js';
import { readList } from '../js/input.js';
import { plan, toMachine } from '../js/planner.js';
import { REASONS, reasonFor } from '../js/reasons.js';
import { COMPARE_CAPTION, COMPARE_HINT, NOT_IN_TABLE, sizeComparison, todo, whyLines } from '../js/details.js';
import { reportHtml } from '../js/report.js';
import * as W from '../js/words.js';
import * as F from '../js/files.js';
import { FACT_GROUPS, GENERATION_GROUPS, GENERATION_HINT, NO_VALUE, NOT_IN_LIST, workloadFound } from '../js/evidence.js';

const table = new SizeTable(sizes.sizes);
const NOW = new Date('2026-10-09T12:00:00Z');
const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');

// Lists that reach the notes and messages the samples do not reach.
const EXTRA_LISTS = [
    'VM name,Current size,Generation,OS,Security type,NIC count,Data-disk count,Image SKU,Managed by,Resource type\n'
    + 'contoso-x1,D4s_v3,V2,Plan 9,Shielded,two,1.5,,,\n'
    + 'contoso-x2,Standard_DS3_v2_Promo,,Linux,TrustedLaunch,1,0,,,\n'
    + 'contoso-x3,Standard_D4s_v3,,Linux,Standard,1,0,22_04-lts-gen2,,\n'
    + 'contoso-x4,Standard_D4s_v3,,Linux,Standard,1,0,,AKS,Scale set\n'
    + 'contoso-x5,Standard_D4s_v3,,Linux,Standard,1,0,,None,Scale set\n'
    + 'contoso-x6,Standard_D4s_v3,1,Linux,TrustedLaunch,1,0,,,\n'
    + ',,V2,Linux,,,,,,\n'
    + 'contoso-x7,not a size,V2,Linux,,,,,,\n'
    + 'contoso-x8,Standard_D2s_v3,V2,Linux,,4,40,,,\n'
    + 'contoso-x9,Standard_B2ms,V1,Windows,,1,0,,Microsoft.Batch,\n'
    + 'contoso-x10,Standard_D4s_v3,3,Linux,TrustedLaunch,1,0,,,\n'
    + 'contoso-x11,Standard_D4s_v3,3,Linux,Standard,1,0,22_04-lts-gen2,,\n',
    'VM name,Machine name,Current size,Generation\ncontoso-d1,contoso-d2,Standard_D2s_v3,V2\n',
    '',
];

// Each text a customer can see, once: { text, where }.
function collect() {
    const texts = new Map();
    const add = (where, ...items) => {
        for (const t of items.flat(Infinity)) {
            const s = String(t ?? '').replace(/\s+/g, ' ').trim();
            // A list of VM names (the report lists the VMs that stay) is data, not words.
            if (s && !/^(contoso-[\w-]+,? ?)+$/.test(s) && !texts.has(s)) texts.set(s, where);
        }
    };
    const lists = [...readdirSync(new URL('../samples/', import.meta.url)).map((f) => [f, read(`samples/${f}`)]), ...EXTRA_LISTS.map((t, i) => [`extra list ${i + 1}`, t])];
    for (const [name, text] of lists) {
        const list = readList(text);
        add(`${name}: list messages`, list.stops, list.notes);
        if (list.stops.length) continue;
        const p = plan(list.rows.map((r, i) => toMachine(r, list.map, i + 2, table, NOW)), table, NOW);
        for (const r of F.summaryRows(p)) {
            add(`${name}: vm-summary.csv`, ['Generation', 'Current stage', 'Move needed', 'Result group', 'Workload type', 'Workload type advice', 'v5', 'v6', 'v7', 'Burstable', 'Needs review', 'Evidence'].map((c) => r[c]));
            // Lists joined with "; " or ", ": each item is one text.
            for (const c of ['Before the move', 'Good to know', 'Notes']) add(`${name}: vm-summary.csv ${c}`, r[c].split('; '));
            add(`${name}: vm-summary.csv To check`, r['To check'].split(', '));
        }
        for (const r of F.targetRows(p, table, NOW)) {
            const skip = new Set(['VM name', 'Region', 'Subscription ID', 'Resource group', 'Resource ID', 'Current size', 'Target size', 'Ranked sizes', 'Notes']);
            add(`${name}: vm-target-sizes.csv`, F.TARGET_COLUMNS.filter((c) => !skip.has(c)).map((c) => r[c]));
            add(`${name}: vm-target-sizes.csv Ranked sizes`, String(r['Ranked sizes'] ?? '').split('; ').map((x) => x.replace(/^\d+\. \S+ \((.*)\)$/, '$1')));
        }
        for (const r of F.notCheckedRows(p, table, NOW)) add(`${name}: vm-not-checked.csv`, r['Generation'], r['What'], r['Why']);
        for (const m of p.machines) {
            const g = F.groupOf(m);
            const t = todo(m, g);
            add(`${name}: what to do`, t.main, t.more, whyLines(m, g, table, NOW), m.notes);
            if (m.vm) add(`${name}: sizes`, m.rows.map((r) => [W.moveWords(r.series, r.option.rebuild, Boolean(m.vm.os)), F.rankedFor(m, r, table, NOW).map((x) => x.why)]));
            // The current size beside each new size: the labels and each note.
            const c = sizeComparison(m, table);
            if (c) add(`${name}: size table`, c.rows.map((r) => [r.label, r.cells.map((x) => x.less)]));
        }
        add(`${name}: about-these-results.txt`, F.aboutText(p, list, name, NOW).split('\r\n')
            .filter((l) => !/ <- '/.test(l)).map((l) => l.replace(/^\s*[\w.-]+\.(csv|html|txt)\s{2,}/, '')));
        add(`${name}: report`, htmlText(reportHtml(p, table, name, NOW)));
    }
    // Every reason, with made-up facts, so that a reason the samples do not reach is checked too.
    const vm = { sourceSize: 'Standard_D4s_v3' };
    for (const suggestion of [{ name: 'Standard_D8ds_v6', max: 16 }, null]) {
        const ctx = { vm, series: 'v6', table, now: NOW, option: { targetSize: 'Standard_D4ds_v6' }, stage: { stage: 'End of Life', retiresUtc: '2028-05-01' },
            problem: { securityWords: 'Trusted launch' }, facts: { processor: 'Arm64', family: 'D', vcpus: 4, memoryGB: 16, required: 3, suggestion, sizes: [] } };
        for (const code of Object.keys(REASONS)) add(`reasons.js: ${code}`, reasonFor(code, ctx));
    }
    // Every evidence text, with made-up facts for each kind, so that a text the samples
    // do not reach (a plan, a gallery, a managed application with a plan) is checked too.
    const known = { managedBy: 'None', scaleSet: false, sqlServer: false, sharedDisk: false, sap: false, virtualDesktop: false, imagePublisher: 'Canonical', imageOffer: 'ubuntu' };
    for (const extra of [
        known, { ...known, managedBy: null }, { ...known, virtualDesktop: true }, { ...known, virtualDesktop: true, hostPoolType: 'Personal' },
        { ...known, imagePublisher: 'paloaltonetworks', imageOffer: 'vmseries-flex' }, { ...known, imagePublisher: '', planPublisher: 'fortinet', planProduct: 'fortinet_fortigate-vm_v5' },
        { ...known, imagePublisher: 'cohesity', imageOffer: 'cohesity-cloudtd-tool' }, { ...known, imagePublisher: '', planPublisher: 'rubrik-inc', planProduct: 'rubrik-cloud-data-management' },
        { ...known, imagePublisher: '', imageId: '/communityGalleries/WekaIO-00000000-0000-0000-0000-000000000000/images/weka/versions/1.0.0' },
        { ...known, managedBy: 'Managed application' }, { ...known, managedBy: 'Managed application', planPublisher: 'contosoisv', planProduct: 'contoso-app' },
        { ...known, managedBy: 'Managed application', planPublisher: 'contosoisv' },
        { ...known, managedBy: 'Managed application', appName: 'contoso-app', appPlanPublisher: 'contosoisv', appPlanProduct: 'contoso-app' }, { ...known, managedBy: 'Managed application', appName: 'contoso-app' },
        { ...known, managedBy: 'AKS' }, { ...known, managedBy: 'ARO' }, { ...known, resourceType: 'Scale set' }, { ...known, scaleSet: true },
        { ...known, virtualDesktop: true, hostPoolType: 'Pooled' }, { ...known, managedBy: 'Databricks' },
        { ...known, sqlServer: 'Enterprise', imagePublisher: 'MicrosoftSQLServer', sqlGroup: true, sharedDisk: true, sap: true },
    ]) {
        const w = workloadFound({ extra, read: { name: 'contoso-x' } });
        add(`evidence.js: ${w.name}`, w.lead, w.shown, w.evidence, w.kind ? `${w.kind}. ${w.evidence}` : '');
    }
    add('evidence.js', NOT_IN_LIST, NO_VALUE, FACT_GROUPS.map(([group]) => group), GENERATION_GROUPS, GENERATION_HINT);
    add('details.js', COMPARE_CAPTION, COMPARE_HINT, NOT_IN_TABLE);
    // Each note of the size table, with made-up facts: a VM with more NICs, data disks and an older generation than a small new size.
    {
        const m = plan([toMachine(['contoso-z', 'Standard_D4s_v3', 'V1', 'Linux', '3', '9'], { 'VM name': 0, 'Current size': 1, 'Generation': 2, 'OS': 3, 'NIC count': 4, 'Data-disk count': 5 }, 2, table, NOW)], table, NOW).machines[0];
        for (const size of ['Standard_D2s_v5', 'Standard_A4_v2', 'Standard_D4s_v6']) add('details.js: size table', sizeComparison({ ...m, rows: [{ series: 'v5', option: { supported: true, targetSize: size } }] }, table).rows.map((r) => r.cells.map((x) => x.less)));
    }
    // The words in words.js.
    add('words.js', Object.values(W.GROUPS).map((g) => [g.short, g.long]), Object.values(W.PATTERNS).map((p) => [p.name, p.advice]), W.NOT_FOUND, W.PROCESSOR_NOTE,
        W.capacityWords(capacity), ['closest', 'processor', 'temp-disk-removed', 'temp-disk-added', 'more-memory', 'same-shape', 'other-shape'].map((w) => W.rankWords(w, 'AMD')),
        ['v5', 'v6', 'burstable'].flatMap((s) => [true, false].flatMap((rb) => [true, false].map((os) => W.moveWords(s, rb, os)))),
        ['Current', 'Extended', 'Current or Extended', 'End of Life', 'Retired', null].flatMap((stage) => [null, '2028-05-01', '2025-09-30'].flatMap((d) => [null, capacity].flatMap((c) => [null, NOW].map((now) => W.stageWords({ stage, retiresUtc: d }, c, now))))),
        W.capacityWords(capacity, NOW));
    // The page: index.html, and the texts in js/page.js.
    add('index.html', htmlText(read('index.html').replace(/<head>[\s\S]*?<\/head>/, '').replace(/<pre[\s\S]*?<\/pre>/g, '')));
    add('js/page.js', pageStrings(read('js/page.js')));
    return texts;
}

// The text of an HTML page, one item for each block. Inline tags (bold, links) stay
// inside the sentence. No styles, no tags.
function htmlText(html) {
    return html.replace(/<style[\s\S]*?<\/style>/gi, '').replace(/<code>[\s\S]*?<\/code>/gi, 'CODE')
        .split(/<\/?(?:p|li|ul|ol|div|h\d|td|th|tr|table|thead|tbody|section|header|footer|main|label|option|select|button|br|title|textarea|input|dl|dt|dd|details|summary)\b[^>]*>/i)
        .map((t) => t.replace(/<\/?span\b[^>]*>/gi, ' ').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#9;/g, ' ').replace(/&amp;/g, '&'));
}

// The strings in js/page.js that are words for a customer: they start with a capital
// letter and have a space. A ${...} part counts as one word.
function pageStrings(code) {
    const out = [];
    for (const [, a, b] of code.matchAll(/'((?:[^'\\\n]|\\.)*)'|`((?:[^`\\]|\\.)*)`/g)) {
        out.push((a !== undefined ? a : b.replace(/\$\{[^{}]*\}/g, 'X').replace(/\$\{.*$/s, 'X')).replace(/\\(.)/g, '$1'));
    }
    return out.filter((s) => /^[A-Z][a-z]/.test(s) && /\s/.test(s));
}

// ---- The rules ----

// STE rule 5.1 (procedure) and 6.1 (descriptive writing): at most 20 words in a
// sentence that gives an instruction, at most 25 in any other sentence.
const PROCEDURAL_LIMIT = 20;
const DESCRIPTIVE_LIMIT = 25;
// An instruction starts with a verb in the imperative.
const IMPERATIVE = /^(Add|Ask|Change|Check|Confirm|Convert|Copy|Correct|Deploy|Do|Give|Keep|Load|Look|Make|Move|Open|Paste|Plan|Press|Rebuild|Record|Remove|Resize|Run|See|Select|Tell|Test|Try|Turn|Type|Update|Use|Wait|First|Then|Also)\b/;
// Words that STE does not approve, which this tool has used or can easily use.
// The Microsoft term "hard gate" is allowed in quotes, where the text names it as
// Microsoft's term.
const NOT_APPROVED = [
    [/\bgates?\b/i, 'gate (not an STE word: say what to do)'],
    [/\butili[sz]e/i, 'utilize (use "use")'], [/\bleverag/i, 'leverage (use "use")'], [/\bensure/i, 'ensure (use "make sure")'],
    [/\bvia\b/i, 'via (use "through" or "with")'], [/\be\.g\./i, 'e.g. (use "for example")'], [/\bi\.e\./i, 'i.e. (use "that is")'],
    [/\betc\b/i, 'etc (give the full list)'], [/\bplease\b/i, 'please'], [/\bin order to\b/i, 'in order to (use "to")'],
    [/\bprior to\b/i, 'prior to (use "before")'], [/\bsimply\b/i, 'simply'], [/\bobviously\b/i, 'obviously'],
];
const CONTRACTION = /\b(?:\w+n['’]t|(?:it|that|there|what|here|who|where|let|he|she|you|we|they|i)['’](?:s|re|ve|ll|d|m)|\w+['’](?:re|ve|ll))\b/i;

// The sentences of a text. A sentence ends with . ! or ? before a space and a capital
// letter (or a quote or a bracket), or at the end of the text.
const sentences = (text) => text.split(/(?<=[.!?])\s+(?=["'(]?[A-Z0-9])/);
// The words of a sentence: each item with a letter or a number in it. A size name,
// a number and an abbreviation are each one word, as in STE.
const words = (sentence) => sentence.split(/\s+/).filter((w) => /[A-Za-z0-9]/.test(w));

const texts = collect();

test('the STE check reads the texts of the page, the files and the report', () => {
    const where = [...new Set([...texts.values()].map((w) => w.replace(/^[^:]+: /, '')))];
    for (const w of ['vm-summary.csv', 'vm-target-sizes.csv', 'vm-not-checked.csv', 'about-these-results.txt', 'report', 'what to do', 'list messages']) {
        assert.ok(where.includes(w), `no texts from ${w}`);
    }
    assert.ok([...texts.values()].some((w) => w === 'index.html') && [...texts.values()].some((w) => w === 'js/page.js'));
    assert.ok(texts.size > 400, `${texts.size} texts`);
    assert.ok([...texts.keys()].includes(W.GROUPS.first.long));
    assert.ok([...texts.keys()].includes(reasonFor('disk-encryption-present', {})));
});

test('no contractions in the words a customer sees', () => {
    const bad = [...texts].filter(([t]) => CONTRACTION.test(t)).map(([t, w]) => `${w}: ${t}`);
    assert.deepEqual(bad, []);
});

test('no semicolons in the words a customer sees', () => {
    const bad = [...texts].filter(([t]) => t.includes(';')).map(([t, w]) => `${w}: ${t}`);
    assert.deepEqual(bad, []);
});

test('no sentence is longer than STE allows (20 words in an instruction, 25 in other text)', () => {
    const bad = [];
    for (const [t, w] of texts) {
        for (const s of sentences(t)) {
            const n = words(s).length;
            const limit = IMPERATIVE.test(s) ? PROCEDURAL_LIMIT : DESCRIPTIVE_LIMIT;
            if (n > limit) bad.push(`${w}: ${n} words (limit ${limit}): ${s}`);
        }
    }
    assert.deepEqual(bad, []);
});

test('no words that STE does not approve', () => {
    const bad = [];
    for (const [t, w] of texts) {
        const text = t.replace(/"hard gates?"/g, '');
        for (const [re, why] of NOT_APPROVED) if (re.test(text)) bad.push(`${w}: ${why}: ${t}`);
    }
    assert.deepEqual(bad, []);
});

test('the STE rules catch what they must', () => {
    assert.ok(CONTRACTION.test("This VM can't move.") && CONTRACTION.test("It's ready.") && !CONTRACTION.test("Microsoft's guide"));
    assert.equal(sentences('One two. Three four. The size Standard_D4s_v3 is v3.').length, 3);
    assert.equal(words('Resize to Standard_D4ds_v5 - then (1) check it.').length, 7);
    assert.ok(IMPERATIVE.test('Resize the VM.') && !IMPERATIVE.test('The VM moves.'));
    assert.ok(NOT_APPROVED.some(([re]) => re.test('This is a gate.')));
});
