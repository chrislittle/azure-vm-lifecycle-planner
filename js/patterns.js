// The workload pattern of a VM: Microsoft's seven patterns for the move to v6
// and v7 (the v6/v7 modernization guide, "Discover", "Workload modernization
// categories"). The pattern decides how to move a VM, not only the size.
// docs/workload-patterns.md gives the signal for each pattern and its status.

import { isApplianceImage, isStorageApplianceImage } from './extras.js?v=0.5.0-beta';

// A service that owns a resource group, as the query writes it.
const POOL_SERVICES = ['aks', 'aro'];

// The pattern of one VM: 'A' to 'G', or '' when the list does not give the
// facts to decide (unknown is never a pattern). x: the extra facts (extras.js).
// In order: a hard gate first, then a service that owns the VM, then the pool
// or cluster that the VM is part of.
export function patternOf(x) {
    if (isApplianceImage(x.imagePublisher, x.imageOffer) || isStorageApplianceImage(x.imagePublisher, x.imageOffer)) return 'G';
    const managedBy = x.managedBy ? x.managedBy.toLowerCase() : null;
    if (managedBy && managedBy !== 'none' && !POOL_SERVICES.includes(managedBy)) return 'C';
    if ((managedBy && POOL_SERVICES.includes(managedBy)) || x.resourceType === 'Scale set' || x.scaleSet === true) return 'A';
    const pool = x.hostPoolType ? x.hostPoolType.toLowerCase() : null;
    if (pool === 'pooled') return 'B';
    const sql = x.sqlServer !== null && x.sqlServer !== false;
    // A SQL Server image from Microsoft, also when the SQL IaaS Agent is not on the VM.
    const sqlImage = String(x.imagePublisher ?? '').toLowerCase() === 'microsoftsqlserver';
    if (sql || sqlImage || x.sqlGroup === true || x.sharedDisk === true || x.sap === true) return 'F';
    // Pattern E is "every VM that is not in another pattern": so every signal
    // must be known. An AVD host with no host pool type can be B or E.
    const known = managedBy !== null && x.scaleSet !== null && x.sqlServer !== null && x.sharedDisk !== null && x.sap !== null
        && x.virtualDesktop !== null && !(x.virtualDesktop === true && !pool);
    return known ? 'E' : '';
}
