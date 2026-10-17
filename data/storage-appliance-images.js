// Storage and backup appliance images: our own list, read from the Azure Marketplace
// image catalog and from the vendors' own deployment code. Not a Microsoft list.
// Microsoft's v6/v7 Plan page ("Storage and backup virtual appliances": "Treat
// VM-based storage appliances like NVAs") names NetApp, Pure Storage, Rubrik, Silk,
// Nasuni, Dell, Cohesity and WEKA as examples. Owner, 2026-10-10: vendor approval
// first for every storage and backup appliance, across the board.
export default {
  "readUtc": "2026-10-16",
  "how": "az vm image list-publishers and az vm image list-offers in East US and West Europe; the WEKA gallery from WEKA's Terraform module (github.com/weka/terraform-azure-weka) and az sig image-definition list-community. Offers can differ by region; refresh from time to time.",
  "source": "https://learn.microsoft.com/azure/virtual-machines/sizes/lifecycle/sizes-v6-v7-modernization-plan",
  "rule": "A VM is a storage or backup appliance when (1) its image publisher is one of these AND its image offer matches one of that publisher's offers, or (2) its Marketplace purchase plan (plan publisher and product) matches the same way, or (3) its image ID matches one of the galleries. A * matches any text. Case is ignored.",
  "vendors": [
    { "vendor": "NetApp (Cloud Volumes ONTAP, Global File Cache)", "publisher": "netapp", "offers": ["netapp-ontap-cloud*", "netapp-cloud-ontap*", "netapp-gfc-*"] },
    { "vendor": "Pure Storage Cloud Block Store", "publisher": "purestorageinc1578960262525", "offers": ["cloud_block_store*"] },
    { "vendor": "Rubrik", "publisher": "rubrik-inc", "offers": ["rubrik-*"] },
    { "vendor": "Silk", "publisher": "silk", "offers": ["silk_cloud_data_platform*"] },
    { "vendor": "Nasuni", "publisher": "nasunicorporation", "offers": ["nasuni-*", "naa-server"] },
    { "vendor": "Dell (APEX, Data Domain, Avamar, NetWorker, PowerProtect)", "publisher": "dellemc", "offers": ["apexfilestorage", "dell_apex_block_storage", "dell-emc-datadomain-*", "dell-emc-avamar-virtual-edition", "dell-emc-networker-virtual-edition", "ppdm*"] },
    { "vendor": "Dell (APEX, Data Domain)", "publisher": "dellemceisi123456", "offers": ["apex_block_storage*", "apexfilestorage*", "ddve*"] },
    { "vendor": "Dell (APEX)", "publisher": "dell-australia", "offers": ["dell_apex_block_storage*"] },
    { "vendor": "Dell (APEX, Data Domain)", "publisher": "dell-canada-inc", "offers": ["apexfilestorage*", "dell-datadomain-virtual-edition*"] },
    { "vendor": "Cohesity DataPlatform Cloud Edition", "publisher": "cohesity", "offers": ["cohesity-cloudtd-tool"] },
    { "vendor": "Cohesity DataPlatform Cloud Edition", "publisher": "cohesitydev1592001764720", "offers": ["sol-4471-ixk"] },
    { "vendor": "Veeam", "publisher": "veeam", "offers": ["veeam-backup-replication*", "veeamcloudconnect", "veeam-cloud-connect-enterprise", "azure_backup*", "veeamhubimage"] },
    { "vendor": "Commvault", "publisher": "commvault", "offers": ["*"] },
    { "vendor": "CTERA", "publisher": "cteranetworksltd1651947437632", "offers": ["ctera-*"] },
    { "vendor": "Druva", "publisher": "druvainc1738665083385", "offers": ["*"] },
    { "vendor": "Druva", "publisher": "druvainc1776165200367", "offers": ["*"] },
    { "vendor": "Veritas (NetBackup, InfoScale)", "publisher": "veritas", "offers": ["*"] },
    { "vendor": "BackupAssure", "publisher": "backupassure", "offers": ["*"] },
    { "vendor": "Hammerspace", "publisher": "hammerspace", "offers": ["*"] },
    { "vendor": "Hitachi Vantara VSP One SDS", "publisher": "hitachivantara", "offers": ["vsp_one_sds_block_image*", "gad_cloud_quorum*", "hv-gadcloudquorum"] },
    { "vendor": "IBM Storage Virtualize", "publisher": "ibm-alliance-usa-ny-armonk-hq-ibmstorage-6201192", "offers": ["ibm-svpc-*"] },
    { "vendor": "Lightbits", "publisher": "lightbitslabsinc1670948060485", "offers": ["lightbits-*"] },
    { "vendor": "Panzura", "publisher": "panzura-file-system", "offers": ["*"] },
    { "vendor": "SoftNAS (Buurst)", "publisher": "softnas", "offers": ["*"] },
    { "vendor": "Zerto", "publisher": "zerto", "offers": ["*"] },
    { "vendor": "Microsoft StorSimple Cloud Appliance (StorSimple retired in 2022)", "publisher": "MicrosoftHybridCloudStorage", "offers": ["StorSimple*"] }
  ],
  // A vendor that deploys from its own gallery, not the Marketplace. WEKA's Terraform
  // module builds both its storage VMs and its client VMs from this image. The client
  // VMs are flagged too: the WEKA client depends on the network adapter, and v6 and
  // v7 change it, so the vendor must approve the size there as well.
  "galleries": [
    { "vendor": "WEKA", "imageId": "/communityGalleries/WekaIO-*" }
  ],
  // Offers of a listed publisher that are not an appliance (test, internal, console,
  // connector, other products), checked on 2026-10-16. The weekly check does not
  // report them again.
  "reviewed": [
    "dellemc/test-dell-emc-avamar-virtual-edition",
    "hitachivantara/hitachivantara-pdc_10", "hitachivantara/pdi-server-9-5", "hitachivantara/pdi-server-9-5-269",
    "hitachivantara/pentaho-data-integration-server-9-5-0-0-42801", "hitachivantara/pentaho-platform-server-9-5-0-0-428", "hitachivantara/platform-server-9-5-269",
    "lightbitslabsinc1670948060485/vm123",
    "netapp/cloud-compliance", "netapp/cloudmanager-connector-dev", "netapp/netapp-oncommand-cloud-manager", "netapp/netapp-oncommand-cloud-manager-dev",
    "netapp/netapp-oncommand-cloud-manager-staging", "netapp/riyoa-vetted-marketplace-image", "netapp/riyoa-vetted-marketplace-image-local", "netapp/riyoa-vetted-marketplace-image-v2",
    "purestorageinc1578960262525/zactestvmoffer",
    "veeam/azure-backup-test", "veeam/jan_azure_backup_3", "veeam/managed-backup-portal", "veeam/office365backup", "veeam/test_azure_tables",
    "veeam/test_jan_azure_backup_2", "veeam/veeam-direct-restore-to-microsoft-azure", "veeam/veeam_service_provider_console",
    "cubebackupinc1662619479161/cubebackup_for_google_workspace_image", "cubebackupinc1662619479161/cubebackup_for_google_workspace_image_linux",
    "cubebackupinc1662619479161/cubebackup_for_microsoft_365_image_linux", "cubebackupinc1662619479161/cubebackup_for_microsoft_365_image_windows",
    "dell_software/remotescan", "dell_software/uccs", "pacteratechnologiesinc/intelligenttrainvm", "quantumaiinc1765274899639/qai-ckfcmlfmicrok8sjuju"
  ],
  // Publishers whose name looks like a storage or backup vendor, but that have no
  // storage or backup appliance image (extensions, other products, no VM images),
  // checked on 2026-10-16. The weekly check does not report them again.
  "notVendors": [
    "Acronis.Backup", "MICROSOFT.AZURE.HOSTSTORAGE", "Microsoft.Azure.Backup.Test", "Microsoft.Azure.Backup.Test.Edp",
    "Microsoft.Azure.RecoveryServices.WorkloadBackup", "Microsoft.Azure.RecoveryServices.WorkloadBackup.Edp",
    "Microsoft.CloudBackup.Workload.Extension", "Microsoft.CloudBackup.Workload.Extension.Edp", "Microsoft.Edge.Backup",
    "Microsoft.StorageSync", "PureStorage.Extensions", "arctera", "cubebackup",
    "cubebackupinc1662619479161", "dell_software", "hitachi-solutions", "minio", "nasuni", "pacteratechnologiesinc",
    "quantumaiinc1765274899639", "storage_made_easy"
  ],
  // Checked and not on the list: Cohesity and WEKA were missed on 2026-10-10 (Cohesity's
  // offer name hides that it is the appliance; WEKA is not in the Marketplace).
  "notes": "Not storage appliances: Veeam office365backup and the Veeam consoles; NetApp BlueXP (Cloud Manager) connector; Hitachi Pentaho; IBM other offers."
};
