// The four download files, made in the browser:
//   vm-summary.csv          one row per machine - start here
//   vm-target-sizes.csv     one row per machine and series, with reasons and caveats
//   vm-not-checked.csv      what the tool could not check
//   about-these-results.txt the columns used, what a result means, where the data came from

import sizes from '../data/sizes.js?v=0.3.1-beta';
import families from '../data/families.js?v=0.3.1-beta';
import endOfLife from '../data/end-of-life.js?v=0.3.1-beta';
import capacity from '../data/capacity.js?v=0.3.1-beta';
import nvme from '../data/nvme-images.js?v=0.3.1-beta';
import { capacityRestricted } from './planner.js?v=0.3.1-beta';
import { optionReason, reasonFor } from './reasons.js?v=0.3.1-beta';
import { GROUPS, GUIDANCE, NOT_FOUND, PATTERNS, POOL_PATTERNS, PROCESSOR_NOTE, answerWords, capacityWords, dateWords, moveWords, rankWords, stageWords } from './words.js?v=0.3.1-beta';
import { rankedSizes, sizeProcessor } from './lifecycle.js?v=0.3.1-beta';

// CSV as Excel opens it: a byte order mark, every field quoted, CRLF.
export function toCsv(columns, rows) {
    const q = (v) => '"' + String(v ?? '').replace(/"/g, '""') + '"';
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
const SECURITY = { TrustedLaunch: 'Trusted Launch', ConfidentialVM: 'Confidential VM', Standard: 'Standard' };
const SERIES = (s) => (s === 'gen1Route' ? 'Generation 1 to 2' : s === 'burstable' ? 'Burstable (Bsv2, Basv2)' : s);

// The columns every file starts with: the VM as the list gave it.
function base(m) {
    const r = m.read;
    return {
        'Machine': r.name,
        'Region': r.region || '',
        'Current size': r.size || r.sizeAsWritten,
        'Generation': r.generation ? r.generation.replace('V', 'Gen') : r.generationAsWritten,
        'OS': r.os || 'Not checked',
        'Security type': SECURITY[r.securityType] || 'Not checked',
    };
}

const CAVEAT_TOPICS = ['NVMe', 'Disk encryption', 'Temporary disk', 'Accelerated networking', 'NICs', 'Data disks', 'Hibernation',
    'Scale set / AKS / AVD', 'SAP', 'Unmanaged disks', 'Ephemeral OS disk', 'Identity', 'Availability set', 'Network virtual appliance', 'Storage or backup appliance', 'Zone'];

// The option a VM would most likely take: its Current default, else its
// Extended default, else any supported option.
function likelyRow(m) {
    return m.rows.find((r) => r.result === 'Supported' && m.advice && r.series === m.advice.start.current)
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
    const r = likelyRow(m);
    if (!r || !r.caveats) return none;
    const pick = (state) => CAVEAT_TOPICS.filter((t) => r.caveats[t] && r.caveats[t].state === state).map((t) => ({ topic: t, text: r.caveats[t].text }));
    return { actions: pick('problem'), attention: pick('attention'), checks: pick('check') };
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
            return (m.vm.blockers || []).some((b) => ['sap-needs-a-certified-size', 'nva-requires-parallel-deployment', 'storage-appliance-requires-vendor'].includes(b)) ? 'gate' : 'nopath';
        default: {
            const s = signals(m);
            return s.actions.length || s.checks.length ? 'first' : 'ready';
        }
    }
}

// The ranked sizes of one supported option, in words.
export function rankedFor(m, r, table, now = new Date()) {
    const list = rankedSizes(m.vm, table, r.option, now);
    return list.map((x) => ({ size: x.size, why: rankWords(x.why, sizeProcessor(x.size) === 'AMD' ? 'AMD' : 'Intel') }));
}

// How to move to one supported option: the pattern decides it for a pool or
// a service; otherwise the series does.
export function howToMove(m, r) {
    if (POOL_PATTERNS.includes(m.pattern)) return PATTERNS[m.pattern || ''].advice;
    return moveWords(r.series, r.option.rebuild, Boolean(m.vm.os));
}

function stageText(m) {
    return m.stage ? stageWords(m.stage, capacityRestricted(m.vm.sourceSize)) : '';
}

export const SUMMARY_COLUMNS = ['Machine', 'Region', 'Current size', 'Generation', 'OS', 'Security type', 'Current stage', 'Move needed',
    'Result', 'Workload type', 'Workload type advice', 'v5', 'v6', 'v7', 'Burstable', 'Suggested - Current stage', 'Suggested - Extended stage', 'Readiness signals', 'Attention', 'To check', 'Not checked', 'Notes'];

export function summaryRows(p) {
    return p.machines.map((m) => ({
        ...base(m),
        'Current stage': stageText(m),
        'Move needed': MOVE_NEEDED[m.moveRequired],
        'Result': GROUPS[groupOf(m)].short,
        'Workload type': PATTERNS[m.pattern || ''].name,
        'Workload type advice': PATTERNS[m.pattern || ''].advice,
        'v5': answerWords(m, 'v5'), 'v6': answerWords(m, 'v6'), 'v7': answerWords(m, 'v7'), 'Burstable': answerWords(m, 'burstable'),
        'Suggested - Current stage': m.defaults.current, 'Suggested - Extended stage': m.defaults.extended,
        'Readiness signals': warnings(m).join('; '),
        'Attention': signals(m).attention.map((a) => `${a.topic}: ${a.text}`).join('; '),
        'To check': signals(m).checks.map((c) => c.topic).join(', '),
        'Not checked': m.needsReview ? 'Yes' : 'No',
        'Notes': [...m.problems.map((pr) => reasonFor(pr.why, { problem: pr })), ...m.notes].join('; '),
    }));
}

export const TARGET_COLUMNS = ['Machine', 'Region', 'Current size', 'Generation', 'OS', 'Security type', 'Current stage', 'Move needed',
    'Workload type', 'Series', 'Target size', 'Result', 'Supported', 'Reason', 'How to move', 'Ranked sizes', 'Target stage', 'Lifecycle change', 'Suggested', 'Rebuild',
    'Premium SSD on target', 'Burstable ends', 'Region availability', ...CAVEAT_TOPICS, 'Notes'];

export function targetRows(p, table, now = new Date()) {
    const out = [];
    for (const m of p.machines) {
        if (!m.vm) {
            out.push({ ...base(m), 'Workload type': PATTERNS[m.pattern || ''].name, 'Move needed': 'Not checked', 'Result': 'Not checked', 'Supported': 'Not checked',
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
                'Result': m.moveRequired === 'No' && r.result !== 'Supported' ? 'Not needed' : RESULT[r.result],
                'Supported': r.result === 'Supported' ? 'Yes' : r.result === 'Needs team review' ? 'Not checked' : 'No',
                'Reason': optionReason(r, table, now),
                'Target stage': o.targetStage ? o.targetStage.stage : '',
                'Lifecycle change': has ? CHANGE[o.stageChange] : '',
                'Suggested': r.isDefault.map((d) => (d === 'Current default' ? 'Current stage' : 'Extended stage')).join(', '),
                'How to move': o.supported ? howToMove(m, r) : '',
                'Ranked sizes': o.supported ? rankedFor(m, r, table, now).map((x, i) => `${i + 1}. ${x.size} (${x.why})`).join('; ') : '',
                'Rebuild': !has ? '' : !m.vm.os ? 'Not checked. This tool does not know the OS.' : o.rebuild ? 'Yes' : 'No',
                'Premium SSD on target': !has ? '' : o.premiumDisks === null ? 'Not checked' : o.premiumDisks ? 'Yes' : 'No',
                'Burstable ends': o.burstableEnds ? 'Yes. The new size has fixed CPU performance. It does not use CPU credits.' : '',
                'Region availability': has ? 'Not checked' : '',
                'Notes': m.notes.join('; '),
            };
            for (const t of CAVEAT_TOPICS) row[t] = r.caveats && r.caveats[t] ? r.caveats[t].text : '';
            out.push(row);
        }
    }
    return out;
}

export const NOT_CHECKED_COLUMNS = ['Machine', 'Region', 'Current size', 'Series', 'What', 'Why'];

export function notCheckedRows(p, table, now = new Date()) {
    const byName = new Map(p.machines.map((m) => [m.read.name, m]));
    return p.review.map((r) => {
        const m = byName.get(r.machine);
        const vm = m && m.vm;
        const row = m && m.rows.find((x) => SERIES(x.series) === r.series || x.series === r.series);
        const why = r.why.split(' ').map((code) => {
            const problem = m && m.problems.find((pr) => pr.why === code);
            return reasonFor(code, { vm, series: row ? row.series : '', table, now, option: row ? row.option : null, stage: m && m.stage, problem });
        }).join(' ');
        return { 'Machine': r.machine, 'Region': r.region, 'Current size': r.size, 'Series': r.series === 'Gen1 to Gen2 route' ? 'Generation 1 to 2' : r.series, 'What': r.what.replace(/''/g, '(blank)'), 'Why': why };
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
        '  The types are the workload patterns A to G in the Microsoft guide for the move to v6 and v7.',
        ...Object.keys(PATTERNS).filter((k) => k).map((k) => `  ${PATTERNS[k].name} (pattern ${k}): ${p.machines.filter((m) => m.pattern === k).length}. ${PATTERNS[k].advice}`),
        `  ${PATTERNS[''].name}: ${p.machines.filter((m) => !m.pattern).length}. ${PATTERNS[''].advice}`,
        `  ${NOT_FOUND}`,
        '',
        'FILES',
        '  vm-summary.csv         One row for each VM. Start with this file.',
        '                         It shows if you must move the VM, and the answer for each series.',
        '  vm-target-sizes.csv    One row for each VM and series. It gives the reasons and the notes.',
        '  vm-not-checked.csv     The items that this tool cannot check.',
        '  about-these-results.txt  This file.',
        '',
        'RESULT GROUPS',
        ...Object.values(GROUPS).map((g) => `  ${g.short}. ${g.long}`),
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
        '  v5:        Resize the current VM, when Azure supports a resize to the new size.',
        '             A Windows VM needs a rebuild when one size has a temporary disk and the other size does not.',
        '  v6 and v7: Deploy a new VM in parallel, move the workload, then retire the old VM.',
        '             Microsoft highly recommends this. A move to v6 or v7 is not a normal resize.',
        '  Resize:    Azure changes the size of the same VM. The VM keeps its identity and its disks.',
        '  Rebuild:   You make a new VM. A new VM gets a new system-assigned identity,',
        '             and a rebuild removes Azure Disk Encryption.',
        '',
        'RANKED SIZES',
        '  For each supported series, up to five sizes, best first. Each one passes the same checks.',
        '  Microsoft recommends that a workload support more than one compatible size (capacity resilience).',
        `  ${PROCESSOR_NOTE}`,
        '  https://learn.microsoft.com/azure/well-architected/design-guides/capacity-resilience',
        '',
        'READINESS SIGNALS',
        '  A readiness signal is a recommended action: a step to do before the move. It does not block the move.',
        '  Attention: a fact to know, with nothing to do first. A VM with only attention notes is ready.',
        '  Check: the list does not give the fact.',
        '  A fact that is fine has no note.',
        '  This tool does not show an unknown fact as a pass.',
        '  If the list has no NIC count, this tool selects the size for 1 NIC.',
        '  If the list has no data-disk count, this tool selects the size for 0 data disks.',
        '',
        'CAPACITY RESTRICTIONS',
        ...capacityWords(capacity).map((l) => `  ${l}`),
        `  Source: ${capacity.source}`,
        '',
        'MICROSOFT GUIDANCE',
        `  ${GUIDANCE.lifecycle}`,
        `  ${GUIDANCE.endOfLife}`,
        `  ${GUIDANCE.retirements}`,
        '',
    ].join('\r\n');
}
