// The reason for each answer, in the customer's words. One sentence or two,
// with the numbers that matter. Shown to the owner as one list (PLAN.md).

import { mappingFor, sizeGeneration, sizeRetirement } from './lifecycle.js?v=0.5.1-beta';
import { dateWords, stageWords } from './words.js?v=0.5.1-beta';

const SERIES = { v5: 'v5', v6: 'v6', v7: 'v7', gen1Route: 'Generation 2', burstable: 'burstable' };
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

// Each reason: (context) -> sentence. Context: { vm, series, table, now, option }.
export const REASONS = {
    // ---- Not needed ----
    'source-is-newer': ({ vm }) => `Not needed. This VM is on a ${sizeGeneration(vm.sourceSize)} size. That is newer than v5.`,
    'already-on-series': ({ series }) => `Not needed. This VM is on a ${series} size now.`,
    'already-on-nvme': ({ vm }) => `Not needed. This VM is on an NVMe size (${sizeGeneration(vm.sourceSize)}) now.`,

    // ---- Not in this tool (on purpose) ----
    'not-built-yet': () => 'To change a VM from Generation 1 to Generation 2, use the Trusted launch upgrade from Microsoft. You cannot undo this upgrade. This tool does not give the steps. See the Microsoft guidance.',
    'gen1-requires-redeploy': ({ series }) => `${series} sizes support only Generation 2 VMs. This VM is Generation 1.`,
    'confidential-vm-requires-manual': () => 'This tool gives no target size for confidential VMs. A confidential VM moves to a newer confidential size, for example from DCasv5 to DCasv6.',
    'confidential-family': () => 'This tool gives no target size for the confidential computing sizes (the DC and EC families). See the Microsoft guidance for this family.',
    'hpc-or-fpga-size': () => 'This tool gives no target size for HPC or FPGA sizes. See the Microsoft guidance for this family.',
    'local-nvme-storage-size': () => 'This tool gives no target size for the Ls and Lsv2 storage sizes. Microsoft recommends newer L sizes.',
    'l-series-replacement': () => 'This tool gives no target size for G and Gs sizes. Microsoft recommends the L series.',
    'gpu-size': () => 'This tool gives no target size for GPU sizes (the N family). A D or E size has no GPU.',
    'size-retired': ({ vm, now }) => {
        const r = sizeRetirement(vm.sourceSize);
        const when = r ? (Date.parse(r.retiresUtc) <= now.getTime() ? `Microsoft retired this size on ${dateWords(r.retiresUtc)}. ` : `Microsoft retires this size on ${dateWords(r.retiresUtc)}. `) : '';
        return `${when}This tool gives no target size for a VM on a retired size. First, move the VM to a size that is Current or Extended.`;
    },
    'processor-not-approved': ({ facts }) => `This VM has an ${facts?.processor || 'Arm64'} processor. Microsoft lists only Intel and AMD sizes as v5, v6 and v7 targets.`,
    'not-approved': ({ series, facts }) => `Microsoft lists no ${series} target size for the ${facts?.family || 'same'} family.`,
    'excluded': () => 'Another Azure service manages this VM. This tool gives no target size for it.',
    'disk-encryption-present': () => 'v6 and v7 sizes do not support Azure Disk Encryption. Microsoft retires Azure Disk Encryption on 15 September 2028. Move to encryption at host with the Microsoft migration steps. They make new disks and a new VM, because an encrypted disk keeps a flag after decryption.',
    'sap-needs-a-certified-size': () => 'This VM runs SAP. SAP supports only the sizes that SAP certifies (SAP Note 1928533). This tool cannot check that list.',
    'nva-requires-parallel-deployment': () => 'This VM is a network virtual appliance. Network traffic goes through it, and a move stops the traffic. Ask the vendor which sizes they support. Then deploy a new appliance beside this one and move the traffic.',
    'storage-appliance-requires-vendor': () => 'This VM is a storage or backup appliance. The vendor certifies specific VM families, disk presentation and drivers. Ask the vendor which sizes they support before a move.',
    'unmanaged-os-disk': () => 'This VM has unmanaged disks (VHD files in a storage account). Convert them to managed disks first.',
    'ephemeral-os-disk': () => 'This VM has an ephemeral OS disk. That disk is on the host, so its data does not stay when the VM moves to other hardware. This tool gives no target size for this VM.',

    // ---- No size fits (a fact) ----
    'not-in-region': ({ series }) => `Azure has no ${series} size with the same name as this size. Other ${series} sizes can fit, but they can change the processor or the number of active vCPUs. Select a ${series} size by hand.`,
    // A size that is not in the size table is not known: say that, not a fact about its family.
    'family-not-in-region': ({ series, facts, vm, table }) => (vm && table && !table.has(vm.sourceSize)
        ? 'Not checked. This tool cannot identify this size.'
        : `Azure has no ${series} size in the ${facts?.family || 'same'} family. This tool has no size to suggest. See the Microsoft guidance for this family.`),
    'no-shape-fit': ({ series, facts }) => `Azure has no ${series} Dl, D or E size with at least ${facts.vcpus} vCPUs and ${facts.memoryGB} GiB for this VM.`,
    'too-few-data-disks': ({ series, facts }) => `The ${series} size for this VM holds fewer than ${plural(facts.required, 'data disk', 'data disks')}.` +
        (facts.suggestion ? ` A larger size, ${facts.suggestion.name}, holds up to ${facts.suggestion.max}.` : ' Use a larger size, or remove some data disks.'),
    'too-few-nics': ({ series, facts }) => `The ${series} size for this VM holds fewer than ${plural(facts.required, 'NIC', 'NICs')}.` +
        (facts.suggestion ? ` A larger size, ${facts.suggestion.name}, holds up to ${facts.suggestion.max}.` : ' Use a larger size, or remove a NIC.'),
    'smaller-than-source': ({ series, facts }) => `Each ${series} size of this name is smaller than this VM (${facts.vcpus} vCPUs, ${facts.memoryGB} GiB). This tool does not suggest a smaller size.`,
    'no-burstable-fit': ({ facts }) => `No Bsv2 or Basv2 size has at least ${facts?.vcpus} vCPUs and ${facts?.memoryGB} GiB and also supports the generation, NICs and data disks of this VM.`,
    'gen1-no-size': ({ series }) => `No ${series} size for this VM supports Generation 1 VMs.`,
    'os-unknown-encryption': () => 'The list does not give the OS. On a Windows VM, this move is a rebuild, and a rebuild removes Azure Disk Encryption. Give the OS in the list.',
    'disk-encryption-rebuild': ({ series }) => `This VM has Azure Disk Encryption. The move to ${series} is a rebuild, and a rebuild removes the encryption. Only a resize keeps it.`,

    // ---- Not checked ----
    'processor-unreadable': () => 'This tool cannot read the processor type from the size name.',
    'shape-unknown': () => 'The size table does not give the vCPUs and memory of this size. This tool cannot make sure that the new size is not smaller.',
    'mapped-unverified': ({ option }) => `${option?.targetSize || 'The new size'} is not in the size table. This tool cannot check its limits.`,
    'no-path': () => 'This tool found a new size, but it cannot tell how to make the move.',
    'chosen-size-gone': () => 'The size that you chose is not available for this VM.',
    'region-not-read': () => 'This tool cannot read the sizes for this region.',

    // ---- A row that this tool cannot read ----
    'machine-name-empty': () => 'The VM name is empty.',
    'size-empty': () => 'The current size is empty.',
    'size-unreadable': () => 'This tool cannot read the current size. Use the Azure name, for example Standard_D4s_v3.',
    'generation-missing': () => 'The generation is empty or not valid. Run the Azure Resource Graph query in step 1 again, or type the generation (1 or 2) for this VM.',
    'scale-set-generation-missing': () => 'Azure Resource Graph does not give the generation of a scale set. Type the generation (1 or 2) of the scale set image in the Generation column.',
    'generation-conflicts-with-security-type': ({ problem }) => `The list gives Generation 1, but ${problem?.securityWords || 'this security type'} needs Generation 2. Check the two values.`,

    // ---- Supported, but this tool does not know a fact that it needs ----
    'stage-unknown': ({ vm }) => `This tool cannot identify ${vm.sourceSize}. It does not know the lifecycle stage. Check the size name.`,
    'target-stage-unknown': ({ option }) => `This tool does not know the lifecycle stage of ${option.targetSize}.`,
    'target-not-in-table': ({ option }) => `${option.targetSize} is not in the size table. This tool cannot check its limits.`,
    'must-move-no-target': ({ stage }) => `${stageWords(stage, null)} No size fits this VM.`,
};

const MAPPING_CODES = ['not-in-region', 'family-not-in-region', 'no-shape-fit', 'too-few-data-disks', 'too-few-nics',
    'smaller-than-source', 'gen1-no-size', 'not-approved', 'processor-not-approved'];

// The sentence for one code.
export function reasonFor(code, ctx) {
    const f = REASONS[code];
    if (!f) return `Unknown reason: ${code}.`;
    let facts = ctx.facts;
    if (!facts && MAPPING_CODES.includes(code) && ctx.vm && ctx.table && ctx.series in SERIES && ctx.series !== 'gen1Route') {
        const m = mappingFor(ctx.vm, ctx.table, ctx.series, ctx.now || new Date());
        if (m.code === code) facts = m.facts;
    }
    try { return f({ ...ctx, facts }); } catch { return `Unknown reason: ${code}.`; }
}

// The reason column for one option row.
export function optionReason(row, table, now = new Date()) {
    const vm = row.machine.vm;
    const series = row.series === 'gen1Route' ? 'gen1Route' : row.series;
    if (row.option.supported) {
        let r = series === 'burstable'
            ? 'Supported for this size and generation. Bsv2 and Basv2 use CPU credits, as the current size does. Microsoft recommends them as a replacement.'
            : 'Supported for this size and generation.';
        if (row.moveRequired === 'No') r += ' This VM does not need to move now.';
        for (const w of row.reviewWhy) r += ' ' + reasonFor(w, { vm, series, table, now, option: row.option });
        return r;
    }
    const why = row.codes.map((c) => reasonFor(c, { vm, series, table, now, option: row.option, facts: row.option.facts || undefined })).join(' ');
    // Not moving: the option is for reference only.
    if (row.moveRequired === 'No' && !why.startsWith('Not needed')) return `No move needed. Note: ${why}`;
    return why;
}
