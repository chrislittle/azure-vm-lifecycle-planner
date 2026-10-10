# VM Lifecycle Planner for Azure

Give this tool your Azure VM list. It shows the lifecycle stage of each VM and the
supported v5, v6 and v7 sizes for it.

A community tool. Not affiliated with or endorsed by Microsoft.

**Open the tool:** https://chrislittle.github.io/azure-vm-lifecycle-planner/

**Status:** beta (version 0.3.1-beta). The results are advice. They are not a check
that a VM is ready to move.

## How to use it

1. Get your VM list. In the Azure portal, open **Resource Graph Explorer**. Run the
   query that the page shows (the same query is in [query.kql](query.kql)). Select
   **Download as CSV**. The query only reads data. It does not change anything.
   If you make the list yourself, use [template.csv](template.csv).
2. Give the list to the tool. Paste the rows, or load the CSV file.
3. Read the results. Select a VM to see the reason and the notes for each series.
   Select **Download results (.zip)** to get the results files.

To try the tool without your own data, select **Try the sample** on the page.

## What the tool shows

For each VM:

- The lifecycle stage of the current size: Current, Extended, End of Life or Retired.
  Current and Extended are modern sizes: Microsoft fully supports them.
- A result group:

  | Group | What it means |
  |---|---|
  | Modern size - no move needed | Microsoft fully supports the current size. |
  | Move needed - ready | A supported size is available, and there is no action to do first. |
  | Move needed - do this first | A supported size is available. Do the recommended actions first. |
  | Move needed - hard gate | SAP or the vendor of the appliance must certify the new size. |
  | Move needed - no supported size | This tool has no supported size. The reason tells you why. |
  | Not checked | The tool cannot read the VM or its size. |

- The supported size on v5, v6 and v7, and the reason when there is no size. For B v1,
  Av2 and Amv2 VMs, the tool also shows a burstable size (Bsv2 or Basv2).
- How to move, by series, as Microsoft recommends. On v5, resize the current VM when
  Azure supports it. On v6 and v7, deploy a new VM in parallel and move the workload.
  Microsoft says that a move to v6 or v7 is "not a normal VM resize".
- Ranked sizes: up to five sizes for each series, best first. Each one passes the same
  checks. Microsoft recommends that a workload support more than one compatible size
  ([capacity resilience](https://learn.microsoft.com/azure/well-architected/design-guides/capacity-resilience)).
  A size with a different processor has an asterisk: test the application first.
- Readiness signals (Microsoft's term). Each one is one of these:
  - A **recommended action** to do before the move (amber).
  - A fact that needs your **attention** (blue).
  - "Check:", when the list does not give the fact (grey).

  A readiness signal does not block the move. A fact that is fine has no note.
- Network virtual appliances (NVAs). The tool finds them by their marketplace image.
  It uses the Microsoft list in the Azure Policy "Configure Marketplace Network Virtual
  Appliances (NVAs) to add a MANA support tag". An appliance is a hard gate. Ask the
  vendor which sizes they certify. Then deploy a new appliance beside the old one.
- Storage and backup appliances (for example NetApp Cloud Volumes ONTAP, Pure Storage,
  Rubrik, Silk, Nasuni, Dell, Veeam, Commvault). The tool finds them by their
  marketplace image, from a list that it reads from the Azure Marketplace catalog
  ([data/storage-appliance-images.js](data/storage-appliance-images.js)). This is not a
  Microsoft list. An appliance is a hard gate: ask the vendor which sizes they certify.

- The workload type. It tells you how to move the VM. The types are the workload
  patterns A to G in the Microsoft guide for the move to v6 and v7:

  | Workload type | How the tool finds it | How to move |
  |---|---|---|
  | Node pool or scale set (A) | AKS, Azure Red Hat OpenShift, a scale set | Add a new node pool or scale set at the new size. Then remove the old one. |
  | Pooled AVD host (B) | An AVD session host in a pooled host pool | Make new session hosts from the image. Then remove the old hosts. |
  | Managed by a service (C) | A resource group that a service manages, for example Azure Databricks | Change the node type or size in the service. |
  | Cluster in a service (D) | Not in the VM list (for example Azure Machine Learning, HDInsight) | Make a new cluster at the new size. |
  | Standalone VM (E) | Every other VM, AVD personal desktops included | Use the move for each series. |
  | Cluster or database (F) | SQL Server, an availability group, a shared disk, SAP | Move one node at a time. |
  | Vendor appliance (G) | A network virtual appliance, or a storage or backup appliance | A hard gate. Ask the vendor. |

  The tool cannot find domain controllers, self-hosted CI agents on single VMs, or
  NoSQL and search clusters. Look for them yourself. A list without these
  columns (from an earlier query, or made by hand) shows "Type not checked".
  [docs/workload-patterns.md](docs/workload-patterns.md) gives the signal for each
  pattern, and how a test build proved it.

The zip file has these files:

| File | Contents |
|---|---|
| vm-summary.csv | One row for each VM. Start with this file. |
| vm-target-sizes.csv | One row for each VM and series, with the reasons and the notes. |
| vm-not-checked.csv | The items that the tool cannot check. |
| about-these-results.txt | The columns that the tool used, what a result means, and the sources. |

## Privacy

Customer VM lists can contain private data. For this reason, this tool keeps all data in your
browser:

- There is no server. GitHub Pages sends the page as plain HTML, CSS and JavaScript.
  There is no build step, no minified code and no code from other sites.
- A Content-Security-Policy in [index.html](index.html) stops all network requests
  (`connect-src 'none'`). The page cannot send your list anywhere.
- The tool does not keep your list. When you close the tab, the list is gone.
- Your browser makes the results files. The download saves them on your computer.

### How to make sure that no data leaves your browser

1. Open the tool.
2. Open the developer tools of your browser (F12). Select the **Network** tab.
3. Load your list and show the results.
4. Look at the Network tab. The page sends no request.

You can also disconnect from the internet after the page opens. The tool continues to
work.

## What the tool does not check

- If a size is available in your region. The tool uses one table for all regions.
- If a VM is ready to move. For example, the tool does not look inside the VM.
- The VMs in a scale set or an AKS node pool, one by one. The query gives each scale set
  as one row. Azure Resource Graph does not give the generation of a scale set. The tool
  reads it from a Generation 2 image SKU. If it cannot, type the generation in the list.

## Sources

- **Size facts:** a table of 1,496 Azure VM sizes, read from Azure on 9 October 2026
  ([data/sizes.js](data/sizes.js)). The page does not connect to Azure.
- **Lifecycle stages and retirement dates:** the Microsoft
  [lifecycle overview](https://learn.microsoft.com/azure/virtual-machines/sizes/lifecycle/lifecycle-overview),
  [End of Life list](https://learn.microsoft.com/azure/virtual-machines/sizes/lifecycle/end-of-life-sizes-list) and
  [retirements and capacity restrictions](https://learn.microsoft.com/azure/virtual-machines/sizes/lifecycle/retirements-and-capacity-restrictions),
  read on 9 October 2026.
- **Target sizes:** the Microsoft
  [v6 and v7 modernization overview](https://learn.microsoft.com/azure/virtual-machines/sizes/lifecycle/sizes-v6-v7-modernization-overview)
  and the
  [retired sizes modernization guide](https://learn.microsoft.com/azure/virtual-machines/sizes/lifecycle/retirement/retired-sizes-modernization-guide).
- **NVMe support of the OS:** the Microsoft
  [list of OS images that support NVMe](https://learn.microsoft.com/azure/virtual-machines/enable-nvme-interface),
  read on 9 October 2026.

## Feedback

Open an issue on GitHub. Give the version from the page footer. **Do not put VM names,
subscription IDs or other customer data in an issue.** Give the size and the
generation only, for example "Standard_D4s_v3, Generation 2".

## For developers

- The code is plain JavaScript modules. There is nothing to install.
- Tests: `node --test` (Node 20 or later). The tests make no network requests.
- Local preview: `python -m http.server 8000` in this folder, then open
  http://localhost:8000/. The page does not work from a `file://` address, because
  browsers do not load modules from files.
- New release: `node tools/set-version.mjs <version>`. This puts the version on each
  link from the page to its own files, so a browser does not mix old and new files.

## Licence

[MIT](LICENSE).
