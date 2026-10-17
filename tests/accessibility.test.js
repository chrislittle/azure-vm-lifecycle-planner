// Accessibility checks that are cheap to run: colour contrast from the CSS tokens,
// a label for each control, table headers, and the language of each page.
// WCAG 2.2 AA. Run: node --test

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import sizes from '../data/sizes.js';
import sample from '../js/sample.js';
import { SizeTable } from '../js/lifecycle.js';
import { readList } from '../js/input.js';
import { plan, toMachine } from '../js/planner.js';
import { reportHtml } from '../js/report.js';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const NOW = new Date('2026-10-17T12:00:00Z');

// ---- Colour contrast ----

// The tokens of one CSS block: { name: '#rrggbb' }.
const tokens = (text) => Object.fromEntries([...text.matchAll(/--([\w-]+):\s*(#[0-9a-f]{6})\b/gi)].map((m) => [m[1], m[2].toLowerCase()]));
const luminance = (hex) => {
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
export const contrast = (a, b) => { const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

// The page's light tokens, and its dark tokens (the same in both dark blocks).
function pageThemes() {
    const css = read('style.css');
    const light = tokens(/:root\s*\{([^}]*)\}/.exec(css)[1]);
    const system = tokens(/:root:not\(\[data-theme="light"\]\)\s*\{([^}]*)\}/.exec(css)[1]);
    const chosen = tokens(/:root\[data-theme="dark"\]\s*\{([^}]*)\}/.exec(css)[1]);
    return { light, system, chosen };
}

// Text on its background, as style.css uses them: 4.5:1. [text, background, where].
const TEXT = [
    ['text', 'bg', 'the page'], ['text', 'panel', 'cards and the table'], ['text', 'code', 'the query'],
    ['text', 'row-hover', 'an open or hovered row'], ['text', 'fine-bg', 'the privacy note and the "results made" message'],
    ['text', 'check-bg', 'a note message'], ['text', 'problem-bg', 'a message that stops'],
    ['muted', 'bg', 'hints'], ['muted', 'panel', 'hints in a card, the size details'], ['muted', 'row-hover', 'the lines under a VM name, open row'],
    ['muted', 'none-bg', 'the "Not checked" pill'],
    ['accent', 'panel', 'links and the secondary buttons'], ['accent', 'bg', 'links'], ['accent', 'fine-bg', 'the link in the privacy note'],
    ['accent', 'none-bg', 'a note tag'], ['accent-text', 'accent', 'the primary buttons'],
    ['fine', 'fine-bg', 'the "ready" and "no move" pills'], ['fine', 'panel', 'a supported size in the table'], ['fine', 'row-hover', 'a supported size in an open row'],
    ['check', 'check-bg', 'the "do this first" and "vendor approval" pills, the capacity tag'],
    ['problem', 'problem-bg', 'the "no supported size" pill'], ['pool', 'pool-bg', 'the "service or pool" pill'],
];
// Parts of a control and of the focus ring on their background: 3:1.
const UI = [
    ['accent', 'panel', 'the focus ring and the selected count'], ['accent', 'bg', 'the focus ring'], ['accent', 'row-hover', 'the focus ring in an open row'],
    ['control', 'panel', 'the border of a text box or a menu'], ['control', 'bg', 'the border of the paste box'],
];

test('every text colour and its background have a contrast of 4.5:1 or more, in the light and the dark theme', () => {
    const themes = pageThemes();
    const bad = [];
    for (const [theme, t] of Object.entries(themes)) {
        for (const [fg, bg, where] of TEXT) {
            assert.ok(t[fg] && t[bg], `${theme}: --${fg} and --${bg} are set`);
            const r = contrast(t[fg], t[bg]);
            if (r < 4.5) bad.push(`${theme}: --${fg} on --${bg} (${where}) is ${r.toFixed(2)}:1`);
        }
    }
    assert.deepEqual(bad, []);
});

test('the focus ring and the borders of text boxes and menus have a contrast of 3:1 or more', () => {
    const bad = [];
    for (const [theme, t] of Object.entries(pageThemes())) {
        for (const [fg, bg, where] of UI) {
            assert.ok(t[fg] && t[bg], `${theme}: --${fg} and --${bg} are set`);
            const r = contrast(t[fg], t[bg]);
            if (r < 3) bad.push(`${theme}: --${fg} on --${bg} (${where}) is ${r.toFixed(2)}:1`);
        }
    }
    assert.deepEqual(bad, []);
    const css = read('style.css');
    assert.match(css, /select, input\[type=search\] \{[^}]*border: 1px solid var\(--control\)/);
    assert.match(css, /textarea \{[^}]*border: 1px solid var\(--control\)/);
});

test('the two dark blocks have the same tokens', () => {
    const { system, chosen } = pageThemes();
    assert.deepEqual(system, chosen);
});

test('the report: every text colour on its background has a contrast of 4.5:1 or more', () => {
    const html = reportHtml(planned(), new SizeTable(sizes.sizes), 'sample', NOW);
    const t = { ...tokens(/:root \{([^}]*)\}/.exec(html)[1]), white: '#ffffff' };
    const pairs = [['text', 'white'], ['text', 'bg'], ['muted', 'white'], ['muted', 'bg'], ['accent', 'white'],
        ['ok', 'ok-bg'], ['act', 'act-bg'], ['no', 'no-bg'], ['pool', 'pool-bg']];
    const bad = pairs.filter(([fg, bg]) => contrast(t[fg], t[bg]) < 4.5).map(([fg, bg]) => `--${fg} on --${bg}: ${contrast(t[fg], t[bg]).toFixed(2)}:1`);
    assert.deepEqual(bad, []);
});

test('the contrast check catches a colour that is too light', () => {
    assert.ok(contrast('#767676', '#ffffff') >= 4.5);
    assert.ok(contrast('#777777', '#ffffff') < 4.5);
    assert.equal(Math.round(contrast('#000000', '#ffffff')), 21);
});

// ---- The page ----

test('the page has a language, landmarks and headings in order', () => {
    const html = read('index.html');
    assert.match(html, /<html lang="en">/);
    for (const tag of ['header', 'main', 'footer']) assert.match(html, new RegExp(`<${tag}\\b`));
    const levels = [...html.matchAll(/<h([1-6])\b/g)].map((m) => Number(m[1]));
    assert.equal(levels[0], 1);
    for (let i = 1; i < levels.length; i++) assert.ok(levels[i] <= levels[i - 1] + 1, `heading h${levels[i]} after h${levels[i - 1]}`);
    // The details of a VM (in js/page.js) are under the h2 "Results": h3, then h4.
    const page = read('js/page.js');
    assert.match(page, /el\('h3', \{ class: 'sec'/);
    assert.match(page, /el\('h4', \{ class: o\.supported/);
    assert.doesNotMatch(page, /el\('h5'/);
});

test('every control on the page has a label', () => {
    const html = read('index.html');
    const ids = new Set([...html.matchAll(/<label[^>]*for="([^"]+)"/g)].map((m) => m[1]));
    // A control inside a <label> element has that label.
    const inLabel = new Set();
    for (const m of html.matchAll(/<label\b[^>]*>([\s\S]*?)<\/label>/g)) for (const c of m[1].matchAll(/<(?:input|select|textarea)\b[^>]*id="([^"]+)"/g)) inLabel.add(c[1]);
    const controls = [...html.matchAll(/<(input|select|textarea)\b([^>]*)>/g)];
    assert.ok(controls.length >= 6);
    for (const [, tag, attrs] of controls) {
        const id = /id="([^"]+)"/.exec(attrs)?.[1];
        assert.ok(id && (ids.has(id) || inLabel.has(id) || /aria-label="[^"]+"/.test(attrs)), `<${tag} ${attrs.trim()}> has a label`);
    }
    for (const [, attrs, text] of html.matchAll(/<button\b([^>]*)>([^<]*)<\/button>/g)) assert.ok(text.trim() || /aria-label="[^"]+"/.test(attrs), `button ${attrs} has a name`);
    // The query box scrolls, so it takes the focus: it has a name.
    assert.match(html, /<pre id="query" tabindex="0" aria-label="[^"]+"/);
});

test('the results table has column headers, and each VM row opens with a button that says if it is open', () => {
    const html = read('index.html');
    const head = /<table id="table">[\s\S]*?<thead>([\s\S]*?)<\/thead>/.exec(html)[1];
    const th = [...head.matchAll(/<th\b([^>]*)>/g)];
    assert.equal(th.length, 8);
    for (const [, attrs] of th) assert.match(attrs, /scope="col"/);
    const page = read('js/page.js');
    assert.match(page, /el\('th', \{ class: 'vm', scope: 'row' \}/);
    assert.match(page, /el\('button', \{ type: 'button', class: 'name', 'aria-expanded': 'false'/);
    assert.match(page, /button\.setAttribute\('aria-expanded', 'true'\)/);
    assert.match(page, /button\.setAttribute\('aria-controls', id\)/);
    // Every table on the page has column headers with a scope.
    for (const m of html.matchAll(/<thead>([\s\S]*?)<\/thead>/g)) for (const [, attrs] of m[1].matchAll(/<th\b([^>]*)>/g)) assert.match(attrs, /scope="col"/);
});

test('messages and counts are in live regions; the motion stops when the system asks', () => {
    const html = read('index.html');
    assert.match(html, /<div id="messages" role="status" aria-live="polite"/);
    assert.match(html, /<span id="shown" class="hint" role="status"/);
    assert.match(html, /<span id="download-status" class="status" role="status"/);
    assert.match(read('style.css'), /@media \(prefers-reduced-motion: reduce\) \{[^}]*transition: none/);
});

// ---- The report ----

function planned() {
    const table = new SizeTable(sizes.sizes);
    const list = readList(sample);
    return plan(list.rows.map((r, i) => toMachine(r, list.map, r.line ?? i + 2, table, NOW)), table, NOW);
}

test('the report has a language, headings in order, and a header for each table column', () => {
    const html = reportHtml(planned(), new SizeTable(sizes.sizes), 'sample', NOW);
    assert.match(html, /<html lang="en">/);
    assert.match(html, /<main>/);
    // The three summary tables are under h2 "Summary": each has an h3.
    assert.equal((html.match(/<h3 class="label">/g) || []).length, 3);
    const levels = [...html.matchAll(/<h([1-6])\b/g)].map((m) => Number(m[1]));
    assert.equal(levels[0], 1);
    for (let i = 1; i < levels.length; i++) assert.ok(levels[i] <= levels[i - 1] + 1, `heading h${levels[i]} after h${levels[i - 1]}`);
    const tables = [...html.matchAll(/<table\b[\s\S]*?<\/table>/g)].map((m) => m[0]);
    assert.ok(tables.length > 5);
    for (const t of tables) {
        assert.match(t, /<thead>/, 'each table has a header row');
        for (const [, attrs] of /<thead>([\s\S]*?)<\/thead>/.exec(t)[1].matchAll(/<th\b([^>]*)>/g)) assert.match(attrs, /scope="col"/);
        for (const [, attrs] of (/<tbody>([\s\S]*?)<\/tbody>/.exec(t)?.[1] || '').matchAll(/<th\b([^>]*)>/g)) assert.match(attrs, /scope="row"/);
    }
    // Printed, the links show where they go.
    assert.match(html, /@media print \{[^\n]*a\[href\^="http"\]::after \{ content: " \(" attr\(href\) "\)"/);
});
