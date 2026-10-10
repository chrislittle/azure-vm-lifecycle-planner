// The report in the zip: one HTML file, made in the browser, that opens in any
// browser and prints to PDF. No scripts and nothing to load: the CSS is in the
// file. The same words as the page (details.js).

import capacity from '../data/capacity.js?v=0.5.0-beta';
import { capacityRestricted } from './planner.js?v=0.5.0-beta';
import * as F from './files.js?v=0.5.0-beta';
import { optionReason, reasonFor } from './reasons.js?v=0.5.0-beta';
import { seriesList, todo } from './details.js?v=0.5.0-beta';
import { GROUPS, PATTERNS, POOL_PATTERNS, PROCESSOR_NOTE, NOT_FOUND, serviceManaged, stageWords, stageShort, dateWords, capacityWords, GUIDANCE, moveWords } from './words.js?v=0.5.0-beta';
import version from './version.js?v=0.5.0-beta';

export const REPORT_NAME = 'vm-lifecycle-report.html';

export function reportHtml(p, table, sourceName, now = new Date()) {
    const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    const short = (s) => String(s || '').replace(/^Standard_/, '');

    const target = (m, g) => { if (!m.vm || ['modern', 'gate', 'nopath', 'unchecked'].includes(g)) return ''; const r = F.likelyRow(m); return r ? `${r.series === 'burstable' ? 'Burstable' : r.series}: ${short(r.option.targetSize)}` : ''; };
    const where = (m) => [m.read.resourceGroup, m.read.region].filter((x) => x).join(' · ');
    const stageCell = (m) => { if (!m.stage) return 'Not checked'; const s = stageShort(m.stage, capacityRestricted(m.vm.sourceSize)); return `${s.name}${s.detail ? ` <span class="muted">${esc(s.detail)}</span>` : ''}`; };

    const groups = Object.keys(GROUPS);
    const by = (key) => { const c = new Map(); for (const m of p.machines) { const k = key(m) || '(not in the list)'; c.set(k, (c.get(k) || 0) + 1); } return [...c].sort((a, b) => b[1] - a[1]); };
    const count = (g) => p.machines.filter((m) => F.groupOf(m) === g).length;
    const ORDER = ['first', 'ready', 'pool', 'gate', 'nopath', 'unchecked', 'modern'];
    const TONE = { modern: 'ok', ready: 'ok', first: 'act', pool: 'pool', gate: 'act', nopath: 'no', unchecked: 'muted' };

    function vmCard(m) {
        const g = F.groupOf(m); const t = todo(m, g); const n = F.allNotes(m);
        const notes = (title, items, cls, strip) => items.length ? `<h4>${title}</h4><ul class="${cls}">${items.map((x) => `<li><b>${esc(x.topic)}:</b> ${esc(strip ? x.text.replace(/^Check: /, '') : x.text)}${x.series.length ? ` <span class="muted">(${seriesList(x.series)} only)</span>` : ''}</li>`).join('')}</ul>` : '';
        const why = [m.stage ? stageWords(m.stage, capacityRestricted(m.vm?.sourceSize)) : '', ...(!m.vm ? m.problems.map((pr) => reasonFor(pr.why, { problem: pr })) : [])].filter((x) => x);
        let sizesHtml = '';
        if (m.vm && !['gate', 'nopath'].includes(g)) {
            const rows = m.rows.filter((r) => r.series !== 'gen1Route').map((r) => {
                const o = r.option; const name = r.series === 'burstable' ? 'Burstable' : r.series;
                if (!o.supported) return `<tr><th>${name}</th><td class="muted" colspan="2">${esc(optionReason(r, table, now))}</td></tr>`;
                const ranked = F.rankedFor(m, r, table, now);
                const how = POOL_PATTERNS.includes(m.pattern) ? '' : moveWords(r.series, o.rebuild, Boolean(m.vm.os)).split('. ')[0] + '.';
                return `<tr><th>${name}</th><td><b>${esc(o.targetSize)}</b><br><span class="muted">${esc(how)}</span></td><td class="muted">${ranked.slice(1).map((x) => `${esc(short(x.size))} (${esc(x.why.replace(/\*$/, '*'))})`).join(', ') || '-'}</td></tr>`;
            }).join('');
            sizesHtml = `<h4>${g === 'pool' ? 'Sizes to look for in the service or pool' : 'Sizes'}</h4><table class="sizes"><thead><tr><th>Series</th><th>Size</th><th>Other sizes that fit</th></tr></thead><tbody>${rows}</tbody></table>`;
        }
        return `<section class="vm">
      <header><h3>${esc(m.read.name)}</h3><span class="tag ${TONE[g]}">${esc(GROUPS[g].short)}</span></header>
      <p class="meta">${esc(short(m.read.size || m.read.sizeAsWritten))} · ${esc(where(m))} · ${esc(PATTERNS[m.pattern || ''].name)}</p>
      <div class="todo"><b>What to do:</b> ${esc(t.main)} ${t.more.map(esc).join(' ')}</div>
      ${why.length ? `<h4>Why</h4><p>${why.map(esc).join(' ')}</p>` : ''}
      ${serviceManaged(m) && m.moveRequired === 'Yes' ? '<h4>Before the move</h4><p class="muted">Nothing to do on the VM. The service manages the image and the disks.</p>' : notes('Before the move', n.actions, 'act')}
      ${notes('Good to know', n.attention, 'att')}
      ${notes('To check', n.checks, 'chk', true)}
      ${sizesHtml}
      ${m.read.resourceId ? `<p class="rid">${esc(m.read.resourceId)}</p>` : ''}
    </section>`;
    }

    const actionTables = ORDER.filter((g) => g !== 'modern' && count(g)).map((g) => `
    <h3 class="grp"><span class="tag ${TONE[g]}">${count(g)}</span> ${esc(GROUPS[g].short)}</h3>
    <p class="muted">${esc(GROUPS[g].long)}</p>
    <table><thead><tr><th>VM</th><th>Where</th><th>Size</th><th>Lifecycle stage</th><th>Target</th><th>What to do</th></tr></thead><tbody>
    ${p.machines.filter((m) => F.groupOf(m) === g).map((m) => `<tr><td><a href="#vm-${m.read.row}">${esc(m.read.name)}</a></td><td class="muted">${esc(where(m))}</td><td>${esc(short(m.read.size || m.read.sizeAsWritten))}</td><td>${stageCell(m)}</td><td>${esc(target(m, g))}</td><td>${esc(todo(m, g).main)}</td></tr>`).join('')}
    </tbody></table>`).join('');

    const modern = p.machines.filter((m) => F.groupOf(m) === 'modern');
    return `<!doctype html>
    <html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
    <title>VM Lifecycle Report</title>
    <style>
    :root { --text:#1b1f24; --muted:#5b6573; --line:#dde2e8; --bg:#f6f7f9; --accent:#0b6bcb; --ok:#1a7f37; --ok-bg:#e6f4ea; --act:#8a5a00; --act-bg:#fff4dc; --no:#b42318; --no-bg:#fdecea; --pool:#4b3aa8; --pool-bg:#ece8fc; }
    * { box-sizing: border-box; }
    body { margin: 0; font: 14px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif; color: var(--text); background: #fff; }
    main { max-width: 1000px; margin: 0 auto; padding: 24px 16px 48px; }
    h1 { font-size: 24px; margin: 0 0 4px; } h2 { font-size: 18px; margin: 32px 0 8px; padding-bottom: 4px; border-bottom: 2px solid var(--text); }
    h3 { font-size: 15px; margin: 18px 0 4px; } h4 { font-size: 11px; text-transform: uppercase; letter-spacing: .04em; color: var(--muted); margin: 12px 0 4px; }
    .muted { color: var(--muted); } p { margin: 0 0 6px; }
    .cover { border-bottom: 1px solid var(--line); padding-bottom: 12px; }
    .facts { display: grid; grid-template-columns: max-content 1fr; gap: 2px 16px; margin: 10px 0 0; font-size: 13px; }
    .tiles { display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: 8px; margin: 8px 0 16px; }
    .tile { border: 1px solid var(--line); border-radius: 6px; padding: 8px 10px; min-width: 0; } .tile b { display: block; font-size: 22px; } .tile .tag { white-space: normal; display: inline; line-height: 1.6; }
    .tag { display: inline-block; padding: 0 8px; border-radius: 10px; font-size: 12px; font-weight: 600; white-space: nowrap; }
    .tag.ok { background: var(--ok-bg); color: var(--ok); } .tag.act { background: var(--act-bg); color: var(--act); } .tag.no { background: var(--no-bg); color: var(--no); }
    .tag.pool { background: var(--pool-bg); color: var(--pool); } .tag.muted { background: var(--bg); color: var(--muted); }
    .three { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; }
    table { width: 100%; border-collapse: collapse; font-size: 13px; margin: 4px 0 8px; }
    th, td { text-align: left; vertical-align: top; padding: 5px 8px; border-bottom: 1px solid var(--line); }
    thead th { background: var(--bg); font-size: 12px; }
    a { color: var(--accent); }
    .vm { border: 1px solid var(--line); border-radius: 8px; padding: 12px 14px; margin: 12px 0; break-inside: avoid; }
    .vm header { display: flex; gap: 10px; align-items: baseline; flex-wrap: wrap; } .vm h3 { margin: 0; }
    .meta { color: var(--muted); font-size: 13px; }
    .todo { background: var(--bg); border-left: 3px solid var(--accent); padding: 6px 10px; margin: 8px 0; }
    ul { margin: 0; padding-left: 18px; } li { margin: 2px 0; }
    ul.act li::marker { color: var(--act); } ul.att li::marker { color: var(--accent); } ul.chk li::marker { color: var(--muted); }
    table.sizes th:first-child { width: 80px; }
    .rid { font: 11px ui-monospace, Consolas, monospace; color: var(--muted); overflow-wrap: anywhere; margin-top: 8px; }
    @media (max-width: 700px) { .three { grid-template-columns: 1fr; } }
    @media print { main { max-width: none; padding: 0; } h2 { break-after: avoid; } h3.grp { break-after: avoid; } a { color: inherit; text-decoration: none; } @page { margin: 14mm; } }
    </style></head><body><main>
    <div class="cover">
      <h1>VM Lifecycle Report</h1>
      <p class="muted">VM Lifecycle Planner for Azure. A community tool. Not affiliated with or endorsed by Microsoft.</p>
      <div class="facts"><span class="muted">List</span><span>${esc(sourceName)}</span><span class="muted">Made</span><span>${dateWords(now.toISOString().slice(0, 10))}, ${now.toISOString().slice(11, 16)} UTC, in your browser</span><span class="muted">VMs</span><span>${p.machines.length}</span><span class="muted">Tool version</span><span>${esc(version)}</span></div>
    </div>

    <h2>1. Summary</h2>
    <div class="tiles">${ORDER.map((g) => `<div class="tile"><b>${count(g)}</b><span class="tag ${TONE[g]}">${esc(GROUPS[g].short)}</span></div>`).join('')}</div>
    <div class="three">
      <div><h4>Workload type</h4><table><tbody>${by((m) => PATTERNS[m.pattern || ''].name).map(([k, v]) => `<tr><td>${esc(k)}</td><td>${v}</td></tr>`).join('')}</tbody></table></div>
      <div><h4>Region</h4><table><tbody>${by((m) => m.read.region).map(([k, v]) => `<tr><td>${esc(k)}</td><td>${v}</td></tr>`).join('')}</tbody></table></div>
      <div><h4>Resource group</h4><table><tbody>${by((m) => m.read.resourceGroup).map(([k, v]) => `<tr><td>${esc(k)}</td><td>${v}</td></tr>`).join('')}</tbody></table></div>
    </div>

    <h2>2. What to do, by result</h2>
    ${actionTables}
    <h3 class="grp"><span class="tag ok">${modern.length}</span> ${esc(GROUPS.modern.short)}</h3>
    <p class="muted">${modern.map((m) => esc(m.read.name)).join(', ')}</p>

    <h2>3. Each VM that needs a move</h2>
    ${p.machines.filter((m) => F.groupOf(m) !== 'modern').map((m) => vmCard(m).replace('<section class="vm">', `<section class="vm" id="vm-${m.read.row}">`)).join('\n')}
    <p class="muted">${esc(PROCESSOR_NOTE)}</p>

    <h2>4. Notes and sources</h2>
    <ul>
      <li>${esc(NOT_FOUND)}</li>
      <li>This tool does not check if a size is available in your region.</li>
      <li>Capacity growth restrictions: ${esc(capacityWords(capacity).join(' '))}</li>
      <li>Lifecycle stages: <a href="${GUIDANCE.lifecycle}">Microsoft lifecycle overview</a>, <a href="${GUIDANCE.endOfLife}">End of Life list</a>, <a href="${GUIDANCE.retirements}">retirements and capacity growth restrictions</a>.</li>
    </ul>
    </main></body></html>
    `;
}
