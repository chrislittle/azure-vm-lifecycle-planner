// The facts the Azure Resource Graph query adds beyond size and generation:
// reading them from the list, the reasons they give an option, and the
// caveats on every target - each fine, a problem, or "check" when the list
// does not say. Unknown is never a pass.

import nvme from '../data/nvme-images.js?v=0.1.0-beta';
import { readCount } from './planner.js?v=0.1.0-beta';

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
    };
}

// The reasons the extra facts give, as the target logic reads them. Each
// applies to the series its rule names (data/series-rules.js).
export function extraBlockers(x) {
    const out = [];
    if (x.diskEncryption === true) out.push('disk-encryption-present');
    if (x.sap === true) out.push('sap-needs-a-certified-size');
    if (x.unmanagedDisks === true) out.push('unmanaged-os-disk');
    if (x.ephemeralOsDisk === true) out.push('ephemeral-os-disk');
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

// One caveat: { state: 'fine' | 'problem' | 'check' | '', text }.
const fine = (text) => ({ state: 'fine', text });
const problem = (text) => ({ state: 'problem', text });
const check = (text) => ({ state: 'check', text });
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
            : ok === false ? problem('The OS is not on the Microsoft NVMe list. After the move, the OS possibly cannot start.')
            : check('Check: the list does not give the OS image. The OS must support NVMe.');
    }

    // Azure Disk Encryption.
    out['Disk encryption'] = x.diskEncryption === false ? fine('No Azure Disk Encryption.')
        : x.diskEncryption === true ? problem(isNvme ? 'On. v6 and v7 do not support it.' : 'On. A resize keeps it. A rebuild removes it.')
        : check('Check: the list does not say if the VM uses Azure Disk Encryption.');

    // Temporary disk (from the size table).
    if (!hasTarget) out['Temporary disk'] = none;
    else if (vm.sourceTempDisks === 0) out['Temporary disk'] = fine('No temporary disk.');
    else if (vm.sourceTempDisks > 0 && option.tempDisksTo === 0) out['Temporary disk'] = problem('The new size has no temporary disk. You lose the data on the current temporary disk.');
    else if (vm.sourceTempDisks > 0) out['Temporary disk'] = problem('You lose the data on the temporary disk when you move.');
    else out['Temporary disk'] = check('Check: the size table does not give the temporary disk. You lose the data on it when you move.');

    // Accelerated networking (from the target logic).
    const an = option.acceleratedNetworking;
    if (!hasTarget) out['Accelerated networking'] = none;
    else if (an.required === false) out['Accelerated networking'] = fine('The new size does not need it.');
    else if (an.turnsOn === true) out['Accelerated networking'] = problem('Off. The new size needs it. Turn it on before the move.');
    else if (an.required === true && an.turnsOn === false) out['Accelerated networking'] = fine('On.');
    else out['Accelerated networking'] = check('Check: the list does not say if accelerated networking is on. The new size needs it.');

    // NICs and data disks: the target was chosen to hold them.
    out['NICs'] = !hasTarget ? none : vm.nicCount !== undefined ? fine(`${vm.nicCount} NIC${vm.nicCount === 1 ? '' : 's'}. The new size holds ${vm.nicCount === 1 ? 'it' : 'them'}.`) : check('Check: the list does not give the NIC count. This tool chose the size for 1 NIC.');
    out['Data disks'] = !hasTarget ? none : vm.dataDiskCount !== undefined ? fine(`${vm.dataDiskCount} data disk${vm.dataDiskCount === 1 ? '' : 's'}. The new size holds ${vm.dataDiskCount === 1 ? 'it' : 'them'}.`) : check('Check: the list does not give the data-disk count. This tool chose the size for 0 data disks.');

    out['Hibernation'] = x.hibernation === false ? fine('Off.') : x.hibernation === true ? problem('On. Turn it off before you resize.') : check('Check: the list does not say if hibernation is on.');

    out['Scale set / AKS / AVD'] = x.scaleSet === true ? problem('In a scale set. This tool gives no target size for it.')
        : x.virtualDesktop === true ? problem('Azure Virtual Desktop session host. This tool gives no target size for it.')
        : x.scaleSet === false && x.virtualDesktop === false ? fine('Not in a scale set.')
        : check('Check: the list does not say if this VM is in a scale set or in Azure Virtual Desktop.');

    out['SAP'] = x.sap === false ? fine('Not SAP.') : x.sap === true ? problem('SAP supports only the sizes that it certifies. See SAP Note 1928533.') : check('Check: the list does not say if this VM runs SAP.');
    out['Unmanaged disks'] = x.unmanagedDisks === false ? fine('Managed disks.') : x.unmanagedDisks === true ? problem('Convert the unmanaged disks to managed disks first.') : check('Check: the list does not say if the disks are managed disks.');
    out['Ephemeral OS disk'] = x.ephemeralOsDisk === false ? fine('Not ephemeral.') : x.ephemeralOsDisk === true ? problem('The new size must have space for it. Azure empties it when the VM stops.') : check('Check: the list does not say if the OS disk is ephemeral.');

    // A system-assigned identity is kept on a resize and lost on a rebuild.
    if (x.systemIdentity === false) out['Identity'] = fine('No system-assigned identity.');
    else if (x.systemIdentity === true) {
        out['Identity'] = !hasTarget ? problem('A resize keeps it. A rebuild removes it.')
            : !vm.os ? check('Check: the list does not give the OS. A rebuild removes the identity.')
            : option.rebuild ? problem('This move is a rebuild. A rebuild removes the system-assigned identity.')
            : fine('This move is a resize. A resize keeps the system-assigned identity.');
    } else out['Identity'] = check('Check: the list does not say if the VM has a system-assigned identity.');

    out['Availability set'] = x.availabilitySet === false ? fine('Not in an availability set.') : x.availabilitySet === true ? problem('In an availability set. Azure can make you stop all the VMs in the set for the move.') : check('Check: the list does not say if the VM is in an availability set.');
    out['Zone'] = x.zone ? fine(/^none$/i.test(x.zone) ? 'No zone.' : `Zone ${x.zone}.`) : check('Check: the list does not give the zone. The new size must be available in it.');
    return out;
}
