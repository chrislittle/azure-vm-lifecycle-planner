// The facts the Azure Resource Graph query adds beyond size and generation:
// reading them from the list, the reasons they give an option, and the
// notes on every target - a problem, or "check" when the list
// does not say. Unknown is never a pass.

import storageImages from '../data/storage-appliance-images.js?v=0.9.7-beta';
import nvaImages from '../data/nva-images.js?v=0.9.7-beta';
import nvme from '../data/nvme-images.js?v=0.9.7-beta';
import { readCount } from './planner.js?v=0.9.7-beta';

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
        // The sign that the query found for SAP, as text (query 0.9.4-beta and later).
        sapSign: cell('SAP sign') || null,
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
        imageId: cell('Image ID') || null,
        planPublisher: cell('Plan publisher') || null,
        planProduct: cell('Plan product') || null,
        // The managed application of the resource group, and its Marketplace plan.
        appName: cell('Managed application') || null,
        appPlanPublisher: cell('Application plan publisher') || null,
        appPlanProduct: cell('Application plan product') || null,
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
// Each image is checked against the lists once: a large list has the same images
// many times (2026-10-17).
const applianceImages = new Map();
export function isApplianceImage(publisher, offer) {
    if (!publisher || !offer) return false;
    const key = `${publisher}\n${offer}`;
    let found = applianceImages.get(key);
    if (found === undefined) {
        found = likeAny(publisher, nvaImages.publishers) && likeAny(offer, nvaImages.offers);
        applianceImages.set(key, found);
    }
    return found;
}

// Is this marketplace image a storage or backup appliance? Our own list from the
// Azure Marketplace catalog: the publisher, and one of that publisher's offers.
// The vendor entry of the list that the image matches, or null.
function storageVendor(publisher, offer) {
    if (!publisher || !offer) return null;
    return storageImages.vendors.find((v) => v.publisher.toLowerCase() === String(publisher).toLowerCase() && likeAny(offer, v.offers)) || null;
}
export const isStorageApplianceImage = (publisher, offer) => storageVendor(publisher, offer) !== null;

// An appliance by any of its signs: the image name, or the Marketplace purchase plan
// (a VM bought in the Marketplace keeps the vendor's plan, also when its image comes
// from a gallery or a managed application), or a vendor's gallery image.
// Each function gives the sign that matched, so that the page and the files can show
// it: { sign: 'image' | 'plan' | 'gallery', publisher, offer, imageId, vendor }, or
// null. The image is checked first, then the plan, then the gallery. The NVA list
// has no vendor names: the publisher ID is all that it gives.
export function applianceSign(x) {
    if (isApplianceImage(x.imagePublisher, x.imageOffer)) return { sign: 'image', publisher: x.imagePublisher, offer: x.imageOffer };
    if (isApplianceImage(x.planPublisher, x.planProduct)) return { sign: 'plan', publisher: x.planPublisher, offer: x.planProduct };
    return null;
}
export function storageApplianceSign(x) {
    let v = storageVendor(x.imagePublisher, x.imageOffer);
    if (v) return { sign: 'image', vendor: v.vendor, publisher: x.imagePublisher, offer: x.imageOffer };
    v = storageVendor(x.planPublisher, x.planProduct);
    if (v) return { sign: 'plan', vendor: v.vendor, publisher: x.planPublisher, offer: x.planProduct };
    const g = x.imageId ? storageImages.galleries.find((gallery) => like(x.imageId, gallery.imageId)) : null;
    return g ? { sign: 'gallery', vendor: g.vendor, imageId: x.imageId } : null;
}
export const isAppliance = (x) => applianceSign(x) !== null;
export const isStorageAppliance = (x) => storageApplianceSign(x) !== null;
// A VM in a managed application (Azure Marketplace): the vendor owns it, and the
// customer cannot change it.
export const inManagedApplication = (x) => /^managed application$/i.test(String(x.managedBy ?? ''));

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
    if (isAppliance(x)) out.push('nva-requires-parallel-deployment');
    // A storage or backup appliance: vendor validation first (owner, 2026-10-10).
    else if (isStorageAppliance(x)) out.push('storage-appliance-requires-vendor');
    else if (inManagedApplication(x)) out.push('managed-application-requires-vendor');
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
            // RHEL 10 and later: a two-digit major (10-lvm-gen2, 10_0). Version 1.0 does not exist.
            m = /^(1\d)(?:[._](\d{1,2}))?(?:[^\d._]|$)/.exec(s) || /^(\d)(?:[._]?(\d{1,2}))?(?:[^\d]|$)/.exec(s);
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
            // Oracle Linux 10 and later: ol10, ol100 (10.0). Version 1.x does not exist.
            m = /ol(1\d)(\d?)(?!\d)/.exec(s) || /ol(\d)(\d{0,2})/.exec(s);
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
// Is the Trusted launch upgrade open for the OS of a Generation 1 VM? (0.9.7-beta)
// ---------------------------------------------------------------------------

// Microsoft Learn, "Upgrade Gen1 VMs to Trusted launch"
// (https://learn.microsoft.com/azure/virtual-machines/trusted-launch-existing-vm-gen-1,
// updated 2026-09-24): "Trusted launch supported operating system (OS) version
// (excluding Windows Server 2016, Debian, Azure Linux)". For Windows Server 2016 only,
// the workaround is to update the guest OS to Windows Server 2019 or 2022. Linux: "only
// supported for VMs created using supported OS images published in Azure Marketplace".
// The image columns decide, as for NVMe; the OS column only tells Linux from Windows.
// { code, facts }: the reason code of the Generation 1 to 2 row (reasons.js).
//   gen1-windows-server-2016  a Windows Server 2016 image, also SQL Server or Visual Studio on it (ws2016)
//   gen1-os-not-supported     Debian or Azure Linux (CBL-Mariner is its old name)
//   gen1-linux-custom-image   Linux with no Azure Marketplace image: "Check:"
//   gen1-custom-image         no Azure Marketplace image, Windows or no OS: "Check:"
//   gen1-image-unknown        the list gives no image: "Check:"
//   not-built-yet             any other Marketplace image: the upgrade, with its conditions
export function gen1Upgrade(x, os) {
    const p = String(x.imagePublisher ?? '').toLowerCase();
    const o = String(x.imageOffer ?? '').toLowerCase();
    const both = `${o} ${String(x.imageSku ?? '').toLowerCase()}`;
    const linux = String(os ?? '').toLowerCase() === 'linux';
    if (!p) {
        // A gallery or managed image, or a purchase plan with no image: not an Azure Marketplace image.
        if (x.imageId || x.planPublisher) {
            const imageId = x.imageId || '';
            return linux ? { code: 'gen1-linux-custom-image', facts: { imageId } } : { code: 'gen1-custom-image', facts: { imageId, osKnown: Boolean(os) } };
        }
        return { code: 'gen1-image-unknown', facts: {} };
    }
    // Windows Server 2016: the Windows Server publisher with 2016 in the offer or SKU; or, from
    // any publisher (SQL Server, Visual Studio, a vendor) on Windows or with no OS, ws2016 in
    // the offer or SKU, or an offer or SKU that starts with 2016- (review, 2026-11-13).
    const ws2016 = (t) => /ws2016|^2016-/.test(t);
    if ((p === 'microsoftwindowsserver' && /2016/.test(both)) || (!linux && (ws2016(o) || ws2016(String(x.imageSku ?? '').toLowerCase())))) {
        return { code: 'gen1-windows-server-2016', facts: { image: imageWords(x) } };
    }
    if (p === 'debian' || /^debian/.test(o)) return { code: 'gen1-os-not-supported', facts: { os: 'Debian', image: imageWords(x), oldName: false } };
    if (p === 'microsoftcblmariner') return { code: 'gen1-os-not-supported', facts: { os: 'Azure Linux', image: imageWords(x), oldName: /cbl-mariner/.test(both) } };
    return { code: 'not-built-yet', facts: { linux } };
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
// A note that says what to do for each of the two ways of v6 and v7 (deploy in parallel,
// change the size): ways gives the part for each way, with the value from the list, for
// the boxes of "What to do" (details.js, 0.9.6-beta). '' means nothing for that way.
// The text (the CSV files) does not change.
const withWays = (note, parallel, resize) => ({ ...note, ways: { parallel, resize } });

// The value of a column as the list gives it, in words: '"Hibernation" is Yes.'
// Each note says the value that made it (0.9.0-beta), so that a customer can see
// why the note is there.
const said = (column, value = 'Yes') => `"${column}" is ${value}.`;
// The image as the list gives it: 'MicrosoftWindowsServer / WindowsServer / 2016-Datacenter'.
const imageWords = (x) => [x.imagePublisher, x.imageOffer, x.imageSku].filter((v) => v).join(' / ');
// 32 -> '32', 1.5 -> '1.5'.
export const gibWords = (n) => String(Math.round(n * 10) / 10);
// The temporary disk of the current size, in words, or '' when the size table does not give it.
const currentTempDisk = (vm) => (vm.sourceTempDiskGiB > 0 ? `The current size ${vm.sourceSize} has a temporary disk of ${gibWords(vm.sourceTempDiskGiB)} GiB. ` : '');

// The SAP note: the value, the sign that the query found (when the list gives it),
// and the step to correct the list. Only the extension can be removed from the VM.
function sapNote(x) {
    const confirm = 'Confirm that SAP certifies the new size (SAP Note 1928533).';
    if (!x.sapSign) return `${said('SAP')} ${confirm}`;
    return `${said('SAP')} ${said('SAP sign', `"${x.sapSign}"`)} ${confirm} ${sapClear(x)}`;
}
// How to correct the list for a VM that does not run SAP, or '' with no sign. Only
// the extension can be removed from the VM. "What to do" uses it too (details.js).
export function sapClear(x) {
    if (!x || !x.sapSign) return '';
    const extension = /^Azure VM extension for SAP solutions\b/i.test(x.sapSign);
    return `If this VM does not run SAP, ${extension ? 'remove the extension from the VM, or ' : ''}set "SAP" to No in your list.`;
}
// The sign in words: '"SAP sign" is "Licence type SLES_SAP".', or '' with no sign.
export const sapSignWords = (x) => (x && x.sapSign ? said('SAP sign', `"${x.sapSign}"`) : '');

// The caveats for one option of one machine. Agreed wording (PLAN.md).
// pool: the VM is in a pool or a service (patterns A to D), which makes new nodes.
export function caveats(vm, x, option, pool = false) {
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
            : ok === false ? problem(`The image ${imageWords(x)} is not on the Microsoft list of OS images that support NVMe. Update the OS to a version on the Microsoft NVMe list, or deploy a new VM from a newer image.`)
            // An image that the list names, but that this tool cannot find on the Microsoft list.
            : x.imagePublisher ? check(`Check: this tool cannot tell if the image ${imageWords(x)} supports NVMe. The OS must support NVMe.`)
            : check(`Check: the list does not give the OS image. The OS must support NVMe.${x.imageId ? ` The image ID is ${x.imageId}.` : ''}`);
    }

    // Azure Disk Encryption.
    out['Disk encryption'] = x.diskEncryption === false ? fine('No Azure Disk Encryption.')
        // Microsoft: Azure Disk Encryption retires on 15 September 2028; the move to
        // encryption at host makes new disks and a new VM (disk-encryption-migrate page,
        // read 2026-10-10).
        : x.diskEncryption === true ? problem(`${said('Azure Disk Encryption')} ${isNvme ? 'v6 and v7 do not support Azure Disk Encryption. Move to encryption at host with the Microsoft migration steps. They make new disks and a new VM.'
            : 'Use a resize: a resize keeps Azure Disk Encryption. Microsoft retires Azure Disk Encryption on 15 September 2028, so also plan the move to encryption at host.'}`)
        : check('Check: the list does not say if the VM uses Azure Disk Encryption.');

    // Temporary disk (from the size table).
    if (!hasTarget) out['Temporary disk'] = none;
    else if (vm.sourceTempDisks === 0) out['Temporary disk'] = fine('No temporary disk.');
    else if (vm.sourceTempDisks > 0 && option.tempDisksTo === 0) out['Temporary disk'] = attention(`${currentTempDisk(vm)}The new size has no temporary disk. The move deletes the data on the current temporary disk.`);
    else if (vm.sourceTempDisks > 0) out['Temporary disk'] = attention(`${currentTempDisk(vm)}The move deletes the data on the temporary disk. Keep nothing there that you need.`);
    else out['Temporary disk'] = check(`Check: the size table does not give the temporary disk of ${vm.sourceSize}. You lose the data on it when you move.`);

    // Accelerated networking (from the target logic).
    const an = option.acceleratedNetworking;
    const count = vm.acceleratedNicCount !== undefined && vm.acceleratedNicCount !== null ? vm.acceleratedNicCount : null;
    if (!hasTarget) out['Accelerated networking'] = none;
    else if (an.required === false) out['Accelerated networking'] = fine('The new size does not need it.');
    // The value that shows it is off: the primary NIC, else no NIC with it on.
    else if (an.turnsOn === true) out['Accelerated networking'] = problem(`${vm.primaryNicAccelerated === false ? said('Primary NIC accelerated', 'No') : said('Accelerated NICs', String(count))} Turn on accelerated networking before the move. The new size needs it.`);
    else if (an.required === true && an.turnsOn === false) out['Accelerated networking'] = fine('On.');
    else out['Accelerated networking'] = check(count === null ? 'Check: the list does not say if accelerated networking is on. The new size needs it.'
        // Some NICs have it on, but the list does not say which NIC is the primary NIC.
        : `Check: the list does not say if accelerated networking is on for the primary NIC. ${said('Accelerated NICs', String(count))} ${vm.nicCount !== undefined ? said('NIC count', String(vm.nicCount)) : 'The list does not give the NIC count.'} The new size needs it.`);

    // NICs and data disks: the target was chosen to hold them.
    out['NICs'] = !hasTarget ? none : vm.nicCount !== undefined ? fine(`${vm.nicCount} NIC${vm.nicCount === 1 ? '' : 's'}. The new size holds ${vm.nicCount === 1 ? 'it' : 'them'}.`) : check('Check: the list does not give the NIC count. This tool chose the size for 1 NIC.');
    out['Data disks'] = !hasTarget ? none : vm.dataDiskCount !== undefined ? fine(`${vm.dataDiskCount} data disk${vm.dataDiskCount === 1 ? '' : 's'}. The new size holds ${vm.dataDiskCount === 1 ? 'it' : 'them'}.`) : check('Check: the list does not give the data-disk count. This tool chose the size for 0 data disks.');

    out['Hibernation'] = x.hibernation === false ? fine('Off.') : x.hibernation === true ? problem(`${said('Hibernation')} Turn off hibernation before the move.`) : check('Check: the list does not say if hibernation is on.');

    // A scale set and a pooled host: "What to do" gives the move, so no note here.
    out['Scale set / AKS / AVD'] = x.scaleSet === true ? none
        // A personal desktop is the VM of one user: it moves as a normal VM.
        : x.virtualDesktop === true && /^personal$/i.test(x.hostPoolType || '') ? attention(`A personal desktop: ${said('AVD host pool type', x.hostPoolType)} The user cannot use it during the move. Tell the user first.`)
        : x.virtualDesktop === true && /^pooled$/i.test(x.hostPoolType || '') ? none
        : x.virtualDesktop === true ? check(`Check: the list does not say if the host pool is pooled or personal.${x.hostPoolType ? ` ${said('AVD host pool type', x.hostPoolType)}` : ''} For a pooled host pool, make new session hosts from the image.`)
        : x.scaleSet === false && x.virtualDesktop === false ? fine('Not in a scale set.')
        : check('Check: the list does not say if this VM is in a scale set or in Azure Virtual Desktop.');

    // Only when the list says Yes, as for an appliance: No and no value show nothing
    // (owner, 2026-11-06). The sign that the query found shows, so that a customer
    // can see why, and how to correct a list for a VM that does not run SAP.
    out['SAP'] = x.sap === true ? problem(sapNote(x)) : none;
    out['Unmanaged disks'] = x.unmanagedDisks === false ? fine('Managed disks.') : x.unmanagedDisks === true ? problem(`${said('Unmanaged disks')} Convert the unmanaged disks to managed disks first.`) : check('Check: the list does not say if the disks are managed disks.');
    out['Ephemeral OS disk'] = x.ephemeralOsDisk === false ? fine('Not ephemeral.') : x.ephemeralOsDisk === true ? problem(`${said('Ephemeral OS disk')} The data on an ephemeral OS disk does not stay when the VM moves. Deploy a new VM at the new size.`) : check('Check: the list does not say if the OS disk is ephemeral.');

    // A system-assigned identity is kept on a resize and lost on a new VM. Microsoft:
    // "Shared life cycle with the Azure resource that the managed identity is created
    // with. When the parent resource is deleted, the managed identity is deleted as
    // well." (read 2026-11-06 on
    // https://learn.microsoft.com/entra/identity/managed-identities-azure-resources/overview )
    // The method decides it (words.js moveWords), not the series.
    // A pool or a service makes new VMs. On v5 and Burstable its rows keep the new-VM notes
    // where 0.9.4-beta had them: Windows, and the temporary disk changes type (0.9.5-beta).
    const poolNewVm = pool && !isNvme && vm.os === 'Windows' && Boolean(option.targetDiskArch) && vm.sourceDiskArch !== option.targetDiskArch;
    if (x.systemIdentity === false) out['Identity'] = fine('No system-assigned identity.');
    else if (x.systemIdentity === true) {
        out['Identity'] = !hasTarget ? none
            // v6 and v7 have two methods (0.9.3-beta, owner 2026-11-06). Deploy in parallel
            // makes a new VM, with a new identity. A change of the size of the current VM
            // keeps the VM: Microsoft's NVMe conversion script "Stops and deallocates the
            // VM" and "Resizes the VM to the target SKU and sets the disk controller type
            // to NVMe." (GUIDANCE.tempDiskPreview, "3. Usage", read 2026-11-06).
            // "What to do" shows each way in its own box (0.9.6-beta): ways gives the part
            // of the note for each way. The change of the size has no step: its box says
            // that the VM keeps its identity.
            : isNvme ? withWays(problem(`${said('System-assigned identity')} If you deploy a new VM in parallel, record the role assignments of the system-assigned identity. A new VM gets a new identity: add them to it again. If you change the size of the current VM, the VM keeps its identity.`),
                `${said('System-assigned identity')} Record the role assignments of the system-assigned identity. A new VM gets a new identity: add them to it again.`, '')
            : poolNewVm ? problem(`${said('System-assigned identity')} Record the role assignments of the system-assigned identity. A new VM gets a new identity: add them to it again.`)
            // v5 and Burstable are always a resize of the same VM, also with the preview
            // feature: the VM kept its identity (measured in lab tests, 2026-11-01 to
            // 2026-11-07; lifecycle.js, previewFeature). No note.
            : fine();
    } else out['Identity'] = check('Check: the list does not say if the VM has a system-assigned identity.');

    // Two methods, each in the same words (0.9.4-beta, owner 2026-11-06). A new VM joins a
    // set only when Azure creates it. A resize keeps the VM in its set: Microsoft's "Resize
    // a VM" page says to deallocate all the VMs in the set only when the new size is not
    // available on the hardware cluster of the set
    // (https://learn.microsoft.com/azure/virtual-machines/sizes/resize-vm), and a measured
    // run moved two VMs in one set from v4 to v6 one at a time, with the other VM running.
    const avParallel = 'put the new VM in the same availability set when you create it. Azure cannot add an existing VM to a set.';
    const avInPlace = 'the VM stays in its set. You can resize the VMs one at a time. If Azure does not offer the new size for this set, stop (deallocate) all the VMs in the set first.';
    const upper = (s) => `${s[0].toUpperCase()}${s.slice(1)}`;
    // v6 and v7: deploy in parallel, or change the size of the current VM. Not for
    // Generation 1 (v6 and v7 need a new VM at Generation 2) or a pool (new nodes).
    // ways: the part of the note for each way, for the boxes of "What to do" (0.9.6-beta).
    const avBoth = isNvme && vm.gen !== 'V1' && !pool;
    out['Availability set'] = x.availabilitySet === true && avBoth
        ? withWays(attention(`${said('Availability set')} If you deploy a new VM in parallel: ${avParallel} If you change the size of the current VM: ${avInPlace}`),
            `${said('Availability set')} ${upper(avParallel)}`, `${said('Availability set')} ${upper(avInPlace)}`)
        : x.availabilitySet === false ? fine('Not in an availability set.') : x.availabilitySet === true ? attention(`${said('Availability set')} ${
            // A new VM: Azure adds a VM to an availability set only when it creates the VM.
            isNvme || poolNewVm
            ? 'Azure adds a VM to an availability set only when it creates the VM. Deploy the new VM into the set.'
            // v5 and Burstable: only a resize, also with the preview feature (0.9.5-beta), in
            // the words of the resize method.
            : upper(avInPlace)}`) : check('Check: the list does not say if the VM is in an availability set.');
    // Only on an appliance: on any other VM this note says nothing (owner, 2026-10-09).
    const nva = applianceSign(x);
    out['Network virtual appliance'] = nva
        ? problem(`${nva.sign === 'image' ? 'The image' : 'The Marketplace purchase plan'} is ${nva.publisher} / ${nva.offer}. Ask the vendor which sizes they certify.`) : none;
    // Only on a storage or backup appliance.
    const storage = nva ? null : storageApplianceSign(x);
    out['Storage or backup appliance'] = storage
        ? problem(`The vendor is ${storage.vendor}. Ask the vendor which sizes they certify.`) : none;
    out['Zone'] = x.zone ? fine(/^none$/i.test(x.zone) ? 'No zone.' : `Zone ${x.zone}.`) : check('Check: the list does not give the zone. The new size must be available in it.');
    return out;
}
