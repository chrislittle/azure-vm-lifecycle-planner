// Which target series each reason applies to (v5, v6, v7).
// A reason not listed here applies to every series.
export default {
  "blockers": {
    "gen1-requires-redeploy": {
      "appliesTo": [
        "v6",
        "v7"
      ]
    },
    "confidential-vm-requires-manual": {
      "appliesTo": [
        "v5",
        "v6",
        "v7"
      ]
    },
    "image-not-supported": {
      "appliesTo": [
        "v5",
        "v6",
        "v7"
      ]
    },
    "image-cannot-boot-nvme": {
      "appliesTo": [
        "v6",
        "v7"
      ]
    },
    "windows-version-below-2019": {
      "appliesTo": [
        "v6",
        "v7"
      ]
    },
    "windows-version-not-proven": {
      "appliesTo": [
        "v5"
      ]
    },
    "unmanaged-os-disk": {
      "appliesTo": [
        "v5",
        "v6",
        "v7"
      ]
    },
    "nva-requires-parallel-deployment": {
      "appliesTo": [
        "v5",
        "v6",
        "v7"
      ]
    },
    "disk-encryption-present": {
      "appliesTo": [
        "v6",
        "v7"
      ]
    },
    "hpc-or-fpga-size": {
      "appliesTo": [
        "v5",
        "v6",
        "v7"
      ]
    },
    "local-nvme-storage-size": {
      "appliesTo": [
        "v5",
        "v6",
        "v7"
      ]
    },
    "l-series-replacement": {
      "appliesTo": [
        "v5",
        "v6",
        "v7"
      ]
    },
    "size-retired": {
      "appliesTo": [
        "v5",
        "v6",
        "v7"
      ]
    },
    "sap-needs-a-certified-size": {
      "appliesTo": [
        "v5",
        "v6",
        "v7"
      ]
    },
    "ephemeral-os-disk": {
      "appliesTo": [
        "v5",
        "v6",
        "v7"
      ]
    }
  },
  "prep": {
    "system-identity-recreated": {
      "appliesTo": [
        "v5",
        "v6",
        "v7"
      ]
    },
    "stornvme": {
      "appliesTo": [
        "v6",
        "v7"
      ]
    },
    "pagefile": {
      "appliesTo": [
        "v6",
        "v7"
      ]
    },
    "linux-nvme-prep": {
      "appliesTo": [
        "v6",
        "v7"
      ]
    },
    "verify-generation": {
      "appliesTo": [
        "v6",
        "v7"
      ]
    },
    "verify-custom-image-nvme-ready": {
      "appliesTo": [
        "v6",
        "v7"
      ]
    },
    "mana-kernel-floor": {
      "appliesTo": [
        "v5",
        "v6",
        "v7"
      ]
    }
  }
};
