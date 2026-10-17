// Large lists: the time, and the same answer in any order.
// Run: node --test

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import sizes from '../data/sizes.js';
import { SizeTable } from '../js/lifecycle.js';
import { readList, parseTable } from '../js/input.js';
import { plan, toMachine } from '../js/planner.js';
import * as F from '../js/files.js';
import { reportHtml } from '../js/report.js';
import { largeList } from './large-list.js';

const NOW = new Date('2026-10-17T12:00:00Z');
const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

function run(text, table = new SizeTable(sizes.sizes)) {
    const list = readList(text);
    const machines = list.rows.map((r, i) => toMachine(r, list.map, r.line ?? i + 2, table, NOW));
    return { list, table, plan: plan(machines, table, NOW) };
}

function files(r, name = 'list') {
    return {
        summary: F.toCsv(F.SUMMARY_COLUMNS, F.summaryRows(r.plan)),
        targets: F.toCsv(F.TARGET_COLUMNS, F.targetRows(r.plan, r.table, NOW)),
        notChecked: F.toCsv(F.NOT_CHECKED_COLUMNS, F.notCheckedRows(r.plan, r.table, NOW)),
        report: reportHtml(r.plan, r.table, name, NOW),
        about: F.aboutText(r.plan, r.list, name, NOW),
    };
}

// The rows of a list in another order (a fixed order: the same every run).
function shuffled(text, seed) {
    const rows = text.replace(/\r\n$/, '').split('\r\n');
    const body = rows.slice(1);
    let a = seed;
    for (let i = body.length - 1; i > 0; i--) {
        a = (a * 1103515245 + 12345) % 2147483648;
        const j = a % (i + 1);
        [body[i], body[j]] = [body[j], body[i]];
    }
    return [rows[0], ...body].join('\r\n') + '\r\n';
}

// Each file row by its resource ID, without the columns that only give the row's place.
function byResourceId(csv) {
    const rows = parseTable(csv.replace(/^﻿/, ''));
    const head = rows[0];
    const id = head.indexOf('Resource ID');
    const out = new Map();
    for (const r of rows.slice(1)) {
        const key = r[id];
        if (!out.has(key)) out.set(key, []);
        out.get(key).push(r.join('\u0001'));
    }
    return out;
}

test('a list of 20,000 VMs reads, plans and makes every file in a sane time, the same twice', () => {
    const text = largeList(20000);
    const start = performance.now();
    const first = run(text);
    const a = files(first);
    const seconds = (performance.now() - start) / 1000;
    assert.equal(first.plan.machines.length, 20000);
    // About 3 seconds on a laptop (2026-10-17). The limit is generous, so that a slow
    // build machine does not fail; a return to the old speed (more than 10 seconds
    // to plan alone), or a step that grows with the square of the list, fails it.
    assert.ok(seconds < 30, `20,000 VMs took ${seconds.toFixed(1)} seconds`);
    const b = files(run(text));
    for (const k of Object.keys(a)) assert.equal(a[k], b[k], `${k} is the same twice`);
});

test('the same VMs in another order give the same result for each resource ID', () => {
    const text = largeList(3000, 5);
    const a = files(run(text));
    const b = files(run(shuffled(text, 11)));
    for (const k of ['summary', 'targets', 'notChecked']) {
        const x = byResourceId(a[k]);
        const y = byResourceId(b[k]);
        assert.equal(x.size, y.size, k);
        for (const [id, rows] of x) assert.deepEqual([...y.get(id)].sort(), [...rows].sort(), `${k}: ${id}`);
    }
    // The counts in the report and the about file do not depend on the order either.
    const counts = (t) => t.split('\r\n').filter((l) => /^ {2}[^ ].*: \d+(\.|$)/.test(l)).join('\n');
    assert.ok(counts(a.about).split('\n').length >= 7, 'the about file has the counts');
    assert.equal(counts(a.about), counts(b.about));
});

test('the sample lists give the same files with a new size table and with one that a large list used first', () => {
    const used = new SizeTable(sizes.sizes);
    run(largeList(2000, 3), used);
    for (const f of ['samples/contoso-from-azure.csv', 'samples/contoso-every-series.csv', 'samples/contoso-by-hand.csv']) {
        const fresh = files(run(read(f)), f);
        const again = files(run(read(f), used), f);
        for (const k of Object.keys(fresh)) assert.equal(again[k], fresh[k], `${f}: ${k}`);
    }
});

test('the facts that are read once and kept give the same answer as a new read', async () => {
    const { targetSize, sizeFamily, sizeProcessor } = await import('../js/lifecycle.js');
    const { isApplianceImage } = await import('../js/extras.js');
    const table = new SizeTable(sizes.sizes);
    // The L family has v5 sizes, but no v6 or v7 size: the families are kept for each question.
    assert.equal(targetSize({ sourceSize: 'Standard_L3s_v3', table, targetGeneration: 'v6' }).code, 'family-not-in-region');
    assert.equal(targetSize({ sourceSize: 'Standard_L3s_v3', table, targetGeneration: 'v5' }).code, 'not-in-region');
    assert.equal(targetSize({ sourceSize: 'Standard_L3s_v3', table, targetGeneration: 'v7' }).code, 'family-not-in-region');
    // A size name in any case: the family in capitals, the same processor.
    assert.equal(sizeFamily('standard_d2as_v5'), 'D');
    assert.equal(sizeFamily('Standard_D2as_v5'), 'D');
    assert.equal(sizeProcessor('Standard_D2as_v5'), 'AMD');
    assert.equal(sizeProcessor('Standard_D2s_v5'), 'Intel');
    // An appliance image is kept by its publisher AND its offer.
    assert.equal(isApplianceImage('arista-networks', 'a10-vthunder-x'), true);
    assert.equal(isApplianceImage('arista-networks', 'contoso-app'), false);
    assert.equal(isApplianceImage('contoso', 'a10-vthunder-x'), false);
});

test('the large list has what a real list has: the same name in many places, scale sets, appliances, empty values', () => {
    const { plan: p } = run(largeList(5000));
    const names = new Map();
    for (const m of p.machines) names.set(m.read.name, (names.get(m.read.name) || 0) + 1);
    assert.ok([...names.values()].some((n) => n > 1), 'names in the list more than once');
    assert.equal(new Set(p.machines.map((m) => m.read.resourceId)).size, 5000, 'each VM has its own resource ID');
    assert.ok(new Set(p.machines.map((m) => m.read.subscriptionId)).size > 20);
    assert.ok(new Set(p.machines.map((m) => m.read.region)).size > 10);
    const groups = new Set(p.machines.map((m) => F.groupOf(m)));
    for (const g of ['modern', 'ready', 'first', 'pool', 'gate', 'nopath', 'unchecked']) assert.ok(groups.has(g), `group ${g}`);
    assert.ok(p.machines.some((m) => m.read.resourceType === 'Scale set' && m.extra.managedBy === 'AKS'), 'AKS node pools');
    assert.ok(p.machines.some((m) => m.problems.some((x) => x.why === 'generation-missing') && /^contoso-vm/.test(m.read.name)), 'an empty generation');
    assert.ok(p.machines.some((m) => m.notes.some((n) => n.includes("'two' is not a number"))), 'a NIC count that is not a number');
    assert.ok(p.machines.some((m) => m.read.size === 'Standard_Q4z_v9' && m.moveRequired === 'Review'), 'a size that this tool does not know');
});
