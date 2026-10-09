// The four download files, made in the browser:
//   vm-summary.csv          one row per machine - start here
//   vm-target-sizes.csv     one row per machine and series, with reasons and caveats
//   vm-not-checked.csv      what the tool could not check
//   about-these-results.txt the columns used, what a result means, where the data came from

import sizes from '../data/sizes.js?v=0.1.1-beta';
import families from '../data/families.js?v=0.1.1-beta';
import endOfLife from '../data/end-of-life.js?v=0.1.1-beta';
import capacity from '../data/capacity.js?v=0.1.1-beta';
import nvme from '../data/nvme-images.js?v=0.1.1-beta';
import { capacityRestricted } from './planner.js?v=0.1.1-beta';
import { optionReason, reasonFor } from './reasons.js?v=0.1.1-beta';
import { GUIDANCE, OUTCOME, answerWords, capacityWords, dateWords, stageWords } from './words.js?v=0.1.1-beta';

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
    'Scale set / AKS / AVD', 'SAP', 'Unmanaged disks', 'Ephemeral OS disk', 'Identity', 'Availability set', 'Network virtual appliance', 'Zone'];

// The problems on the option a VM would most likely take: its Current
// default, else its Extended default, else any option with a size.
// Only for a VM that must move: one that stays where it is has nothing to warn about.
export function warnings(m) {
    if (!m.vm || m.moveRequired === 'No') return [];
    const pick = m.rows.find((r) => r.result === 'Supported' && m.advice && r.series === m.advice.start.current)
        || m.rows.find((r) => r.result === 'Supported')
        || m.rows.find((r) => r.option.targetSize)
        || m.rows.find((r) => r.series === 'v5');
    if (!pick || !pick.caveats) return [];
    return CAVEAT_TOPICS.filter((t) => pick.caveats[t] && pick.caveats[t].state === 'problem').map((t) => `${t}: ${pick.caveats[t].text}`);
}

function stageText(m) {
    return m.stage ? stageWords(m.stage, capacityRestricted(m.vm.sourceSize)) : '';
}

export const SUMMARY_COLUMNS = ['Machine', 'Region', 'Current size', 'Generation', 'OS', 'Security type', 'Current stage', 'Move needed',
    'Result', 'v5', 'v6', 'v7', 'Burstable', 'Suggested - Current stage', 'Suggested - Extended stage', 'Problems', 'Not checked', 'Notes'];

export function summaryRows(p) {
    return p.machines.map((m) => ({
        ...base(m),
        'Current stage': stageText(m),
        'Move needed': MOVE_NEEDED[m.moveRequired],
        'Result': OUTCOME[m.outcome],
        'v5': answerWords(m, 'v5'), 'v6': answerWords(m, 'v6'), 'v7': answerWords(m, 'v7'), 'Burstable': answerWords(m, 'burstable'),
        'Suggested - Current stage': m.defaults.current, 'Suggested - Extended stage': m.defaults.extended,
        'Problems': m.vm ? warnings(m).join('; ') : '',
        'Not checked': m.needsReview ? 'Yes' : 'No',
        'Notes': [...m.problems.map((pr) => reasonFor(pr.why, { problem: pr })), ...m.notes].join('; '),
    }));
}

export const TARGET_COLUMNS = ['Machine', 'Region', 'Current size', 'Generation', 'OS', 'Security type', 'Current stage', 'Move needed',
    'Series', 'Target size', 'Result', 'Supported', 'Reason', 'Target stage', 'Lifecycle change', 'Suggested', 'Move', 'Rebuild',
    'Premium SSD on target', 'Burstable ends', 'Region availability', 'Other sizes', ...CAVEAT_TOPICS, 'Notes'];

export function targetRows(p, table, now = new Date()) {
    const out = [];
    for (const m of p.machines) {
        if (!m.vm) {
            out.push({ ...base(m), 'Move needed': 'Not checked', 'Result': 'Not checked', 'Supported': 'Not checked',
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
                'Series': SERIES(r.series),
                // A size only where it is supported: a blocked option shows no size.
                'Target size': o.supported ? o.targetSize : '',
                'Result': m.moveRequired === 'No' && r.result !== 'Supported' ? 'Not needed' : RESULT[r.result],
                'Supported': r.result === 'Supported' ? 'Yes' : r.result === 'Needs team review' ? 'Not checked' : 'No',
                'Reason': optionReason(r, table, now),
                'Target stage': o.targetStage ? o.targetStage.stage : '',
                'Lifecycle change': has ? CHANGE[o.stageChange] : '',
                'Suggested': r.isDefault.map((d) => (d === 'Current default' ? 'Current stage' : 'Extended stage')).join(', '),
                'Move': !has ? '' : o.move === 'nvme-conversion' ? 'SCSI to NVMe' : 'Resize (SCSI)',
                'Rebuild': !has ? '' : !m.vm.os ? 'Not checked. This tool does not know the OS.' : o.rebuild ? 'Yes' : 'No',
                'Premium SSD on target': !has ? '' : o.premiumDisks === null ? 'Not checked' : o.premiumDisks ? 'Yes' : 'No',
                'Burstable ends': o.burstableEnds ? 'Yes. The new size has fixed CPU performance. It does not use CPU credits.' : '',
                'Region availability': has ? 'Not checked' : '',
                'Other sizes': r.otherSizes.join(', '),
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
    const counts = (label) => p.machines.filter((m) => m.outcome === label).length;
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
        ...Object.keys(OUTCOME).map((k) => `  ${OUTCOME[k]} ${counts(k)}`),
        '',
        'FILES',
        '  vm-summary.csv         One row for each VM. Start with this file.',
        '                         It shows if you must move the VM, and the answer for each series.',
        '  vm-target-sizes.csv    One row for each VM and series. It gives the reasons and the notes.',
        '  vm-not-checked.csv     The items that this tool cannot check.',
        '  about-these-results.txt  This file.',
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
        'TWO TYPES OF MOVE',
        '  Resize:   Azure changes the size of the same VM. The VM keeps its identity and its disks.',
        '  Rebuild:  You make a new VM with the same disks. A Windows VM needs a rebuild when one size',
        '            has a temporary disk and the other size does not. A rebuild removes a system-assigned identity',
        '            and Azure Disk Encryption.',
        '',
        'NOTES',
        '  Each note is a problem or "Check:". "Check:" means that the list does not give the fact.',
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
