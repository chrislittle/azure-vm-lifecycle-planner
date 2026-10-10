// The facts the Azure Resource Graph query adds beyond size and generation:
// reading them from the list, the reasons they give an option, and the
// notes on every target - a problem, or "check" when the list
// does not say. Unknown is never a pass.

import storageImages from '../data/storage-appliance-images.js?v=0.3.1-beta';
import nvaImages from '../data/nva-images.js?v=0.3.1-beta';
import nvme from '../data/nvme-images.js?v=0.3.1-beta';
import { readCount } from './planner.js?v=0.3.1-beta';

// Yes / No -> true / false; anything else (blank) -> null.
export function readYesNo(text) {
    const t = String(text ?? '').trim().toLowerCase();
    if (['yes', 'y', 'true', '1', 'on', 'enabled'].includes(t)) return true;
    if (['no', 'n', 'false', '0', 'off', 'disabled'].includes(t)) return false;
    return null;
}

// The extra facts of one row. Each is null when the list does not say.
export function readExtras(cell) {
    const yes = (column) => readYesNo(cell(column));
    const an = readCount(cell('Accelerated NICs'));
    const zone = cell('Zone');
    const resourceType = cell('Resource type');
    const sql = cell('SQL Server');
    return {
        imagePublisher: cell('Image publisher'), imageOffer: cell('Image offer'), imageSku: cell('Image SKU'),
        acceleratedNicCount: an.value,
        primaryNicAccelerated: yes('Primary NIC accelerated'),
        diskEncryption: yes('Azure Disk Encryption'),
        hibernation: yes('Hibernation'),
        scaleSet: yes('Scale set'),
        virtualDesktop: yes('Azure Virtual Desktop'),
        sap: yes('SAP'),
        unmanagedDisks: yes('Unmanaged disks'),
        ephemeralOsDisk: yes('Ephemeral OS disk'),
        systemIdentity: yes('System-assigned identity'),
        availabilitySet: yes('Availability set'),
        zone: zone ? zone : null,
        // The workload pattern (patterns.js).
        resourceType: /^scale ?set$/i.test(resourceType) ? 'Scale set' : /^vm$/i.test(resourceType) ? 'VM' : null,
        instances: readCount(cell('Instances')).value,
        managedBy: cell('Managed by') || null,
        hostPoolType: cell('AVD host pool type') || null,
        // The SQL Server edition, false for 'No', null when the list does not say.
        sqlServer: sql === '' ? null : readYesNo(sql) === false ? false : sql,
        sqlGroup: yes('SQL availability group'),
        sharedDisk: yes('Shared disk'),
    };
}

// Is this marketplace image a network virtual appliance? Microsoft's list
// (an Azure built-in policy): the publisher AND the offer must match. A * matches
// any text; case is ignored. A custom image (no publisher) cannot tell: false,
// and the tool says nothing about it, as for any VM that is not an appliance.
// One pattern: the text between the * signs must appear in order; the first part
// at the start and the last part at the end.
function like(value, pattern) {
    const v = value.toLowerCase();
    const parts = pattern.toLowerCase().split('*');
    if (parts.length === 1) return v === parts[0];
    if (!v.startsWith(parts[0]) || !v.endsWith(parts[parts.length - 1])) return false;
    let at = parts[0].length;
    for (const part of parts.slice(1, -1)) {
        const i = v.indexOf(part, at);
        if (i < 0) return false;
        at = i + part.length;
    }
    return at <= v.length - parts[parts.length - 1].length;
}
const likeAny = (value, patterns) => patterns.some((p) => like(value, p));
export function isApplianceImage(publisher, offer) {
    if (!publisher || !offer) return false;
    return likeAny(publisher, nvaImages.publishers) && likeAny(offer, nvaImages.offers);
}

// Is this marketplace image a storage or backup appliance? Our own list from the
// Azure Marketplace catalog: the publisher, and one of that publisher's offers.
export function isStorageApplianceImage(publisher, offer) {
    if (!publisher || !offer) return false;
    return storageImages.vendors.some((v) => v.publisher.toLowerCase() === String(publisher).toLowerCase() && likeAny(offer, v.offers));
}

// The reasons the extra facts give, as the target logic reads them. Each
// applies to the series its rule names (data/series-rules.js).
export function extraBlockers(x) {
    const out = [];
    if (x.diskEncryption === true) out.push('disk-encryption-present');
    if (x.sap === true) out.push('sap-needs-a-certified-size');
    if (x.unmanagedDisks === true) out.push('unmanaged-os-disk');
    if (x.ephemeralOsDisk === true) out.push('ephemeral-os-disk');
    // Traffic goes through an appliance: it is rebuilt beside the old one with
    // the vendor, never moved in place.
    if (isApplianceImage(x.imagePublisher, x.imageOffer)) out.push('nva-requires-parallel-deployment');
    // A storage or backup appliance: vendor validation first (owner, 2026-10-10).
    if (isStorageApplianceImage(x.imagePublisher, x.imageOffer)) out.push('storage-appliance-requires-vendor');
    return out;
}

// ---------------------------------------------------------------------------
// Does the OS image support NVMe? true / false / null (cannot tell)
// ---------------------------------------------------------------------------

function onList(os, major, minor) {
    const rule = nvme.linux[os];
    if (!rule || major === null) return null;
    const row = rule.supported.find(([maj]) => maj === major);
    if (!row) {
        const lowest = Math.min(...rule.supported.map(([maj]) => maj));
        return major < lowest ? false : null;   // newer than the list: cannot tell
    }
    if (minor === null) return true;            // a rolling image: the newest of that version
    return minor >= row[1];
}

export function imageSupportsNvme(publisher, offer, sku) {
    const p = String(publisher ?? '').toLowerCase();
    const o = String(offer ?? '').toLowerCase();
    const s = String(sku ?? '').toLowerCase();
    if (!p) return null;   // a custom image: nothing to read
    const both = `${o} ${s}`;
    let m;
    switch (p) {
        case 'microsoftwindowsserver': {
            m = /(20\d\d)/.exec(both);
            return m ? parseInt(m[1], 10) >= nvme.windowsServerFrom : null;
        }
        case 'microsoftsqlserver': {
            m = /ws(20\d\d)/.exec(both);
            return m ? parseInt(m[1], 10) >= nvme.windowsServerFrom : null;
        }
        case 'microsoftwindowsdesktop': {
            m = /win(?:dows)?-?(\d{1,2})\b/.exec(both);
            return m ? nvme.windowsClient.includes(parseInt(m[1], 10)) : null;
        }
        case 'canonical': {
            m = /(\d{2})[._](\d{2})/.exec(both);
            if (!m) return null;
            const major = parseInt(m[1], 10), minor = parseInt(m[2], 10);
            if (major < 18) return false;
            if (minor !== 4) return null;   // an interim release: not on the list either way
            return nvme.linux.ubuntu.supported.some(([maj]) => maj === major) ? true : null;
        }
        case 'redhat': {
            m = /^(\d)(?:[._]?(\d{1,2}))?(?:[^\d]|$)/.exec(s);
            return m ? onList('rhel', parseInt(m[1], 10), m[2] !== undefined ? parseInt(m[2], 10) : null) : null;
        }
        case 'suse': {
            m = /sles(-sap)?-(\d+)(?:-sp(\d+))?/.exec(both);
            return m ? onList(m[1] ? 'sles-sap' : 'sles', parseInt(m[2], 10), m[3] !== undefined ? parseInt(m[3], 10) : 0) : null;
        }
        case 'debian': {
            m = /debian-(\d+)/.exec(both);
            return m ? onList('debian', parseInt(m[1], 10), 0) : null;
        }
        case 'oracle': {
            m = /ol(\d)(\d{0,2})/.exec(s);
            return m ? onList('oracle', parseInt(m[1], 10), m[2] ? parseInt(m[2], 10) : null) : null;
        }
        case 'almalinux': {
            m = /^(\d+)(?:[._](\d+))?/.exec(s);
            return m ? onList('almalinux', parseInt(m[1], 10), m[2] !== undefined ? parseInt(m[2], 10) : null) : null;
        }
        case 'resf': {
            m = /^(\d+)(?:[._](\d+))?/.exec(s);
            return m ? onList('rocky', parseInt(m[1], 10), m[2] !== undefined ? parseInt(m[2], 10) : null) : null;
        }
        case 'microsoftcblmariner': {
            m = /azure-linux-(\d+)/.exec(both);
            if (m) return onList('azurelinux', parseInt(m[1], 10), null);
            return /cbl-mariner/.test(both) ? false : null;
        }
        case 'openlogic':   // CentOS: not on Microsoft's list
            return false;
        default:
            return null;
    }
}

// ---------------------------------------------------------------------------
// The caveats on one option
// ---------------------------------------------------------------------------

// One note: { state: 'problem' | 'attention' | 'check' | '', text }. A problem is a readiness
// signal (Microsoft's term): its text is the recommended action, a step the
// customer can take, so that it does not read as a dead end.
// A fact that is fine shows nothing (owner, 2026-10-09: show only what needs
// attention, so that it is simple to see).
const fine = () => ({ state: '', text: '' });
const problem = (text) => ({ state: 'problem', text });
const check = (text) => ({ state: 'check', text });
// A fact to know, with nothing to do first (peer, 2026-10-09: "these are not
// really problems"). It does not stop a VM from being ready.
const attention = (text) => ({ state: 'attention', text });
const none = { state: '', text: '' };

// The caveats for one option of one machine. Agreed wording (PLAN.md).
export function caveats(vm, x, option) {
    const series = option.option;
    if (series === 'gen1Route') return {};
    const hasTarget = Boolean(option.targetSize);
    const isNvme = series === 'v6' || series === 'v7';
    const out = {};

    // NVMe OS support.
    if (!isNvme) out['NVMe'] = fine(series === 'burstable' ? 'No change. Bsv2 keeps SCSI disks.' : 'No change. v5 keeps SCSI disks.');
    else {
        const ok = imageSupportsNvme(x.imagePublisher, x.imageOffer, x.imageSku);
        out['NVMe'] = ok === true ? fine('The OS supports NVMe.')
            : ok === false ? problem('Update the OS to a version on the Microsoft NVMe list, or rebuild from a newer image.')
            : check('Check: the list does not give the OS image. The OS must support NVMe.');
    }

    // Azure Disk Encryption.
    out['Disk encryption'] = x.diskEncryption === false ? fine('No Azure Disk Encryption.')
        : x.diskEncryption === true ? problem(isNvme ? 'v6 and v7 do not support Azure Disk Encryption. Decrypt the disks, or use encryption at host on the new VM.' : 'Use a resize: a resize keeps Azure Disk Encryption, and a rebuild removes it.')
        : check('Check: the list does not say if the VM uses Azure Disk Encryption.');

    // Temporary disk (from the size table).
    if (!hasTarget) out['Temporary disk'] = none;
    else if (vm.sourceTempDisks === 0) out['Temporary disk'] = fine('No temporary disk.');
    else if (vm.sourceTempDisks > 0 && option.tempDisksTo === 0) out['Temporary disk'] = attention('The new size has no temporary disk. Data on the current temporary disk does not move.');
    else if (vm.sourceTempDisks > 0) out['Temporary disk'] = attention('Data on the temporary disk does not move. Keep nothing there that you need.');
    else out['Temporary disk'] = check('Check: the size table does not give the temporary disk. You lose the data on it when you move.');

    // Accelerated networking (from the target logic).
    const an = option.acceleratedNetworking;
    if (!hasTarget) out['Accelerated networking'] = none;
    else if (an.required === false) out['Accelerated networking'] = fine('The new size does not need it.');
    else if (an.turnsOn === true) out['Accelerated networking'] = problem('Turn on accelerated networking before the move. The new size needs it.');
    else if (an.required === true && an.turnsOn === false) out['Accelerated networking'] = fine('On.');
    else out['Accelerated networking'] = check('Check: the list does not say if accelerated networking is on. The new size needs it.');

    // NICs and data disks: the target was chosen to hold them.
    out['NICs'] = !hasTarget ? none : vm.nicCount !== undefined ? fine(`${vm.nicCount} NIC${vm.nicCount === 1 ? '' : 's'}. The new size holds ${vm.nicCount === 1 ? 'it' : 'them'}.`) : check('Check: the list does not give the NIC count. This tool chose the size for 1 NIC.');
    out['Data disks'] = !hasTarget ? none : vm.dataDiskCount !== undefined ? fine(`${vm.dataDiskCount} data disk${vm.dataDiskCount === 1 ? '' : 's'}. The new size holds ${vm.dataDiskCount === 1 ? 'it' : 'them'}.`) : check('Check: the list does not give the data-disk count. This tool chose the size for 0 data disks.');

    out['Hibernation'] = x.hibernation === false ? fine('Off.') : x.hibernation === true ? problem('Turn off hibernation before the move.') : check('Check: the list does not say if hibernation is on.');

    out['Scale set / AKS / AVD'] = x.scaleSet === true ? problem('Change the size in the scale set or node pool, not on each VM. See the workload type.')
        // A personal desktop is the VM of one user: it moves as a normal VM.
        : x.virtualDesktop === true && /^personal$/i.test(x.hostPoolType || '') ? attention('A personal desktop. The user cannot use it during the move. Tell the user first.')
        : x.virtualDesktop === true ? problem('Make new session hosts at the new size from the image. Then remove this host.')
        : x.scaleSet === false && x.virtualDesktop === false ? fine('Not in a scale set.')
        : check('Check: the list does not say if this VM is in a scale set or in Azure Virtual Desktop.');

    out['SAP'] = x.sap === false ? fine('Not SAP.') : x.sap === true ? problem('Confirm that SAP certifies the new size (SAP Note 1928533).') : check('Check: the list does not say if this VM runs SAP.');
    out['Unmanaged disks'] = x.unmanagedDisks === false ? fine('Managed disks.') : x.unmanagedDisks === true ? problem('Convert the unmanaged disks to managed disks first.') : check('Check: the list does not say if the disks are managed disks.');
    out['Ephemeral OS disk'] = x.ephemeralOsDisk === false ? fine('Not ephemeral.') : x.ephemeralOsDisk === true ? problem('Confirm that the new size has space for the ephemeral OS disk.') : check('Check: the list does not say if the OS disk is ephemeral.');

    // A system-assigned identity is kept on a resize and lost on a rebuild.
    if (x.systemIdentity === false) out['Identity'] = fine('No system-assigned identity.');
    else if (x.systemIdentity === true) {
        // On v6 and v7 the move is a new VM (deploy in parallel), which gets a new identity.
        const newVm = isNvme || option.rebuild;
        out['Identity'] = !hasTarget ? none
            : newVm ? problem('Record the role assignments of the system-assigned identity. A new VM gets a new identity: add them to it again.')
            : !vm.os ? check('Check: the list does not give the OS. A rebuild removes the system-assigned identity.')
            : fine();
    } else out['Identity'] = check('Check: the list does not say if the VM has a system-assigned identity.');

    out['Availability set'] = x.availabilitySet === false ? fine('Not in an availability set.') : x.availabilitySet === true ? attention('All the VMs in the availability set can need to stop for the move.') : check('Check: the list does not say if the VM is in an availability set.');
    // Only on an appliance: on any other VM this note says nothing (owner, 2026-10-09).
    out['Network virtual appliance'] = isApplianceImage(x.imagePublisher, x.imageOffer)
        ? problem('Ask the vendor which sizes they certify.') : none;
    // Only on a storage or backup appliance.
    out['Storage or backup appliance'] = isStorageApplianceImage(x.imagePublisher, x.imageOffer)
        ? problem('Ask the vendor which sizes they certify.') : none;
    out['Zone'] = x.zone ? fine(/^none$/i.test(x.zone) ? 'No zone.' : `Zone ${x.zone}.`) : check('Check: the list does not give the zone. The new size must be available in it.');
    return out;
}
