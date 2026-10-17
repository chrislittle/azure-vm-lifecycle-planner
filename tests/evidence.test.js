// Run: node --test
// The vendor and the evidence behind a workload type (js/evidence.js), "Facts from
// your list", the Vendor and Evidence columns, and the report's "Appliances by vendor".

import { test } from 'node:test';
import assert from 'node:assert/strict';
import sizes from '../data/sizes.js';
import sample from '../js/sample.js';
import { SizeTable } from '../js/lifecycle.js';
import { COLUMNS, readList } from '../js/input.js';
import { plan, toMachine } from '../js/planner.js';
import { patternFound } from '../js/patterns.js';
import { FACT_GROUPS, NO_VALUE, NOT_IN_LIST, appliancesByVendor, factsRead, workloadFound } from '../js/evidence.js';
import { reportHtml } from '../js/report.js';
import * as F from '../js/files.js';

const table = new SizeTable(sizes.sizes);
const NOW = new Date('2026-10-17T12:00:00Z');

function run(text) {
    const list = readList(text);
    return plan(list.rows.map((r, i) => toMachine(r, list.map, i + 2, table, NOW)), table, NOW);
}
const byName = (p, name) => p.machines.find((m) => m.read.name === name);

// A list from rows of facts: every row has every column; a fact that a row does not
// give is the value of a standalone VM (all facts known, none special).
const HEAD = ['VM name', 'Region', 'Current size', 'Generation', 'OS', 'Image publisher', 'Image offer', 'Scale set', 'Azure Virtual Desktop', 'SAP',
    'Resource type', 'Managed by', 'AVD host pool type', 'SQL Server', 'SQL availability group', 'Shared disk', 'Image ID', 'Plan publisher', 'Plan product', 'Resource ID'];
const STANDALONE = { 'Region': 'eastus2', 'Current size': 'Standard_D4s_v3', 'Generation': 'V2', 'OS': 'Linux', 'Image publisher': 'Canonical', 'Image offer': 'ubuntu-24_04-lts',
    'Scale set': 'No', 'Azure Virtual Desktop': 'No', 'SAP': 'No', 'Resource type': 'VM', 'Managed by': 'None', 'SQL Server': 'No', 'SQL availability group': 'No', 'Shared disk': 'No' };
const rid = (rg, name) => `/subscriptions/00000000-0000-0000-0000-000000000000/resourceGroups/${rg}/providers/Microsoft.Compute/virtualMachines/${name}`;
function list(rows) {
    return [HEAD.join(','), ...rows.map((r) => HEAD.map((h) => (h in r ? r[h] : STANDALONE[h] ?? '')).join(','))].join('\n') + '\n';
}
const KINDS = list([
    { 'VM name': 'contoso-e1' },
    { 'VM name': 'contoso-net1', 'Image publisher': 'paloaltonetworks', 'Image offer': 'vmseries-flex' },
    { 'VM name': 'contoso-net2', 'Image publisher': '', 'Image offer': '', 'Plan publisher': 'fortinet', 'Plan product': 'fortinet_fortigate-vm_v5' },
    { 'VM name': 'contoso-stg1', 'Image publisher': 'cohesity', 'Image offer': 'cohesity-cloudtd-tool' },
    { 'VM name': 'contoso-stg2', 'Image publisher': '', 'Image offer': '', 'Plan publisher': 'rubrik-inc', 'Plan product': 'rubrik-cloud-data-management' },
    { 'VM name': 'contoso-stg3', 'Image publisher': '', 'Image offer': '', 'Image ID': '/communityGalleries/WekaIO-00000000-0000-0000-0000-000000000000/images/weka/versions/1.0.0' },
    { 'VM name': 'contoso-ma1', 'Managed by': 'Managed application' },
    { 'VM name': 'contoso-ma2', 'Managed by': 'Managed application', 'Plan publisher': 'contosoisv', 'Plan product': 'contoso-app' },
    { 'VM name': 'contoso-aks1', 'Managed by': 'AKS', 'Resource type': 'Scale set' },
    { 'VM name': 'contoso-aro1', 'Managed by': 'ARO' },
    { 'VM name': 'contoso-ss1', 'Resource type': 'Scale set' },
    { 'VM name': 'contoso-ss2', 'Scale set': 'Yes' },
    { 'VM name': 'contoso-avd1', 'Azure Virtual Desktop': 'Yes', 'AVD host pool type': 'Pooled' },
    { 'VM name': 'contoso-avd2', 'Azure Virtual Desktop': 'Yes', 'AVD host pool type': 'Personal' },
    { 'VM name': 'contoso-avd3', 'Azure Virtual Desktop': 'Yes' },
    { 'VM name': 'contoso-dbx1', 'Managed by': 'Databricks' },
    { 'VM name': 'contoso-sql1', 'SQL Server': 'Enterprise', 'SQL availability group': 'Yes' },
    { 'VM name': 'contoso-sql2', 'Image publisher': 'MicrosoftSQLServer', 'Image offer': 'sql2022-ws2022' },
    { 'VM name': 'contoso-fc1', 'Shared disk': 'Yes' },
    { 'VM name': 'contoso-sap1', 'SAP': 'Yes' },
    { 'VM name': 'contoso-u1', 'SAP': '', 'Shared disk': '' },
]);

test('evidence: a storage or backup appliance names the vendor and the sign: the image, the plan or the gallery', () => {
    const p = run(KINDS);
    const w = (n) => workloadFound(byName(p, n));
    assert.deepEqual(pick(w('contoso-stg1')), { pattern: 'G', kind: 'Storage or backup appliance', vendor: 'Cohesity DataPlatform Cloud Edition',
        lead: 'Storage or backup appliance: Cohesity DataPlatform Cloud Edition.', evidence: 'The image is cohesity / cohesity-cloudtd-tool.' });
    assert.equal(w('contoso-stg2').vendor, 'Rubrik');
    assert.equal(w('contoso-stg2').evidence, 'The Marketplace purchase plan is rubrik-inc / rubrik-cloud-data-management.');
    assert.equal(w('contoso-stg3').vendor, 'WEKA');
    assert.equal(w('contoso-stg3').evidence, 'The image is from the gallery of WEKA. The image ID is /communityGalleries/WekaIO-00000000-0000-0000-0000-000000000000/images/weka/versions/1.0.0.');
});

test('evidence: a network virtual appliance gives the publisher ID as Azure gives it, by the image or the plan', () => {
    const p = run(KINDS);
    const a = workloadFound(byName(p, 'contoso-net1'));
    assert.deepEqual(pick(a), { pattern: 'G', kind: 'Network virtual appliance', vendor: 'paloaltonetworks', lead: 'Network virtual appliance. The publisher ID is paloaltonetworks.',
        evidence: 'The image is paloaltonetworks / vmseries-flex. This publisher and offer are on the network virtual appliance list of an Azure built-in policy.' });
    const b = workloadFound(byName(p, 'contoso-net2'));
    assert.equal(b.vendor, 'fortinet');
    assert.match(b.evidence, /^The Marketplace purchase plan is fortinet \/ fortinet_fortigate-vm_v5\. /);
});

test('evidence: a VM that is on both lists is a network virtual appliance, as in the notes', () => {
    // NetApp Cloud Volumes ONTAP is on both lists: the NVA list first (extras.js).
    const x = { imagePublisher: 'netapp', imageOffer: 'netapp-ontap-cloud' };
    assert.equal(patternFound(x).kind, 'nva');
    assert.equal(patternFound(x).sign.publisher, 'netapp');
    // The image first, then the plan: an NVA plan does not hide a storage image.
    assert.equal(patternFound({ imagePublisher: 'cohesity', imageOffer: 'cohesity-cloudtd-tool', planPublisher: 'paloaltonetworks', planProduct: 'vmseries-flex' }).kind, 'nva');
    assert.equal(patternFound({ imagePublisher: 'cohesity', imageOffer: 'cohesity-cloudtd-tool', planPublisher: 'rubrik-inc', planProduct: 'rubrik-x' }).sign.sign, 'image');
});

test('evidence: a managed application shows "Managed by", and the plan publisher only when the list gives it', () => {
    const p = run(KINDS);
    const a = workloadFound(byName(p, 'contoso-ma1'));
    assert.deepEqual(pick(a), { pattern: 'G', kind: 'Managed application', vendor: '', lead: 'Managed application. The list does not give the vendor.',
        evidence: '"Managed by" is Managed application. The resource group of this VM belongs to a managed application.' });
    const b = workloadFound(byName(p, 'contoso-ma2'));
    assert.equal(b.vendor, 'contosoisv');
    assert.equal(b.lead, 'Managed application. The publisher ID is contosoisv.');
    assert.match(b.evidence, / The Marketplace purchase plan is contosoisv \/ contoso-app\.$/);
});

test('evidence: each workload type gives the facts that decided it', () => {
    const p = run(KINDS);
    const ev = (n) => workloadFound(byName(p, n)).evidence;
    assert.equal(ev('contoso-aks1'), '"Managed by" is AKS.');
    assert.equal(ev('contoso-aro1'), '"Managed by" is ARO.');
    assert.equal(ev('contoso-ss1'), '"Resource type" is Scale set.');
    assert.equal(ev('contoso-ss2'), '"Scale set" is Yes.');
    assert.equal(ev('contoso-avd1'), '"AVD host pool type" is Pooled.');
    assert.equal(ev('contoso-dbx1'), '"Managed by" is Databricks.');
    assert.equal(ev('contoso-sql1'), '"SQL Server" is Enterprise. "SQL availability group" is Yes.');
    assert.equal(ev('contoso-sql2'), '"Image publisher" is MicrosoftSQLServer.');
    assert.equal(ev('contoso-fc1'), '"Shared disk" is Yes.');
    assert.equal(ev('contoso-sap1'), '"SAP" is Yes.');
    for (const [n, pattern] of [['contoso-aks1', 'A'], ['contoso-aro1', 'A'], ['contoso-ss1', 'A'], ['contoso-ss2', 'A'], ['contoso-avd1', 'B'], ['contoso-dbx1', 'C'],
        ['contoso-sql1', 'F'], ['contoso-sql2', 'F'], ['contoso-fc1', 'F'], ['contoso-sap1', 'F'], ['contoso-e1', 'E'], ['contoso-avd2', 'E'], ['contoso-avd3', ''], ['contoso-u1', '']]) {
        assert.equal(workloadFound(byName(p, n)).pattern, pattern, n);
        assert.equal(byName(p, n).pattern, pattern, `${n}: the pattern of the plan is the same`);
    }
    // All the SQL facts show, not only the first.
    assert.deepEqual(patternFound({ sqlServer: 'Standard', imagePublisher: 'MicrosoftSQLServer', sqlGroup: true, sharedDisk: true, sap: true }).facts.map((f) => f.column),
        ['SQL Server', 'Image publisher', 'SQL availability group', 'Shared disk', 'SAP']);
});

test('evidence: a standalone VM has no evidence; a type not checked names the missing facts', () => {
    const p = run(KINDS);
    const e = workloadFound(byName(p, 'contoso-e1'));
    assert.equal(e.evidence, '');
    assert.equal(e.shown, 'No fact in the list shows another workload type.');
    // A personal desktop: why it is not a pooled host.
    assert.equal(workloadFound(byName(p, 'contoso-avd2')).evidence, '"AVD host pool type" is Personal.');
    assert.equal(workloadFound(byName(p, 'contoso-avd2')).shown, '"AVD host pool type" is Personal.');
    const u = workloadFound(byName(p, 'contoso-u1'));
    assert.equal(u.evidence, '', 'the CSV gives no evidence for a type not checked');
    assert.equal(u.shown, 'The list does not give "Shared disk", "SAP".');
    assert.equal(workloadFound(byName(p, 'contoso-avd3')).shown, 'The list does not give "AVD host pool type".');
    // A list with few columns: each fact that is not in it.
    const few = run('VM name,Current size,Generation\ncontoso-f1,Standard_D4s_v3,V2\n').machines[0];
    assert.equal(workloadFound(few).shown, 'The list does not give "Managed by", "Scale set", "SQL Server", "Shared disk", "SAP", "Azure Virtual Desktop".');
});

test('facts from your list: each value as the list gives it; "Not in the list" and "No value" are never a value', () => {
    const p = run('VM name,Current size,Generation,OS,SAP,Image offer\ncontoso-f1,Standard_D4s_v3,V2,  Linux ,,=cmd\n');
    const groups = factsRead(p.machines[0]);
    const fact = (c) => groups.flatMap((g) => g.facts).find((f) => f.column === c);
    assert.deepEqual(fact('OS'), { column: 'OS', value: 'Linux', given: true }, 'trimmed, as the planner reads it');
    assert.deepEqual(fact('SAP'), { column: 'SAP', value: NO_VALUE, given: false });
    assert.deepEqual(fact('Zone'), { column: 'Zone', value: NOT_IN_LIST, given: false });
    assert.equal(fact('Image offer').value, '=cmd', 'shown as text on the page, never run');
    assert.deepEqual(groups.map((g) => g.group), ['Size and OS', 'Disks and network', 'Security', 'Workload', 'Image and Marketplace', 'Location and IDs']);
    // An alias of a column ("Machine name") is read as the column.
    const old = run('Machine name,Current size,Generation\ncontoso-f2,Standard_D4s_v3,V2\n').machines[0];
    assert.equal(factsRead(old).flatMap((g) => g.facts).find((f) => f.column === 'VM name').value, 'contoso-f2');
    assert.deepEqual(factsRead({ read: {} }), [], 'a VM without its row has no facts');
});

test('facts from your list: every column of the query is in one group, except "Disk controller" (the tool does not read it)', () => {
    const grouped = FACT_GROUPS.flatMap(([, columns]) => columns);
    assert.equal(new Set(grouped).size, grouped.length, 'each column once');
    assert.deepEqual([...grouped].sort(), COLUMNS.map((c) => c.name).filter((c) => c !== 'Disk controller').sort());
});

test('vm-summary.csv: Vendor and Evidence are the last columns; the other columns keep their place', () => {
    assert.deepEqual(F.SUMMARY_COLUMNS, ['VM name', 'Region', 'Subscription ID', 'Resource group', 'Current size', 'Generation', 'OS', 'Security type', 'Current stage', 'Move needed',
        'Result group', 'Workload type', 'Workload type advice', 'v5', 'v6', 'v7', 'Burstable', 'Suggested - Current stage', 'Suggested - Extended stage', 'Before the move', 'Good to know',
        'To check', 'Needs review', 'Notes', 'Resource ID', 'Vendor', 'Evidence']);
    const rows = F.summaryRows(run(sample));
    const row = (n) => rows.find((r) => r['VM name'] === n);
    assert.deepEqual([row('contoso-coh01').Vendor, row('contoso-coh01').Evidence], ['Cohesity DataPlatform Cloud Edition', 'Storage or backup appliance. The image is cohesity / cohesity-cloudtd-tool.']);
    assert.equal(row('contoso-fw01').Vendor, 'paloaltonetworks');
    assert.match(row('contoso-fw01').Evidence, /^Network virtual appliance\. The image is paloaltonetworks \/ vmseries-flex\./);
    // 0.9.0-beta: the sample gives the managed application and its Marketplace plan.
    assert.deepEqual([row('contoso-pure01').Vendor, row('contoso-pure01').Evidence], ['contosoisv', 'Managed application. "Managed by" is Managed application. The resource group of this VM belongs to a managed application. Managed application: contoso-cbs. The Marketplace plan of the application is contosoisv / contoso-storage-app.']);
    assert.deepEqual([row('contoso-aks-np1').Vendor, row('contoso-aks-np1').Evidence], ['', '"Managed by" is AKS.']);
    assert.deepEqual([row('contoso-web02').Vendor, row('contoso-web02').Evidence], ['', ''], 'a standalone VM: both empty');
});

test('appliances by vendor: one row for each vendor and kind, sorted; same names get where-words; no vendor last', () => {
    const p = run(list([
        { 'VM name': 'contoso-ma1', 'Managed by': 'Managed application' },
        { 'VM name': 'contoso-fw1', 'Image publisher': 'paloaltonetworks', 'Image offer': 'vmseries-flex', 'Resource ID': rid('rg-contoso-hub', 'contoso-fw1') },
        { 'VM name': 'contoso-fw1', 'Image publisher': 'paloaltonetworks', 'Image offer': 'vmseries-flex', 'Resource ID': rid('rg-contoso-dr', 'contoso-fw1') },
        { 'VM name': 'contoso-bkp1', 'Image publisher': 'veeam', 'Image offer': 'veeam-backup-replication' },
        { 'VM name': 'contoso-e1' },
        { 'VM name': 'contoso-nas1', 'Image publisher': 'cohesity', 'Image offer': 'cohesity-cloudtd-tool' },
    ]));
    const a = appliancesByVendor(p.machines);
    assert.deepEqual(a.map((x) => [x.vendor, x.kind, x.machines.map((y) => `${y.m.read.name}${y.where ? ` (${y.where})` : ''}`)]), [
        ['Cohesity DataPlatform Cloud Edition', 'Storage or backup appliance', ['contoso-nas1']],
        ['paloaltonetworks', 'Network virtual appliance', ['contoso-fw1 (rg-contoso-hub)', 'contoso-fw1 (rg-contoso-dr)']],
        ['Veeam', 'Storage or backup appliance', ['contoso-bkp1']],
        ['', 'Managed application', ['contoso-ma1']],
    ]);
    assert.deepEqual(appliancesByVendor(run(list([{ 'VM name': 'contoso-e1' }])).machines), []);
    // The same publisher in another case is one vendor: the first spelling shows.
    const c = appliancesByVendor(run(list([
        { 'VM name': 'contoso-fw7', 'Image publisher': 'PaloAltoNetworks', 'Image offer': 'vmseries-flex' },
        { 'VM name': 'contoso-fw8', 'Image publisher': 'paloaltonetworks', 'Image offer': 'vmseries-flex' },
    ])).machines);
    assert.deepEqual(c.map((x) => [x.vendor, x.machines.length]), [['PaloAltoNetworks', 2]]);
});

test('the report: "Appliances by vendor" links only to a VM that has a card; no facts block in the cards', () => {
    // contoso-fw2 is on a modern size: no move, so the report has no card for it.
    const p = run(list([
        { 'VM name': 'contoso-fw1', 'Image publisher': 'paloaltonetworks', 'Image offer': 'vmseries-flex' },
        { 'VM name': 'contoso-fw2', 'Current size': 'Standard_D4ds_v6', 'Image publisher': 'paloaltonetworks', 'Image offer': 'vmseries-flex' },
        { 'VM name': 'contoso-ma1', 'Managed by': 'Managed application' },
        { 'VM name': 'contoso-coh1', 'Image publisher': 'cohesity', 'Image offer': 'cohesity-cloudtd-tool' },
    ]));
    assert.equal(F.groupOf(byName(p, 'contoso-fw2')), 'modern');
    const html = reportHtml(p, table, 'test', NOW);
    const t = /<h3 class="label">Appliances by vendor<\/h3>[\s\S]*?<\/table>/.exec(html)[0];
    assert.match(t, /<td>paloaltonetworks <span class="muted">\(publisher ID\)<\/span><\/td><td>Network virtual appliance<\/td><td>2<\/td><td><a href="#vm-2">contoso-fw1<\/a>, contoso-fw2<\/td>/);
    assert.match(t, /<span class="muted">The list does not give the vendor.<\/span><\/td><td>Managed application<\/td><td>1<\/td><td><a href="#vm-4">contoso-ma1<\/a>/);
    assert.match(t, /<td>Cohesity DataPlatform Cloud Edition<\/td><td>Storage or backup appliance<\/td>/, 'a storage vendor is a name, not a publisher ID');
    for (const [, id] of html.matchAll(/href="#(vm-\d+)"/g)) assert.match(html, new RegExp(`id="${id}"`), `the link to ${id} has a card`);
    assert.match(html, /<h4>Workload type<\/h4><p><b>Network virtual appliance. The publisher ID is paloaltonetworks.<\/b> The image is paloaltonetworks/);
    assert.doesNotMatch(html, /Facts from your list|<details/);
    // No appliances: no table.
    assert.doesNotMatch(reportHtml(run(list([{ 'VM name': 'contoso-e1' }])), table, 'test', NOW), /Appliances by vendor/);
});

function pick(w) {
    return { pattern: w.pattern, kind: w.kind, vendor: w.vendor, lead: w.lead, evidence: w.evidence };
}
