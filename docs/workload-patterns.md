# Workload patterns: how to find them with Azure Resource Graph

Microsoft sorts workloads into seven patterns for the move to the v6 and v7 VM series
(the v6/v7 modernization guide, "Discover", "Workload modernization categories"). The
pattern decides how to move a VM. This document gives, for each pattern, the Azure
Resource Graph signal that finds it, and how sure that signal is.

Any tool can use this document. Each signal reads only. Each one runs in Resource
Graph Explorer in the Azure portal, or with `az graph query`.

**Status of each signal:**

- **Tested** - a temporary test build proved it on 10 October 2026 (Central US). A
  second build proved the combined query (`query.kql`) and the planner on the same day.
- **From Azure Policy** - the list comes from an Azure built-in policy definition,
  read from Azure with `az policy definition show`.
- **From the Marketplace catalog** - our own list, read from the Azure Marketplace
  image catalog. Not a Microsoft list.
- **From the docs** - the signal comes from Microsoft's documentation. Nobody tested
  it here, because the test needs a large or special setup.
- **Tested, "No" only** - the query read the field correctly on VMs that do not have
  the feature. No test VM had the feature, so the "Yes" side is from the docs.
- **Not possible** - Azure has no signal for it.

## Summary

| Pattern | Examples | Signal | Status |
|---|---|---|---|
| A. Compute pools | AKS node pools | The node resource group is "managed by" the AKS cluster. The nodes are a uniform scale set with `aks-managed-*` tags. | Tested |
| | Uniform scale sets (and Azure DevOps scale-set agents) | A `virtualmachinescalesets` resource. Its instances are in the `computeresources` table, not in the VM list. | Tested |
| | Azure Red Hat OpenShift (ARO) | The cluster's resource group is "managed by" the ARO cluster. | From the docs |
| | Azure Batch, CycleCloud | Batch (user subscription mode) and CycleCloud make their own scale sets or tags. | From the docs |
| | Self-hosted CI agents on single VMs | None. | Not possible |
| B. Image-based desktops | AVD pooled host pools | The session host's host pool has `hostPoolType` = `Pooled`. (`Personal` is pattern E, tested on a personal session host.) | Tested |
| | Citrix DaaS, VMware Horizon | Possibly by the tags that their provisioning adds. | From the docs (Citrix); Not possible (Horizon) |
| C. Service-managed compute | Azure Databricks | The cluster's resource group is "managed by" the Databricks workspace. | Tested |
| | Data Explorer, Synapse Spark, SSIS integration runtime, PostgreSQL and MySQL flexible server | Their compute is not in the customer's subscription. | Tested for Azure Machine Learning (same model); from the docs for the others |
| D. Cluster re-creation | Azure Machine Learning compute clusters | The nodes are not in the customer's subscription. | Tested |
| | HDInsight | The cluster is a service resource. | From the docs |
| E. Customer-managed VMs | Line-of-business, web, file, DNS servers | Any VM that is not in another pattern. | Tested (default) |
| F. Stateful and clustered | SQL Server on a VM | A `microsoft.sqlvirtualmachine/sqlvirtualmachines` resource that points to the VM. | Tested |
| | SQL Server Always On availability groups | The same resource, with `sqlVirtualMachineGroupResourceId` set. | From the docs (needs a domain) |
| | Failover clusters | A managed disk with `maxShares` > 1 on the VM. Resource Graph has no list of the VMs on a shared disk: find them from the data disks of each VM (see below). | Tested, with two VMs on one disk |
| | Service Fabric | The Service Fabric extension on a scale set, or a managed cluster's resource group. | From the docs |
| | SAP | The Azure VM extension for SAP solutions, an SAP licence type, or an SAP marketplace image. | From the docs |
| | Oracle with Data Guard | An Oracle database image. Data Guard itself has no signal. | From the docs (partly) |
| | AD DS domain controllers, NoSQL and search clusters | None. | Not possible |
| G. ISV appliances | Firewalls, network virtual appliances | The marketplace image: publisher **and** offer on Microsoft's list in the Azure Policy "Configure Marketplace Network Virtual Appliances (NVAs) to add a MANA support tag". | From Azure Policy (the definition, read from Azure on 9 October 2026, version 1.4.0) |
| | Storage and backup appliances (NetApp Cloud Volumes ONTAP, Pure Storage Cloud Block Store, Rubrik, Silk, Nasuni, Dell) | A separate topic from network virtual appliances (Microsoft's v6/v7 Plan page, "Storage and backup virtual appliances": "Treat VM-based storage appliances like NVAs"). Microsoft has no list of their images. The Azure Marketplace catalog gives the vendors' publishers and offers (see below). | From the Marketplace catalog (our own list); not tested on a real deployment. A hard gate in the VM Lifecycle Planner from 0.2.1-beta. |
| | Backup proxies and media agents (Veeam, Commvault) | From the Marketplace catalog when deployed from the vendor's image (a hard gate in the VM Lifecycle Planner, as for the storage appliances). Not possible when someone installs the software on a normal VM. | Partly |

## Signals in detail

### A resource group "managed by" a service (AKS, Databricks, ARO)

A service that makes its own resource group writes its ID in the group's `managedBy`
field. A VM or scale set in that group belongs to the service.

```kusto
resourcecontainers
| where type =~ 'microsoft.resources/subscriptions/resourcegroups'
| where isnotempty(managedBy)
| project resourceGroup = tolower(name), managedBy = tolower(tostring(managedBy))
```

The test showed:

- AKS: `MC_<group>_<cluster>_<region>`, managed by `.../Microsoft.ContainerService/managedClusters/<cluster>`.
- Databricks: `databricks-rg-<workspace>-<suffix>`, managed by `.../Microsoft.Databricks/workspaces/<workspace>`.

The service type is the part of `managedBy` after `/providers/`. Do not use the group
name: a customer can rename it, and a normal group can have a name that starts with
`MC_`.

### Scale sets and their instances

A uniform scale set is a `microsoft.compute/virtualmachinescalesets` resource. Its
instances are **not** in the `resources` table with the VMs. They are in the
`computeresources` table:

```kusto
computeresources
| where type =~ 'microsoft.compute/virtualmachinescalesets/virtualmachines'
| project name, resourceGroup, size = tostring(sku.name),
          scaleSet = tolower(tostring(split(id, '/virtualMachines/')[0]))
```

A VM in a **flexible** scale set is in the VM list, with
`properties.virtualMachineScaleSet.id` set. The size of a scale set is `sku.name`, and
its instance count is `sku.capacity`. A list of VMs alone misses every uniform scale
set, AKS nodes included.

### AVD: pooled or personal

The session host is in the `desktopvirtualizationresources` table. It points to the VM
in `properties.resourceId`. Its name is `<host pool>/<VM>`. The host pool is in the
`resources` table, with `properties.hostPoolType` (`Pooled` or `Personal`).

```kusto
resources
| where type =~ 'microsoft.desktopvirtualization/hostpools'
| project hostPool = tolower(id), hostPoolType = tostring(properties.hostPoolType)
```

The session host ID starts with the host pool ID, so the two join on that part.

### SQL Server on a VM

The SQL IaaS Agent makes a `microsoft.sqlvirtualmachine/sqlvirtualmachines` resource.
The test showed `virtualMachineResourceId` (the VM), `sqlImageOffer`
(`SQL2022-WS2022`), `sqlImageSku` (`Developer`) and `sqlManagement` (`LightWeight`).
For an Always On availability group, Microsoft documents
`sqlVirtualMachineGroupResourceId`. A SQL Server VM without the SQL IaaS Agent has no
such resource. Then only its marketplace image tells.

```kusto
resources
| where type =~ 'microsoft.sqlvirtualmachine/sqlvirtualmachines'
| project vm = tolower(tostring(properties.virtualMachineResourceId)),
          edition = tostring(properties.sqlImageSku),
          availabilityGroup = tostring(properties.sqlVirtualMachineGroupResourceId)
```

### Shared disks (failover clusters)

A disk that more than one VM can use has `properties.maxShares` greater than 1.
Microsoft documents `managedByExtended` as the list of VMs on the disk, but Resource
Graph does not have it (tested with two VMs on one disk: the field is empty, and
`managedBy` gives only one VM). Each VM lists its data disks, so start from the VMs:

```kusto
resources
| where type =~ 'microsoft.compute/virtualmachines'
| mv-expand d = properties.storageProfile.dataDisks
| project vm = name, disk = tolower(tostring(d.managedDisk.id))
| join kind=inner (
    resources
    | where type =~ 'microsoft.compute/disks' and toint(properties.maxShares) > 1
    | project disk = tolower(id)
  ) on disk
| project vm, disk
```

`query.kql` does the same without a join: in its first pass a VM gives a key for
each of its data disks, so the group of a shared disk holds every VM on it.

### Compute that is not in the customer's subscription

The test made an Azure Machine Learning compute cluster with one node that runs. The
node was not in the `resources` table and not in the `computeresources` table. Nothing
in the subscription had its IP address. Services that work in the same way (Data
Explorer, Synapse Spark, the SSIS integration runtime, the flexible servers) cannot be
in a VM list. To change their size, use the service.

### A note on the network virtual appliance list

The Azure Policy list (version 1.4.0) has the publisher `netapp`, a storage vendor, and
offer patterns such as `net*`. So a NetApp marketplace image matches the network virtual
appliance list. This can be a mistake in the policy that Microsoft fixes later. Use the
list as Microsoft publishes it, and check this entry when you refresh the list.

### Storage and backup appliance images

Read from the Azure Marketplace catalog (`az vm image list-publishers` and
`az vm image list-offers`, Central US) on 10 October 2026. This is not a Microsoft list.
The vendors are the examples on Microsoft's v6/v7 Plan page. Offers vary by region,
and a product that deploys as a managed application can use other images. Refresh the
list from time to time.

| Vendor | Publisher | Offers that are the appliance |
|---|---|---|
| NetApp Cloud Volumes ONTAP | `netapp` | `netapp-ontap-cloud` |
| Pure Storage Cloud Block Store | `purestorageinc1578960262525` | `cloud_block_store*` |
| Rubrik | `rubrik-inc` | `rubrik-cloud-data-management`, `rubrik-data-protection` |
| Silk | `silk` | `silk_cloud_data_platform*` |
| Nasuni | `nasunicorporation` | `nasuni-nea*`, `naa-server` |
| Dell | `dellemc` | `apexfilestorage`, `dell_apex_block_storage`, `dell-emc-datadomain-virtual-edition*`, `dell-emc-avamar-virtual-edition`, `dell-emc-networker-virtual-edition`, `ppdm*` |
| Veeam | `veeam` | `veeam-backup-replication`, `veeamcloudconnect` |
| Commvault | `commvault` | `commvault`, `commvaultmediaagent` |
| Cohesity | `cohesity` | No appliance image in the catalog (only a tool image) |
| WEKA | - | No publisher in the catalog |

## Other signals for the move

These are not patterns, but they decide how a VM can move. The VM Lifecycle Planner
query (`query.kql`) reads all of them.

| Signal | Field | Status |
|---|---|---|
| VM generation (1 or 2) | `properties.extended.instanceView.hyperVGeneration` | Tested (9 October 2026) |
| Disk controller (SCSI or NVMe) | `properties.storageProfile.diskControllerType` | Tested (9 October 2026) |
| OS image (for NVMe support and appliances) | `properties.storageProfile.imageReference` (publisher, offer, SKU); empty for a custom image | Tested (9 October 2026) |
| Accelerated networking | `properties.enableAcceleratedNetworking` on each NIC. Azure leaves the field out when it is off: on a NIC that the query can read, no field means off. | Tested, on and off (9 October 2026) |
| Azure Disk Encryption | The `AzureDiskEncryption` or `AzureDiskEncryptionForLinux` extension, or `osDisk.encryptionSettings.enabled` | Tested, on and off (9 October 2026) |
| AVD session host | `desktopvirtualizationresources`, `properties.resourceId` | Tested (9 and 10 October 2026) |
| Security type (Trusted launch, confidential VM) | `properties.securityProfile.securityType`; empty means Standard | Tested, Standard only |
| System-assigned identity | `identity.type` contains `SystemAssigned` | Tested, on (9 October 2026) |
| Hibernation | `properties.additionalCapabilities.hibernationEnabled` | Tested, "No" only |
| Unmanaged disks | `osDisk.vhd.uri`, or a `vhd` on a data disk | Tested, "No" only |
| Ephemeral OS disk | `osDisk.diffDiskSettings.option` = `Local` | Tested, "No" only |
| Availability set | `properties.availabilitySet.id` | Tested, "No" only |
| Zone | `zones` | Tested, "No zone" only |
| Flexible scale set membership | `properties.virtualMachineScaleSet.id` | Tested, "No" only |
| NVMe support of the OS | The OS image against Microsoft's list of OS images that support NVMe (Microsoft Learn, "Supported OS images for remote NVMe") | From the docs |

## How to combine the signals in one query

Resource Graph limits a query to three `join` or `union` operators, with only one
table other than `resourcecontainers`, and three `mv-expand` operators. `query.kql`
fits in these limits:

1. One pass over the `resources` table reads VMs, scale sets, NICs, extensions, SQL IaaS
   Agent records and disks. Each record gives the key of the VM it belongs to
   (`mv-expand`). A `summarize` by the key puts each VM's records together.
2. A second `summarize` gives "shared disk" to every VM on a shared disk.
3. Three joins: the AVD session hosts (`desktopvirtualizationresources`), the AVD host
   pools (`resources`) and the resource groups (`resourcecontainers`).

The second test build ran `query.kql` and gave the expected answer for each resource.
The columns that the earlier query also gave did not change on 9 VMs in two
subscriptions.

A scale set has no generation in Resource Graph (`instanceView` is only on a VM). The
image SKU tells for most marketplace images (`-gen2`, `-g2`). An AKS node image is
not a marketplace image. A third test build (10 October 2026, one AKS node pool)
showed:

- The scale set's `virtualMachineProfile.storageProfile.imageReference.id` is a
  Microsoft gallery image whose name gives the generation, for example
  `.../galleries/AKSUbuntu/images/2404gen2containerd/versions/202609.15.0`. The AKS
  cluster's `agentPoolProfiles[].nodeImageVersion` gives the same name
  (`AKSUbuntu-2404gen2containerd-202609.15.0`).
- Each running node, in the `computeresources` table
  (`microsoft.compute/virtualmachinescalesets/virtualmachines`), has
  `properties.extended.instanceView.hyperVGeneration` (`V2`). A stopped cluster or a
  pool with 0 nodes has no rows there.

The VM Lifecycle Planner does not use either: for a node pool that a service manages,
the service makes the new nodes from its own image, so the current generation does not
change the move.

## The test build

One resource group in a personal subscription, with the smallest sizes, for less than
one US dollar:

- AKS, 1 node (Standard_B2s), then the cluster stopped.
- A Databricks workspace (Premium tier) with no compute.
- A uniform scale set (Standard_B1s), first with 0 instances, then 1.
- Two AVD host pools (Pooled, Personal), and one Windows Server session host in the
  pooled pool.
- A SQL Server 2022 Developer edition VM, registered with the SQL IaaS Agent.
- A 256 GiB Premium SSD with `maxShares` = 2, on a Linux VM.
- An Azure Machine Learning compute cluster, first with 0 nodes, then 1.

The test stopped (deallocated) each VM after Azure made it. After it read the signals,
the test deleted the resource group, and the resource groups that AKS and Databricks
made.

A second build (the same day) proved the combined query: AKS (stopped), a uniform
scale set with 0 instances, a pooled and a personal AVD host pool with one session host
each, a SQL Server VM with the SQL IaaS Agent, and one shared disk on two Linux VMs.

**Not tested** (a large or special setup): ARO, HDInsight, Service Fabric, SQL Server
availability groups, Batch, CycleCloud, Citrix, VMware Horizon.
