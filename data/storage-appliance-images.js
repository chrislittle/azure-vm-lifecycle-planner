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
    { "vendor": "NetApp (Cloud Volumes ONTAP, Global File Cache)", "publisher": "netapp", "offers": ["netapp-ontap-cloud*", "netapp-gfc-*"] },
    { "vendor": "Pure Storage Cloud Block Store", "publisher": "purestorageinc1578960262525", "offers": ["cloud_block_store*"] },
    { "vendor": "Rubrik", "publisher": "rubrik-inc", "offers": ["rubrik-*"] },
    { "vendor": "Silk", "publisher": "silk", "offers": ["silk_cloud_data_platform*"] },
    { "vendor": "Nasuni", "publisher": "nasunicorporation", "offers": ["nasuni-*", "naa-server"] },
    { "vendor": "Dell (APEX, Data Domain, Avamar, NetWorker, PowerProtect)", "publisher": "dellemc", "offers": ["apexfilestorage", "dell_apex_block_storage", "dell-emc-datadomain-*", "dell-emc-avamar-virtual-edition", "dell-emc-networker-virtual-edition", "ppdm*"] },
    { "vendor": "Dell (APEX, Data Domain)", "publisher": "dellemceisi123456", "offers": ["apex_block_storage*", "apexfilestorage*", "ddve*"] },
    { "vendor": "Cohesity DataPlatform Cloud Edition", "publisher": "cohesity", "offers": ["cohesity-cloudtd-tool"] },
    { "vendor": "Cohesity DataPlatform Cloud Edition", "publisher": "cohesitydev1592001764720", "offers": ["sol-4471-ixk"] },
    { "vendor": "Veeam", "publisher": "veeam", "offers": ["veeam-backup-replication*", "veeamcloudconnect", "veeam-cloud-connect-enterprise", "azure_backup*", "veeamhubimage"] },
    { "vendor": "Commvault", "publisher": "commvault", "offers": ["*"] },
    { "vendor": "CTERA", "publisher": "cteranetworksltd1651947437632", "offers": ["ctera-*"] },
    { "vendor": "Druva", "publisher": "druvainc1738665083385", "offers": ["*"] },
    { "vendor": "Hammerspace", "publisher": "hammerspace", "offers": ["*"] },
    { "vendor": "Hitachi Vantara VSP One SDS", "publisher": "hitachivantara", "offers": ["vsp_one_sds_block_image*", "gad_cloud_quorum*", "hv-gadcloudquorum"] },
    { "vendor": "IBM Storage Virtualize", "publisher": "ibm-alliance-usa-ny-armonk-hq-ibmstorage-6201192", "offers": ["ibm-svpc-*"] },
    { "vendor": "Lightbits", "publisher": "lightbitslabsinc1670948060485", "offers": ["lightbits-*"] },
    { "vendor": "Panzura", "publisher": "panzura-file-system", "offers": ["*"] },
    { "vendor": "SoftNAS (Buurst)", "publisher": "softnas", "offers": ["*"] },
    { "vendor": "Zerto", "publisher": "zerto", "offers": ["*"] }
  ],
  // A vendor that deploys from its own gallery, not the Marketplace. WEKA's Terraform
  // module builds both its storage VMs and its client VMs from this image. The client
  // VMs are flagged too: the WEKA client depends on the network adapter, and v6 and
  // v7 change it, so the vendor must approve the size there as well.
  "galleries": [
    { "vendor": "WEKA", "imageId": "/communityGalleries/WekaIO-*" }
  ],
  // Checked and not on the list: Cohesity and WEKA were missed on 2026-10-10 (Cohesity's
  // offer name hides that it is the appliance; WEKA is not in the Marketplace).
  "notes": "Not storage appliances: Veeam office365backup and the Veeam consoles; NetApp BlueXP (Cloud Manager) connector; Hitachi Pentaho; IBM other offers."
};
