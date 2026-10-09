// Target series, processors and Microsoft lifecycle stages and retirements.
// Sources: Microsoft Learn, VM sizes lifecycle pages.
export default {
  "updatedUtc": "2026-10-04",
  "sources": [
    {
      "url": "https://learn.microsoft.com/azure/virtual-machines/sizes/lifecycle/retirements-and-capacity-restrictions",
      "section": "general-purpose-vm-series-with-announced-retirements",
      "readUtc": "2026-10-03"
    },
    {
      "url": "https://learn.microsoft.com/azure/virtual-machines/sizes/lifecycle/sizes-v6-v7-modernization-overview",
      "section": "target-vm-families",
      "readUtc": "2026-09-22"
    },
    {
      "url": "https://learn.microsoft.com/azure/virtual-machines/vm-naming-conventions",
      "section": "additive-features",
      "readUtc": "2026-09-22"
    },
    {
      "url": "https://learn.microsoft.com/azure/virtual-machines/sizes/lifecycle/sizes-v5-modernization-overview",
      "section": "what-changes-when-the-vm-family-changes",
      "readUtc": "2026-09-26"
    },
    {
      "url": "https://learn.microsoft.com/azure/virtual-machines/sizes/lifecycle/lifecycle-overview",
      "section": "lifecycle-stages",
      "readUtc": "2026-09-26"
    },
    {
      "url": "https://learn.microsoft.com/azure/virtual-machines/sizes/lifecycle/end-of-life-sizes-list",
      "section": "general-purpose-end-of-life-sizes",
      "readUtc": "2026-09-26"
    },
    {
      "url": "https://learn.microsoft.com/azure/virtual-machines/sizes/general-purpose/dsv5-series",
      "section": "feature-support",
      "readUtc": "2026-09-26"
    },
    {
      "url": "https://learn.microsoft.com/azure/virtual-machines/sizes/memory-optimized/ev5-series",
      "section": "feature-support",
      "readUtc": "2026-10-02"
    },
    {
      "url": "https://learn.microsoft.com/azure/virtual-machines/sizes/lifecycle/sizes-v6-v7-modernization-plan",
      "section": "retiring-v3-workloads",
      "readUtc": "2026-10-03"
    },
    {
      "url": "https://learn.microsoft.com/azure/virtual-machines/sizes/general-purpose/dav4-series",
      "section": "sizes-in-series",
      "readUtc": "2026-10-04"
    },
    {
      "url": "https://learn.microsoft.com/azure/virtual-machines/sizes/general-purpose/dasv4-series",
      "section": "sizes-in-series",
      "readUtc": "2026-10-04"
    },
    {
      "url": "https://learn.microsoft.com/azure/virtual-machines/sizes/memory-optimized/eav4-series",
      "section": "sizes-in-series",
      "readUtc": "2026-10-04"
    },
    {
      "url": "https://learn.microsoft.com/azure/virtual-machines/sizes/memory-optimized/easv4-series",
      "section": "sizes-in-series",
      "readUtc": "2026-10-04"
    },
    {
      "url": "https://learn.microsoft.com/azure/virtual-machines/sizes/lifecycle/retirement/av1-series-retirement",
      "section": "",
      "readUtc": "2026-10-04"
    },
    {
      "url": "https://learn.microsoft.com/azure/virtual-machines/sizes/lifecycle/retirement/retired-sizes-modernization-guide",
      "section": "recommended-replacement-vm-series",
      "readUtc": "2026-10-04"
    },
    {
      "url": "https://learn.microsoft.com/azure/virtual-machines/sizes/general-purpose/b-family",
      "section": "",
      "readUtc": "2026-10-04"
    },
    {
      "url": "https://learn.microsoft.com/azure/virtual-machines/sizes/general-purpose/dv4-series",
      "section": "sizes-in-series",
      "readUtc": "2026-10-04"
    },
    {
      "url": "https://learn.microsoft.com/azure/virtual-machines/sizes/general-purpose/ddv4-series",
      "section": "sizes-in-series",
      "readUtc": "2026-10-04"
    },
    {
      "url": "https://learn.microsoft.com/azure/virtual-machines/sizes/memory-optimized/ev4-series",
      "section": "sizes-in-series",
      "readUtc": "2026-10-04"
    },
    {
      "url": "https://learn.microsoft.com/azure/virtual-machines/sizes/memory-optimized/edv4-series",
      "section": "sizes-in-series",
      "readUtc": "2026-10-04"
    }
  ],
  "burstableFamilies": [
    "B"
  ],
  "processorLetters": {
    "a": "AMD",
    "p": "Arm64"
  },
  "defaultProcessor": "Intel",
  "approvedProcessors": [
    "Intel",
    "AMD"
  ],
  "seriesByGeneration": {
    "v5": [
      "D",
      "E"
    ],
    "v6": [
      "D",
      "E",
      "F"
    ],
    "v7": [
      "D",
      "E",
      "F"
    ]
  },
  "generations": {
    "v5": {
      "controller": "SCSI",
      "hyperVGenerations": [
        "V1",
        "V2"
      ],
      "acceleratedNetworkingRequired": [
        {
          "series": "D",
          "processor": "Intel"
        },
        {
          "series": "E",
          "processor": "Intel"
        }
      ],
      "manaProcessors": [
        "Intel"
      ]
    },
    "v6": {
      "controller": "NVMe",
      "hyperVGenerations": [
        "V2"
      ],
      "acceleratedNetworkingRequired": [],
      "manaProcessors": [
        "Intel",
        "AMD"
      ]
    },
    "v7": {
      "controller": "NVMe",
      "hyperVGenerations": [
        "V2"
      ],
      "acceleratedNetworkingRequired": [],
      "manaProcessors": [
        "Intel",
        "AMD"
      ]
    }
  },
  "replacements": {
    "bySeries": [
      {
        "sourceSeries": [
          "Dv3",
          "Dsv3"
        ],
        "everySizeHasTemporaryDisk": true,
        "targets": {
          "v5": [
            "Dv5",
            "Dsv5",
            "Ddv5",
            "Ddsv5",
            "Dasv5",
            "Dadsv5"
          ],
          "v6": [
            "Dsv6",
            "Ddsv6",
            "Dasv6",
            "Dadsv6"
          ],
          "v7": [
            "Dsv7",
            "Ddsv7",
            "Dasv7",
            "Dadsv7"
          ]
        },
        "source": "sizes-v6-v7-modernization-plan",
        "basis": "stated"
      },
      {
        "sourceSeries": [
          "Ev3",
          "Esv3"
        ],
        "everySizeHasTemporaryDisk": true,
        "targets": {
          "v5": [
            "Ev5",
            "Esv5",
            "Edv5",
            "Edsv5",
            "Easv5",
            "Eadsv5"
          ],
          "v6": [
            "Esv6",
            "Edsv6",
            "Easv6",
            "Eadsv6"
          ],
          "v7": [
            "Esv7",
            "Edsv7",
            "Easv7",
            "Eadsv7"
          ]
        },
        "source": "sizes-v6-v7-modernization-plan",
        "basis": "stated"
      },
      {
        "sourceSeries": [
          "Dav4"
        ],
        "everySizeHasTemporaryDisk": true,
        "targets": {
          "v5": [
            "Dasv5",
            "Dadsv5"
          ],
          "v6": [
            "Dasv6",
            "Dadsv6"
          ],
          "v7": [
            "Dasv7",
            "Dadsv7"
          ]
        },
        "source": "dav4-series",
        "basis": "derived"
      },
      {
        "sourceSeries": [
          "Dasv4"
        ],
        "everySizeHasTemporaryDisk": true,
        "targets": {
          "v5": [
            "Dasv5",
            "Dadsv5"
          ],
          "v6": [
            "Dasv6",
            "Dadsv6"
          ],
          "v7": [
            "Dasv7",
            "Dadsv7"
          ]
        },
        "source": "dasv4-series",
        "basis": "derived"
      },
      {
        "sourceSeries": [
          "Eav4"
        ],
        "everySizeHasTemporaryDisk": true,
        "targets": {
          "v5": [
            "Easv5",
            "Eadsv5"
          ],
          "v6": [
            "Easv6",
            "Eadsv6"
          ],
          "v7": [
            "Easv7",
            "Eadsv7"
          ]
        },
        "source": "eav4-series",
        "basis": "derived"
      },
      {
        "sourceSeries": [
          "Easv4"
        ],
        "everySizeHasTemporaryDisk": true,
        "targets": {
          "v5": [
            "Easv5",
            "Eadsv5"
          ],
          "v6": [
            "Easv6",
            "Eadsv6"
          ],
          "v7": [
            "Easv7",
            "Eadsv7"
          ]
        },
        "source": "easv4-series",
        "basis": "derived"
      },
      {
        "sourceSeries": [
          "Dv4"
        ],
        "everySizeHasTemporaryDisk": false,
        "targets": {
          "v5": [
            "Dv5",
            "Ddv5"
          ],
          "v6": [
            "Dsv6",
            "Ddsv6"
          ],
          "v7": [
            "Dsv7",
            "Ddsv7"
          ]
        },
        "source": "dv4-series",
        "basis": "derived"
      },
      {
        "sourceSeries": [
          "Ddv4"
        ],
        "everySizeHasTemporaryDisk": true,
        "targets": {
          "v5": [
            "Dv5",
            "Ddv5"
          ],
          "v6": [
            "Dsv6",
            "Ddsv6"
          ],
          "v7": [
            "Dsv7",
            "Ddsv7"
          ]
        },
        "source": "ddv4-series",
        "basis": "derived"
      },
      {
        "sourceSeries": [
          "Ev4"
        ],
        "everySizeHasTemporaryDisk": false,
        "targets": {
          "v5": [
            "Ev5",
            "Edv5"
          ],
          "v6": [
            "Esv6",
            "Edsv6"
          ],
          "v7": [
            "Esv7",
            "Edsv7"
          ]
        },
        "source": "ev4-series",
        "basis": "derived"
      },
      {
        "sourceSeries": [
          "Edv4"
        ],
        "everySizeHasTemporaryDisk": true,
        "targets": {
          "v5": [
            "Ev5",
            "Edv5"
          ],
          "v6": [
            "Esv6",
            "Edsv6"
          ],
          "v7": [
            "Esv7",
            "Edsv7"
          ]
        },
        "source": "edv4-series",
        "basis": "derived"
      }
    ]
  },
  "lifecycle": {
    "bySeries": [
      {
        "family": "D",
        "generations": [
          "v6",
          "v7"
        ],
        "stage": "Current",
        "basis": "stated",
        "source": "lifecycle-overview"
      },
      {
        "family": "D",
        "generations": [
          "v4",
          "v5"
        ],
        "stage": "Extended",
        "basis": "stated",
        "source": "lifecycle-overview"
      },
      {
        "family": "D",
        "generations": [
          "v1",
          "v2",
          "v3"
        ],
        "stage": "End of Life",
        "basis": "stated",
        "source": "end-of-life-sizes-list"
      },
      {
        "family": "DS",
        "generations": [
          "v1",
          "v2"
        ],
        "stage": "End of Life",
        "basis": "stated",
        "source": "end-of-life-sizes-list"
      },
      {
        "family": "E",
        "generations": [
          "v6",
          "v7"
        ],
        "stage": "Current",
        "basis": "stated",
        "source": "sizes-v5-modernization-overview"
      },
      {
        "family": "E",
        "generations": [
          "v5"
        ],
        "stage": "Extended",
        "basis": "stated",
        "source": "sizes-v5-modernization-overview"
      },
      {
        "family": "E",
        "generations": [
          "v4"
        ],
        "stage": "Extended",
        "basis": "derived",
        "source": "lifecycle-overview"
      },
      {
        "family": "E",
        "generations": [
          "v3"
        ],
        "stage": "End of Life",
        "basis": "stated",
        "source": "end-of-life-sizes-list"
      },
      {
        "family": "F",
        "generations": [
          "v7"
        ],
        "stage": "Current",
        "basis": "derived",
        "source": "lifecycle-overview"
      },
      {
        "family": "F",
        "generations": [
          "v6"
        ],
        "stage": "Current",
        "basis": "derived",
        "source": "lifecycle-overview"
      },
      {
        "family": "B",
        "generations": [
          "v1"
        ],
        "stage": "End of Life",
        "basis": "stated",
        "source": "end-of-life-sizes-list"
      },
      {
        "family": "F",
        "generations": [
          "v1",
          "v2"
        ],
        "stage": "End of Life",
        "basis": "stated",
        "source": "end-of-life-sizes-list"
      },
      {
        "family": "A",
        "generations": [
          "v2"
        ],
        "stage": "End of Life",
        "basis": "stated",
        "source": "end-of-life-sizes-list"
      },
      {
        "family": "A",
        "generations": [
          "v1"
        ],
        "stage": "Retired",
        "basis": "stated",
        "source": "av1-series-retirement"
      }
    ],
    "retirements": [
      {
        "series": [
          "Dv3",
          "Dsv3",
          "Ev3",
          "Esv3"
        ],
        "sizeSeries": [
          "Dv3",
          "Dsv3",
          "Ev3",
          "Esv3",
          "Eiv3",
          "Eisv3"
        ],
        "retiresUtc": "2029-11-15",
        "source": "end-of-life-sizes-list"
      },
      {
        "series": [
          "D",
          "Ds",
          "Dv2",
          "Dsv2"
        ],
        "sizeSeries": [
          "D",
          "DS",
          "Dv2",
          "DSv2"
        ],
        "retiresUtc": "2028-05-01",
        "source": "retirements-and-capacity-restrictions"
      },
      {
        "series": [
          "Av2",
          "Amv2",
          "B v1"
        ],
        "sizeSeries": [
          "Av2",
          "Amv2",
          "Bs",
          "Bms",
          "Bls"
        ],
        "retiresUtc": "2028-11-15",
        "source": "retirements-and-capacity-restrictions"
      },
      {
        "series": [
          "F",
          "Fs",
          "Fsv2"
        ],
        "sizeSeries": [
          "F",
          "Fs",
          "Fsv2"
        ],
        "retiresUtc": "2028-11-15",
        "source": "retirements-and-capacity-restrictions"
      },
      {
        "series": [
          "Basic and Standard A-series (A v1)"
        ],
        "sizeSeries": [
          "A"
        ],
        "retiresUtc": "2024-08-31",
        "source": "av1-series-retirement"
      }
    ]
  }
};
