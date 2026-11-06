// Run: node --test
// SAP: the query finds the standard and the new Azure VM extension for SAP solutions,
// and writes the sign that it found ("SAP sign"). The SAP note shows only when the
// list says Yes, and it says the sign, so that a customer can see why.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import sizes from '../data/sizes.js';
import sample from '../js/sample.js';
import query from '../js/query.js';
import { SizeTable } from '../js/lifecycle.js';
import { COLUMNS, readList } from '../js/input.js';
import { plan, toMachine } from '../js/planner.js';
import { patternFound } from '../js/patterns.js';
import { factsRead, workloadFound } from '../js/evidence.js';
import { reportHtml } from '../js/report.js';
import * as F from '../js/files.js';

const table = new SizeTable(sizes.sizes);
const NOW = new Date('2026-11-06T12:00:00Z');
const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');

// A standalone Windows VM on D4s_v3 with every query column; each test changes some.
const HEAD = COLUMNS.map((c) => c.name);
const BASE = { 'Region': 'eastus2', 'Current size': 'Standard_D4s_v3', 'Generation': 'V2', 'OS': 'Windows', 'NIC count': '1', 'Data-disk count': '1', 'Security type': 'TrustedLaunch',
    'Image publisher': 'MicrosoftWindowsServer', 'Image offer': 'WindowsServer', 'Image SKU': '2022-datacenter-g2', 'Disk controller': 'SCSI', 'Accelerated NICs': '1', 'Primary NIC accelerated': 'Yes',
    'Azure Disk Encryption': 'No', 'Hibernation': 'No', 'Scale set': 'No', 'Azure Virtual Desktop': 'No', 'SAP': 'No', 'Unmanaged disks': 'No', 'Ephemeral OS disk': 'No', 'System-assigned identity': 'No',
    'Availability set': 'No', 'Zone': '1', 'Resource type': 'VM', 'Managed by': 'None', 'SQL Server': 'No', 'SQL availability group': 'No', 'Shared disk': 'No' };
const cell = (v) => (/[",]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
function list(rows, head = HEAD) {
    return [head.join(','), ...rows.map((r) => head.map((h) => cell(String(h in r ? r[h] : BASE[h] ?? ''))).join(','))].join('\n') + '\n';
}
function run(text) {
    const l = readList(text);
    return plan(l.rows.map((r, i) => toMachine(r, l.map, i + 2, table, NOW)), table, NOW);
}
const one = (row, head) => run(list([{ 'VM name': 'contoso-sap1', ...row }], head)).machines[0];
// The SAP note on each series that has one.
const sapNotes = (m) => m.rows.filter((r) => r.caveats && r.caveats['SAP']).map((r) => r.caveats['SAP']);

const EXT = 'Azure VM extension for SAP solutions (MonitorX64Windows)';
const CONFIRM = 'Confirm that SAP certifies the new size (SAP Note 1928533).';

// ---------------------------------------------------------------------------
// The query
// ---------------------------------------------------------------------------

const code = read('query.kql').split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n');

test('query: a VM extension for SAP is the publisher and the type together, the standard and the new version', () => {
    const ext = /\| extend sapExt = case\(([\s\S]*?)\)\n/.exec(code);
    assert.ok(ext, 'one value for the extension records');
    const pairs = [...ext[1].matchAll(/extPublisher =~ '([^']+)' and extType =~ '([^']+)'/g)].map((x) => `${x[1]}/${x[2]}`);
    assert.deepEqual(pairs, ['Microsoft.AzureCAT.AzureEnhancedMonitoring/MonitorX64Windows', 'Microsoft.AzureCAT.AzureEnhancedMonitoring/MonitorX64Linux',
        'Microsoft.AzureCAT.AzureEnhancedMonitoring/AzureCATExtensionHandler', 'Microsoft.OSTCExtensions/AzureEnhancedMonitorForLinux']);
    assert.match(ext[1], /^t != 'microsoft\.compute\/virtualmachines\/extensions', 0,/, 'only an extension record counts');
    assert.match(code, /sapExtension = max\(sapExt\)/, 'the highest value, so that the same VM gives the same type each time');
    // Both Microsoft pages are named in a comment.
    const q = read('query.kql');
    assert.ok(q.includes('https://learn.microsoft.com/azure/sap/workloads/vm-extension-for-sap-new'));
    assert.ok(q.includes('https://learn.microsoft.com/azure/sap/workloads/vm-extension-for-sap-standard'));
});

test('query: a scale set gives the extension type from its model, the standard Windows version too', () => {
    const sign = /\| extend sapExtensionType = case\(([\s\S]*?)\n\| /.exec(code);
    assert.ok(sign);
    const lines = sign[1].split('\n').map((l) => l.trim()).filter((l) => l);
    const types = ['MonitorX64Windows', 'MonitorX64Linux', 'AzureCATExtensionHandler', 'AzureEnhancedMonitorForLinux'];
    types.forEach((type, i) => {
        assert.ok(lines[i].includes(`sapExtension == ${4 - i} or`), `${type}: from the VM extension records`);
        assert.ok(lines[i].includes(`"type":"${type}"`), `${type}: from the scale set model`);
        assert.ok(lines[i].endsWith(`'${type}',`), `${type}: the type that was found`);
        assert.ok(lines[i].includes(i < 3 ? 'vmssSapNew and' : 'vmssSapStd and'), `${type}: with its publisher`);
    });
    assert.match(code, /vmssSapNew = vmssExtensions matches regex @'\(\?i\)"publisher":"Microsoft\\\.AzureCAT\\\.AzureEnhancedMonitoring"'/);
    assert.match(code, /vmssSapStd = vmssExtensions matches regex @'\(\?i\)"publisher":"Microsoft\\\.OSTCExtensions"'/);
});

test('query: "SAP sign" in a fixed order (extension, licence type, image); "SAP" is Yes only with a sign', () => {
    const sign = /\| extend sapSign = case\(([\s\S]*?)\n\| /.exec(code);
    assert.ok(sign);
    const s = sign[1];
    const at = (t) => { const i = s.indexOf(t); assert.ok(i >= 0, t); return i; };
    const ext = at("isnotempty(sapExtensionType), strcat('Azure VM extension for SAP solutions (', sapExtensionType, ')')");
    const lic = at("licenseType in~ ('RHEL_SAPAPPS', 'RHEL_SAPHA', 'RHEL_BASESAPAPPS', 'RHEL_BASESAPHA', 'SLES_SAP'), strcat('Licence type ', licenseType)");
    const red = at("imagePublisher =~ 'RedHat' and imageOffer in~ ('rhel-sap-apps', 'rhel-sap-ha'), strcat('Image ', imagePublisher, ' ', imageOffer)");
    const suse = at("imagePublisher =~ 'SUSE' and tolower(imageOffer) startswith 'sles-sap', strcat('Image ', imagePublisher, ' ', imageOffer)");
    assert.ok(ext < lic && lic < red && red < suse, 'extension, then licence type, then image');
    assert.match(s, /,\n\s*''\)$/, 'empty when there is no sign');
    const project = /\| project\n([\s\S]*?)\n\| order by/.exec(code)[1];
    assert.match(project, /^ {4}SAP = iff\(isnotempty\(sapSign\), 'Yes', 'No'\),$/m);
    assert.match(project, /^ {4}\['SAP sign'\] = sapSign,$/m);
    const names = [...project.matchAll(/^\s{4}(?:\['([^']+)'\]|([A-Za-z]+)) =/gm)].map((x) => x[1] || x[2]);
    assert.equal(names[names.indexOf('SAP') + 1], 'SAP sign', '"SAP sign" comes after "SAP"');
    assert.equal(query, read('query.kql'), 'the page shows the same query');
    // No new join.
    assert.ok((code.match(/\|\s*(join|union)\b/g) || []).length <= 3);
});

test('the template, the reader and the sample have "SAP sign" after "SAP"', () => {
    const names = COLUMNS.map((c) => c.name);
    assert.equal(names[names.indexOf('SAP') + 1], 'SAP sign');
    assert.equal(read('template.csv').split('\n')[0], names.join(','));
    const p = run(sample);
    const sap = p.machines.find((m) => m.read.name === 'contoso-sap01');
    assert.equal(sap.extra.sapSign, 'Image SUSE sles-sap-15-sp5');
});

// ---------------------------------------------------------------------------
// The SAP note
// ---------------------------------------------------------------------------

test('SAP note: the extension sign says how to remove the sign', () => {
    const notes = sapNotes(one({ 'SAP': 'Yes', 'SAP sign': EXT }));
    assert.ok(notes.length >= 3);
    for (const n of notes) {
        assert.equal(n.state, 'problem');
        assert.equal(n.text, `"SAP" is Yes. "SAP sign" is "${EXT}". ${CONFIRM} If this VM does not run SAP, remove the extension from the VM, or set "SAP" to No in your list.`);
    }
    // The standard version on Linux too.
    const std = sapNotes(one({ 'SAP': 'Yes', 'SAP sign': 'Azure VM extension for SAP solutions (AzureEnhancedMonitorForLinux)', 'OS': 'Linux' }))[0];
    assert.match(std.text, /remove the extension from the VM, or set "SAP" to No in your list\.$/);
});

test('SAP note: a licence or image sign says only to set "SAP" to No', () => {
    const lic = sapNotes(one({ 'SAP': 'Yes', 'SAP sign': 'Licence type SLES_SAP', 'OS': 'Linux' }))[0];
    assert.equal(lic.text, `"SAP" is Yes. "SAP sign" is "Licence type SLES_SAP". ${CONFIRM} If this VM does not run SAP, set "SAP" to No in your list.`);
    const img = sapNotes(one({ 'SAP': 'Yes', 'SAP sign': 'Image RedHat rhel-sap-ha', 'OS': 'Linux' }))[0];
    assert.equal(img.text, `"SAP" is Yes. "SAP sign" is "Image RedHat rhel-sap-ha". ${CONFIRM} If this VM does not run SAP, set "SAP" to No in your list.`);
});

test('SAP note: Yes with no sign (an older query or a hand-made list) is as before', () => {
    assert.equal(sapNotes(one({ 'SAP': 'Yes' }))[0].text, `"SAP" is Yes. ${CONFIRM}`);
    const old = one({ 'SAP': 'Yes' }, HEAD.filter((h) => h !== 'SAP sign'));
    assert.equal(sapNotes(old)[0].text, `"SAP" is Yes. ${CONFIRM}`);
});

test('SAP note: none when the list says No, gives no value, or has no SAP column; only Yes asks for SAP', () => {
    const empty = { state: '', text: '' };
    const no = one({ 'SAP': 'No' });
    const blank = one({ 'SAP': '' });
    const missing = one({}, HEAD.filter((h) => h !== 'SAP' && h !== 'SAP sign'));
    // A sign with "No": the customer set SAP to No, as the note says.
    const turnedOff = one({ 'SAP': 'No', 'SAP sign': EXT });
    for (const m of [no, blank, missing, turnedOff]) {
        for (const n of sapNotes(m)) assert.deepEqual(n, empty);
        assert.ok(!(m.vm.blockers || []).includes('sap-needs-a-certified-size'), 'no SAP blocker');
        assert.notEqual(F.groupOf(m), 'gate');
        assert.ok(!F.allNotes(m).checks.some((c) => c.topic === 'SAP'), 'no "To check" for SAP');
    }
    const yes = one({ 'SAP': 'Yes', 'SAP sign': EXT });
    assert.ok(yes.vm.blockers.includes('sap-needs-a-certified-size'));
    assert.equal(F.groupOf(yes), 'gate');
});

// ---------------------------------------------------------------------------
// Where the sign shows
// ---------------------------------------------------------------------------

test('facts from your list and the workload type show the sign', () => {
    const m = one({ 'SAP': 'Yes', 'SAP sign': EXT });
    const workload = factsRead(m).find((g) => g.group === 'Workload').facts;
    assert.deepEqual(workload.slice(-2), [{ column: 'SAP', value: 'Yes', given: true }, { column: 'SAP sign', value: EXT, given: true }]);
    assert.equal(workloadFound(m).evidence, `"SAP" is Yes. "SAP sign" is "${EXT}".`);
    assert.equal(workloadFound(one({ 'SAP': 'Yes' })).evidence, '"SAP" is Yes.');
    // The report gives the facts behind the workload type.
    const html = reportHtml(run(list([{ 'VM name': 'contoso-sap1', 'SAP': 'Yes', 'SAP sign': EXT }])), table, 'test', NOW);
    assert.ok(html.includes(`&quot;SAP sign&quot; is &quot;${EXT}&quot;.`));
});

test('pattern: a list with no SAP column still cannot say that the VM is standalone', () => {
    const x = { managedBy: 'None', scaleSet: false, sqlServer: false, sharedDisk: false, virtualDesktop: false, sap: null };
    const f = patternFound(x);
    assert.equal(f.pattern, '');
    assert.deepEqual(f.facts.map((y) => y.column), ['SAP']);
    // The sign alone, with SAP not Yes, does not make the pattern.
    assert.equal(patternFound({ ...x, sap: false, sapSign: EXT }).pattern, 'E');
});

test('vm-summary.csv and vm-target-sizes.csv: "SAP sign" is the last column; "SAP" is blank when the list does not say Yes', () => {
    assert.equal(F.SUMMARY_COLUMNS.at(-1), 'SAP sign');
    assert.equal(F.TARGET_COLUMNS.at(-1), 'SAP sign');
    assert.deepEqual(F.SUMMARY_COLUMNS.slice(-3, -1), ['Vendor', 'Evidence'], 'the other columns keep their place');
    const p = run(list([
        { 'VM name': 'contoso-s1', 'SAP': 'Yes', 'SAP sign': EXT },
        { 'VM name': 'contoso-s2', 'SAP': 'No' },
        { 'VM name': 'contoso-s3', 'SAP': '' },
    ]));
    const target = F.targetRows(p, table, NOW);
    const v5 = (n) => target.find((r) => r['VM name'] === n && r['Series'] === 'v5');
    assert.equal(v5('contoso-s1')['SAP sign'], EXT);
    assert.match(v5('contoso-s1')['SAP'], /^"SAP" is Yes\. "SAP sign" is /);
    for (const n of ['contoso-s2', 'contoso-s3']) assert.deepEqual([v5(n)['SAP'], v5(n)['SAP sign']], ['', '']);
    const summary = F.summaryRows(p);
    assert.deepEqual(summary.map((r) => r['SAP sign']), [EXT, '', '']);
    assert.ok(F.toCsv(F.TARGET_COLUMNS, target).split('\r\n')[0].endsWith('"Resource ID","SAP sign"'));
});

test('about-these-results.txt: what the SAP note and "SAP sign" mean', () => {
    const l = readList(sample);
    const p = run(sample);
    const about = F.aboutText(p, l, 'sample', NOW);
    assert.ok(about.includes('\r\nSAP\r\n'));
    assert.ok(about.includes('  The SAP note shows only when the "SAP" column of your list is Yes.'));
    assert.ok(about.includes('  "SAP sign" gives the fact that the query found: the Azure VM extension for SAP solutions, an SAP licence type or an SAP image.'));
    assert.ok(about.includes('  If a VM does not run SAP, set "SAP" to No in your list. Then load the list again.'));
});
