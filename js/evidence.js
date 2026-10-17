// What the tool found, and the facts it found it from: the vendor and the sign of
// an appliance, the facts behind a workload type, and every fact as the list gives
// it. One source for the page, the files and the report.

import { patternFound } from './patterns.js?v=0.8.0-beta';
import { APPLIANCE_KINDS, PATTERNS } from './words.js?v=0.8.0-beta';

// The workload type of a VM and why: { pattern, name, kind, vendor, lead, evidence }.
// kind: the kind of appliance in words, or ''. vendor: the vendor of a storage or
// backup appliance from our list, or the publisher ID of a network virtual appliance
// as Azure gives it (the Microsoft list has no vendor names), or ''.
// lead: the type and the vendor in words. evidence: the facts, in words; '' for a
// standalone VM and for a type this tool cannot find.
export function workloadFound(m) {
    const f = patternFound(m.extra || {});
    const name = PATTERNS[f.pattern].name;
    const kind = f.kind ? APPLIANCE_KINDS[f.kind] : '';
    const s = f.sign;
    // A managed application: the publisher of its Marketplace purchase plan, when the list gives it.
    const plan = f.kind === 'managed-application' && m.extra.planPublisher ? m.extra : null;
    const vendor = f.kind === 'storage' ? s.vendor : f.kind === 'nva' ? s.publisher : plan ? plan.planPublisher : '';
    const lead = f.kind === 'storage' ? `${kind}: ${vendor}.`
        : f.kind === 'nva' ? `${kind}. The publisher ID is ${vendor}.`
        : f.kind === 'managed-application' ? (plan ? `${kind}. The publisher ID is ${vendor}.` : `${kind}. The list does not give the vendor.`)
        : `${name}.`;
    const words = [];
    if (s) {
        if (s.sign === 'image') words.push(`The image is ${s.publisher} / ${s.offer}.`);
        else if (s.sign === 'plan') words.push(`The Marketplace purchase plan is ${s.publisher} / ${s.offer}.`);
        else words.push(`The image is from the gallery of ${s.vendor}. The image ID is ${s.imageId}.`);
        if (f.kind === 'nva') words.push('This publisher and offer are on the network virtual appliance list of an Azure built-in policy.');
    }
    if (f.pattern === '') words.push(`The list does not give ${f.facts.map((x) => `"${x.column}"`).join(', ')}.`);
    else words.push(...f.facts.map((x) => `"${x.column}" is ${x.value}.`));
    if (f.kind === 'managed-application') words.push('The resource group of this VM belongs to a managed application.');
    if (plan) words.push(`The Marketplace purchase plan is ${plan.planPublisher} / ${plan.planProduct || NO_VALUE}.`);
    const evidence = f.pattern === '' ? '' : words.join(' ');
    // On the page: the reason for "Type not checked" too.
    const shown = f.pattern === 'E' && !words.length ? 'No fact in the list shows another workload type.' : words.join(' ');
    return { pattern: f.pattern, name, kind, vendor, lead, evidence, shown };
}

// The facts that the answer reads, in groups. "Disk controller" is not here: the
// tool takes the disk controller from the size, not from the list.
export const FACT_GROUPS = [
    ['Size and OS', ['Current size', 'Generation', 'OS', 'Hibernation']],
    ['Disks and network', ['Data-disk count', 'Unmanaged disks', 'Ephemeral OS disk', 'Shared disk', 'NIC count', 'Accelerated NICs', 'Primary NIC accelerated']],
    ['Security', ['Security type', 'Azure Disk Encryption', 'System-assigned identity']],
    ['Workload', ['Resource type', 'Instances', 'Scale set', 'Managed by', 'Azure Virtual Desktop', 'AVD host pool type', 'SQL Server', 'SQL availability group', 'SAP']],
    ['Image and Marketplace', ['Image publisher', 'Image offer', 'Image SKU', 'Image ID', 'Plan publisher', 'Plan product']],
    ['Location and IDs', ['VM name', 'Region', 'Zone', 'Availability set', 'Resource ID']],
];
export const NOT_IN_LIST = 'Not in the list';
export const NO_VALUE = 'No value';

// Each fact as the list gives it: [{ group, facts: [{ column, value, given }] }].
// given: false when the list has no such column or the cell is empty.
export function factsRead(m) {
    const src = m.source;
    if (!src) return [];
    return FACT_GROUPS.map(([group, columns]) => ({
        group,
        facts: columns.map((column) => {
            const i = src.map[column];
            if (i === undefined) return { column, value: NOT_IN_LIST, given: false };
            const v = String(src.row[i] ?? '').trim();
            return v ? { column, value: v, given: true } : { column, value: NO_VALUE, given: false };
        }),
    }));
}

// For a VM whose name is in the list more than once: what tells it apart. The
// resource group, else the subscription, else the region, else the row. same:
// every VM with this name, this one too.
export function whereWords(m, same) {
    same = same.filter((x) => x !== m);
    const r = m.read;
    if (r.resourceGroup && same.every((x) => (x.read.resourceGroup || '').toLowerCase() !== r.resourceGroup.toLowerCase())) return r.resourceGroup;
    if (r.subscriptionId && same.every((x) => x.read.subscriptionId !== r.subscriptionId)) return `Subscription ${r.subscriptionId}`;
    if (r.region && same.every((x) => x.read.region !== r.region)) return r.region;
    return `Row ${r.row} of the list`;
}

// The VMs with the same name, by name in lower case.
export function sameNames(machines) {
    const byName = new Map();
    for (const m of machines) {
        const k = m.read.name.toLowerCase();
        if (!byName.has(k)) byName.set(k, []);
        byName.get(k).push(m);
    }
    return byName;
}

// The appliances, by vendor, so that one list can go to each vendor:
// [{ vendor, kind, machines: [{ m, where }] }], sorted by vendor and kind. A
// managed application has no vendor in the list: those come last.
export function appliancesByVendor(machines) {
    const byName = sameNames(machines);
    const groups = new Map();
    for (const m of machines) {
        if (m.pattern !== 'G') continue;
        const w = workloadFound(m);
        const key = `${w.vendor}\n${w.kind}`;
        if (!groups.has(key)) groups.set(key, { vendor: w.vendor, kind: w.kind, machines: [] });
        const same = byName.get(m.read.name.toLowerCase());
        groups.get(key).machines.push({ m, where: same.length > 1 ? whereWords(m, same) : '' });
    }
    return [...groups.values()].sort((a, b) => (a.vendor === '') - (b.vendor === '') || a.vendor.localeCompare(b.vendor, 'en') || a.kind.localeCompare(b.kind, 'en'));
}
