# Azure VM Lifecycle Planner - build plan

Agreed with the owner 2026-10-09.

## What it is

A web page **customers use on their own**: they give it their VM list in one standard
format; it gives each machine's lifecycle stage and its supported v5, v6 and v7 target
sizes. On the page: "VM Lifecycle Planner for Azure" and "A community tool. Not
affiliated with or endorsed by Microsoft."

It starts as a JavaScript port of the owner's PowerShell tool, which gives the size
logic and data. **This page now leads (owner, 2026-10-09):** it reads more from Azure
than the PowerShell tool does, and the PowerShell tool is not kept in step for now. The
page speaks to a customer, not to the owner's team.

## Promises to the visitor

- **Nothing leaves the browser.** No server, no upload, no storage, no analytics, no
  cookies. The list is read in the page and forgotten when the tab closes.
- **The page cannot send data.** A Content-Security-Policy in the page forbids every
  network send (`connect-src 'none'`) and any script from elsewhere.
- **Anyone can check.** Plain HTML and JavaScript, no build step, no minifying, no outside
  libraries, served by GitHub Pages straight from this repo. Works offline once loaded.
  The README shows how to check (open the browser's Network tab, run a list, see no
  requests).
- **The page never calls Azure.** The customer runs the query themselves; size facts come
  from the built-in table, as in the PowerShell tool.

## Input - one standard format (owner, 2026-10-09)

Customers' own sheets come in endless shapes, so the page does not try to understand
them. It takes one format, with these columns:

| Column | Required | Notes |
|---|---|---|
| Machine name | yes | |
| Region | no | Shown only; region availability is not checked. |
| Current size | yes | For example `Standard_D4s_v3`. |
| Generation | yes | 1 or 2 (V1/V2, Gen1/Gen2 also accepted). |
| OS | no | Windows / Linux. |
| NIC count | no | |
| Data-disk count | no | |
| Security type | no | Standard, TrustedLaunch, ConfidentialVM (Azure's words; "Trusted launch" etc. also accepted). |
| Image publisher, Image offer, Image SKU | no | The OS image - whether the OS supports NVMe. |
| Disk controller | no | SCSI or NVMe today. |
| Accelerated NICs | no | How many NICs have accelerated networking on. |
| Primary NIC accelerated | no | Yes / No. |
| Azure Disk Encryption | no | Yes / No (the extension, or the OS disk setting). |
| Hibernation | no | Yes / No. |
| Scale set | no | Yes / No. |
| Azure Virtual Desktop | no | Yes / No - a session host. |
| SAP | no | Yes / No - the extension for SAP solutions, an SAP licence type, or an SAP image. |
| Unmanaged disks | no | Yes / No - disks kept as VHDs in a storage account. |
| Ephemeral OS disk | no | Yes / No. |
| System-assigned identity | no | Yes / No. |
| Availability set | no | Yes / No. |
| Zone | no | 1, 2, 3 or None. |

The extra columns (Image publisher onward) come from the query (`query.kql`); on a
hand-made list (`template.csv`) they may be blank, and a blank is "Check:", never a
pass. The temporary disk comes from the size table, not the list.

**Query proven 2026-10-09** on the owner's CI VMs and a temporary test build (torn down
the same day): Azure Disk Encryption, accelerated networking (on and off) and an Azure
Virtual Desktop session host each read correctly. Azure leaves the accelerated
networking setting out when it is off, so on a NIC that was read, missing means off; a
NIC that could not be read leaves the column blank. SAP, unmanaged disks, ephemeral OS
disk, identity, availability set and zone (added the same day, owner: "we might as
well") read plain Azure fields; on the test VMs they read correctly as No / None / Yes
(identity), and were not built to show Yes.

**AKS:** AKS nodes run in uniform scale sets, which Azure does not list as VMs, so they
never appear. The page says so: AKS node sizes are changed through AKS node pools.
AKS nodes run in uniform scale sets, which the query does not list as VMs at all.

**NVMe OS support** needs a list of which OS images support NVMe. Azure says whether an
image *can* boot on NVMe but not whether it is still supported, so the list is a dated
judgement kept as data in this repo. A custom image, or one not on the list, is "Check:".

Two ways to fill it:

1. **From Azure (the main way).** The page shows an Azure Resource Graph query with a
   Copy button. The customer runs it in Resource Graph Explorer in the Azure portal; it
   lists every VM in every subscription they can see, in exactly these columns, read
   from Azure. They then copy
   the results or download them as CSV. The query is tested against a real Azure
   environment by the owner before it ships.
2. **By hand.** A template (CSV, opens in Excel) with these columns and one contoso
   example row, for machines a customer lists themselves.

Two ways to give it to the page:

- **Paste** - select the rows in Excel or Resource Graph Explorer, copy, paste into a box.
- **Load a CSV file** - the Resource Graph download, or the filled-in template.

Excel files (.xlsx) are not read: a customer with an Excel sheet copies and pastes it.
This keeps the page small and leaves nothing outside to trust.

**Wrong columns:** the page names each missing or unknown column and points back to the
query or the template. It does not guess at other names. Headers are matched ignoring
case, spaces, dashes and underscores (`machine_name` = `Machine name`), nothing more.

**Generation** is never guessed. A row with a blank or odd value is flagged ("generation
missing - see the query"); the other rows still run.

## Output

On the page: a table, one row per machine - its size, lifecycle stage, whether it must
move, and the v5, v6 and v7 answers - with the counts above it. Downloads, made in the
browser: the PowerShell tool's four files, renamed (`vm-summary.csv`,
`vm-target-sizes.csv`, `vm-not-checked.csv`, `about-these-results.txt`), with the extra
columns' answers added.

### Words for a customer (agreed 2026-10-09)

**ASD-STE100 (owner, 2026-10-09): every word a customer sees follows Simplified
Technical English** - short sentences, one idea in each, active voice, no
contractions, no Microsoft sentences pasted in (say what they mean). One term for one
meaning: **VM** (the column stays "Machine name"), **notes** for the per-topic notes
(fine / problem / "Check:", where "Check:" means only that the list did not give the
fact), **Problems** for the problem notes in the summary, **move** with its two kinds
**resize** and **rebuild** (defined on the page and in the about file), and
**Supported** only for a target size. The wording in the tables below was rewritten in
STE on 2026-10-09; the code (`js/words.js`, `js/reasons.js`, `js/extras.js`) holds
the current text.

How it was checked: every distinct line a customer can see (459, from the page, the
messages, and every file and note the sample lists produce) went through an
automatic check (sentence length, contractions, -ing words, passive voice,
semicolons, non-approved words) and two independent reviews. Fixed from the reviews:
a contradiction in the NIC and data-disk reasons, three Microsoft links broken by a
word replacement (a test now checks every link), "Supported" used for a lifecycle
stage, "Check:" used as an instruction, and mixed terms.

The PowerShell tool speaks to the owner's team ("needs team review", "before this goes to
a customer"). Every outcome, reason, caveat and file name gets customer words, agreed
with the owner one by one. The answers behind the words do not change.

Agreed so far:

- **Where the page sends a customer it cannot help (owner, 2026-10-09):** Microsoft's
  public guidance on Microsoft Learn (size and retirement pages), linked. Never a person
  or team: the page is not affiliated with Microsoft, and must not send customers to the
  owner.
- **The four headline results:**

  | Reference tool | Page |
  |---|---|
  | No move required | No move needed - your size is current; newer options shown for reference |
  | Must move - supported target | Move needed - supported sizes shown |
  | Must move - outside the scope of this tool | Move needed - no suggestion here (with the reason, e.g. GPU) and a link to Microsoft's guidance |
  | Needs team review | Not checked - the tool could not read this machine, and a link to Microsoft's guidance |

- **The current size's stage** (dates written out, e.g. 1 May 2028):

  | Reference tool | Page |
  |---|---|
  | Current - no move required | Current - fully supported |
  | Extended - no move required yet | Extended - supported; newer sizes are available |
  | Current or Extended - no move required | Supported - no retirement announced |
  | End of Life - retires {date} | End of Life - retires {date}; plan a move |
  | Retired on {date} - no longer runs | Retired on {date} - no longer runs |
  | Unknown - team review | Not checked - size not recognised |
  | ; capacity growth restrictions since {date} | Microsoft is limiting new capacity for this size since {date} |

- **The v5 / v6 / v7 answer** (a supported target shows its size):

  | Reference tool | Page |
  |---|---|
  | Review - see needs-review.csv | Not checked |
  | No fitting size | No size of this shape |
  | No fitting size (data disks) | No size holds this many data disks |
  | No fitting size (NICs) | No size holds this many NICs |
  | No - a rebuild cannot keep Azure Disk Encryption | No - would lose Azure Disk Encryption |
  | No - needs Gen2 | No - needs a Generation 2 VM |
  | Not needed - already newer | Not needed - already newer |
  | Not needed - already on it | Not needed - already on this series |
  | Not needed - already on NVMe | Not needed - already on NVMe |
  | No - not planned by this tool | No - not covered here |
  | No - HPC/FPGA out of scope | No - HPC and FPGA sizes not covered |
  | No - GPU out of scope | No - GPU sizes not covered |
  | No - Arm64 out of scope | No - Arm64 sizes not covered |
  | No - confidential VM out of scope | No - confidential VMs not covered |
  | No - retired size out of scope | No - retired size not covered |
  | No - family is not a target | No - Microsoft lists no target for this family |
  | No - out of scope | No - not covered here |

- **Caveats** - each has three answers: fine, a problem, or blank (a hand-made list). (0.1.1-beta: a fine fact shows no note.)
  "Check:" means it is on the customer; "fits" means it was checked.

  | Topic | Fine | Problem | Blank |
  |---|---|---|---|
  | NVMe (v6, v7) | OS supports NVMe | OS not on the NVMe list - check before moving | Check: your OS must support NVMe |
  | NVMe (v5) | No change - v5 keeps SCSI disks | | |
  | Disk encryption | No Azure Disk Encryption | Uses Azure Disk Encryption - can't move to v6 or v7 | Check: Azure Disk Encryption |
  | Temporary disk | No temporary disk | Has a temporary disk - anything on it is lost when you resize | Check: anything on the temporary disk is lost when you resize |
  | Accelerated networking | On / Not needed | Off - the new size needs it on | Check: the new size needs accelerated networking |
  | NICs | {n} NICs - fits | No size holds this many NICs | Check: picked for 1 NIC |
  | Data disks | {n} data disks - fits | No size holds this many data disks | Check: picked for no data disks |
  | Hibernation | Off | On - turn it off before you resize | Check: hibernation |
  | Scale set / AKS / AVD | Not in a scale set | In a scale set (or AKS/AVD) - not covered here | Check: VMs in AKS, AVD or a scale set aren't covered here |
  | SAP | Not SAP | SAP - only sizes SAP certifies are supported; check SAP Note 1928533 | Check: SAP workloads need an SAP-certified size |
  | Unmanaged disks | Managed disks | Unmanaged disks - convert to managed disks first | Check: disks must be managed disks |
  | Ephemeral OS disk | Not ephemeral | Ephemeral OS disk - the new size needs room for it; its contents are lost | Check: ephemeral OS disk |
  | Identity | No system-assigned identity | System-assigned identity - kept on a resize, lost on a rebuild | Check: system-assigned identity |
  | Availability set | Not in a set | In an availability set - every VM in the set may need to move together | Check: availability set |
  | Zone | {zone} / None | | Check: zone (the new size must be offered in it) |

- **Download file names:** `vm-summary.csv` (was summary.csv), `vm-target-sizes.csv`
  (targets.csv), `vm-not-checked.csv` (needs-review.csv), `about-these-results.txt`
  (notes.txt).
- **The reason sentences**: rewritten in the same plain style (`js/reasons.js`), shown
  to the owner as one list and accepted for beta testing (2026-10-09).

## The logic - a faithful port

- The PowerShell tool's logic is ported to JavaScript by hand, function for function,
  keeping the order of decisions, so on the columns both read the results match.
- The extra columns feed the checks the logic already has (accelerated networking,
  Azure Disk Encryption, temporary disk, NIC and data-disk limits), plus new ones (NVMe
  OS support, hibernation, scale set, Azure Virtual Desktop).
- Names are this tool's own, with no mention of where the logic
  came from.
- The "same answer every run" rule carries over: sizes are walked in name order.
- All rules carry over: unknown is never a pass and never a fail; Generation is never
  guessed; a same-stage move is "same" (v4 to v5); region availability is "not checked";
  the caveats on every row.

## Data

Copied from the PowerShell tool's `data/`: `azure-sizes.json` (1,496 sizes, read
2026-10-09), `target-families.json`, `assessment-reasons.json`, `end-of-life.json`,
`capacity-restrictions.json`. Their dates are shown on the page and in `notes.txt`.
Plus this repo's own `nvme-images.json` (which OS images support NVMe, dated). From now
on the data is kept here; refreshing is done when the owner asks.

## Files

```
index.html          the page (with the Content-Security-Policy)
style.css
js/input.js         reading a paste or CSV, checking the columns
js/lifecycle.js     the size and lifecycle logic (port)
js/planner.js       machines, stage, outcome, results, what is not checked
js/extras.js        the query's extra columns: reasons and caveats
js/reasons.js       the reason sentences
js/words.js         the customer's words
js/files.js         the four download files
js/page.js          the page
js/query.js         the query, as shown on the page (= query.kql)
js/sample.js        the sample, for "Try the sample" (= samples/contoso-from-azure.csv)
query.kql           the Azure Resource Graph query
template.csv        the hand-made list template
data/*.js           the size table, lifecycle data, NVMe list
samples/            made-up contoso lists
tests/              node --test
```
## Testing

- **The port is right.** While porting, a check runs the PowerShell tool and the
  JavaScript logic (in Node, on this PC) on the same made-up lists, using only the
  columns both read, and requires the same answers (words aside). A safety net for the
  port, not a rule kept forever.
- Made-up contoso lists covering every result, every lifecycle stage, Gen1, a missing
  generation, each extra column (on, off, blank), and the query's own output shape.
- The PowerShell tool's own tests, ported: the three results, lifecycle stages, caveats,
  an unreadable size, wrong columns.
- **No network:** a test that no file calls `fetch`, `XMLHttpRequest`, `WebSocket`,
  `sendBeacon`, or loads anything from another site, and that the CSP is present.
- **Same answer twice:** each list run twice, results identical.
- Node's built-in test runner: nothing to install.
- Then the owner runs the query in Azure, pastes the result, and checks the Network tab.

## Publishing

GitHub Pages from `main`, root folder, turned on by the owner after he has tried it.

## Build steps (one at a time, owner checks each)

1. This plan - done 2026-10-09.
2. Customer words - done 2026-10-09 (reason sentences in step 5).
3. The Resource Graph query and the template - done 2026-10-09.
4. Data and samples copied in - done 2026-10-09. `assessment-reasons.json` and
   `target-families.json` still carry notes from where they came from (file paths,
   requirement codes): cut down to what the logic reads, in this tool's own words, in
   step 5, and never committed before that.
5. Done 2026-10-09. The logic port, with the port check against the PowerShell tool; then the extra
   columns' checks; the reason sentences shown to the owner.
   - 2026-10-09: data cut down and stored as `data/*.js` (no network request);
     `js/lifecycle.js` (size and lifecycle logic) ported. Port check: every size in the
     table as Gen1/Gen2, Windows/Linux, with and without NIC and data-disk counts -
     9,492 machines, all identical to the PowerShell tool.
   - 2026-10-09: results layer ported (`js/input.js` reading the list, `js/planner.js`
     stage, outcome, results and review; `js/words.js` the agreed customer words).
     Port check on the same 9,492 machines, the two samples and a sheet of broken rows
     (blank name, unreadable size, missing or conflicting Generation, Promo, GPU, HPC,
     retired, unknown size): 71,025 checks, all identical. Checked that the comparison
     catches a deliberate break.
   - 2026-10-09: the extra columns (`js/extras.js`). Owner: a real problem makes the
     option a no - Azure Disk Encryption (v6, v7), SAP, unmanaged disks and an
     ephemeral OS disk are reasons, said as "Move needed - no
     suggestion here" with the reason. Everything else is a caveat: fine, a problem, or
     "Check:" when the list does not say. NVMe OS support is read from the image's
     publisher, offer and SKU against Microsoft's list of OS images that support NVMe
     (`data/nvme-images.js`, read 2026-10-09); a custom image is "Check:". The port
     check still passes with the extra columns left out.
   - 2026-10-09: the reason sentences (`js/reasons.js`) - 38 shown to the owner as one
     list; owner: "this is good for beta testing".
   - 2026-10-09: the four files (`js/files.js`): `vm-summary.csv` (with a Warnings column:
     the problems on the size a machine would most likely take), `vm-target-sizes.csv`
     (one column per caveat), `vm-not-checked.csv`, `about-these-results.txt`. CSV as
     Excel opens it (byte order mark, quoted, CRLF).
6. The page - done 2026-10-09: `index.html`, `style.css`, `js/page.js`. The query and the
   sample are in the page as `js/query.js` and `js/sample.js` (a test keeps them equal to
   `query.kql` and the sample file). Checked in a browser: fetch, XMLHttpRequest and
   sendBeacon are all blocked by the Content-Security-Policy; planning makes no request;
   phone width has no sideways scroll; 9,492 machines plan in about 3 seconds. Tests:
   `node --test` (14, no network, nothing to install).
   - Owner's first try on his own list (2026-10-09): a machine that is not moving got
     warnings and "no size" answers. Now: a machine that is not moving shows a newer
     size only when one is supported (for reference), otherwise "Not needed", and has
     no warnings; an unrecognised size says "Not checked" in every column. Checked
     against Microsoft's End of Life page (updated 2026-09-25): only B-series (V1) is
     End of Life, so Bsv2 (Standard_B2ls_v2) needs no move.
   - Audit of every size (2026-10-09, after the owner asked "did you make mistakes like
     this elsewhere?"): all 1,496 sizes planned and grouped by series. Fixed: 37 M-series
     sizes with a memory-tier number (Standard_M128bds_3_v3) were not recognised; the
     confidential DC and EC families are now "not covered here" by their name; a
     machine that must move and whose family has no v5, v6 or v7 size at all (M, for
     example) is "Move needed - no suggestion here", not "Not checked". The PowerShell
     tool has the same three faults. `samples/contoso-every-series.csv`: one machine
     per series (212), for the owner to try.
   - Downloads: one "Download results (.zip)" with the four files (owner), made in the
     browser by `js/zip.js` (no library).
   - **Microsoft's retired-sizes guide (owner, 2026-10-09: "follow the guide").** The
     guide (updated 2026-09-25) names Falsv6 for F, Fs and Fsv2, and Bsv2 / Basv2 for
     B v1, Av2 and Amv2. This tool advises, so it follows the guide:
     - F is a v6 target series; an F, Fs or Fsv2 machine may choose Falsv6 (v6) and
       Faldsv7 / Falsv7 (v7) beside the D sizes (the D size stays the best match at
       the same shape). F v6 stage: **Current**, derived - Microsoft's lifecycle page
       says "for general purpose sizes, v6 and v7 series are Current" and the Falsv6
       page names no stage (owner, 2026-10-09).
     - A **Burstable** option (its own column) for B v1, Av2 and Amv2 machines: the
       smallest Bsv2 or Basv2 size (including the ts and ls sizes) with at least the
       machine's vCPUs and memory that takes its generation, NICs and data disks;
       Intel first, the AMD size of the same shape as the other choice.
   - Local preview: `.claude/serve.py` serves with caching off (not part of the site).
     **Before publishing:** make sure an update cannot mix old and new files from the
     browser's cache (GitHub Pages lets browsers keep files for 10 minutes).
   - Screen sizes (owner, 2026-10-09: "could render poorly on different screen
     sizes?"): wider than 1,000 pixels the results are a table (size names shown
     without "Standard_"; stage and problems as short tags, full text in the details);
     at 1,000 pixels or less each VM is a card with a label on each line. Checked with
     the sample and an open VM at 320, 360, 414, 768, 1,000, 1,024, 1,280, 1,366,
     1,440, 1,920 and 2,560 pixels: nothing goes past the edge of the page at any width.
     Check these widths again after any change to the page layout.
7. README - done 2026-10-09: what the tool does, how to use it, the privacy promise and
   how to make sure (the Network tab), what it does not check, sources, feedback (no
   customer data in issues), and notes for developers. Written in STE.
8. First release - done 2026-10-09: **0.1.0-beta** for peer testing. Pull request
   #1 (merged by the owner), tag `v0.1.0-beta`, GitHub pre-release, GitHub Pages at
   https://chrislittle.github.io/azure-vm-lifecycle-planner/. Checked on the live
   site: the sample plans, the footer shows the version, planning sends no request,
   and the Content-Security-Policy blocks a test request.
   - Each link from the page to its own files carries `?v=<version>` (set with
     `node tools/set-version.mjs <version>`; a test checks it), so a browser does not
     mix old and new files after an update.
   - Publishing (owner, 2026-10-09: no deprecated parts): GitHub's built-in Pages job
     used an action on Node.js 20, which GitHub has deprecated. The site now publishes
     with `.github/workflows/pages.yml`: the tests run first, and a failing test stops
     the publish. Each action is pinned to the exact commit of a current release (all
     on Node.js 24), and the build machine is Ubuntu 24.04.

## 0.1.1-beta (2026-10-09)

- **Network virtual appliances** (owner: so that appliances are
  not moved without the vendor). Found by the marketplace image: the publisher AND
  the offer must match Microsoft's list in the Azure built-in policy "Configure
  Marketplace Network Virtual Appliances (NVAs) to add a MANA support tag"
  (`data/nva-images.js`, policy version 1.4.0, read 2026-10-09: 44 publishers, 179
  offer patterns). The broad offer patterns
  (ubuntu*, win*) count only with an appliance publisher. An appliance gets no target
  size on any series ("Move needed - no suggestion", or "Not needed" when its size is
  current); a custom image cannot tell. The appliance note shows only on an appliance.
- **Notes show only what needs attention** (owner: "make it simple & easy to spot"):
  a problem or "Check:". A fact that is fine has no note.
- A size shows only where it is supported: a blocked option shows no size in the
  details or in vm-target-sizes.csv.
- The sample has a made-up firewall (contoso-fw01, a Palo Alto image).

## Next

- Peer feedback, as GitHub issues.
- Before each release: `node tools/set-version.mjs <version>`, then check the screen
  widths (step 6) and the STE check of all customer text.
- Refresh the size table and Microsoft's lists when the owner asks.
