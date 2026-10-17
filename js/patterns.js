// The workload pattern of a VM: Microsoft's seven patterns for the move to v6
// and v7 (the v6/v7 modernization guide, "Discover", "Workload modernization
// categories"). The pattern decides how to move a VM, not only the size.
// docs/workload-patterns.md gives the signal for each pattern and its status.

import { applianceSign, inManagedApplication, storageApplianceSign } from './extras.js?v=0.7.1-beta';

// A service that owns a resource group, as the query writes it.
const POOL_SERVICES = ['aks', 'aro'];

// The pattern of one VM: 'A' to 'G', or '' when the list does not give the
// facts to decide (unknown is never a pattern). x: the extra facts (extras.js).
export const patternOf = (x) => patternFound(x).pattern;

// The pattern and the facts that decided it, one source for the pattern and for the
// words that show why: { pattern, kind, sign, facts: [{ column, value }] }.
// kind: 'nva', 'storage' or 'managed-application' for pattern G, else ''.
// sign: the appliance sign (extras.js), or null. facts: the columns of the list
// that decided the pattern, with their values; for '' the facts that are missing.
// In order: a hard gate first, then a service that owns the VM, then the pool
// or cluster that the VM is part of.
export function patternFound(x) {
    const fact = (column, value) => ({ column, value: value === true ? 'Yes' : value === false ? 'No' : String(value) });
    const found = (pattern, facts, kind = '', sign = null) => ({ pattern, kind, sign, facts });
    // A VM that is both: the NVA comes first, as in the notes (extras.js).
    const nva = applianceSign(x);
    if (nva) return found('G', [], 'nva', nva);
    const storage = storageApplianceSign(x);
    if (storage) return found('G', [], 'storage', storage);
    if (inManagedApplication(x)) return found('G', [fact('Managed by', x.managedBy)], 'managed-application');
    const managedBy = x.managedBy ? x.managedBy.toLowerCase() : null;
    if (managedBy && managedBy !== 'none' && !POOL_SERVICES.includes(managedBy)) return found('C', [fact('Managed by', x.managedBy)]);
    if (managedBy && POOL_SERVICES.includes(managedBy)) return found('A', [fact('Managed by', x.managedBy)]);
    if (x.resourceType === 'Scale set') return found('A', [fact('Resource type', x.resourceType)]);
    if (x.scaleSet === true) return found('A', [fact('Scale set', true)]);
    const pool = x.hostPoolType ? x.hostPoolType.toLowerCase() : null;
    if (pool === 'pooled') return found('B', [fact('AVD host pool type', x.hostPoolType)]);
    const sql = x.sqlServer !== null && x.sqlServer !== false;
    // A SQL Server image from Microsoft, also when the SQL IaaS Agent is not on the VM.
    const sqlImage = String(x.imagePublisher ?? '').toLowerCase() === 'microsoftsqlserver';
    const f = [];
    if (sql) f.push(fact('SQL Server', x.sqlServer));
    if (sqlImage) f.push(fact('Image publisher', x.imagePublisher));
    if (x.sqlGroup === true) f.push(fact('SQL availability group', true));
    if (x.sharedDisk === true) f.push(fact('Shared disk', true));
    if (x.sap === true) f.push(fact('SAP', true));
    if (f.length) return found('F', f);
    // Pattern E is "every VM that is not in another pattern": so every signal
    // must be known. An AVD host with no host pool type can be B or E.
    const missing = [['Managed by', managedBy], ['Scale set', x.scaleSet], ['SQL Server', x.sqlServer], ['Shared disk', x.sharedDisk], ['SAP', x.sap], ['Azure Virtual Desktop', x.virtualDesktop]]
        .filter(([, v]) => v === null).map(([column]) => ({ column, value: null }));
    if (x.virtualDesktop === true && !pool) missing.push({ column: 'AVD host pool type', value: null });
    if (missing.length) return found('', missing);
    // A personal desktop moves as a standalone VM: say why it is not pattern B.
    return found('E', x.virtualDesktop === true ? [fact('AVD host pool type', x.hostPoolType)] : []);
}
