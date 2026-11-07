# VM Lifecycle Planner for Azure

Give this tool your Azure VM list. It shows the lifecycle stage of each VM and the
supported v5, v6 and v7 sizes for it.

A community tool. Not affiliated with or endorsed by Microsoft.

**Open the tool:** https://chrislittle.github.io/azure-vm-lifecycle-planner/

**Status:** beta (version <!-- fact:version -->0.9.6-beta<!-- /fact -->). The results are advice. They are not a check
that a VM is ready to move.

## How to use it

1. Get your VM list. In the Azure portal, open **Resource Graph Explorer**. Run the
   query that the page shows (the same query is in [query.kql](query.kql)). Copy the
   query, paste it in the query box and select **Run query**. Then select
   **Download results as CSV**. The query only reads data. It does not change anything.
   If you make the list yourself, use [template.csv](template.csv).
2. Give the list to the tool: select **Load the CSV file**, or drag the file onto the
   page. For a list in Excel, you can also paste the rows.
3. Read the results. Select a VM to see what to do (the ways to move, each with its
   steps), why, and the sizes.
   Select **Download results (.zip)** to get the results files.

To try the tool without your own data, select **Try the sample** on the page.

The **Theme** menu at the top of the page sets light, dark, or the setting of your
system. The tool does not keep your choice: when you open the page again, it follows
your system.

The tool works with a list of 50,000 VMs. On a laptop, the results for 50,000 VMs show
in about 3 seconds, and the zip file takes about 2 seconds more. The browser
compresses the files in the zip: for 50,000 VMs the files are about 180 MB, and the zip
file is about 9 MB.

You can use the page with only a keyboard. In the results table, each VM name is a
button: press Enter or Space to open or close the details of the VM. The colours meet
the WCAG 2.2 AA contrast levels in the light and the dark theme.

## What the tool shows

For each VM:

- The lifecycle stage of the current size: Current, Extended, End of Life or Retired.
  Current and Extended are modern sizes: Microsoft fully supports them. In the details
  and the report, a retirement date also shows the time to it, or since it, in whole
  months from the day that you make the results, for example "15 November 2029 (in 36
  months)". The start of the capacity growth restrictions shows the same.
- The generation of the VM, in the results table, the report and the CSV files:

  | Value | What it means |
  |---|---|
  | 1 or 2 | The list gives Generation 1 or Generation 2. The CSV files show "Generation 1" or "Generation 2". |
  | 2* | The list does not give the generation. The tool uses Generation 2 because of the image SKU or the security type (Trusted launch or a confidential VM). The notes of the VM give the reason. The CSV files show "Generation 2 (from the image SKU)" or "Generation 2 (from the security type)". |
  | Not given | The list does not give a generation that the tool can read. The tool does not check the VM. |
  | Set by the service | A service (AKS, Azure Red Hat OpenShift or Azure Databricks) makes the new nodes from its own image. The tool does not need the generation. |
- A result. The Result column has two lines: "Move needed" (or "Modern size", or
  "Readiness unknown"), and the readiness. The readiness words are similar to the
  readiness categories of an Azure Migrate assessment: "Ready for Azure", "Ready with
  conditions", "Not ready for Azure" and "Readiness unknown"
  ([Review readiness](https://learn.microsoft.com/azure/migrate/tutorial-assess-vmware-azure-vm)).
  This tool does not use Azure Migrate. "Ready" and "Not ready: no supported size" are the
  words of this tool, with the meaning in the table below. The CSV files,
  the counts and the filter put the two lines on one line, for example "Move needed -
  Ready with conditions".

  | Result | What it means |
  |---|---|
  | Modern size - No move needed | Microsoft fully supports the current size. |
  | Move needed - Ready | A supported size is available. |
  | Move needed - Ready with conditions | A supported size is available. First, do the conditions in "What to do" or check the facts in "To check". |
  | Move needed - Change it in the service or pool | The VM is in an AKS node pool, a scale set or a pooled AVD host pool, or a service (for example Azure Databricks) manages it. Change the size in the service or the pool, not on the VM. |
  | Move needed - Vendor approval first | SAP or the vendor of the appliance must approve the new size first. Microsoft calls this a "hard gate". |
  | Move needed - Not ready: no supported size | This tool has no supported size. The reason tells you why. |
  | Readiness unknown - This tool cannot read this VM or its size | The tool cannot read the VM or its size. |

- The supported size on v5, v6 and v7, and the reason when there is no size. For B v1,
  Av2 and Amv2 VMs, the tool also shows a burstable size (Bsv2 or Basv2).
- How to move, by series, as Microsoft recommends. On v5, resize the current VM when
  Azure supports it. On v6 and v7, deploy a new VM in parallel and move the workload.
  Microsoft says that a move to v6 or v7 is "not a normal VM resize".
  The tool also says that you can change the size of the current VM, but that this has
  more steps and more risk. With that method, the VM keeps its system-assigned identity.
  A new VM gets a new identity. For a VM with a system-assigned identity, the note
  "Identity" tells you what to do for each method. For a VM in an availability set, the
  note "Availability set" does the same. A new VM goes into the set only when Azure
  creates it. With a resize, the VM stays in its set, and you can resize the VMs one at a
  time. If Azure does not offer the new size for the set, stop (deallocate) all the VMs
  in the set first ([Resize a VM](https://learn.microsoft.com/azure/virtual-machines/sizes/resize-vm)).
  The tool never tells you to rebuild a VM (to make a new VM with the same disks).
  Every move is a resize of the same VM, or a new VM in parallel.
- The preview feature VMTempDiskResizePreview. A Windows VM needs it for a resize
  when one of the two sizes has a SCSI temporary disk and the other size does not. A v6
  or v7 size has no SCSI temporary disk, so a move from a size with a temporary disk on
  v5 or older to v6 or v7 needs it. A size with no temporary disk does not need it, also
  to a v6 or v7 size with a temporary disk. A Linux VM never needs it. Generation 1 and
  Generation 2 are the same. Where the feature is necessary, the tool says:
  "The resize needs the preview feature VMTempDiskResizePreview, registered on the
  subscription. Move the page file from the temporary disk to C: before the resize."
  When the list does not give the OS, the tool says "On a Windows VM, the resize needs
  the preview feature". On v5, the tool also gives the size of the same shape that keeps
  the temporary disk type, for a resize with no feature. On Burstable, it gives the v5
  size (no Bsv2 or Basv2 size has a temporary disk). In vm-target-sizes.csv, the column
  "Preview feature" says Needed, Not needed or Not checked, and the column Rebuild is
  "No" for every size. A VM with Azure Disk Encryption gets a size that does not need
  the feature, if there is one: the tool does not plan the feature with Azure Disk
  Encryption.
  This comes from lab tests from 2026-11-01 to 2026-11-07 on Windows Server 2016, 2019,
  2022 and 2025: the VM kept its ID, its system-assigned identity and its extensions.
  It does not come from a Microsoft page. Microsoft names the feature in a note about its
  NVMe conversion script, on the page
  [Convert SCSI to NVMe](https://learn.microsoft.com/azure/virtual-machines/nvme-linux).
  The feature is a preview.
- Ranked sizes: up to five sizes for each series, best first. Each one passes the same
  checks. Microsoft recommends that a workload support more than one compatible size
  ([capacity resilience](https://learn.microsoft.com/azure/well-architected/design-guides/capacity-resilience)).
  A size with a different processor has an asterisk: test the application first.
  When a size needs the preview feature VMTempDiskResizePreview and the suggested size
  does not, the list says so.
- The details of each VM, in the same order for every VM: **What to do**, **Why**, the
  **Workload type**, the notes, then the **Sizes**.
  - **What to do** gives the size to move to, and each way to move in its own box. v6 and
    v7 have two ways: "Option 1: Deploy a new VM in parallel" (Microsoft recommends this)
    and "Option 2: Change the size of this VM" (the VM keeps its identity, disks and
    extensions). v5 and Burstable have one way: change the size of this VM. Each box gives
    "Conditions" with the number of steps, and all the steps for that way. A step for both
    ways is in the two boxes. The identity step is only for a new VM. The preview feature
    and the page file are only for a resize. A VM in a pool or a service, a vendor
    appliance, an SAP VM and a VM with no supported size have one box with their advice.
  - The notes are the readiness signals in Microsoft's guide. A step (amber) is in the
    boxes of "What to do". A step for only the other sizes is under **Steps for the other
    sizes**. In vm-summary.csv, the column "Before the move" has the steps from the facts
    of the VM. The preview feature and the page file are in the columns "How to move" and
    "Preview feature" of vm-target-sizes.csv.
  - **Good to know** (blue): a fact to know, with nothing to do first.
  - **To check** (grey): the list does not give the fact, or the tool cannot judge it
    from what the list gives.
  - **Sizes**: a card for each series, with the lifecycle stage of the series (for
    example Extended or Current). The card of the size that "What to do" uses has an
    outline and the words "What to do uses this size". The other sizes also fit the VM.

  Each note gives the value from your list that made it, for example "Hibernation" is
  Yes, or the image that is not on the Microsoft NVMe list.

  Each note shows once. A note for only some series names them, for example "(v5 only)".
  A fact that is fine has no note. A VM that a service manages (AKS, Azure Red Hat
  OpenShift, Azure Databricks) has no notes: the service manages its image and disks.
- A table with the current size beside each new size: vCPUs, memory, temporary disk,
  the maximum NICs and data disks, Premium SSD and the generations, from the size table.
  Where a new size has less than the current size or the VM (for example fewer NICs than
  the VM has), a note under the value says so.
- Network virtual appliances (NVAs). The tool finds them by their marketplace image.
  It uses the Microsoft list in the Azure Policy "Configure Marketplace Network Virtual
  Appliances (NVAs) to add a MANA support tag". Ask the
  vendor which sizes they certify. Then deploy a new appliance beside the old one.
- Storage and backup appliances (for example NetApp, Pure Storage, Rubrik, Silk, Nasuni,
  Dell, Cohesity, WEKA, Veeam, Commvault, and <!-- fact:storage-vendors -->12 more vendors<!-- /fact -->). The tool finds them by
  their Marketplace image, by their Marketplace purchase plan, or by the vendor's own
  gallery image, from our own list
  ([data/storage-appliance-images.js](data/storage-appliance-images.js)). This is not a
  Microsoft list. A VM in a managed application from the Marketplace belongs to its
  vendor too. Ask the vendor which sizes they certify before a move.

- The workload type. It tells you how to move the VM. The types come from the workload
  patterns in the Microsoft guide for the move to v6 and v7:

  | Workload type | How the tool finds it | How to move |
  |---|---|---|
  | Node pool or scale set | AKS, Azure Red Hat OpenShift, a scale set | Add a new node pool or scale set at the new size. Then remove the old one. |
  | Pooled AVD host | An AVD session host in a pooled host pool | Make new session hosts from the image. Then remove the old hosts. |
  | Managed by a service | A resource group that a service manages, for example Azure Databricks | Change the node type or size in the service. |
  | Cluster in a service | Not in the VM list (for example Azure Machine Learning, HDInsight) | Make a new cluster at the new size. |
  | Standalone VM | Every other VM, AVD personal desktops included | Use the move for each series. |
  | Cluster or database | SQL Server, an availability group, a shared disk, SAP | Move one node at a time. |
  | Vendor appliance | A network virtual appliance, or a storage or backup appliance | Ask the vendor which sizes they certify. |

  The details of each VM show the workload type and the facts that the tool found it
  from. For a storage or backup appliance, they give the vendor from our list and the
  sign that matched: the image (publisher / offer), the Marketplace purchase plan (plan
  publisher / plan product), or the gallery image (image ID). For a network virtual
  appliance, they give the publisher ID as Azure gives it. The Microsoft list has no
  vendor names. For a managed application, they give the "Managed by" value, the name of
  the application, and the publisher ID and product of its Marketplace plan (columns
  from the query of 0.9.0-beta and later). For the
  other types, they give the columns that decided the type, for example "Managed by" is
  AKS, or "SQL availability group" is Yes.

  For SAP, they also give the "SAP sign" column (from the query of 0.9.4-beta and later).
  It tells you why "SAP" is Yes: the Azure VM extension for SAP solutions (the standard
  or the new version, with its type), an SAP licence type, or an SAP image. The SAP note
  shows only when "SAP" is Yes. A blank SAP value, or a value that this tool cannot read,
  gives no SAP note, as for the appliances. If your list does not give SAP, a VM that is
  in no other workload type shows "Type not checked". "What to do" and "Why" for the VM
  also give the sign.
  If a VM does not run SAP, set "SAP" to No in your list,
  and load the list again. If the sign is the extension, you can also remove the
  extension from the VM.

  The details of each VM also have **Facts from your list**. It is closed at first.
  It shows each column that the tool used, with its value from your list. "Not in the
  list" means that your list does not have the column. "No value" means that the cell
  is empty. These facts tell you why a note says "Check".

  The tool cannot find domain controllers, self-hosted CI agents on single VMs, or
  NoSQL and search clusters. Look for them yourself. A list without these
  columns (from an earlier query, or made by hand) shows "Type not checked".
  [docs/workload-patterns.md](docs/workload-patterns.md) gives the signal for each
  pattern, and how a test build proved it.

VMs with the same name in other resource groups, subscriptions or regions stay apart:
the query gives each VM's resource ID. When a name is in the list more than once, the
table shows what tells those VMs apart (for example the resource group). The details
of each VM show its resource ID. **Find** also matches the resource group and the
subscription ID.

The zip file has these files. Each file has the columns Region, Subscription ID,
Resource group and Resource ID, so you can sort, filter or group by them, for example
in Excel:

| File | Contents |
|---|---|
| vm-lifecycle-report.html | The report. Start with this file. It opens in any browser, also offline. To make a PDF, print it and select "Save as PDF". It has a summary, what to do for each result group, and the details of each VM that needs a move. The summary counts the VMs by workload type, region, resource group and generation. The summary has the table "Appliances by vendor": send each vendor the list of its VMs. |
| vm-summary.csv | One row for each VM, to sort and filter in Excel. Near the end are the columns Vendor (the vendor of a storage or backup appliance, or the publisher ID of a network virtual appliance. For a managed application, it is the publisher ID of the Marketplace plan of the application, else of the purchase plan of the VM, when the list has one) and Evidence (the facts behind the workload type). They are empty for a standalone VM. The last column is SAP sign: the "SAP sign" value from your list, when "SAP" is Yes. |
| vm-target-sizes.csv | One row for each VM and series, with the reasons and the notes. The SAP column has the SAP note. It is empty when "SAP" is not Yes. Near the end is the column SAP sign: the "SAP sign" value from your list, when "SAP" is Yes. The last column is Preview feature: Needed, Not needed or Not checked, for the preview feature VMTempDiskResizePreview. The column Rebuild is No for every size. |
| vm-not-checked.csv | The items that the tool cannot check, with the generation of each VM. The Generation column is new: it comes after Current size, so the columns after it move one place right. |
| about-these-results.txt | The columns that the tool used, what a result means, and the sources. |

## Privacy

Customer VM lists can contain private data. For this reason, this tool keeps all data in your
browser:

- There is no server. GitHub Pages sends the page as plain HTML, CSS and JavaScript.
  There is no build step, no minified code and no code from other sites.
- A Content-Security-Policy in [index.html](index.html) stops scripts from other sites,
  and it stops the page when it tries to send data to a server (`connect-src 'none'`). The code of
  the page has no other way to send data. Anyone can read the code to make sure.
- The tool does not keep your list. When you close the tab, the list is gone.
- Your browser makes the results files. The download saves them on your computer.

### How to make sure that no data leaves your browser

1. Open the tool.
2. Open the developer tools of your browser (F12). Select the **Network** tab.
3. Load your list and show the results.
4. Look at the Network tab. The page sends no request when it reads the list or makes
   the results. (A link that you select, for example to the template or to Microsoft
   documentation, opens a page as usual.)

You can also disconnect from the internet after the page opens. The tool continues to
work in that open tab. (It does not load again while you are offline.)

## What the tool does not check

- If a size is available in your region. The tool uses one table for all regions.
- If a VM is ready to move. For example, the tool does not look inside the VM.
- The VMs in a scale set or an AKS node pool, one by one. The query gives each scale set
  as one row. Azure Resource Graph does not give the generation of a scale set. For an
  AKS or Azure Red Hat OpenShift node pool, or a VM that a service manages, the tool does
  not need it: the service makes the new nodes from its own image. For a scale set of
  your own, the tool reads it from a Generation 2 image SKU. If it cannot, type the
  generation in the list.

## Sources

- **Size facts:** a table of <!-- fact:sizes -->1,498 Azure VM sizes, read from Azure on 16 October 2026<!-- /fact -->
  ([data/sizes.js](data/sizes.js)). The page does not connect to Azure.
- **Lifecycle stages and retirement dates:** the Microsoft
  [lifecycle overview](https://learn.microsoft.com/azure/virtual-machines/sizes/lifecycle/lifecycle-overview),
  [End of Life list](https://learn.microsoft.com/azure/virtual-machines/sizes/lifecycle/end-of-life-sizes-list) and
  [retirements and capacity growth restrictions](https://learn.microsoft.com/azure/virtual-machines/sizes/lifecycle/retirements-and-capacity-restrictions),
  read on <!-- fact:lifecycle-read -->9 and 10 October 2026<!-- /fact -->.
- **Target sizes:** the Microsoft
  [v6 and v7 modernization overview](https://learn.microsoft.com/azure/virtual-machines/sizes/lifecycle/sizes-v6-v7-modernization-overview)
  and the
  [retired sizes modernization guide](https://learn.microsoft.com/azure/virtual-machines/sizes/lifecycle/retirement/retired-sizes-modernization-guide).
- **NVMe support of the OS:** the Microsoft
  [list of OS images that support NVMe](https://learn.microsoft.com/azure/virtual-machines/enable-nvme-interface),
  read on <!-- fact:nvme-read -->9 October 2026<!-- /fact -->.
- **The SAP extension in the query:** the Microsoft pages of the Azure VM extension for SAP
  solutions, the [new version](https://learn.microsoft.com/azure/sap/workloads/vm-extension-for-sap-new)
  and the [standard version](https://learn.microsoft.com/azure/sap/workloads/vm-extension-for-sap-standard),
  read on 6 November 2026.
- **Accelerated networking:** the Microsoft size pages, for example
  [Dsv5](https://learn.microsoft.com/azure/virtual-machines/sizes/general-purpose/dsv5-series) and
  [Dsv6](https://learn.microsoft.com/azure/virtual-machines/sizes/general-purpose/dsv6-series).
  The Intel D and E sizes of v5 and every D and E size of v6 require it (the v6 pages
  changed on 27 October 2026). The AMD v5 sizes and the v7 sizes support it.

Each Monday, a GitHub workflow reads these Microsoft pages, the Azure size list, the
NVA policy and the Marketplace catalog again, and compares them with the data in this
repo. If a source changed, it opens a
GitHub issue. The data changes only in a pull request, after a person checks the
change. The dates above are the dates of the data, not of the last weekly check.

## Feedback

Open an issue on GitHub. Give the version from the page footer. **Do not put VM names,
subscription IDs or other customer data in an issue.** Give the size and the
generation only, for example "Standard_D4s_v3, Generation 2".

## For developers

- The code is plain JavaScript modules. There is nothing to install.
- Tests: `node --test` (Node 20 or later). The tests make no network requests. GitHub
  runs them on each pull request (`.github/workflows/tests.yml`) and again before each
  publish.
- Speed: `node tools/time-large-list.mjs 20000 50000` makes made-up contoso lists of
  that size (`tests/large-list.js`) and shows the time of each step. With `--write
  <folder>` it also saves the lists as CSV files, to load in the page. Do not commit them.
- Local preview: `python -m http.server 8000` in this folder, then open
  http://localhost:8000/. The page does not work from a `file://` address, because
  browsers do not load modules from files.
- After a change to `query.kql` or `samples/contoso-from-azure.csv`: `node tools/copy-files.mjs`.
  The page cannot read files over the network, so `js/query.js` and `js/sample.js` hold
  the same text. A test checks that they match.
- Sources: each Monday, the workflow "Watch the sources" reads every Microsoft Learn
  page that the data or the code cites (`tools/sources.mjs`; a test keeps the list
  complete). It reads the whole article (each sentence, list item and table row) and
  compares it with `tools/source-snapshot.json`. For a page that changed, or that it
  cannot read, it opens one GitHub issue (label `source-watch`) with the lines added and
  removed, or comments on the open issue when the difference is new. When the page and
  the snapshot agree again, it closes the issue. It does not change the data. After you
  update the data files, run `node tools/watch-sources.mjs --update` in the same pull
  request. The same workflow then reads Azure (`tools/azure-sources.mjs`): the VM size
  list (`data/sizes.js`), the NVA policy (`data/nva-images.js`) and the Marketplace
  catalog for the storage and backup appliances (`data/storage-appliance-images.js`,
  including possible new vendors). It signs in as a read-only identity with no stored
  password (a federated credential), which only the `azure-read` environment on `main`
  can use. To refresh the size table and the NVA list yourself: `az login`, then
  `node tools/azure-sources.mjs --update`. GitHub turns off a scheduled workflow after
  60 days with no activity in a public repo. Each run tries to stop this: it turns the
  workflow on again with the GitHub API (job `keep-on`), and makes no commit. GitHub does
  not say that this resets the 60 days. If GitHub still turns the workflow off, it sends
  an email: turn the workflow on again in the Actions tab.
- README facts: some facts in this README come from the data files. These are the
  version, the size count and its read date, the read dates of the Microsoft pages,
  and the number of storage and backup vendors. Each fact is between two HTML comment
  marks that GitHub does not show. `node tools/readme-facts.mjs` writes
  the facts from the data files. With `--check`, it only compares them. A test fails
  when the README and the data do not agree. `node tools/azure-sources.mjs --update`,
  `node tools/watch-sources.mjs --update` and `node tools/set-version.mjs` also write
  the facts. Each issue of the weekly check has a section "README". It gives the facts
  that come from the source and the text in the README now. For the size list, it
  also gives the text that the new data makes.
- `tools/` runs on GitHub or on a computer, never in the page. The page does not load
  it, so its network access does not change the page's "no data leaves your browser"
  promise. `tools/source-snapshot.json` holds text from Microsoft Learn pages
  (© Microsoft), kept only to find changes.
- New release: `node tools/set-version.mjs <version>`. This puts the version on each
  link from the page to its own files, so a browser does not mix old and new files.

## Licence

[MIT](LICENSE).
