// Microsoft's End of Life and retirement lists, for families outside the lifecycle table.
export default {
  "why": "Microsoft's lifecycle overview: End of Life series are the ones with an announced retirement, and Retired series can no longer run. Every other series is Current or Extended - both 'modern' and fully supported - so a machine on one needs no move. The tool's lifecycle table (target-families.json) names the stage of the D, E, F, B v1 and A families; this list covers every other family, so a size outside both is modern by Microsoft's own definitions, never 'unknown'.",
  "sources": [
    {
      "url": "https://learn.microsoft.com/azure/virtual-machines/sizes/lifecycle/end-of-life-sizes-list",
      "pageUpdatedUtc": "2026-09-26",
      "readUtc": "2026-10-09"
    },
    {
      "url": "https://learn.microsoft.com/azure/virtual-machines/sizes/lifecycle/retirements-and-capacity-restrictions",
      "pageUpdatedUtc": "2026-09-27",
      "readUtc": "2026-10-09"
    },
    {
      "url": "https://learn.microsoft.com/azure/virtual-machines/sizes/lifecycle/lifecycle-overview",
      "pageUpdatedUtc": "2026-09-26",
      "readUtc": "2026-10-09"
    }
  ],
  "readingNote": "sizeSeries is how a size name reads: the family (capitals), the letters after the size number, any accelerator or tag part, and the version. Standard_NV12s_v3 reads NVsv3, Standard_NV4as_v4 NVasv4, Standard_HB120rs_v2 HBrsv2, Standard_HC44rs HCrs, Standard_NP10s NPs, Standard_DC2as_cc_v5 DCasccv5. A _Promo suffix is ignored. sizes lists single sizes Microsoft names one by one.",
  "series": [
    {
      "names": "B-series (V1)",
      "sizeSeries": [
        "Bs",
        "Bms",
        "Bls"
      ],
      "retiresUtc": "2028-11-15"
    },
    {
      "names": "Standard D-series, DS-series, Dv1, Dsv1, memory-optimized D and DS",
      "sizeSeries": [
        "D",
        "DS"
      ],
      "retiresUtc": "2028-05-01"
    },
    {
      "names": "Dv2 and Dsv2-series",
      "sizeSeries": [
        "Dv2",
        "DSv2"
      ],
      "retiresUtc": "2028-05-01"
    },
    {
      "names": "Dv3 and Dsv3-series",
      "sizeSeries": [
        "Dv3",
        "Dsv3"
      ],
      "retiresUtc": "2029-11-15"
    },
    {
      "names": "Av2 and Amv2-series",
      "sizeSeries": [
        "Av2",
        "Amv2"
      ],
      "retiresUtc": "2028-11-15"
    },
    {
      "names": "DCsv3 and DCdsv3-series",
      "sizeSeries": [
        "DCsv3",
        "DCdsv3"
      ],
      "retiresUtc": "2029-10-31"
    },
    {
      "names": "DCsv2-series",
      "sizeSeries": [
        "DCsv2"
      ],
      "retiresUtc": "2026-06-30"
    },
    {
      "names": "DCas_cc_v5 and DCads_cc_v5-series",
      "sizeSeries": [
        "DCasccv5",
        "DCadsccv5"
      ],
      "retiresUtc": "2026-09-01"
    },
    {
      "names": "F, Fs and Fsv2-series",
      "sizeSeries": [
        "F",
        "Fs",
        "Fsv2"
      ],
      "retiresUtc": "2028-11-15"
    },
    {
      "names": "Ev3 and Esv3-series",
      "sizeSeries": [
        "Ev3",
        "Esv3",
        "Eiv3",
        "Eisv3"
      ],
      "retiresUtc": "2029-11-15"
    },
    {
      "names": "G and GS-series",
      "sizeSeries": [
        "G",
        "GS"
      ],
      "retiresUtc": "2028-11-15"
    },
    {
      "names": "ECas_cc_v5 and ECads_cc_v5-series",
      "sizeSeries": [
        "ECasccv5",
        "ECadsccv5"
      ],
      "retiresUtc": "2026-09-01"
    },
    {
      "names": "Ls-series (Lsv1)",
      "sizeSeries": [
        "Ls"
      ],
      "retiresUtc": "2028-05-01"
    },
    {
      "names": "Lsv2-series",
      "sizeSeries": [
        "Lsv2"
      ],
      "retiresUtc": "2028-11-15"
    },
    {
      "names": "NVv3-series",
      "sizeSeries": [
        "NVsv3"
      ],
      "retiresUtc": "2026-09-30"
    },
    {
      "names": "NVv4-series",
      "sizeSeries": [
        "NVasv4"
      ],
      "retiresUtc": "2026-09-30"
    },
    {
      "names": "NCv3-series (including NC24rs_v3)",
      "sizeSeries": [
        "NCsv3",
        "NCrsv3"
      ],
      "retiresUtc": "2025-09-30"
    },
    {
      "names": "NP-series",
      "sizeSeries": [
        "NPs"
      ],
      "retiresUtc": "2027-05-31"
    },
    {
      "names": "HC-series",
      "sizeSeries": [
        "HCrs"
      ],
      "retiresUtc": "2027-05-31"
    },
    {
      "names": "HBv2-series",
      "sizeSeries": [
        "HBrsv2"
      ],
      "retiresUtc": "2027-05-31"
    }
  ],
  "sizes": [
    {
      "names": "Msv2 and Mdsv2 isolated sizes",
      "sizes": [
        "Standard_M192idms_v2",
        "Standard_M192ids_v2",
        "Standard_M192ims_v2",
        "Standard_M192is_v2"
      ],
      "retiresUtc": "2027-03-31"
    }
  ]
};
