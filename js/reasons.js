// The reason for each answer, in the customer's words. One sentence or two,
// with the numbers that matter. Shown to the owner as one list (PLAN.md).

import { mappingFor, sizeGeneration, sizeRetirement } from './lifecycle.js?v=0.9.7-beta';
import { GUIDANCE, dateWords, stageWords } from './words.js?v=0.9.7-beta';

const SERIES = { v5: 'v5', v6: 'v6', v7: 'v7', gen1Route: 'Generation 2', burstable: 'burstable' };
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
// "Operating system: Windows Server 2016, Azure Linux, Debian, and any other operating
// system not listed under Trusted launch supported operating system (OS) version."
const GEN1_NOT_FOR = 'Microsoft does not support the upgrade for Windows Server 2016, Debian, Azure Linux or an OS version that Trusted launch does not support.';

// Each reason: (context) -> sentence. Context: { vm, series, table, now, option }.
export const REASONS = {
    // ---- Not needed ----
    'source-is-newer': ({ vm }) => `Not needed. This VM is on a ${sizeGeneration(vm.sourceSize)} size. That is newer than v5.`,
    'already-on-series': ({ series }) => `Not needed. This VM is on a ${series} size now.`,
    'already-on-nvme': ({ vm }) => `Not needed. This VM is on an NVMe size (${sizeGeneration(vm.sourceSize)}) now.`,

    // ---- Not in this tool (on purpose) ----
    // The Generation 1 to 2 row, by the OS of the image (0.9.7-beta, extras.js gen1Upgrade).
    // Microsoft Learn, "Upgrade Gen1 VMs to Trusted launch" (GUIDANCE.gen1Upgrade, updated
    // 2026-09-24), in its terms. Its prerequisites that the list cannot show: Azure Backup
    // with the Enhanced policy ("can't be enabled for VMs configured with Standard policy
    // backup protection"), Windows OS volume encryption such as BitLocker off before the
    // upgrade, Azure Site Recovery off before the upgrade ("can be re-enabled" after it).
    // The OS must be a "Trusted launch supported operating system (OS) version".
    'not-built-yet': ({ facts }) => {
        const linux = Boolean(facts?.linux);
        return 'To change a VM from Generation 1 to Generation 2, use the Trusted launch upgrade from Microsoft. You cannot undo this upgrade. This tool does not give the steps. '
            + 'The OS must be a version that Trusted launch supports. '
            + `The list does not show ${linux ? 'two' : 'three'} other conditions for the upgrade. `
            + 'Azure Backup must use the Enhanced policy, because the upgrade is not possible with the Standard policy. '
            + (linux ? '' : 'Before the upgrade, turn off Windows OS volume encryption, for example BitLocker. ')
            + 'Before the upgrade, turn off Azure Site Recovery. '
            + `You can turn ${linux ? 'it' : 'them'} on again after the upgrade. See the Microsoft page: ${GUIDANCE.gen1Upgrade}.`;
    },
    // "For Windows Server 2016 only, workaround is to update the Guest OS to Windows Server 2019 or 2022."
    'gen1-windows-server-2016': ({ facts }) => `${facts?.image ? `The image ${facts.image} is Windows Server 2016. ` : ''}`
        + 'Microsoft does not support the Trusted launch upgrade of a Generation 1 VM with Windows Server 2016. '
        + 'First, update the guest OS to Windows Server 2019 or 2022 with an in-place upgrade. '
        + 'Then use the Trusted launch upgrade to change the VM to Generation 2. You cannot undo this upgrade. This tool does not give the steps. '
        + `See the Microsoft pages: ${GUIDANCE.inPlaceUpgrade} and ${GUIDANCE.gen1Upgrade}.`,
    // Debian and Azure Linux: no workaround, only the registration. Never a new VM or a
    // rebuild (0.9.5-beta): the v5 size, when this tool has one, takes Generation 1.
    'gen1-os-registration': ({ facts }) => {
        const os = facts?.os || 'this OS';
        return `${facts?.image ? `The image ${facts.image} is ${os}. ` : ''}${facts?.oldName ? 'CBL-Mariner is the old name of Azure Linux. ' : ''}`
            + `Microsoft does not support the Trusted launch upgrade of a Generation 1 VM with ${os}. `
            + `Microsoft has a registration for Generation 1 Linux VMs that need this upgrade: ${GUIDANCE.gen1Registration}. `
            + (facts?.v5 ? `The v5 size ${facts.v5} supports Generation 1 VMs. A move to it does not need the upgrade. ` : '')
            + `See the Microsoft page: ${GUIDANCE.gen1Upgrade}.`;
    },
    // Linux: "only supported for VMs created using supported OS images published in Azure Marketplace".
    'gen1-linux-custom-image': ({ facts }) => 'Check: this tool cannot tell if Microsoft supports the Trusted launch upgrade for this VM. '
        + `The list gives no Azure Marketplace image for this Linux VM.${facts?.imageId ? ` The image ID is ${facts.imageId}.` : ''} `
        + 'Microsoft supports the upgrade of a Generation 1 Linux VM only when the VM comes from a supported OS image in the Azure Marketplace. '
        + `For other Generation 1 Linux VMs, Microsoft has a registration: ${GUIDANCE.gen1Registration}. `
        + `See the Microsoft page: ${GUIDANCE.gen1Upgrade}.`,
    // "For custom OS images or disks, the base image should be Trusted launch capable."
    'gen1-custom-image': ({ facts }) => `Check: the list gives no Azure Marketplace image for this VM.${facts?.imageId ? ` The image ID is ${facts.imageId}.` : ''} `
        + `This tool cannot tell the OS version. ${GEN1_NOT_FOR} `
        + (facts?.osKnown ? '' : 'For Linux, Microsoft supports the upgrade only from a supported OS image in the Azure Marketplace. ')
        + `For a custom image, the base image must be Trusted launch capable. See the Microsoft page: ${GUIDANCE.gen1Upgrade}.`,
    'gen1-image-unknown': () => 'Check: the list does not give the OS image. This tool cannot tell if Microsoft supports the Trusted launch upgrade for this VM. '
        + `${GEN1_NOT_FOR} See the Microsoft page: ${GUIDANCE.gen1Upgrade}.`,
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
    // What the list says, not a fact this tool checked (0.9.4-beta): with the sign, when the list gives it.
    'sap-needs-a-certified-size': ({ sapSign }) => `The list says this VM runs SAP.${sapSign ? ` "SAP sign" is "${sapSign}".` : ''} SAP supports only the sizes that SAP certifies (SAP Note 1928533). This tool cannot check that list.`,
    'nva-requires-parallel-deployment': () => 'This VM is a network virtual appliance. Network traffic goes through it, and a move stops the traffic. Ask the vendor which sizes they support. Then deploy a new appliance beside this one and move the traffic.',
    'managed-application-requires-vendor': () => 'This VM is part of a managed application from the Azure Marketplace. The vendor of the application owns the VM, and you cannot change it. Ask the vendor which sizes they support.',
    'storage-appliance-requires-vendor': () => 'This VM is a storage or backup appliance. The vendor certifies specific VM families, disk presentation and drivers. Ask the vendor which sizes they support before a move.',
    'unmanaged-os-disk': () => 'This VM has unmanaged disks (VHD files in a storage account). Convert them to managed disks first.',
    'ephemeral-os-disk': () => 'This VM has an ephemeral OS disk. That disk is on the host, so its data does not stay when the VM moves to other hardware. This tool gives no target size for this VM.',

    // ---- No size fits (a fact) ----
    'not-in-region': ({ series, vm }) => `Azure has no ${series} size with the same name as this size${vm?.sourceSize ? ` (${vm.sourceSize})` : ''}. Other ${series} sizes can fit, but they can change the processor or the number of active vCPUs. Select a ${series} size by hand.`,
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
    // 0.9.5-beta: a resize that crosses the SCSI temporary disk boundary needs the preview
    // feature on Windows (lifecycle.js, previewFeature). Lab tests did not use the feature
    // with Azure Disk Encryption, and no size of this shape keeps the temporary disk type.
    'os-unknown-encryption': () => 'The list does not give the OS. On a Windows VM, this resize needs the preview feature VMTempDiskResizePreview. Lab tests did not use the feature with Azure Disk Encryption. Give the OS in the list.',
    'disk-encryption-preview': ({ series }) => `This VM has Azure Disk Encryption. The resize to ${series} needs the preview feature VMTempDiskResizePreview, because the temporary disk changes type. Lab tests did not use the feature with Azure Disk Encryption, so this tool does not plan it. ${series === 'burstable' ? 'No Bsv2 or Basv2 size has a temporary disk.' : `No ${series} size of this shape keeps the temporary disk type.`}`,
    // The size table does not give the temporary disk of one of the two sizes (review, 2026-11-06).
    'encryption-temp-disk-unknown': () => 'This VM has Azure Disk Encryption. The size table does not give the temporary disk of the current size or the new size. On Windows, a resize to another type of temporary disk needs the preview feature VMTempDiskResizePreview. This tool does not plan the feature with Azure Disk Encryption.',

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
    'size-unreadable': ({ problem }) => `This tool cannot read the current size${problem?.value ? ` "${problem.value}"` : ''}. Use the Azure name, for example Standard_D4s_v3.`,
    'generation-missing': ({ problem }) => `The generation is empty or not valid.${problem?.value ? ` The list gives "${problem.value}".` : ''} Run the Azure Resource Graph query in step 1 again, or type the generation (1 or 2) for this VM.`,
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
    const sapSign = row.machine.extra ? row.machine.extra.sapSign : null;
    const why = row.codes.map((c) => reasonFor(c, { vm, series, table, now, option: row.option, facts: row.option.facts || undefined, sapSign })).join(' ');
    // Not moving: the option is for reference only.
    // A "Check:" reason keeps its own word.
    if (row.moveRequired === 'No' && !why.startsWith('Not needed')) return `No move needed. ${why.startsWith('Check:') ? '' : 'Note: '}${why}`;
    return why;
}
