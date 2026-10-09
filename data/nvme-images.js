// Which OS images support NVMe (v6 and v7 use NVMe disks only).
// Microsoft's list, read 2026-10-09. An image older than the list, or one that
// cannot be read (a custom image), is "check", never a pass.
export default {
    "readUtc": "2026-10-09",
    "source": "https://learn.microsoft.com/azure/virtual-machines/enable-nvme-interface",
    "pageUpdatedUtc": "2026-06-18",
    "says": "Only Gen2 VM images with security type Standard or Trusted Launch support NVMe. Older operating systems cannot support NVMe due to OS driver limitations.",
    // Each OS: the lowest version on Microsoft's list, per major version.
    // [major, lowest minor]; a major not listed is not supported.
    "linux": {
        "ubuntu": { "supported": [[18, 4], [20, 4], [22, 4], [24, 4]], "versions": "exact" },
        "rhel": { "supported": [[7, 9], [8, 6], [9, 0]] },
        "sles": { "supported": [[15, 4]] },
        "sles-sap": { "supported": [[15, 3]] },
        "debian": { "supported": [[11, 0], [12, 0]] },
        "oracle": { "supported": [[7, 9], [8, 5], [9, 0]] },
        "almalinux": { "supported": [[8, 0], [9, 0]] },
        "rocky": { "supported": [[8, 10], [9, 6]], "versions": "exact" },
        "azurelinux": { "supported": [[3, 0]] }
    },
    // Windows Server 2019, 2022 and 2025; Windows 10 and 11.
    "windowsServerFrom": 2019,
    "windowsClient": [10, 11]
};
