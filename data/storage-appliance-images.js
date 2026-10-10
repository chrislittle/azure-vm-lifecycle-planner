// Storage and backup appliance images: our own list, read from the Azure Marketplace
// image catalog. Not a Microsoft list. The vendors are the examples on Microsoft's
// v6/v7 Plan page ("Storage and backup virtual appliances": "Treat VM-based storage
// appliances like NVAs"). Owner, 2026-10-10: a hard gate for every one of them.
export default {
  "readUtc": "2026-10-10",
  "how": "az vm image list-publishers and az vm image list-offers, Central US. Offers can differ by region; refresh from time to time.",
  "source": "https://learn.microsoft.com/azure/virtual-machines/sizes/lifecycle/sizes-v6-v7-modernization-plan",
  "rule": "An image is a storage or backup appliance when its publisher is one of these AND its offer matches one of that publisher's offers. A * matches any text. Case is ignored.",
  "vendors": [
    { "vendor": "NetApp Cloud Volumes ONTAP", "publisher": "netapp", "offers": ["netapp-ontap-cloud*"] },
    { "vendor": "Pure Storage Cloud Block Store", "publisher": "purestorageinc1578960262525", "offers": ["cloud_block_store*"] },
    { "vendor": "Rubrik", "publisher": "rubrik-inc", "offers": ["rubrik-cloud-data-management", "rubrik-data-protection"] },
    { "vendor": "Silk", "publisher": "silk", "offers": ["silk_cloud_data_platform*"] },
    { "vendor": "Nasuni", "publisher": "nasunicorporation", "offers": ["nasuni-nea*", "naa-server"] },
    { "vendor": "Dell", "publisher": "dellemc", "offers": ["apexfilestorage", "dell_apex_block_storage", "dell-emc-datadomain-virtual-edition*", "dell-emc-avamar-virtual-edition", "dell-emc-networker-virtual-edition", "ppdm*"] },
    { "vendor": "Veeam", "publisher": "veeam", "offers": ["veeam-backup-replication", "veeamcloudconnect"] },
    { "vendor": "Commvault", "publisher": "commvault", "offers": ["commvault", "commvaultmediaagent"] }
  ]
};
