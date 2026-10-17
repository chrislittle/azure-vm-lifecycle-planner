// A large made-up contoso VM list, for the speed tests and tools/time-large-list.mjs.
// It is made from the rows of the sample lists, so it has every kind of VM: many
// regions, subscriptions and resource groups, the same VM name in more than one
// place, scale sets, AKS node pools, appliances, and empty or odd values. The same
// count and seed always give the same list. No file of it is kept in the repo.

import { readFileSync } from 'node:fs';
import { parseTable, COLUMNS } from '../js/input.js';

const HEADER = COLUMNS.map((c) => c.name);
const REGIONS = ['eastus', 'eastus2', 'westus2', 'westus3', 'centralus', 'northeurope', 'westeurope', 'uksouth', 'swedencentral', 'japaneast', 'australiaeast', 'southeastasia'];

// A small, fixed random number source (mulberry32): the same seed, the same list.
function random(seed) {
    let a = seed >>> 0;
    return () => {
        a = (a + 0x6d2b79f5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

// The sample rows as objects by column name. The list with every series has no
// pattern columns: those rows give "Type not checked", as a hand-made list does.
function templates() {
    const out = [];
    for (const f of ['contoso-from-azure.csv', 'contoso-every-series.csv']) {
        const rows = parseTable(readFileSync(new URL(`../samples/${f}`, import.meta.url), 'utf8'));
        const head = rows[0];
        for (const r of rows.slice(1)) out.push(Object.fromEntries(head.map((h, i) => [h, r[i] ?? ''])));
    }
    return out;
}

const csvCell = (v) => (/[",\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);

// count rows -> the CSV text, as the query writes it.
export function largeList(count, seed = 1) {
    const rnd = random(seed);
    const pick = (list) => list[Math.floor(rnd() * list.length)];
    const base = templates();
    const names = [];
    const lines = [HEADER.join(',')];
    for (let i = 0; i < count; i++) {
        const t = { ...pick(base) };
        // About one VM in seven has a name that an earlier VM has: another subscription,
        // resource group or region, so another resource ID.
        const name = names.length && rnd() < 0.15 ? pick(names) : `contoso-vm${String(i).padStart(6, '0')}`;
        names.push(name);
        const sub = `00000000-0000-0000-0000-${String(Math.floor(rnd() * 40)).padStart(12, '0')}`;
        const group = `rg-contoso-${String(Math.floor(rnd() * 300)).padStart(3, '0')}`;
        t['VM name'] = name;
        t['Region'] = pick(REGIONS);
        const set = t['Resource type'] === 'Scale set';
        t['Resource ID'] = `/subscriptions/${sub}/resourceGroups/${group}/providers/Microsoft.Compute/${set ? 'virtualMachineScaleSets' : 'virtualMachines'}/${name}-${i}`;
        // Empty and odd values, as in real lists.
        const x = rnd();
        if (x < 0.02) t['Generation'] = '';
        else if (x < 0.03) t['OS'] = '';
        else if (x < 0.035) t['Current size'] = 'Standard_Q4z_v9';
        else if (x < 0.04) t['NIC count'] = 'two';
        lines.push(HEADER.map((h) => csvCell(String(t[h] ?? ''))).join(','));
    }
    return lines.join('\r\n') + '\r\n';
}
