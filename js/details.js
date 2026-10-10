// What to do for one VM, in words: the same for the page and the report.

import { likelyRow } from './files.js?v=0.5.0-beta';
import { reasonFor } from './reasons.js?v=0.5.0-beta';
import { PATTERNS, POOL_PATTERNS, poolAdvice } from './words.js?v=0.5.0-beta';

// 'v6', 'v7' -> 'v6 and v7'.
export function seriesList(list) {
    const names = list.map((s) => (s === 'burstable' ? 'Burstable' : s));
    return names.length < 2 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

// The hard gate, in words: SAP, or the vendor of an appliance.
export function gateReasons(m) {
    const codes = ['sap-needs-a-certified-size', 'nva-requires-parallel-deployment', 'storage-appliance-requires-vendor'];
    return (m.vm.blockers || []).filter((b) => codes.includes(b)).map((b) => reasonFor(b, {}));
}

// The main thing to do for a VM: { main, more: [] }.
export function todo(m, g) {
    const pool = POOL_PATTERNS.includes(m.pattern);
    if (!m.vm) {
        if (pool) { const a = poolAdvice(m); return { main: a.todo, more: [a.more, 'This tool cannot check the sizes. See "Why".'] }; }
        return { main: 'This tool cannot check this VM.', more: ['See "Why". Correct the list, then load it again.'] };
    }
    if (g === 'modern') return { main: 'No move needed.', more: ['This is a modern size: Microsoft fully supports it.'] };
    if (g === 'unchecked') return { main: 'This tool cannot check this VM.', more: ['See "Why" and "Sizes".'] };
    if (g === 'pool') { const a = poolAdvice(m); return { main: a.todo, more: [a.more] }; }
    if (g === 'gate') {
        const sap = (m.vm.blockers || []).includes('sap-needs-a-certified-size');
        return { main: sap ? 'Ask SAP which sizes they certify. Do not change the VM before that.' : 'Ask the vendor which sizes they certify. Do not change the VM before that.', more: [`This tool gives no size. Only ${sap ? 'SAP' : 'the vendor'} can approve a size.`] };
    }
    if (g === 'nopath') return { main: 'This tool has no supported size for this VM.', more: ['See "Why" for the reason.'] };
    const r = likelyRow(m);
    const o = r.option;
    const main = r.series === 'v6' || r.series === 'v7' ? `Deploy a new VM at ${o.targetSize} in parallel. Then move the workload.`
        : o.rebuild ? `Rebuild at ${o.targetSize} from a current image.` : `Resize to ${o.targetSize}.`;
    const more = [];
    if (g === 'first') more.push('Do the steps in "Before the move" first.');
    if (m.pattern === 'F') more.push(PATTERNS.F.advice);
    const others = m.rows.filter((x) => x !== r && x.option.supported && x.series !== 'gen1Route').map((x) => x.series);
    if (others.length) more.push(`You can also use ${seriesList(others)}. See "Sizes".`);
    return { main, more };
}
