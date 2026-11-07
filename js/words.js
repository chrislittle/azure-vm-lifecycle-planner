// The customer's words for every result (PLAN.md, "Words for a customer").
// The logic works with plain labels; only this file says them to a customer.

// All customer text follows ASD-STE100 Simplified Technical English (owner,
// 2026-10-09): short sentences, one idea in each, active voice, no contractions.

// The result groups, in Microsoft's terms where Microsoft has them (lifecycle
// overview: "modern sizes"; v6/v7 Assess page: "hard gates", "readiness
// signals"). Peer feedback (2026-10-09): ready and "do this first" apart, and a
// readiness signal must not read as an unsolvable blocker.
export const GROUPS = {
    modern: { short: 'Modern size - no move needed', long: 'No move needed. This is a modern size: Microsoft fully supports it.' },
    ready: { short: 'Move needed - ready', long: 'Move needed. A supported size is available, and there is nothing to do first.' },
    first: { short: 'Move needed - do this first', long: 'Move needed. A supported size is available. First, do the steps in "Before the move", or check the facts in "To check".' },
    // A node pool, a scale set, a pooled AVD host or a VM that a service manages:
    // the pool or the service changes the size, not the VM (owner, 2026-10-10).
    pool: { short: 'Move needed - change in the service or pool', long: 'Move needed. Change the size in the service or the pool, not on this VM.' },
    // Microsoft's term is "hard gate"; "gate" is not an STE word (owner, 2026-10-10).
    gate: { short: 'Move needed - vendor approval first', long: 'Move needed. SAP, or the vendor of the appliance or the application, must approve the new size first.' },
    nopath: { short: 'Move needed - no supported size', long: 'Move needed. This tool has no supported size for this VM. See the reason.' },
    unchecked: { short: 'Not checked', long: 'Not checked. This tool cannot read this VM or its size.' },
};

// Why a size is on the ranked list. processor: the name of the other processor.
// feature: 'needed' or 'windows' when this size needs the preview feature and the suggested
// size does not (lifecycle.js, rankedSizes; review 2026-11-06). The asterisk stays at the end.
export function rankWords(why, processor, feature = null) {
    const words = {
        'closest': 'Closest match',
        'processor': `Same shape, ${processor} processor*`,
        'temp-disk-removed': 'Same shape, no temporary disk',
        'temp-disk-added': 'Same shape, with a temporary disk',
        'more-memory': 'More memory for each vCPU',
        'same-shape': 'Same shape, other family',
        'other-shape': 'Other shape that fits',
    }[why] || why;
    const add = { needed: '. A resize to it needs the preview feature VMTempDiskResizePreview', windows: '. On Windows, a resize to it needs the preview feature VMTempDiskResizePreview' }[feature] || '';
    return words.endsWith('*') ? `${words.slice(0, -1)}${add}*` : `${words}${add}`;
}
export const PROCESSOR_NOTE = '* A processor change. Test the application, and check its licence terms.';

// How to move to a supported size. Microsoft: v5 - "Resize the current VM" when
// the VM supports the target size (v5 overview, "Choose a transition method");
// v6 and v7 - "not a normal VM resize": deploy in parallel, highly recommended
// (v6/v7 FAQ and Plan page). The tool never recommends a rebuild (0.9.5-beta, owner
// 2026-11-06): every move is a resize of the same VM, or a new VM in parallel.
// feature: the option's previewFeature (lifecycle.js): 'needed', 'windows' (no OS in the
// list), 'unknown' (the size table cannot tell), 'not-needed' or null.
// fallback: { size } on v5 and Burstable, the size to use without the feature (null: none).
// v6 and v7 keep Microsoft's order: the feature words follow the second method, the
// change of the size of the current VM.
export function moveWords(series, feature = null, fallback = null) {
    const extra = [featureWords(feature), fallbackWords(series, feature, fallback)].filter((w) => w).join(' ');
    if (series === 'v6' || series === 'v7') {
        return `Deploy a new VM at this size in parallel, move the workload, then delete the old VM. Microsoft highly recommends this for v6 and v7. You can also change the size of the current VM, but that has more steps and more risk.${extra ? ` ${extra}` : ''}`;
    }
    return extra ? `Resize the current VM. ${extra}` : 'Resize the current VM. Azure supports a resize to this size.';
}

// The preview feature VMTempDiskResizePreview, named only where a resize needs it
// (0.9.5-beta, owner 2026-11-06 and 2026-11-07). Measured in lab tests, 2026-11-01 to
// 2026-11-07 (lifecycle.js, previewFeature): Windows, a SCSI temporary disk on one of the
// two sizes only. Never for Linux, never from a size with no temporary disk to a v6 or v7
// size. Microsoft names the feature in a Note about its NVMe conversion script
// (GUIDANCE.tempDiskPreview); it gives no terms, limits or date for the preview.
export const FEATURE_WORDS = 'The resize needs the preview feature VMTempDiskResizePreview, registered on the subscription. Move the page file from the temporary disk to C: before the resize.';
export const FEATURE_WORDS_NO_OS = 'On a Windows VM, the resize needs the preview feature VMTempDiskResizePreview, registered on the subscription. On Windows, move the page file from the temporary disk to C: before the resize.';
export const FEATURE_WORDS_UNKNOWN = 'The size table does not give the temporary disk of each size. This tool cannot tell if a Windows VM needs the preview feature VMTempDiskResizePreview for this resize.';
export function featureWords(feature) {
    return { needed: FEATURE_WORDS, windows: FEATURE_WORDS_NO_OS, unknown: FEATURE_WORDS_UNKNOWN }[feature] || '';
}
// Without the feature (owner, 2026-11-07): on v5 the size of the same shape that keeps the
// temporary disk type, a plain resize; on Burstable (no size there has a temporary disk)
// the v5 size. Said honestly when there is none.
export function fallbackWords(series, feature, fallback) {
    if (!['needed', 'windows'].includes(feature) || !fallback || (series !== 'v5' && series !== 'burstable')) return '';
    if (series === 'burstable') return fallback.size ? `Without the feature, use the v5 size ${fallback.size}.` : 'Without the feature, this tool finds no other size for a resize.';
    return fallback.size ? `Without the feature, resize to ${fallback.size}.` : 'Without the feature, this tool finds no v5 size of this shape that keeps the temporary disk type.';
}
// The column "Preview feature" of vm-target-sizes.csv (0.9.5-beta).
export function featureColumn(feature) {
    return { needed: 'Needed', 'not-needed': 'Not needed', windows: 'Not checked. Needed on Windows.', unknown: 'Not checked. The size table does not give the temporary disk.' }[feature] || '';
}
export const PREVIEW_LINK = 'Convert SCSI to NVMe (Microsoft)';

// Whether one row (m: a planned VM, r: one of its rows) shows the link to the Microsoft
// page that names the feature (PREVIEW_LINK): a supported v6 or v7 size (the page is
// about the conversion to NVMe) whose resize needs the feature, and a VM that is not in a
// pool or a service (they get other advice).
export function tempDiskPreview(m, r) {
    const o = r && r.option;
    if (!m || !m.vm || !o || !o.supported || POOL_PATTERNS.includes(m.pattern)) return false;
    return (r.series === 'v6' || r.series === 'v7') && ['needed', 'windows'].includes(o.previewFeature);
}

// Microsoft's workload patterns (v6/v7 modernization guide, "Discover"). The
// advice: A to D - replace the pool, or change the size in the service; E and F -
// resize v5 in place, deploy v6 and v7 in parallel; F one node at a time; G - a
// hard gate (owner, 2026-10-10). The page shows plain names, not the letters
// (owner, 2026-10-10: a quick user does not know what "pattern A" means).
export const PATTERNS = {
    A: { name: 'Node pool or scale set', advice: 'This VM is part of a pool (AKS, Azure Red Hat OpenShift or a scale set). Do not change the size of each VM. Add a new node pool or scale set at the new size. Move the workload to it, then remove the old one.' },
    B: { name: 'Pooled AVD host', advice: 'This VM is a session host in a pooled Azure Virtual Desktop host pool. Do not change the size of the host. Make new session hosts at the new size from the image. Move the users to them, then remove the old hosts.' },
    C: { name: 'Managed by a service', advice: 'A service (for example Azure Databricks) manages this VM. Do not change the VM. Change the node type or size in the service.' },
    D: { name: 'Cluster in a service', advice: 'Make a new cluster at the new size in the service. Then remove the old cluster.' },
    E: { name: 'Standalone VM', advice: 'You manage this VM. Use the move that this tool gives for each series.' },
    F: { name: 'Cluster or database', advice: 'This VM holds state or is part of a cluster (SQL Server, a failover cluster or SAP). Move one node at a time. First move the role away from the node (fail over or drain). For v5, resize the node. For v6 and v7, add a new node at the new size and remove the old node. Check the health of the cluster before the next node.' },
    G: { name: 'Vendor appliance', advice: 'This VM is a vendor appliance. Do not change the size of this VM. Ask the vendor which sizes they certify. Deploy a new appliance beside this one, then move the traffic.' },
    '': { name: 'Type not checked', advice: 'The list does not give the facts that find the workload type. Run the Azure Resource Graph query in step 1 to get them.' },
};
// The patterns where the series advice ("resize", "deploy in parallel") does not apply.
export const POOL_PATTERNS = ['A', 'B', 'C', 'D'];
// The kinds of vendor appliance (pattern G), as the page and the files name them.
export const APPLIANCE_KINDS = { nva: 'Network virtual appliance', storage: 'Storage or backup appliance', 'managed-application': 'Managed application' };

// A service that manages the VM, its image and its disks: AKS, ARO, or a
// service in pattern C. Nothing on the VM itself is for the customer to change.
export function serviceManaged(m) {
    const by = String(m.extra?.managedBy ?? '').toLowerCase();
    return m.pattern === 'C' || (m.pattern === 'A' && (by === 'aks' || by === 'aro'));
}

// What to do for a VM in a pool or a service, with the name of the service
// when the list gives it (owner, 2026-10-10: not "for example").
export function poolAdvice(m) {
    const x = m.extra || {};
    const by = String(x.managedBy ?? '');
    if (m.pattern === 'C') {
        if (/^databricks$/i.test(by)) return { todo: 'Change the node type in the Azure Databricks cluster.', more: 'Azure Databricks manages this VM. Do not change the VM.' };
        return { todo: `Change the size in the service ${by}.`, more: `The service ${by} manages this VM. Do not change the VM.` };
    }
    if (m.pattern === 'A') {
        if (/^aks$/i.test(by)) return { todo: 'Add a new AKS node pool at the new size.', more: 'This scale set is an AKS node pool. Move the workload to the new node pool, then remove the old node pool. Do not change the VMs.' };
        if (/^aro$/i.test(by)) return { todo: 'Add new worker nodes at the new size in the Azure Red Hat OpenShift cluster.', more: 'Move the workload to the new nodes, then remove the old nodes. Do not change the VMs.' };
        if (m.read?.resourceType === 'Scale set') return { todo: 'Make a new scale set at the new size.', more: 'Move the workload to the new scale set, then remove the old one. Do not change each VM.' };
        return { todo: 'Change the size in the scale set.', more: 'This VM is in a scale set. Do not change the size of this VM alone.' };
    }
    if (m.pattern === 'B') return { todo: 'Make new session hosts at the new size from the image.', more: 'This VM is a session host in a pooled Azure Virtual Desktop host pool. Move the users to the new hosts, then remove the old hosts.' };
    return { todo: PATTERNS[m.pattern || ''].advice, more: '' };
}

// What this tool cannot find. The customer must look for these.
export const NOT_FOUND = 'This tool cannot find these workloads. Look for them yourself. They are Active Directory domain controllers and NoSQL or search clusters (move one VM at a time), and self-hosted CI agents on single VMs. It also cannot find compute that is not in the VM list, for example Azure Machine Learning, HDInsight, Azure Data Explorer and Synapse Spark. Change the size of that compute in the service.';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const LONG_MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

// '2028-05-01' -> '1 May 2028'; with short months, '2025-09-30' -> '30 Sep 2025'.
export function dateWords(iso, short = false) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso ?? ''));
    if (!m) return String(iso ?? '');
    const month = (short ? MONTHS : LONG_MONTHS)[parseInt(m[2], 10) - 1];
    return `${parseInt(m[3], 10)} ${month} ${m[1]}`;
}

// Whole calendar months from one day to a later day ('2026-10-17' to '2029-11-15': 36).
// A month counts only when it is full. Same days, same answer: no clock is read.
export function wholeMonths(fromIso, toIso) {
    const a = /^(\d{4})-(\d{2})-(\d{2})$/.exec(fromIso);
    const b = /^(\d{4})-(\d{2})-(\d{2})$/.exec(toIso);
    if (!a || !b) return null;
    const n = (+b[1] - +a[1]) * 12 + (+b[2] - +a[2]) - (+b[3] < +a[3] ? 1 : 0);
    return Math.max(0, n);
}

// How long until a day, or how long since it, counted from the day the list is
// planned (now): 'in 25 months', 'in less than 1 month', '3 months ago', 'less than
// 1 month ago'. '' when the day or now is not known.
export function countdownWords(dayIso, now) {
    if (!now || !/^\d{4}-\d{2}-\d{2}$/.test(String(dayIso ?? ''))) return '';
    const today = now.toISOString().slice(0, 10);
    const future = dayIso > today;
    const n = future ? wholeMonths(today, dayIso) : wholeMonths(dayIso, today);
    const span = n < 1 ? 'less than 1 month' : `${n} ${n === 1 ? 'month' : 'months'}`;
    return future ? `in ${span}` : `${span} ago`;
}

// 'July 2026' (as Microsoft gives the start of the capacity growth restrictions) ->
// '2026-07-01'; null for other text.
export function monthDay(text) {
    const m = /^([A-Z][a-z]+) (\d{4})$/.exec(String(text ?? '').trim());
    const i = m ? LONG_MONTHS.indexOf(m[1]) : -1;
    return i < 0 ? null : `${m[2]}-${String(i + 1).padStart(2, '0')}-01`;
}
// ' (3 months ago)' for the start of the capacity growth restrictions, or ''.
const sinceWords = (capacity, now) => { const c = countdownWords(monthDay(capacity.since), now); return c ? ` (${c})` : ''; };

// The current size's stage, in words. capacity: the capacity data, or null. now: the
// day the list is planned; with it, a date also says how long until it or since it
// (the page and the report). The CSV files call this without now.
export function stageWords(stage, capacity, now = null) {
    const left = (day) => { const c = countdownWords(day, now); return c ? ` (${c})` : ''; };
    let w;
    switch (stage.stage) {
        case 'Current': w = 'Current. This is the newest series, and Microsoft fully supports it.'; break;
        case 'Extended': w = 'Extended. Microsoft fully supports this series. Newer series are available.'; break;
        case 'Current or Extended': w = 'Current or Extended. Microsoft has not announced a retirement date.'; break;
        case 'End of Life': w = stage.retiresUtc ? `End of Life. Microsoft retires this series on ${dateWords(stage.retiresUtc)}${left(stage.retiresUtc)}. Plan a move before that date.` : 'End of Life. Plan a move.'; break;
        case 'Retired': w = !stage.retiresUtc ? 'Retired. A VM on this size cannot run.'
            : left(stage.retiresUtc) ? `Retired. Microsoft retired this series on ${dateWords(stage.retiresUtc)}${left(stage.retiresUtc)}. A VM on this size cannot run.`
            : `Retired on ${dateWords(stage.retiresUtc)}. A VM on this size cannot run.`; break;
        case null: case undefined: return 'Not checked. This tool cannot identify this size.';
        default: w = String(stage.stage);
    }
    // Microsoft's term: "capacity growth restrictions" (owner, 2026-10-10: say only
    // what the Microsoft page says).
    if (capacity) w += ` From ${capacity.since}${sinceWords(capacity, now)}, Microsoft restricts capacity growth for this series: a new subscription cannot deploy it, and Azure approves no more quota.`;
    return w;
}

// The stage in a few words, for a table cell: { name, detail, capacity }.
export function stageShort(stage, capacity) {
    const date = stage.retiresUtc ? dateWords(stage.retiresUtc, true) : '';
    switch (stage.stage) {
        case 'Current': return { name: 'Current', detail: 'Newest series', capacity: Boolean(capacity) };
        case 'Extended': return { name: 'Extended', detail: 'Newer series available', capacity: Boolean(capacity) };
        case 'Current or Extended': return { name: 'Current or Extended', detail: 'No retirement date', capacity: Boolean(capacity) };
        case 'End of Life': return { name: 'End of Life', detail: date ? `Retires ${date}` : '', capacity: Boolean(capacity) };
        case 'Retired': return { name: 'Retired', detail: date ? `On ${date}` : '', capacity: Boolean(capacity) };
        default: return { name: 'Not checked', detail: 'Size not identified', capacity: false };
    }
}

// What the capacity restrictions mean, with the series they apply to.
// now: the day the list is planned (the report and the about file), or null (the page
// before a list is planned).
export function capacityWords(capacity, now = null) {
    return [
        `From ${capacity.since}${sinceWords(capacity, now)}, Microsoft restricts capacity growth for ${capacity.names.length} series.`,
        `These series are ${capacity.names.join(', ')}.`,
        'A new subscription cannot deploy these series.',
        'A subscription that you have now can deploy them in its approved quota, if the region has capacity.',
        'A deployment can fail if the region does not have capacity, also when quota is available.',
        'Azure approves no more quota for these series.',
        'The restrictions do not stop VMs that run now. They are not a retirement.',
    ];
}

// The v5 / v6 / v7 answer in the summary (a supported target shows its size).
const SHORT = {
    'Review - see needs-review.csv': 'Not checked',
    'No fitting size': 'No size with these vCPUs and memory',
    'No fitting size (data disks)': 'The size for this VM holds too few data disks',
    'No fitting size (NICs)': 'The size for this VM holds too few NICs',
    'No - Azure Disk Encryption with the preview feature': 'No - the preview feature with Azure Disk Encryption is not in this tool',
    'No - needs Gen2': 'No - needs a Generation 2 VM',
    'Not needed - already newer': 'Not needed - already newer',
    'Not needed - already on it': 'Not needed - already on this series',
    'Not needed - already on NVMe': 'Not needed - already on NVMe',
    'No - not planned by this tool': 'No - not in this tool',
    'No - HPC/FPGA out of scope': 'No - HPC and FPGA sizes not in this tool',
    'No - GPU out of scope': 'No - GPU sizes not in this tool',
    'No - Arm64 out of scope': 'No - Arm64 sizes not in this tool',
    'No - confidential VM out of scope': 'No - confidential VMs not in this tool',
    'No - retired size out of scope': 'No - retired size not in this tool',
    'No - family is not a target': 'No - Microsoft lists no target for this family',
    'No - out of scope': 'No - not in this tool',
    'No - Azure Disk Encryption': 'No - v6 and v7 do not support Azure Disk Encryption',
    'No - SAP': 'No - SAP needs a size that SAP certifies',
    'No - unmanaged disks': 'No - convert to managed disks first',
    'No - ephemeral OS disk': 'No - ephemeral OS disk not in this tool',
    'No - no size in this family': 'No size in this family',
    'No - network virtual appliance': 'No - network virtual appliance (ask the vendor)',
    'No - storage or backup appliance': 'No - storage or backup appliance (ask the vendor)',
    'No - managed application': 'No - managed application (ask the vendor)',
};
export const shortWords = (label) => (label in SHORT ? SHORT[label] : label);

// The v5 / v6 / v7 answer for one machine. A machine that is not moving shows
// a newer size only when one is supported (for reference), and otherwise
// "Not needed" - never a "no" (owner, 2026-10-09).
export function answerWords(m, series) {
    const label = m.short[series] || '';
    if (!label) return '';
    if (/^(Standard|Basic)_/.test(label)) return label;
    if (m.moveRequired === 'No') return label.startsWith('Not needed') ? shortWords(label) : 'Not needed';
    // A size that this tool does not recognise: nothing about it is checked.
    if (m.moveRequired === 'Review' && m.vm) return 'Not checked';
    return shortWords(label);
}

// Microsoft's public guidance, where the page sends a customer it cannot help.
export const GUIDANCE = {
    lifecycle: 'https://learn.microsoft.com/azure/virtual-machines/sizes/lifecycle/lifecycle-overview',
    endOfLife: 'https://learn.microsoft.com/azure/virtual-machines/sizes/lifecycle/end-of-life-sizes-list',
    retirements: 'https://learn.microsoft.com/azure/virtual-machines/sizes/lifecycle/retirements-and-capacity-restrictions',
    diskEncryption: 'https://learn.microsoft.com/azure/virtual-machines/disk-encryption-migrate',
    // Names the preview feature VMTempDiskResizePreview, in a Note about the NVMe conversion script (PREVIEW_LINK above).
    tempDiskPreview: 'https://learn.microsoft.com/azure/virtual-machines/nvme-linux',
};
