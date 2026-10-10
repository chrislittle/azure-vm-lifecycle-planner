// The customer's words for every result (PLAN.md, "Words for a customer").
// The logic works with plain labels; only this file says them to a customer.

// All customer text follows ASD-STE100 Simplified Technical English (owner,
// 2026-10-09): short sentences, one idea in each, active voice, no contractions.

// The headline result for a machine.
export const OUTCOME = {
    'No move required': 'No move needed. Microsoft supports this size.',
    'Must move - supported target': 'Move needed. The table shows the supported sizes.',
    'Must move - outside the scope of this tool': 'Move needed. This tool has no size to suggest. See the reason.',
    'Needs team review': 'Not checked. This tool cannot read this VM or its size.',
};

// The result groups, in Microsoft's terms where Microsoft has them (lifecycle
// overview: "modern sizes"; v6/v7 Assess page: "hard gates", "readiness
// signals"). Peer feedback (2026-10-09): ready and "do this first" apart, and a
// readiness signal must not read as an unsolvable blocker.
export const GROUPS = {
    modern: { short: 'Modern size - no move needed', long: 'No move needed. This is a modern size: Microsoft fully supports it.' },
    ready: { short: 'Move needed - ready', long: 'Move needed. A supported size is available, and the list shows no readiness signal to act on.' },
    first: { short: 'Move needed - do this first', long: 'Move needed. A supported size is available. First, do the recommended actions in the readiness signals.' },
    gate: { short: 'Move needed - hard gate', long: 'Move needed. A hard gate applies: SAP or the vendor of the appliance must certify the new size. See the reason.' },
    nopath: { short: 'Move needed - no supported size', long: 'Move needed. This tool has no supported size for this VM. See the reason.' },
    unchecked: { short: 'Not checked', long: 'Not checked. This tool cannot read this VM or its size.' },
};

// Why a size is on the ranked list. processor: the name of the other processor.
export function rankWords(why, processor) {
    return {
        'closest': 'Closest match',
        'processor': `Same shape, ${processor} processor*`,
        'temp-disk-removed': 'Same shape, no temporary disk',
        'temp-disk-added': 'Same shape, with a temporary disk',
        'more-memory': 'More memory for each vCPU',
        'other-shape': 'Other shape that fits',
    }[why] || why;
}
export const PROCESSOR_NOTE = '* A processor change. Test the application, and check its licence terms.';

// How to move to a supported size. Microsoft: v5 - "Resize the current VM" when
// the VM supports the target size (v5 overview, "Choose a transition method");
// v6 and v7 - "not a normal VM resize": deploy in parallel, highly recommended
// (v6/v7 FAQ and Plan page).
export function moveWords(series, rebuild, osKnown) {
    if (series === 'v6' || series === 'v7') {
        return 'Deploy a new VM at this size in parallel, move the workload, then retire the old VM. Microsoft highly recommends this for v6 and v7. An in-place upgrade is possible, but it has more steps and more risk.';
    }
    if (rebuild) return 'Rebuild from a current image. A Windows VM needs a rebuild here because the temporary disk changes type.';
    if (!osKnown) return 'Resize the current VM. If it is a Windows VM, a rebuild can be necessary because the temporary disk changes type.';
    return 'Resize the current VM. Azure supports a resize to this size.';
}

// Microsoft's workload patterns (v6/v7 modernization guide, "Discover"). The
// advice: A to D - replace the pool, or change the size in the service; E and F -
// resize v5 in place, deploy v6 and v7 in parallel; F one node at a time; G - a
// hard gate (owner, 2026-10-10). The page shows plain names, not the letters
// (owner, 2026-10-10: a quick user does not know what "pattern A" means).
export const PATTERNS = {
    A: { name: 'Node pool or scale set', advice: 'This VM is part of a pool (AKS, Azure Red Hat OpenShift or a scale set). Do not change the size of each VM. Add a new node pool or scale set at the new size, move the workload to it, then remove the old one.' },
    B: { name: 'Pooled AVD host', advice: 'This VM is a session host in a pooled Azure Virtual Desktop host pool. Do not change the size of the host. Make new session hosts at the new size from the image. Move the users to them, then remove the old hosts.' },
    C: { name: 'Managed by a service', advice: 'A service (for example Azure Databricks) manages this VM. Do not change the VM. Change the node type or size in the service.' },
    D: { name: 'Cluster in a service', advice: 'Make a new cluster at the new size in the service. Then remove the old cluster.' },
    E: { name: 'Standalone VM', advice: 'You manage this VM. Use the move that this tool gives for each series.' },
    F: { name: 'Cluster or database', advice: 'This VM holds state or is part of a cluster (SQL Server, a failover cluster or SAP). Move one node at a time. First move the role away from the node (fail over or drain). For v5, resize the node. For v6 and v7, add a new node at the new size and remove the old node. Check the health of the cluster before the next node.' },
    G: { name: 'Vendor appliance', advice: 'This VM is a vendor appliance. Do not change the size in place. Ask the vendor which sizes they certify. Deploy a new appliance beside this one, then move the traffic.' },
    '': { name: 'Type not checked', advice: 'The list does not give the facts that find the workload type. Run the Azure Resource Graph query in step 1 to get them.' },
};
// The patterns where the series advice ("resize", "deploy in parallel") does not apply.
export const POOL_PATTERNS = ['A', 'B', 'C', 'D'];

// What this tool cannot find. The customer must look for these.
export const NOT_FOUND = 'This tool cannot find these workloads. Look for them yourself: Active Directory domain controllers (move one at a time), self-hosted CI agents on single VMs, and NoSQL or search clusters (move one node at a time). It also cannot find compute that is not in your subscription, for example Azure Machine Learning, HDInsight, Azure Data Explorer and Synapse Spark. Change the size of that compute in the service.';

// A short label for counts and filters.
export const OUTCOME_SHORT = {
    'No move required': 'No move needed',
    'Must move - supported target': 'Move needed',
    'Must move - outside the scope of this tool': 'Move needed - no suggestion',
    'Needs team review': 'Not checked',
};

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const LONG_MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

// '2028-05-01' -> '1 May 2028'; with short months, '2025-09-30' -> '30 Sep 2025'.
export function dateWords(iso, short = false) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso ?? ''));
    if (!m) return String(iso ?? '');
    const month = (short ? MONTHS : LONG_MONTHS)[parseInt(m[2], 10) - 1];
    return `${parseInt(m[3], 10)} ${month} ${m[1]}`;
}

// The current size's stage, in words. capacity: the capacity data, or null.
export function stageWords(stage, capacity) {
    let w;
    switch (stage.stage) {
        case 'Current': w = 'Current. This is the newest series, and Microsoft fully supports it.'; break;
        case 'Extended': w = 'Extended. Microsoft fully supports this series. Newer series are available.'; break;
        case 'Current or Extended': w = 'Current or Extended. Microsoft has not announced a retirement date.'; break;
        case 'End of Life': w = stage.retiresUtc ? `End of Life. Microsoft retires this series on ${dateWords(stage.retiresUtc)}. Plan a move before that date.` : 'End of Life. Plan a move.'; break;
        case 'Retired': w = stage.retiresUtc ? `Retired on ${dateWords(stage.retiresUtc)}. A VM on this size cannot run.` : 'Retired. A VM on this size cannot run.'; break;
        case null: case undefined: return 'Not checked. This tool cannot identify this size.';
        default: w = String(stage.stage);
    }
    if (capacity) w += ` From ${capacity.since}, Microsoft limits new capacity for this series.`;
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
export function capacityWords(capacity) {
    return [
        `From ${capacity.since}, Microsoft limits these old series: ${capacity.names.join(', ')}.`,
        'A new subscription cannot create a VM of these series.',
        'A subscription that you already have can create a VM of these series only in its current quota.',
        'It can do this only when Azure has capacity.',
        'Microsoft does not approve more quota for these series.',
    ];
}

// The v5 / v6 / v7 answer in the summary (a supported target shows its size).
const SHORT = {
    'Review - see needs-review.csv': 'Not checked',
    'No fitting size': 'No size with these vCPUs and memory',
    'No fitting size (data disks)': 'The size for this VM holds too few data disks',
    'No fitting size (NICs)': 'The size for this VM holds too few NICs',
    'No - a rebuild cannot keep Azure Disk Encryption': 'No - the move removes Azure Disk Encryption',
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
};
