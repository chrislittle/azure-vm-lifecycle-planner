// The five download files, made in the browser:
//   vm-lifecycle-report.html the report - start here (report.js)
//   vm-summary.csv          one row per machine
//   vm-target-sizes.csv     one row per machine and series, with reasons and caveats
//   vm-not-checked.csv      what the tool could not check
//   about-these-results.txt the columns used, what a result means, where the data came from

import sizes from '../data/sizes.js?v=0.9.7-beta';
import families from '../data/families.js?v=0.9.7-beta';
import endOfLife from '../data/end-of-life.js?v=0.9.7-beta';
import capacity from '../data/capacity.js?v=0.9.7-beta';
import nvme from '../data/nvme-images.js?v=0.9.7-beta';
import { capacityRestricted } from './planner.js?v=0.9.7-beta';
import { optionReason, reasonFor } from './reasons.js?v=0.9.7-beta';
import { GROUPS, GUIDANCE, NOT_FOUND, PATTERNS, POOL_PATTERNS, PROCESSOR_NOTE, poolAdvice, serviceManaged, answerWords, capacityWords, dateWords, featureColumn, moveWords, rankWords, stageWords } from './words.js?v=0.9.7-beta';
import { rankedSizes, sizeProcessor } from './lifecycle.js?v=0.9.7-beta';
import { generationShown, workloadFound } from './evidence.js?v=0.9.7-beta';

// The vendor of an appliance and the facts behind the workload type (evidence.js).
function vendorAndEvidence(m) {
    const w = workloadFound(m);
    return { 'Vendor': w.vendor, 'Evidence': w.kind && w.evidence ? `${w.kind}. ${w.evidence}` : w.evidence };
}

// The sign that the query found for SAP (query 0.9.4-beta and later), as the list gives
// it, only when the list says SAP is Yes, else ''. The "SAP" column of vm-target-sizes.csv
// has the SAP note, which shows only for Yes too: both are blank for No and for no value,
// as the page shows nothing (review, 2026-11-06).
const sapSign = (m) => (m.extra && m.extra.sap === true && m.extra.sapSign) || '';

// CSV as Excel opens it: a byte order mark, every field quoted, CRLF. A cell that
// starts with = + - @ (or a tab or CR) and is longer than one character gets a ' in
// front, so Excel shows it as text and never runs it as a formula. Azure names
// cannot start so, but a hand-made list can (review, 2026-10-10).
export function toCsv(columns, rows) {
    const safe = (t) => (t.length > 1 && /^[=+\-@\t\r]/.test(t) ? `'${t}` : t);
    const q = (v) => '"' + safe(String(v ?? '')).replace(/"/g, '""') + '"';
    return '﻿' + [columns.map(q).join(','), ...rows.map((r) => columns.map((c) => q(r[c])).join(','))].join('\r\n') + '\r\n';
}

const RESULT = {
    'Supported': 'Supported',
    'Not supported by design': 'Not in this tool',
    'No fitting size': 'No size fits',
    'Needs team review': 'Not checked',
};
const MOVE_NEEDED = { Yes: 'Yes', No: 'No', Review: 'Not checked' };
const CHANGE = { up: 'Newer stage', same: 'Same stage', down: 'Older stage', unknown: 'Not checked' };
const SECURITY = { TrustedLaunch: 'Trusted launch', ConfidentialVM: 'Confidential VM', Standard: 'Standard' };
const SERIES = (s) => (s === 'gen1Route' ? 'Generation 1 to 2' : s === 'burstable' ? 'Burstable (Bsv2, Basv2)' : s);

// The columns every file starts with: the VM as the list gave it.
function base(m) {
    const r = m.read;
    return {
        'VM name': r.name,
        'Region': r.region || '',
        'Subscription ID': r.subscriptionId || '',
        'Resource group': r.resourceGroup || '',
        'Resource ID': r.resourceId || '',
        'Current size': r.size || r.sizeAsWritten,
        // Generation 1 or 2 from the list; Generation 2 (from the image SKU or the
        // security type) when this tool found it; Not given; Set by the service (evidence.js).
        'Generation': generationShown(m).csv,
        'OS': r.os || 'Not checked',
        'Security type': SECURITY[r.securityType] || 'Not checked',
    };
}

export const CAVEAT_TOPICS = ['NVMe', 'Disk encryption', 'Temporary disk', 'Accelerated networking', 'NICs', 'Data disks', 'Hibernation',
    'Scale set / AKS / AVD', 'SAP', 'Unmanaged disks', 'Ephemeral OS disk', 'Identity', 'Availability set', 'Network virtual appliance', 'Storage or backup appliance', 'Zone'];

// The option a VM would most likely take: a burstable size for a burstable VM
// (Microsoft recommends Bsv2 and Basv2 as the replacement, and it is a resize),
// else its Current default, else its Extended default, else any supported option.
export function likelyRow(m) {
    return m.rows.find((r) => r.result === 'Supported' && r.series === 'burstable')
        || m.rows.find((r) => r.result === 'Supported' && m.advice && r.series === m.advice.start.current)
        || m.rows.find((r) => r.result === 'Supported') || null;
}

// The readiness signals of a VM that must move and has a supported size:
// { actions, attention, checks }, each [{ topic, text }]. An action is a
// recommended action (Microsoft's term); attention is a fact to know, with
// nothing to do first; a check is a fact that the list does not give. A VM
// that stays where it is has none.
export function signals(m) {
    const none = { actions: [], attention: [], checks: [] };
    if (!m.vm || m.moveRequired !== 'Yes') return none;
    // The service manages the image and the disks: nothing on the VM to do.
    if (serviceManaged(m)) return none;
    const r = likelyRow(m);
    if (!r || !r.caveats) return none;
    const pick = (state) => CAVEAT_TOPICS.filter((t) => r.caveats[t] && r.caveats[t].state === state).map((t) => ({ topic: t, text: r.caveats[t].text }));
    return { actions: pick('problem'), attention: pick('attention'), checks: pick('check') };
}

// The notes of every supported series, each once: { actions, attention, checks },
// each [{ topic, text, series: [] }]. A note that applies to only some of the
// supported series names them.
export function allNotes(m) {
    const out = { actions: [], attention: [], checks: [] };
    if (!m.vm || m.moveRequired !== 'Yes' || serviceManaged(m)) return out;
    const rows = m.rows.filter((r) => r.result === 'Supported' && r.caveats);
    const key = { problem: 'actions', attention: 'attention', check: 'checks' };
    for (const r of rows) {
        for (const t of CAVEAT_TOPICS) {
            const c = r.caveats[t];
            if (!c || !key[c.state]) continue;
            const list = out[key[c.state]];
            const same = list.find((n) => n.topic === t && n.text === c.text);
            if (same) same.series.push(r.series); else list.push({ topic: t, text: c.text, series: [r.series] });
        }
    }
    const all = rows.length;
    for (const list of Object.values(out)) for (const n of list) if (n.series.length === all) n.series = [];
    return out;
}

// The recommended actions as text, 'Topic: action'.
export function warnings(m) {
    return signals(m).actions.map((a) => `${a.topic}: ${a.text}`);
}

// The result group of a VM (words.js GROUPS).
export function groupOf(m) {
    switch (m.outcome) {
        case 'No move required': return 'modern';
        case 'Needs team review': return 'unchecked';
        case 'Must move - outside the scope of this tool':
            return (m.vm.blockers || []).some((b) => ['sap-needs-a-certified-size', 'nva-requires-parallel-deployment', 'storage-appliance-requires-vendor', 'managed-application-requires-vendor'].includes(b)) ? 'gate' : 'nopath';
        default: {
            if (POOL_PATTERNS.includes(m.pattern)) return 'pool';
            const s = signals(m);
            return s.actions.length || s.checks.length ? 'first' : 'ready';
        }
    }
}

// The ranked sizes of one supported option, in words.
export function rankedFor(m, r, table, now = new Date()) {
    const list = rankedSizes(m.vm, table, r.option, now);
    return list.map((x) => ({ size: x.size, why: rankWords(x.why, sizeProcessor(x.size) === 'AMD' ? 'AMD' : 'Intel', x.feature) }));
}

// How to move to one supported option: the pattern decides it for a pool or
// a service; otherwise the series does.
export function howToMove(m, r) {
    if (POOL_PATTERNS.includes(m.pattern)) { const a = poolAdvice(m); return `${a.todo} ${a.more}`.trim(); }
    return moveWords(r.series, r.option.previewFeature, r.option.featureFallback);
}

function stageText(m) {
    return m.stage ? stageWords(m.stage, capacityRestricted(m.vm.sourceSize)) : '';
}

export const SUMMARY_COLUMNS = ['VM name', 'Region', 'Subscription ID', 'Resource group', 'Current size', 'Generation', 'OS', 'Security type', 'Current stage', 'Move needed',
    'Result group', 'Workload type', 'Workload type advice', 'v5', 'v6', 'v7', 'Burstable', 'Suggested - Current stage', 'Suggested - Extended stage', 'Before the move', 'Good to know', 'To check', 'Needs review', 'Notes', 'Resource ID',
    // Added in 0.8.0-beta at the end, so that the other columns keep their place.
    'Vendor', 'Evidence',
    // Added in 0.9.4-beta at the end: the sign that the query found for SAP, as the list gives it.
    'SAP sign'];

export function summaryRows(p) {
    return p.machines.map((m) => ({
        ...base(m),
        'Current stage': stageText(m),
        'Move needed': MOVE_NEEDED[m.moveRequired],
        'Result group': GROUPS[groupOf(m)].short,
        'Workload type': PATTERNS[m.pattern || ''].name,
        'Workload type advice': POOL_PATTERNS.includes(m.pattern) ? howToMove(m) : PATTERNS[m.pattern || ''].advice,
        'v5': answerWords(m, 'v5'), 'v6': answerWords(m, 'v6'), 'v7': answerWords(m, 'v7'), 'Burstable': answerWords(m, 'burstable'),
        'Suggested - Current stage': m.defaults.current, 'Suggested - Extended stage': m.defaults.extended,
        'Before the move': warnings(m).join('; '),
        'Good to know': signals(m).attention.map((a) => `${a.topic}: ${a.text}`).join('; '),
        'To check': signals(m).checks.map((c) => c.topic).join(', '),
        'Needs review': m.needsReview ? 'Yes' : 'No',
        'Notes': [...m.problems.map((pr) => reasonFor(pr.why, { problem: pr })), ...m.notes].join('; '),
        ...vendorAndEvidence(m),
        'SAP sign': sapSign(m),
    }));
}

export const TARGET_COLUMNS = ['VM name', 'Region', 'Subscription ID', 'Resource group', 'Current size', 'Generation', 'OS', 'Security type', 'Current stage', 'Move needed',
    'Workload type', 'Series', 'Target size', 'Series result', 'Supported', 'Reason', 'How to move', 'Ranked sizes', 'Target stage', 'Lifecycle change', 'Suggested', 'Rebuild',
    'Premium SSD on target', 'Burstable ends', 'Region availability', ...CAVEAT_TOPICS, 'Notes', 'Resource ID',
    // Added in 0.9.4-beta at the end, so that the other columns keep their place.
    'SAP sign',
    // Added in 0.9.5-beta at the end: does the resize need the preview feature VMTempDiskResizePreview?
    'Preview feature'];

export function targetRows(p, table, now = new Date()) {
    const out = [];
    for (const m of p.machines) {
        if (!m.vm) {
            out.push({ ...base(m), 'Workload type': PATTERNS[m.pattern || ''].name, 'Move needed': 'Not checked', 'Series result': 'Not checked', 'Supported': 'Not checked',
                'Reason': m.problems.map((pr) => reasonFor(pr.why, { problem: pr })).join(' '), 'Notes': m.notes.join('; ') });
            continue;
        }
        for (const r of m.rows) {
            const o = r.option;
            const has = Boolean(o.targetSize);
            const row = {
                ...base(m),
                'Current stage': stageText(m),
                'Move needed': MOVE_NEEDED[m.moveRequired],
                'Workload type': PATTERNS[m.pattern || ''].name,
                'Series': SERIES(r.series),
                // A size only where it is supported: a blocked option shows no size.
                'Target size': o.supported ? o.targetSize : '',
                'Series result': m.moveRequired === 'No' && r.result !== 'Supported' ? 'Not needed' : RESULT[r.result],
                'Supported': r.result === 'Supported' ? 'Yes' : r.result === 'Needs team review' ? 'Not checked' : 'No',
                'Reason': optionReason(r, table, now),
                'Target stage': o.targetStage ? o.targetStage.stage : '',
                'Lifecycle change': has ? CHANGE[o.stageChange] : '',
                'Suggested': r.isDefault.map((d) => (d === 'Current default' ? 'Current stage' : 'Extended stage')).join(', '),
                'How to move': o.supported ? howToMove(m, r) : '',
                'Ranked sizes': o.supported ? rankedFor(m, r, table, now).map((x, i) => `${i + 1}. ${x.size} (${x.why})`).join('; ') : '',
                // The tool never recommends a rebuild (0.9.5-beta, owner 2026-11-06). The column
                // stays, so that the other columns keep their place.
                'Rebuild': has ? 'No' : '',
                'Premium SSD on target': !has ? '' : o.premiumDisks === null ? 'Not checked' : o.premiumDisks ? 'Yes' : 'No',
                'Burstable ends': o.burstableEnds ? 'Yes. The new size has fixed CPU performance. It does not use CPU credits.' : '',
                'Region availability': has ? 'Not checked' : '',
                'Notes': m.notes.join('; '),
            };
            for (const t of CAVEAT_TOPICS) row[t] = r.caveats && r.caveats[t] ? r.caveats[t].text : '';
            row['SAP sign'] = sapSign(m);
            // Needed, Not needed or Not checked (words.js, featureColumn). Blank with no
            // supported size, and for a pool or a service (the move makes new VMs).
            row['Preview feature'] = featureColumn(o.previewFeature);
            out.push(row);
        }
    }
    return out;
}

export const NOT_CHECKED_COLUMNS = ['VM name', 'Region', 'Subscription ID', 'Resource group', 'Current size', 'Generation', 'Series', 'What', 'Why', 'Resource ID'];

export function notCheckedRows(p, table, now = new Date()) {
    // By row, not by name: two VMs can have the same name.
    const byRow = new Map(p.machines.map((m) => [m.read.row, m]));
    return p.review.map((r) => {
        const m = byRow.get(r.row);
        const vm = m && m.vm;
        const row = m && m.rows.find((x) => SERIES(x.series) === r.series || x.series === r.series);
        const why = r.why.split(' ').map((code) => {
            const problem = m && m.problems.find((pr) => pr.why === code);
            return reasonFor(code, { vm, series: row ? row.series : '', table, now, option: row ? row.option : null, stage: m && m.stage, problem });
        }).join(' ');
        return { 'VM name': r.machine, 'Region': r.region, 'Subscription ID': m ? m.read.subscriptionId : '', 'Resource group': m ? m.read.resourceGroup : '', 'Resource ID': m ? m.read.resourceId : '', 'Current size': r.size, 'Generation': m ? generationShown(m).csv : '', 'Series': r.series === 'Gen1 to Gen2 route' ? 'Generation 1 to 2' : r.series, 'What': r.what.replace(/''/g, '(blank)'), 'Why': why };
    });
}

// The notes file.
export function aboutText(p, list, sourceName, now = new Date()) {
    const used = Object.keys(list.map);
    const counts = (g) => p.machines.filter((m) => groupOf(m) === g).length;
    return [
        'VM Lifecycle Planner for Azure - about these results',
        'A community tool. Not affiliated with or endorsed by Microsoft.',
        '',
        `List:         ${sourceName}`,
        `Made:         ${now.toISOString().slice(0, 16).replace('T', ' ')} UTC. Your browser made these files. This tool sent no data.`,
        `Size facts:   a table of ${sizes.sizeCount} sizes. This tool read it from Azure on ${dateWords(sizes.readUtc)}.`,
        'Region:       this tool does not check if a size is available in your region.',
        `Lifecycle:    the Microsoft lifecycle pages, read on ${dateWords(families.updatedUtc)}. The End of Life list, read on ${dateWords(endOfLife.sources[0].readUtc)}.`,
        `NVMe:         the Microsoft list of OS images that support NVMe, read on ${dateWords(nvme.readUtc)}.`,
        '',
        'COLUMNS THAT THIS TOOL USED',
        ...used.map((c) => `  ${c} <- '${list.headers[list.map[c]]}'`),
        ...list.notes.map((n) => `  ${n}`),
        '',
        'VMS',
        `  This tool read ${p.machines.length} ${p.machines.length === 1 ? 'VM' : 'VMs'}.`,
        ...Object.keys(GROUPS).map((g) => `  ${GROUPS[g].short}: ${counts(g)}`),
        '',
        'WORKLOAD TYPES',
        '  The workload type tells you how to move the VM.',
        '  The types come from the workload patterns in the Microsoft guide for the move to v6 and v7.',
        ...Object.keys(PATTERNS).filter((k) => k).map((k) => `  ${PATTERNS[k].name}: ${p.machines.filter((m) => m.pattern === k).length}. ${PATTERNS[k].advice}`),
        `  ${PATTERNS[''].name}: ${p.machines.filter((m) => !m.pattern).length}. ${PATTERNS[''].advice}`,
        `  ${NOT_FOUND}`,
        '',
        'FILES',
        '  vm-lifecycle-report.html  The report. Start with this file. It opens in a browser.',
        '                         To make a PDF, print it and select "Save as PDF".',
        '  vm-summary.csv         One row for each VM, to sort and filter in Excel.',
        '                         It shows if you must move the VM, and the answer for each series.',
        '  vm-target-sizes.csv    One row for each VM and series. It gives the reasons and the notes.',
        '  vm-not-checked.csv     The items that this tool cannot check.',
        '  about-these-results.txt  This file.',
        '',
        'RESULT GROUPS',
        '  "Vendor approval first" is a "hard gate" in the Microsoft guide for the move to v6 and v7.',
        ...Object.values(GROUPS).flatMap((g) => [`  ${g.short}`, `    ${g.long}`]),
        '',
        'WHAT A RESULT MEANS',
        '  Supported:          Azure lets you move this VM to the new size.',
        '                      This does not mean that the VM is ready to move.',
        '  Not in this tool:   This tool gives no target size for this item. The reason tells you why.',
        '  No size fits:       Azure has no size for this VM in that series. This is not a limit of this tool.',
        '  Move needed:        Yes, when the current size is End of Life or Retired.',
        '                      No, when the current size is Current or Extended.',
        '  Not checked:        This tool cannot read or check an item.',
        '',
        'HOW TO MOVE',
        '  v5:        Resize the current VM, when Azure supports a resize to the new size. Burstable is the same.',
        '  v6 and v7: Deploy a new VM in parallel, move the workload, then delete the old VM.',
        '             Microsoft highly recommends this. A move to v6 or v7 is not a normal resize.',
        '             You can also change the size of the current VM. The VM then keeps its identity.',
        '  Resize:    Azure changes the size of the same VM. The VM keeps its identity and its disks.',
        // 0.9.5-beta (owner, 2026-11-06): no rebuild. The column stays.
        '  Rebuild:   This tool never tells you to rebuild a VM (to make a new VM with the same disks).',
        '             In vm-target-sizes.csv, Rebuild is No for every size.',
        // The preview feature VMTempDiskResizePreview (lifecycle.js, previewFeature; words.js, featureWords).
        '  Preview:   A Windows VM needs the preview feature VMTempDiskResizePreview for some resizes.',
        '             A resize needs it when one of the two sizes has a SCSI temporary disk and the other does not.',
        '             A v6 or v7 size has no SCSI temporary disk. A Linux VM never needs the feature.',
        '             Register the feature on the subscription. Move the page file to C: before the resize.',
        '             On v5, the tool also gives a size that does not need the feature, if there is one.',
        '             On Burstable, it gives the v5 size. No Bsv2 or Basv2 size has a temporary disk.',
        '             This comes from lab tests from 2026-11-01 to 2026-11-07, not from a Microsoft page.',
        '             In vm-target-sizes.csv, the column Preview feature says Needed, Not needed or Not checked.',
        '             It is blank when there is no size, and for a VM in a pool or a service.',
        '             Microsoft names the feature in a note about its NVMe conversion script:',
        `             ${GUIDANCE.tempDiskPreview}`,
        '',
        // 0.9.7-beta: the Generation 1 to 2 row, by the OS of the image (extras.js, gen1Upgrade).
        'GENERATION 1 TO 2',
        '  For a Generation 1 VM, the row "Generation 1 to 2" of vm-target-sizes.csv is about the Trusted launch upgrade.',
        '  This tool does not plan the upgrade, so the row is always "Not in this tool". The reason depends on the image.',
        '  On the page and in the report, the v6 and v7 boxes of a Generation 1 VM give one sentence about it.',
        '  Windows Server 2016: not supported. First, update the guest OS to Windows Server 2019 or 2022.',
        '  Debian and Azure Linux: not supported.',
        '  Linux with no Azure Marketplace image, a custom image, or no image in the list: "Check:".',
        '  Every other image: use the Trusted launch upgrade. The reason gives the conditions that the list does not show.',
        `  ${GUIDANCE.gen1Upgrade}`,
        '',
        'RANKED SIZES',
        '  For each supported series, up to five sizes, best first. Each one passes the same checks.',
        '  Microsoft recommends that a workload support more than one compatible size (capacity resilience).',
        '  When a size needs the preview feature VMTempDiskResizePreview and the suggested size does not, the list says so.',
        `  ${PROCESSOR_NOTE}`,
        '  https://learn.microsoft.com/azure/well-architected/design-guides/capacity-resilience',
        '',
        'WHAT TO DO: THE WAYS TO MOVE AND THEIR CONDITIONS',
        '  On the page and in the report, "What to do" shows each way to move in a box, with its steps.',
        '  v6 and v7 have two ways. Option 1: deploy a new VM in parallel. Microsoft recommends this.',
        '  Option 2: change the size of this VM. The VM keeps its identity, disks and extensions.',
        '  v5 and Burstable have one way: change the size of this VM.',
        '  "Conditions" gives the number of steps for that way. A step for both ways is in the two boxes.',
        '  The identity step is only for a new VM. The preview feature and the page file are only for a resize.',
        '  A VM in a pool, an SAP VM, a vendor appliance and a VM with no supported size have one box.',
        '',
        'BEFORE THE MOVE, GOOD TO KNOW, TO CHECK',
        '  These notes are the readiness signals in the Microsoft guide for the move to v6 and v7.',
        '  Before the move: a step to do before the move. It does not block the move.',
        '  In vm-summary.csv, the column "Before the move" has the steps from the facts of the VM.',
        '  The preview feature and the page file are in "How to move" and "Preview feature" of vm-target-sizes.csv.',
        '  On the page and in the report, these steps are in the boxes of "What to do".',
        '  A step for only the other sizes is under "Steps for the other sizes".',
        '  Good to know: a fact to know, with nothing to do first. A VM with only these notes is ready.',
        '  To check: the list does not give the fact, or this tool cannot judge it from what the list gives.',
        '  A VM that a service manages (AKS, Azure Red Hat OpenShift, Azure Databricks) has no notes.',
        '  The service manages its image and its disks.',
        '  A fact that is fine has no note.',
        '  This tool does not show an unknown fact as a pass.',
        '  If the list has no NIC count, this tool selects the size for 1 NIC.',
        '  If the list has no data-disk count, this tool selects the size for 0 data disks.',
        '',
        'SAP',
        '  The SAP note shows only when the "SAP" column of your list is Yes.',
        '  "SAP sign" gives the fact that the query found: the Azure VM extension for SAP solutions, an SAP licence type or an SAP image.',
        '  If a VM does not run SAP, set "SAP" to No in your list. Then load the list again.',
        '  A blank SAP value, or a value that this tool cannot read, gives no SAP note, as for the appliances.',
        '  If your list does not give SAP, a VM that is in no other workload type shows "Type not checked".',
        '',
        'CAPACITY GROWTH RESTRICTIONS',
        ...capacityWords(capacity, now).map((l) => `  ${l}`),
        `  Source: ${capacity.source}`,
        '',
        'MICROSOFT GUIDANCE',
        `  ${GUIDANCE.lifecycle}`,
        `  ${GUIDANCE.endOfLife}`,
        `  ${GUIDANCE.retirements}`,
        `  Azure Disk Encryption to encryption at host: ${GUIDANCE.diskEncryption}`,
        '',
    ].join('\r\n');
}
