// The Azure Resource Graph query, as shown on the page. The same text as query.kql
// (tools/copy-files.mjs makes this file; a test keeps the two identical).
export default String.raw`// VM Lifecycle Planner for Azure - the VM list.
// Run in the Azure portal: Resource Graph Explorer. Then "Download results as CSV" and load
// the file into the planner page. Reads only; changes nothing.
//
// One pass over the Resources table gives each VM and scale set, and the records
// that point to it: NICs, extensions, the SQL IaaS Agent record, shared disks.
// Joins add the AVD host pool and the resource group "managed by" a service.
// (Resource Graph allows three joins, with one other table besides the resource
// groups: here AVD.)
Resources
| where type in~ ('microsoft.compute/virtualmachines', 'microsoft.compute/virtualmachinescalesets',
                  'microsoft.network/networkinterfaces', 'microsoft.compute/virtualmachines/extensions',
                  'microsoft.sqlvirtualmachine/sqlvirtualmachines', 'microsoft.compute/disks')
| extend t = tolower(type)
| extend isVm = t == 'microsoft.compute/virtualmachines', isVmss = t == 'microsoft.compute/virtualmachinescalesets'
| extend extType = tostring(properties.type), extPublisher = tostring(properties.publisher)
// The key of the VM or scale set that each record belongs to. A VM also gives
// the ID of each of its data disks, and a disk gives its own ID: so a disk's group
// knows the disk and every VM on it. (Resource Graph does not have the disk's list
// of VMs, managedByExtended.)
| extend keys = case(
    isVm, array_concat(pack_array(tolower(id)), properties.storageProfile.dataDisks),
    isVmss, pack_array(tolower(id)),
    t == 'microsoft.network/networkinterfaces', pack_array(tolower(tostring(properties.virtualMachine.id))),
    t == 'microsoft.compute/virtualmachines/extensions', pack_array(tolower(tostring(split(id, '/extensions/')[0]))),
    t == 'microsoft.sqlvirtualmachine/sqlvirtualmachines', pack_array(tolower(tostring(properties.virtualMachineResourceId))),
    t == 'microsoft.compute/disks', pack_array(tolower(id)),
    dynamic([]))
| mv-expand k = keys
// A data-disk entry is an object: its key is the disk ID.
| extend key = tolower(iff(isnotempty(k.managedDisk.id), tostring(k.managedDisk.id), tostring(k)))
| where isnotempty(key)
// A VM and a scale set describe their machine in different places.
| extend vmp = iff(isVmss, properties.virtualMachineProfile, properties)
| summarize
    self = max(toint((isVm or isVmss) and tolower(id) == key)),
    isVmss = max(toint(isVmss)),
    name = anyif(name, (isVm or isVmss) and tolower(id) == key),
    rid = anyif(id, (isVm or isVmss) and tolower(id) == key),
    rg = anyif(tolower(resourceGroup), (isVm or isVmss) and tolower(id) == key),
    sub = anyif(subscriptionId, (isVm or isVmss) and tolower(id) == key),
    location = anyif(location, (isVm or isVmss) and tolower(id) == key),
    size = anyif(iff(isVmss, tostring(sku.name), tostring(properties.hardwareProfile.vmSize)), (isVm or isVmss) and tolower(id) == key),
    instances = anyif(toint(sku.capacity), (isVmss) and tolower(id) == key),
    generation = anyif(tostring(properties.extended.instanceView.hyperVGeneration), (isVm) and tolower(id) == key),
    os = anyif(tostring(vmp.storageProfile.osDisk.osType), (isVm or isVmss) and tolower(id) == key),
    nicCount = anyif(iff(isVmss, array_length(vmp.networkProfile.networkInterfaceConfigurations), array_length(properties.networkProfile.networkInterfaces)), (isVm or isVmss) and tolower(id) == key),
    vmssAcceleratedNics = anyif(countof(tostring(vmp.networkProfile.networkInterfaceConfigurations), '"enableAcceleratedNetworking":true'), (isVmss) and tolower(id) == key),
    dataDiskCount = anyif(array_length(vmp.storageProfile.dataDisks), (isVm or isVmss) and tolower(id) == key),
    securityType = anyif(tostring(vmp.securityProfile.securityType), (isVm or isVmss) and tolower(id) == key),
    imagePublisher = anyif(tostring(vmp.storageProfile.imageReference.publisher), (isVm or isVmss) and tolower(id) == key),
    imageOffer = anyif(tostring(vmp.storageProfile.imageReference.offer), (isVm or isVmss) and tolower(id) == key),
    imageSku = anyif(tostring(vmp.storageProfile.imageReference.sku), (isVm or isVmss) and tolower(id) == key),
    diskController = anyif(tostring(vmp.storageProfile.diskControllerType), (isVm or isVmss) and tolower(id) == key),
    // NICs: Azure leaves enableAcceleratedNetworking out when it is off (checked
    // 2026-10-09), so on a NIC that was read, missing means off.
    nicsRead = countif(t == 'microsoft.network/networkinterfaces'),
    acceleratedNics = countif(t == 'microsoft.network/networkinterfaces' and tobool(properties.enableAcceleratedNetworking) == true),
    primaryAccelerated = countif(t == 'microsoft.network/networkinterfaces' and tobool(properties.enableAcceleratedNetworking) == true and tobool(properties.primary) == true),
    adeOsDisk = anyif(tostring(properties.storageProfile.osDisk.encryptionSettings.enabled), (isVm) and tolower(id) == key),
    adeExtension = countif(t == 'microsoft.compute/virtualmachines/extensions' and extType in~ ('AzureDiskEncryption', 'AzureDiskEncryptionForLinux')),
    // The Azure VM extension for SAP solutions has no other purpose: it means SAP.
    sapExtension = countif(t == 'microsoft.compute/virtualmachines/extensions' and extPublisher in~ ('Microsoft.AzureCAT.AzureEnhancedMonitoring', 'Microsoft.OSTCExtensions')
                           and extType in~ ('MonitorX64Linux', 'MonitorX64Windows', 'AzureEnhancedMonitorForLinux')),
    hibernation = anyif(tobool(properties.additionalCapabilities.hibernationEnabled), (isVm) and tolower(id) == key),
    scaleSet = anyif(tostring(properties.virtualMachineScaleSet.id), (isVm) and tolower(id) == key),
    licenseType = anyif(tostring(vmp.licenseType), (isVm or isVmss) and tolower(id) == key),
    // A scale set keeps unmanaged OS disks in vhdContainers, not vhd.uri.
    osDiskVhd = anyif(iff(isVmss, iff(array_length(vmp.storageProfile.osDisk.vhdContainers) > 0, 'vhd', ''), tostring(vmp.storageProfile.osDisk.vhd.uri)), (isVm or isVmss) and tolower(id) == key),
    // A scale set's extensions are in its model, not separate resources.
    vmssExtensions = anyif(tostring(vmp.extensionProfile.extensions), isVmss and tolower(id) == key),
    dataDisks = anyif(tostring(vmp.storageProfile.dataDisks), (isVm or isVmss) and tolower(id) == key),
    osDiskOption = anyif(tostring(vmp.storageProfile.osDisk.diffDiskSettings.option), (isVm or isVmss) and tolower(id) == key),
    identityType = anyif(tostring(identity.type), (isVm or isVmss) and tolower(id) == key),
    availabilitySet = anyif(tostring(properties.availabilitySet.id), (isVm) and tolower(id) == key),
    zones = anyif(tostring(zones), (isVm or isVmss) and tolower(id) == key),
    sqlEdition = anyif(tostring(properties.sqlImageSku), t == 'microsoft.sqlvirtualmachine/sqlvirtualmachines'),
    sqlGroup = anyif(tostring(properties.sqlVirtualMachineGroupResourceId), t == 'microsoft.sqlvirtualmachine/sqlvirtualmachines'),
    diskShared = max(toint(t == 'microsoft.compute/disks' and toint(properties.maxShares) > 1)),
    diskVms = make_set_if(tolower(id), isVm)
    by key
// Second pass: each VM gets its own fields, and "shared disk" from the group of
// any shared disk that it is on.
| extend key2s = case(self == 1, pack_array(key), diskShared == 1, diskVms, dynamic([]))
| mv-expand key2 = key2s to typeof(string)
| summarize
    isVmss = take_anyif(isVmss, self == 1),
    name = take_anyif(name, self == 1),
    rid = take_anyif(rid, self == 1),
    rg = take_anyif(rg, self == 1),
    sub = take_anyif(sub, self == 1),
    location = take_anyif(location, self == 1),
    size = take_anyif(size, self == 1),
    instances = take_anyif(instances, self == 1),
    generation = take_anyif(generation, self == 1),
    os = take_anyif(os, self == 1),
    nicCount = take_anyif(nicCount, self == 1),
    vmssAcceleratedNics = take_anyif(vmssAcceleratedNics, self == 1),
    dataDiskCount = take_anyif(dataDiskCount, self == 1),
    securityType = take_anyif(securityType, self == 1),
    imagePublisher = take_anyif(imagePublisher, self == 1),
    imageOffer = take_anyif(imageOffer, self == 1),
    imageSku = take_anyif(imageSku, self == 1),
    diskController = take_anyif(diskController, self == 1),
    nicsRead = take_anyif(nicsRead, self == 1),
    acceleratedNics = take_anyif(acceleratedNics, self == 1),
    primaryAccelerated = take_anyif(primaryAccelerated, self == 1),
    adeOsDisk = take_anyif(adeOsDisk, self == 1),
    adeExtension = take_anyif(adeExtension, self == 1),
    sapExtension = take_anyif(sapExtension, self == 1),
    hibernation = take_anyif(hibernation, self == 1),
    scaleSet = take_anyif(scaleSet, self == 1),
    licenseType = take_anyif(licenseType, self == 1),
    osDiskVhd = take_anyif(osDiskVhd, self == 1),
    vmssExtensions = take_anyif(vmssExtensions, self == 1),
    dataDisks = take_anyif(dataDisks, self == 1),
    osDiskOption = take_anyif(osDiskOption, self == 1),
    identityType = take_anyif(identityType, self == 1),
    availabilitySet = take_anyif(availabilitySet, self == 1),
    zones = take_anyif(zones, self == 1),
    sqlEdition = take_anyif(sqlEdition, self == 1),
    sqlGroup = take_anyif(sqlGroup, self == 1),
    sharedDisk = max(toint(self == 0)),
    hasSelf = max(self)
    by key = key2
| where hasSelf == 1
| extend rgKey = strcat(sub, '/', rg)
| join kind=leftouter (
    desktopvirtualizationresources
    | where type =~ 'microsoft.desktopvirtualization/hostpools/sessionhosts'
    | project key = tolower(tostring(properties.resourceId)), hostPoolId = tolower(tostring(split(id, '/sessionhosts/')[0]))
  ) on key
| join kind=leftouter (
    Resources
    | where type =~ 'microsoft.desktopvirtualization/hostpools'
    | project hostPoolId = tolower(id), hostPoolType = tostring(properties.hostPoolType)
  ) on hostPoolId
| join kind=leftouter (
    ResourceContainers
    | where type =~ 'microsoft.resources/subscriptions/resourcegroups'
    | project rgKey = strcat(subscriptionId, '/', tolower(name)), managedBy = tolower(tostring(managedBy))
  ) on rgKey
| extend managedByType = tostring(split(managedBy, '/providers/')[1])
| project
    ['VM name'] = name,
    Region = location,
    ['Current size'] = size,
    Generation = generation,
    OS = os,
    ['NIC count'] = nicCount,
    ['Data-disk count'] = coalesce(dataDiskCount, 0),
    ['Security type'] = iff(isempty(securityType), 'Standard', securityType),
    ['Image publisher'] = imagePublisher,
    ['Image offer'] = imageOffer,
    ['Image SKU'] = imageSku,
    ['Disk controller'] = diskController,
    // Blank when a NIC could not be read: unknown, never "off".
    ['Accelerated NICs'] = case(isVmss == 1, tostring(vmssAcceleratedNics), nicsRead == nicCount, tostring(acceleratedNics), ''),
    ['Primary NIC accelerated'] = case(isVmss == 1, '', nicsRead == nicCount, iff(primaryAccelerated > 0, 'Yes', 'No'), ''),
    ['Azure Disk Encryption'] = iff(adeExtension > 0 or adeOsDisk =~ 'true'
        or vmssExtensions matches regex @'"type":"AzureDiskEncryption(ForLinux)?"', 'Yes', 'No'),
    Hibernation = iff(hibernation == true, 'Yes', 'No'),
    ['Scale set'] = iff(isVmss == 1 or isnotempty(scaleSet), 'Yes', 'No'),
    ['Azure Virtual Desktop'] = iff(isnotempty(hostPoolId), 'Yes', 'No'),
    // SAP: the extension for SAP solutions, a licence type that puts the machine on SAP
    // repositories, or an SAP marketplace image (Microsoft's Azure Hybrid Benefit page).
    SAP = iff(sapExtension > 0
              or vmssExtensions matches regex @'"type":"(MonitorX64Linux|MonitorX64Windows|AzureEnhancedMonitorForLinux)"'
              or licenseType in~ ('RHEL_SAPAPPS', 'RHEL_SAPHA', 'RHEL_BASESAPAPPS', 'RHEL_BASESAPHA', 'SLES_SAP')
              or (imagePublisher =~ 'RedHat' and imageOffer in~ ('rhel-sap-apps', 'rhel-sap-ha'))
              or (imagePublisher =~ 'SUSE' and tolower(imageOffer) startswith 'sles-sap'), 'Yes', 'No'),
    ['Unmanaged disks'] = iff(isnotempty(osDiskVhd) or dataDisks contains '"vhd"', 'Yes', 'No'),
    ['Ephemeral OS disk'] = iff(osDiskOption =~ 'Local', 'Yes', 'No'),
    ['System-assigned identity'] = iff(identityType contains 'SystemAssigned', 'Yes', 'No'),
    ['Availability set'] = iff(isempty(availabilitySet), 'No', 'Yes'),
    Zone = iff(isempty(zones) or zones == '[]', 'None', replace_regex(zones, @'[\[\]"]', '')),
    ['Resource type'] = iff(isVmss == 1, 'Scale set', 'VM'),
    Instances = iff(isVmss == 1, tostring(instances), ''),
    // The service that owns the resource group, from its "managedBy" field.
    ['Managed by'] = case(
        isempty(managedByType), 'None',
        managedByType startswith 'microsoft.containerservice/managedclusters', 'AKS',
        managedByType startswith 'microsoft.databricks/workspaces', 'Databricks',
        managedByType startswith 'microsoft.redhatopenshift/openshiftclusters', 'ARO',
        tostring(split(managedByType, '/')[0])),
    ['AVD host pool type'] = hostPoolType,
    ['SQL Server'] = iff(isempty(sqlEdition), 'No', sqlEdition),
    ['SQL availability group'] = iff(isempty(sqlGroup), 'No', 'Yes'),
    ['Shared disk'] = iff(sharedDisk > 0, 'Yes', 'No'),
    // Azure's unique key: two VMs can have the same name in other groups or subscriptions.
    ['Resource ID'] = rid
| order by ['VM name'] asc
`;
