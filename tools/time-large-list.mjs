// Times each step for a large made-up contoso list (tests/large-list.js):
// read, plan, the three CSV files, the about file, the report, the zip.
//   node tools/time-large-list.mjs [count ...] [--write <folder>]
// --write saves each list as contoso-large-<count>.csv, to try in the page.
// The files are made-up and large: do not commit them.

import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import sizes from '../data/sizes.js';
import { SizeTable } from '../js/lifecycle.js';
import { readList } from '../js/input.js';
import { plan, toMachine } from '../js/planner.js';
import * as F from '../js/files.js';
import { reportHtml } from '../js/report.js';
import { makeZip } from '../js/zip.js';
import { largeList } from '../tests/large-list.js';

const args = process.argv.slice(2);
const w = args.indexOf('--write');
const folder = w >= 0 ? args[w + 1] : null;
const counts = args.filter((a, i) => /^\d+$/.test(a) && (w < 0 || i !== w + 1)).map(Number);
const table = new SizeTable(sizes.sizes);
const now = new Date('2026-10-17T12:00:00Z');

for (const count of counts.length ? counts : [20000, 50000]) {
    const text = largeList(count);
    if (folder) writeFileSync(join(folder, `contoso-large-${count}.csv`), text);
    const times = [];
    const time = (label, fn) => { const t = performance.now(); const r = fn(); times.push([label, performance.now() - t]); return r; };
    const list = time('read the list', () => readList(text));
    const p = time('plan', () => plan(list.rows.map((r, i) => toMachine(r, list.map, r.line ?? i + 2, table, now)), table, now));
    const files = [
        { name: 'vm-summary.csv', text: time('vm-summary.csv', () => F.toCsv(F.SUMMARY_COLUMNS, F.summaryRows(p))) },
        { name: 'vm-target-sizes.csv', text: time('vm-target-sizes.csv', () => F.toCsv(F.TARGET_COLUMNS, F.targetRows(p, table, now))) },
        { name: 'vm-not-checked.csv', text: time('vm-not-checked.csv', () => F.toCsv(F.NOT_CHECKED_COLUMNS, F.notCheckedRows(p, table, now))) },
        { name: 'vm-lifecycle-report.html', text: time('report', () => reportHtml(p, table, 'large list', now)) },
        { name: 'about-these-results.txt', text: time('about file', () => F.aboutText(p, list, 'large list', now)) },
    ];
    const zip = time('zip', () => makeZip(files, now));
    console.log(`\n${count} VMs (${(text.length / 1e6).toFixed(1)} MB list, ${(zip.length / 1e6).toFixed(1)} MB zip)`);
    for (const f of files) console.log(`  ${f.name.padEnd(24)} ${(f.text.length / 1e6).toFixed(1)} MB`);
    for (const [label, ms] of times) console.log(`  ${label.padEnd(24)} ${(ms / 1000).toFixed(2)} s`);
    console.log(`  ${'total'.padEnd(24)} ${(times.reduce((n, [, ms]) => n + ms, 0) / 1000).toFixed(2)} s`);
}
