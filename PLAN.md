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
fact, or, since 0.9.0-beta, that this tool cannot judge it from what the list gives), **Problems** for the problem notes in the summary, **move** with its two kinds
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

Since 2026-10-17 part of that check runs with the tests (`tests/words.test.js`, in
`node --test`): it collects every text that the page, the four files and the report
show for the sample lists (and every reason, with made-up facts), and fails on a
contraction, a semicolon, a sentence longer than 20 words (an instruction) or 25 words
(other text), or a word from a short list that STE does not approve ("gate", "ensure",
"utilize", "via", "e.g." and others). Microsoft's term "hard gate" is allowed in
quotes, where the about file names it as Microsoft's term. The first run found three
long sentences, now two sentences each: the advice for a node pool or scale set, the
workloads that this tool cannot find, and the capacity growth restrictions with their
19 series names. The check does not test -ing words, passive voice or meaning: a person
still reads each changed line.

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
  "Check:" means it is on the customer: the list does not give the fact, or this tool
  cannot judge it from what the list gives (0.9.0-beta). "Fits" means it was checked.

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
- **Each rule has a test that fails when the rule breaks (2026-10-17).** 121 mutations,
  one at a time (a condition flipped, a branch or a list entry removed, a limit
  changed), each followed by `node --test`. For 68 of them no test failed; 67 now have
  a test that fails. One mutation still passes: "a supported size whose target stage
  is not known is not checked". Today every target series is in the lifecycle table,
  so no list can reach that rule. The mutation script is not kept in the repo.
- **The STE check** (`tests/words.test.js`): see "Words for a customer".
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

## 0.2.0-beta (planned 2026-10-09): Microsoft's workload patterns

Microsoft's chart "Discover migration pattern by workload type" (v6 and v7
modernization) sorts workloads into seven patterns. The tool puts each VM in one,
and the pattern decides the advice: **how** to move, not only the size.

| Pattern | Detect? | Signal (from the query) | Advice | Size |
|---|---|---|---|---|
| A Compute pools: AKS, ARO, scale sets, DevOps scale-set agents | Yes (Batch and CycleCloud partly, by test; single CI agent VMs no) | Resource group "managed by" an AKS or ARO cluster; scale set membership; scale sets as their own rows | Do not resize the VMs. Add a new node pool or scale set at the new size, move the work, remove the old one. | For the new pool |
| B Image-based desktops: AVD pooled | Yes (Citrix partly, by tags; Horizon no) | Host pool type Pooled (AVD personal is E) | Do not resize the hosts. New session hosts from the image at the new size, drain, remove the old ones. | For the new hosts |
| C Service-managed: Databricks | Yes; Data Explorer, Synapse Spark, SSIS IR, PostgreSQL/MySQL are not in the VM list | Resource group managed by the Databricks workspace | Change the node type in the service. | To choose in the service |
| D Cluster re-creation: HDInsight, Azure ML | Not in the VM list (to confirm by test) | - | Make a new cluster at the new size. | For the new cluster |
| E Customer-managed VMs | Yes, by default | Any VM not in another pattern | v5: **resize in place** when compatible, one VM at a time (owner: E and F change the size in place). v6/v7: **deploy in parallel** (Microsoft: highly recommended); in-place upgrade with conditions. See "Grounding" below. | Today's logic |
| F Stateful and clustered: SQL Server / Always On, failover clusters, Service Fabric, SAP | Yes (Oracle Data Guard partly; AD DS domain controllers, NoSQL and search no) | SQL IaaS Agent resource and availability group; shared managed disk (more than one VM); Service Fabric extension or managed-cluster group; SAP (have) | **Change the size in place, one node at a time:** move the role away (fail over, drain), resize, check health, next node. SAP: certified sizes only. | Today's logic, per node |
| G ISV appliances | Yes (have; storage and backup appliances only when on Microsoft's list) | Microsoft's appliance list | No in-place change. Vendor certification, parallel appliances, move the traffic. | None until certified |

Where the tool cannot detect a pattern, the page says so ("This tool cannot find
domain controllers or self-hosted CI agents. Check for them yourself.").

**Peer feedback (2026-10-09):**
- Rename the "Problems" column to **"Before the move"**: it holds things to do or
  check, not blockers (the blockers show as "No - ..." in the series columns).
- Split the notes in two (peer, 2026-10-09: "these are not really problems"):
  **action needed before the move** (turn on accelerated networking, turn off
  hibernation, convert unmanaged disks) and **attention** (temporary-disk data is
  lost, an availability set can need all VMs stopped, a rebuild removes the
  system-assigned identity, zone). Use Microsoft's own names for these two groups if
  the docs give them; the peer found none (2026-10-09), so: **"Before the move"** and
  **"Attention"**. The peer: "make sure customers do not read this as an unsolvable
  blocker." So these tags are not red: red stays only for a real "No" in a series
  column. "Before the move" is amber, "Attention" is grey or blue, and each "Before
  the move" item gives the fix as a step (for example "Turn on accelerated
  networking."), so it reads as a task.
- The counts and filters: **Move needed - ready** (a supported size, nothing to do
  first), **Move needed - do this first** (a supported size, with items before the
  move), **Move needed - no path** (no supported size), No move needed, Not checked;
  and a filter by pattern.

**Peer suggestions, part 2 (2026-10-09):**
- **Categories in Microsoft's marketing and docs terms** (replace our result names):
  | Category | Was | Contains |
  |---|---|---|
  | Already Modern | No move needed | Current or Extended (Microsoft: both "modern") |
  | Modernization Required | Move needed - ready | a supported size, nothing to do first |
  | Modernization Required - Pre-Reqs Required | Move needed - do this first | accelerated networking, temporary disk, availability set, hibernation, unmanaged disks |
  | Modernization Required - Blocked/Redeploy | Move needed - no path | Generation 1, Azure Disk Encryption on v6/v7, no matching size |
  | Modernization Required - Change upstream Service Host Pool | patterns A-D | AKS, ARO, AVD pooled, Databricks; links to each service's docs |
  To settle: SAP is a hard gate in Microsoft's chart ("confirm before anything
  else"), so keep it Blocked until SAP certifies a size (the peer put it under
  Pre-Reqs). The peer suggested filtering out A, B, C and F; keep F (the owner: F
  changes the size in place, node by node).
- **Size fungibility: 3 to 5 ranked sizes for each VM**, not one. Order: the same
  shape on v5, v6 and v7 (closest); the AMD (or Intel) equivalent, marked * (a
  processor change: check licensing and performance); a size from the next family
  (for example E for more memory per vCPU). Label each with why it is there. Builds
  on today's size choices. Link to the Well-Architected Framework guidance on
  capacity resilience, which recommends size fungibility.

**Grounding in Microsoft's docs (checked 2026-10-09; owner: "those are sort of made
up categories"):** the peer's names (Already Modern, Modernization Required, Pre-Reqs
Required, Blocked/Redeploy, Change upstream Service Host Pool) are in none of the
lifecycle or modernization pages. Use Microsoft's own terms instead:
- **Modern size**: lifecycle overview - "Current and Extended sizes are both
  considered modern sizes because they're fully supported."
- **Hard gates**: v6/v7 Assess page - SAP (certified sizes only) and ISV appliances
  (vendor certification); "Confirm the gate first."
- **Readiness signals** with a **recommended action** each: v6/v7 Assess page
  ("Readiness signals to check": Generation 1, OS NVMe support, custom image, MANA,
  SCSI disk paths, persistent data on the OS disk, temporary disk, ADE for Linux,
  local NVMe disk, region and zone, quota, reservations). This replaces "Problems" /
  "Before the move".
- **Workload modernization categories A-G**: v6/v7 Discover page.
- **Fungibility**: Well-Architected Framework, "How to design for capacity
  resilience" - "Prefer fungible VM deployments. Design workloads to support
  multiple compatible VM SKUs instead of pinning to a single series."
- **How to move, by series** (changes the E and F advice above):
  - v5 (v5 overview, "Choose a transition method"): **Resize the existing VM** when
    the VM, disks, generation, region and availability support the target size;
    otherwise rebuild from a current image, replace instances in a scale set, or
    replicate and cut over.
  - v6 and v7 (FAQ: "Is moving to v6 or v7 a normal VM resize? No, treat it as a
    platform modernization"; Plan page): **deploy in parallel and modernize (highly
    recommended)**; in-place upgrade is possible with conditions and more risk. A
    source with a temporary disk "can't convert in place directly to a v6 size".

**Done in 0.2.0-beta (2026-10-09), items 1-3 of the owner's list:**
- Result groups in Microsoft's terms where they exist: Modern size - no move needed;
  Move needed - ready; Move needed - do this first; Move needed - hard gate (SAP, NVA);
  Move needed - no supported size; Not checked. Colours: red only for no supported
  size; amber for "do this first" and hard gate.
- Readiness signals: each problem is a **recommended action** (amber), or
  **attention** (blue: temporary disk, availability set - facts with nothing to do
  first, which do not stop a VM from being "ready"), or "Check:" (grey). Found while
  testing: with the temporary disk as an action, almost no v3 VM could ever be ready.
- How to move, by series (Microsoft): v5 resize the current VM; v6 and v7 deploy in
  parallel. On v6 and v7 the identity note applies (a new VM gets a new identity).
- Ranked sizes: up to five per supported series (closest; the other processor*;
  with or without a temporary disk; more memory; other shapes), each through the same
  checks and never smaller than the VM.
- Not yet: the pattern detection (steps below).

**0.2.1-beta (2026-10-10): storage and backup appliances are a hard gate** (owner: "hard
gate all storage appliances across the board for validation with vendor"). Microsoft's
v6/v7 Plan page: "Treat VM-based storage appliances like NVAs". Microsoft has no list
of their images, so `data/storage-appliance-images.js` is our own list from the Azure
Marketplace catalog (publisher and offers per vendor: NetApp Cloud Volumes ONTAP, Pure
Storage, Rubrik, Silk, Nasuni, Dell, Veeam, Commvault; read 2026-10-10). The NVA rule
and its wording stay as they are (owner: the policy's NetApp entry may be a mistake that
Microsoft fixes later).

**Test build, 2026-10-10 (done):** AKS, Databricks, a uniform scale set, AVD pooled and
personal host pools with a session host, a SQL Server VM with the SQL IaaS Agent, a
shared disk, an Azure ML compute cluster. All signals proven; results in
`docs/workload-patterns.md`. Found: uniform scale-set instances (AKS nodes) are only in
the `computeresources` table; the AVD host pool type is in the `resources` table, not
with the session host; Azure ML nodes are in no table of the customer's subscription.

**Steps:**
1. Rebuild the query as one pass that combines the records by VM (a union, not
   joins: Resource Graph allows only three joins), and add: the resource group
   "managed by" field, scale sets as their own rows, the SQL IaaS Agent records and
   availability groups, shared disks, the Service Fabric extension, AVD host pool type.
2. A temporary test build to prove each signal, torn down the same hour. Confirm the
   list and cost with the owner first. Resource Graph reads configuration, not
   running state: create, stop the VMs at once, wait for Resource Graph, read, delete.
   | Signal | Test | Rough cost |
   |---|---|---|
   | AKS (resource group managed by the cluster; node scale set) | 1-node AKS, smallest size, then stop the cluster | ~$0.10 |
   | Databricks (managed resource group) | a workspace only, no compute | ~$0 |
   | Scale sets as rows (uniform scale sets are not in the VM list) | a scale set with 0 instances | $0 |
   | AVD pooled vs personal | two empty host pools + one session host, then stop it | ~$0.05 |
   | SQL Server VM (SQL IaaS Agent) | SQL Server Developer edition (free licence), small VM, registered, stopped | ~$0.10 |
   | Failover cluster (shared managed disk) | a shared disk on a small VM, stopped | ~$0.20 |
   | Azure ML compute not in the VM list | a compute cluster with 0 minimum nodes | $0 |
   Total under ~$1, in one resource group, in the owner's ChrisLittle subscription.
   Not built (documented from Microsoft's docs, marked "untested"): ARO (6 VMs, about
   40 minutes), HDInsight, Service Fabric managed cluster (3 nodes, about $1 - optional),
   availability groups (need a domain), Batch, CycleCloud, Citrix, Horizon.
   At teardown, check that the resource groups that AKS and Databricks made are gone.
3. The Pattern column and the advice for each pattern; the text for what the tool
   cannot detect.
   - Also a tool-neutral reference, `docs/workload-patterns.md` (owner, 2026-10-10):
     for each pattern, the Resource Graph field or query that finds it, what the test
     build proved, and what cannot be detected. Any tool can use it.
4. The feedback changes.
5. Tests, the STE check, screen widths; pull request.

## 0.3.0-beta (2026-10-10): workload patterns in the tool

- **Query** (`query.kql`, 31 columns): one pass over `resources` plus three joins (AVD
  session hosts, AVD host pools, resource groups), in Resource Graph's limits. New
  columns: Resource type (VM or Scale set), Instances, Managed by (None, AKS,
  Databricks, ARO, or the provider), AVD host pool type, SQL Server (edition or No),
  SQL availability group, Shared disk. Uniform scale sets (AKS node pools included)
  are now rows. Resource Graph has no `managedByExtended`, so a shared disk is found
  from the data disks of each VM (a second summarize).
- **Test build 2** (rg-lcp-patterns-test2, kept until the owner says to delete it):
  the query gave the expected value for every resource; the 24 earlier columns did not
  change on 9 VMs in two subscriptions. The query output, run through the tool, gave
  A (AKS, scale set), B (pooled host), E (personal host), F (SQL Server, both VMs on
  the shared disk). Owner's rule: build, prove the signals, write the final query, run
  it on the build, run its output through the tool, then tear down when the owner says.
- **Pattern** for each VM, in this order: G (appliance), C (managed by a service other
  than AKS or ARO), A (AKS, ARO, scale set), B (AVD pooled), F (SQL Server by agent or
  image, availability group, shared disk, SAP), E (all signals known and none of the
  above). A list without the pattern columns gives "Pattern not checked", never E.
- **Advice:** A to C replace the "how to move" by series (the pool or the service
  decides); E and F keep it (v5 resize, v6 and v7 in parallel); F adds one node at a
  time; G stays a hard gate. An AVD personal desktop is E, with an attention note.
- **Scale set generation:** Resource Graph does not give it. A Generation 2 image SKU
  (`-gen2`, `-g2`, `gensecond`) gives Generation 2; otherwise the row is not checked,
  with a reason that asks for the generation. Never a guess.
- **Page:** the pattern under each VM name, a pattern filter, the advice in the details,
  and a note on what the tool cannot find (domain controllers, CI agents on single VMs,
  NoSQL and search clusters, compute outside the subscription).
- **Files:** Workload pattern and Pattern advice in vm-summary.csv; Workload pattern in
  vm-target-sizes.csv; a pattern section in about-these-results.txt.

## 0.3.1-beta (2026-10-10): plain names for the workload types

Owner: "no one who uses this quickly will know what" pattern A or G means. The page
and the files now say "Workload type" with plain names: Node pool or scale set (A),
Pooled AVD host (B), Managed by a service (C), Cluster in a service (D), Standalone VM
(E), Cluster or database (F), Vendor appliance (G), Type not checked. The letters stay
only in about-these-results.txt, the README table and docs/workload-patterns.md, to
match Microsoft's chart.

## 0.4.0-beta (2026-10-10): a clear layout for each VM

Owner: the details were "a mess": "First, do the recommended actions in the readiness
signals" pointed at nothing labelled, and the workload advice had no heading.
- **Details in a fixed order:** What to do (one main step, in bold), Why (lifecycle
  stage; for a hard gate or no size, the reason once), Sizes (cards; not for a hard
  gate or no size), Before the move, Good to know, To check. Each note shows once, with
  "(v5 only)" when it applies to some series. These three are Microsoft's readiness
  signals; the term stays in the about file.
- **New group "Move needed - change in the service or pool"** for node pools, scale
  sets, pooled AVD hosts and service-managed VMs. A service-managed VM (AKS, ARO, or a
  managed resource group such as Databricks) has no VM notes, and its sizes say "Use a
  size that the service offers".
- **The service by name** (owner: not "for example"): Azure Databricks, AKS node pool,
  ARO, a scale set, or the provider name from the list (for example Microsoft.Batch).
- **Burstable first** for a B-series VM: Bsv2 and Basv2 are Microsoft's replacement,
  and a resize. New sample VM contoso-b02 (B2s to B2ls_v2).
- **Table:** the last column is "Before the move": the steps, plus "N good to know" and
  "N to check".
- **Notes rewritten:** the availability set note (all VMs in the set must stop when the
  hardware does not have the new size), the temporary disk note ("the move deletes the
  data").
- **No pattern letters** in the README or the about file either (owner, 2026-10-10).
  Only docs/workload-patterns.md keeps A to G, to match Microsoft's chart.
- **Step 2:** "Load the CSV file" first. The portal has only "Download results as CSV":
  no copy of the results (owner, 2026-10-10). Paste stays for lists in Excel.

## 0.4.1-beta (2026-10-10): no "hard gate" in customer text

"Gate" is not an STE word, and "This is a hard gate" told the reader nothing (owner).
The group is now "Move needed - vendor approval first". What to do: "Ask the vendor (or
SAP) which sizes they certify. Do not change the VM before that." Microsoft's term
"hard gate" stays only in the README group table, the about file and the pattern doc.
Also: "readiness signal" and "in place" removed from customer sentences.

## 0.4.2-beta (2026-10-10): the details in reading order

Owner: the sizes are long, so the notes after them were easy to miss. The order is now
What to do, Why, Before the move, Good to know, To check, Sizes. The table column
"Before the move" is gone: the Result column says "do this first", and the details
and the download files give the steps.

## 0.4.3-beta (2026-10-10): AKS node pools are not "Not checked"

The sample's AKS node pool showed "Not checked", because Resource Graph gives no
generation for a scale set. Owner: the goal is to find AKS nodes and send the customer
to AKS. For AKS, ARO and other service-managed VMs, the tool now plans without the
generation (the service makes the new nodes from its own image), so they show
"Move needed - change in the service or pool". A scale set of the customer's own still
needs the generation. Test build 3 (one AKS node pool) proved the image name and the
node's hyperVGeneration (docs/workload-patterns.md); the full raw data is saved locally
so that no rebuild is needed for these fields. A name match in the query was tried and
dropped (owner: fragile, and not needed).

## 0.4.4-beta (2026-10-10): a theme menu

Owner: a light and dark choice, as in the owner's other tool. A "Theme" menu at the top
right: Follow the system (the start), Light, Dark. The page keeps no data, so the
choice is not stored: it lasts until the page closes.

## 0.4.5-beta (2026-10-10): capacity words as Microsoft says them

Owner: "is this really from MS docs?" The series list was right (Dsv2 is on Microsoft's
"Impacted VM series" list, read again 2026-10-10), but "Microsoft limits new capacity"
was our own loose summary. All capacity and quota text now follows Microsoft's page:
"capacity growth restrictions"; a new subscription cannot deploy these series; an
existing one can deploy in its approved quota if the region has capacity; Azure
approves no more quota; running VMs are not affected; it is not a retirement. The
series names now match Microsoft's table exactly (B and Bs, not "B v1").

## 0.4.6-beta (2026-10-10): VMs with the same name stay apart

Owner: what if VMs have the same name in other subscriptions, regions or groups? The
query gave no unique key, and vm-not-checked.csv found each VM by name, so a reason
could come from the other VM. Now: the query gives "Resource ID" (Azure's unique key,
no extra join; checked on Azure: only the new column changed). The tool keeps rows
apart by row, never by name. The table shows where a VM is only when its name is in
the list more than once (owner: "already a bit tight"): the resource group, else the
subscription, else the region. The details show the resource ID; Find matches it. The
files get Subscription ID, Resource group and Resource ID, so a customer can group by
region, subscription or group. The sample has contoso-web01 twice.

## 0.5.0-beta (2026-10-10): a report in the zip

Owner: a more formal report for people who do not want Excel. The zip now starts with
vm-lifecycle-report.html: one HTML file with its CSS inside, no scripts, nothing to load,
so it opens in any browser offline and prints to PDF (each VM card stays on one page).
Contents: summary (counts by result group, workload type, region, resource group), what
to do by result group (one table each, with the target size and the main step), one card
for each VM that needs a move (the page's order), notes and sources. The "What to do"
words moved to js/details.js, so the page and the report say the same. The CSV files
stay for Excel. Owner approved a mockup first.

## 0.5.1-beta (2026-10-10): fixes from a review of the whole repo

Three review agents (logic, privacy and security, customer text); each finding was
checked by running code before a fix. Owner: fix them all.
- **Wrong answers fixed:** RHEL 10 and Oracle Linux 10 read as 1.0 (false NVMe fail; now
  "check"); no size with the same name (E16-4s_v3 on v7) said "No size fits" (now "Not
  checked": other sizes can change the processor or active vCPUs); an unknown OS with
  Azure Disk Encryption said "Resize" (now "Not checked"); the report had no reason for
  vendor approval or no size (the page's "Why" is now shared); "Do the steps in Before
  the move" with only facts to check (now says which); the query read no disk encryption,
  SAP or unmanaged disks for scale sets (now from the scale set model; the field path
  proved from saved build data); a size in lower case gave another answer.
- **Security:** CSV cells that start with = + - @ get a ' (Excel formula guard); the report
  has its own Content-Security-Policy; the workflow gives write access only to the publish
  job and keeps no credentials; the page will not run inside another site's frame; more
  "no network" test patterns; a test that only all-zero GUIDs (and the public NVA policy
  ID) are in the repo; js/query.js and js/sample.js are readable (tools/copy-files.mjs).
- **Text:** Azure Disk Encryption retires on 15 September 2028 and the move to
  encryption at host makes new disks and a new VM (Microsoft's migration page); the
  availability set note differs for a resize and a new VM; ephemeral OS disk; "Check:"
  wording; "VM name" everywhere ("Machine name" still read); "Result group", "Series
  result", "Needs review"; "delete the old VM"; "Trusted launch"; "Generation 2"; the
  F-series table; same-shape sizes in another family are labelled as such.
- **Small:** Excel's sep= line, spaces before a quote, row numbers are file lines, an
  unknown NIC count is not one NIC, the generation is skipped only for AKS, ARO and
  Databricks.
- **Checked and not changed:** v5 Intel D and E sizes do require accelerated networking
  (Microsoft's Ddsv5 page); the query runs at tenant scope (run many times); "Azure
  approves no more quota" matches Microsoft's page.

## 0.6.0-beta (2026-10-16): watch the sources, phase 1

A weekly workflow (`.github/workflows/watch-sources.yml`, Monday 06:17 UTC, and a Run
button) reads every Microsoft Learn page that data/*.js or js/*.js cites: 23 pages
(`tools/sources.mjs`; a test fails when a cited page is not in the list). It reads the
whole article: each sentence, list item and table row, with its section heading, so a
fact that is only in a sentence ("v6 and v7 series are Current", "began in July 2026")
is watched too. Code samples and footnote numbers are left out. It compares the lines
with `tools/source-snapshot.json` (duplicates counted). One GitHub issue for each page
(label `source-watch`): opened for a change or a page it cannot read (moved, gone,
another layout); a comment only when the difference is new (a fingerprint); closed when
the page and the snapshot agree again. Page text in an issue is in code spans (no
@-mentions or links); a report fits GitHub's size limit. Fetch: 30 s time limit, three
tries, a moved page is reported, never followed. `--update` refuses to save when a page
fails or loses more than 20% of its lines (`--force` to accept). It never changes the
data. Permissions: read the repo; write issues only in the job that needs it; 15-minute
job limit; one failed issue call does not skip the other pages.
- A full agent review (logic and coverage; security) before the PR; its findings fixed:
  prose facts, 17 missing pages, one issue per page with close, de-duplication,
  time limits, retries, redirects, nested lists, footnotes, missing layout.
- It reads the published pages, not GitHub: Microsoft retires most public Microsoft
  Learn documentation repos by the end of December 2026 (owner, 2026-10-16).
- The snapshot of 2026-10-16 agrees with the data files (reviewer check).
- The NVA policy is not in phase 1: the GitHub copy lags Azure (1.3.0 vs 1.4.0 on
  2026-10-16, same lists). Phase 2 reads it from Azure.
- Accelerated networking on E v5 (found by the review: the v5 overview says only Intel D
  v5 requires it): Microsoft changed the Ev5, Esv5, Edv5 and Edsv5 pages to Required on
  2026-10-01 and did not update the overview; the AMD E v5 pages still say Supported.
  The tool already requires it on Intel D and E v5 only. No change; no feedback to
  Microsoft (owner, 2026-10-16).
- **Storage and backup appliances (owner: "fix all the storage vendor items"):** the
  review found that Cohesity (an offer name that hides the appliance) and WEKA (not in
  the Marketplace: its Terraform module builds the VMs from WEKA's community gallery)
  were missed. Now the query also reads the VM's Marketplace purchase plan, the image ID
  (gallery images) and names a managed application ("Managed by" Managed application).
  A VM is an appliance by its image, its plan or its gallery; a VM in a managed
  application belongs to its vendor (vendor approval first). The list now has 20
  publishers from the catalog (East US and West Europe, 2026-10-16), Cohesity, the WEKA
  gallery, and new vendors: CTERA, Druva, Hammerspace, Hitachi VSP One SDS, IBM Storage
  Virtualize, Lightbits, Panzura, SoftNAS, Zerto. Vendor approval is the first reason in
  the series answers. Sample: contoso-rbk01 (plan), contoso-weka01 (gallery),
  contoso-coh01 (image), contoso-pure01 (managed application).
- GitHub turns off a scheduled workflow after 60 days with no repo activity (public
  repos) and sends an email: turn it on again in the Actions tab. Since 2026-10-17 each
  run also calls the REST API "Enable a workflow" for itself (job `keep-on`: only
  `actions: write`, no environment, no secret, no checkout, no commit). GitHub does not
  define "activity" or say that this call resets the 60 days (it is a common practice). If
  GitHub still turns it off, the email comes as before.
- Phase 2 (to plan with the owner): the size table, the NVA policy and the Marketplace
  appliance images, read from Azure with a GitHub federated credential (no stored
  secret), a read-only custom role on one subscription, used only by the scheduled job
  on main.

## 0.7.0-beta (2026-10-16): watch the sources, phase 2 (Azure)

The weekly workflow also reads Azure (`tools/azure-sources.mjs`, plain HTTPS to Azure
Resource Manager with a token from the Azure CLI):
- **The size list:** the resource SKU list of all 63 physical regions, merged with the
  safer value (as `data/sizes.js` was made). `--update` rebuilds `data/sizes.js` in its
  own layout and order (locale order, pinned to English), so a refresh shows only the
  sizes that changed. First run (2026-10-16), against the table of 2026-10-09: 2 new
  sizes (Standard_M16s_v3, Standard_M32ts_v3) and 9 F v7 sizes whose NIC limit is now
  the same higher value in every region. The table is refreshed in this release.
- **The NVA policy:** read from Azure (version 1.4.0, the same lists).
- **The Marketplace catalog:** each listed vendor's offers (East US and West Europe):
  a new offer to review, or a pattern that matches nothing; and possible new vendors
  (publisher names that look like storage or backup). Decisions are kept in the list
  (`reviewed`, `notVendors`), so they are not reported again. First run: 53 findings,
  all decided: added Veritas, BackupAssure, Dell Australia and Canada, a second Druva
  publisher, NetApp's internal ONTAP image; the rest are tests, consoles, connectors,
  Microsoft extensions or publishers with no VM image.
- **Sign-in (owner approved the commands, 2026-10-16):** an app registration
  "vm-lifecycle-planner-source-reader" with no secret or certificate; a federated
  credential for the subject that GitHub sends, with the owner's and the repo's
  numeric IDs: `repo:chrislittle@11097012/azure-vm-lifecycle-planner@1411898953:environment:azure-read`
  (the first run on 2026-10-17 showed that GitHub no longer sends the name-only form
  `repo:chrislittle/azure-vm-lifecycle-planner:environment:azure-read`; the credential
  was changed, and the IDs do not change when a repo is renamed);
  a custom role "VM Lifecycle Planner source reader" with 5 read actions (VM sizes,
  Marketplace publishers and offers, policy definitions, regions), assignable and
  assigned only on the ChrisLittle subscription. The IDs are GitHub environment secrets,
  never in the repo. The `azure-read` environment allows only `main`. The workflow job
  uses `azure/login` v3.1.0 (pinned), `id-token: write`, and a failed sign-in becomes a
  "cannot read" issue.

- **Security check and review agent (owner asked, 2026-10-16):** the security check found
  no vulnerability (no command injection path; no way for a fork or a pull request to
  get the Azure token; no credential in the code). The review agent found, and this
  release fixes: a failed sign-in stopped the job before any issue (now three "cannot
  sign in" reports, and the issue step runs unless the run is cancelled; proven with no
  Azure CLI); an Azure error could put the subscription ID in a public issue (now
  replaced with `<subscription>`; tested); `azure/login` would ask for subscription-list
  rights that the role does not have (`allow-no-subscriptions`); an error was read as
  "no offers" (only HTTP 404 is); publishers marked "not a vendor" were never checked
  again (now a new image from one is reported - the first run found StorSimple, a
  Microsoft storage appliance, now on the list); short vendor words matched other names
  (now only at the start); list pages (nextLink), network retries and Retry-After.
- **Not changed (to see on the first run):** reading the built-in NVA policy may not need
  `Microsoft.Authorization/policyDefinitions/read`; if the first run reads it, that
  permission can go.

- **First runs on GitHub (2026-10-17):** run 1: the sign-in failed (the subject form
  above); the check wrote "cannot sign in" reports, and the workflow opened issues #19
  to #21 as designed. Run 2, after the credential change: sign-in worked; 23 pages, the
  size list (1,498 sizes, 63 regions), the NVA policy (1.4.0) and the catalog all agree
  with the data; the workflow closed #19 to #21 by itself. The policy-definitions read
  permission stays (owner, 2026-10-17): it reads only public rule text.

**Next:** refresh the data when the weekly check opens an issue.

## 0.7.1-beta (2026-10-17): large lists and accessibility

**Large lists.** Nobody had timed a large customer list. `tests/large-list.js` makes a
made-up contoso list of any size from the sample rows (12 regions, 40 subscriptions,
300 resource groups, about one VM in seven with a name that another VM has, scale
sets, AKS node pools, appliances, empty and odd values); the same size gives the same
list, and no file of it is kept. `node tools/time-large-list.mjs` times each step.

| Step (laptop, Node 24, Chrome) | 20,000 VMs before | after | 50,000 VMs before | after |
|---|---|---|---|---|
| Read the list (Node) | 0.12 s | 0.14 s | 0.39 s | 0.2 s |
| Plan (Node) | 6.84 s | 1.4 s | 14.57 s | 2.4-3.0 s |
| All five files and the zip (Node) | 2.74 s | 1.2 s | 5.54 s | 2.8 s |
| Page: load the CSV to the table shown | 5.8 s | 1.0 s | 14.1 s | 3.0 s |
| Page: Find, one key | | | 350-450 ms | 3-8 ms |
| Page: Show, Type | | | 240-370 ms | 5-6 ms |
| Page: Show more | | | 630 ms | 3 ms |
| Page: Download results | | | 5.0 s | 2.4 s |

- The planning time went to reading the size table again for each VM: each family
  question walked all 1,498 sizes. The table now keeps the answer to each question
  (the sizes that match a name pattern, the families with v5, v6 or v7 sizes), each
  size's capabilities by name, each name's family and processor, and the appliance
  answer for each image. The answers did not change: every file for the three sample
  lists and a 6,000-VM list was byte for byte the same before and after (the report
  changed only in its markup, below).
- The page: the result group, the Find text and the VMs with the same name are made
  once for each list. Before, each row with a repeated name searched the whole list
  (200 rows x 50,000 VMs for each key in Find). "Show more" adds rows and keeps open
  rows open. "Download results" says "This tool makes the zip file. Wait." first.
- Tests: 20,000 VMs plan and make every file in under 30 seconds (about 3 on a
  laptop; generous so that a slow build machine does not fail), the same twice; the
  same VMs in another order give the same result for each resource ID; the samples
  give the same files with a new size table and with one that a large list used first.
- The zip is compressed (owner, 2026-10-17): each file goes through the browser's own
  `CompressionStream('deflate-raw')` (zip method 8), no library. A file that does not
  get smaller, or a browser without CompressionStream, gives a stored file. For 50,000
  VMs: 180 MB of files, an 8.7 MB zip, 1.7 s.

**Accessibility (WCAG 2.2 AA)**, checked by hand and in the browser; found and fixed:
- Each VM row was a table row that took the focus (`tr` with `aria-expanded`), which
  screen readers do not read as a control. Now the VM name is a button with
  `aria-expanded` and `aria-controls` (Enter or Space), in a row header (`th
  scope="row"`). A click on the row still opens it.
- Column headers had no `scope`; the report's three summary tables had no headers.
- Contrast (computed from the CSS tokens): the green text on the green pill and on an
  open row was 4.47:1 and 4.45:1 (light theme, page and report): now 4.78:1 (4.75:1 on
  an open row). The borders of the text boxes and menus were 1.3:1: a new `--control`
  token, 3.5:1 light and 3.6:1 dark.
- The query box takes the focus (it scrolls) but had no name and no focus ring.
- Headings skipped a level (h2 to h4 in the details and the report summary).
- "The table shows N of M VMs" and the download message are now live regions; the
  messages box has `role="status"`.
- The arrow before a VM name moved even when the system asks for less motion.
- The printed report shows the address of each link.
- Checked and not changed: `lang`, landmarks, a label on each control, the theme menu,
  the file button, Find and the filters by keyboard; each pill has text; no sideways
  scroll at 320 px, 375 px or 640 px (200% zoom); light and dark.
- `tests/accessibility.test.js`: contrast of each text and control colour pair in both
  themes and in the report, a label for each control, headings in order, table
  headers with scope, the row button, live regions, reduced motion.

## After 0.7.1-beta (2026-10-17)

- The README Sources section said 1,496 sizes read on 9 October: the table was
  refreshed to 1,498 on 16 October, and the README was not. A test now compares the
  README size count and date with `data/sizes.js`.
- README facts (2026-10-17): the README also said "9 more vendors" when the list had
  12 more. Each README fact that comes from a file is now between two marks that
  GitHub does not show (`<!-- fact:sizes -->...<!-- /fact -->`), and
  `tools/readme-facts.mjs` writes it from the file: the version (`js/version.js`), the
  size count and read date (`data/sizes.js`), the read dates of the lifecycle pages
  (`data/end-of-life.js`, `data/capacity.js`) and of the NVMe list
  (`data/nvme-images.js`), and the number of storage and backup vendors after the ten
  that the README names (`data/storage-appliance-images.js`; a vendor is a company,
  the first word of its name, so Dell with four publishers counts once, and WEKA's
  gallery counts). A mark is never at the start of a line: GitHub then shows the line
  as HTML. The size test is now one test for all facts: README.md must be what the
  tool writes. `tools/azure-sources.mjs --update`, `tools/watch-sources.mjs --update`
  and `tools/set-version.mjs` run the tool; `--check` only compares.
- Each weekly issue has a section "README": the facts that come from the data of the
  source, with the README text now. For the size list, also the text that the data
  of the check gives. The NVA policy has no README fact: the section says so. The
  section is not in the fingerprint, so the same difference is still posted once.
  Each fact names its sources (Learn page ids and Azure source ids): a page that a
  data file only cites, for example the v6 and v7 plan page in
  `data/storage-appliance-images.js`, gives no fact. A test checks that each fact
  (but the version, which comes from a release) names a source, and that each source
  exists.
- `tools/set-version.mjs` makes the new README before it changes any file, so a
  README or data fault stops it with no half-done version change.
- The tests ran only on main, after a merge: `.github/workflows/tests.yml` now runs
  them on each pull request (read only, no secret).

## 0.8.0-beta (2026-10-17): the vendor and the evidence

Owner, 2026-10-17: "we say vendor appliance (storage etc) but don't say what it is".
The tool found the type from facts, but did not show them. No answer changes: the
three CSV files and the workload type of every sample list are byte for byte the same
as 0.7.1-beta, but for the two new columns.

- **One source.** The checks for an appliance (`js/extras.js`) and for a workload type
  (`js/patterns.js`, `patternFound`) give what matched, not only true or false:
  the sign of an appliance (image, Marketplace purchase plan or gallery image, in that
  order), the vendor of a storage or backup appliance (our list), and the columns that
  decided a workload type. `patternOf` is now `patternFound(x).pattern`. The words are
  in `js/evidence.js`, which the page, `vm-summary.csv` and the report use. Owner's
  example: "Storage or backup appliance: NetApp. The image is netapp /
  netapp-ontap-cloud."
- **A network virtual appliance** shows the publisher ID as Azure gives it: the Azure
  policy list has no vendor names, and the tool does not make one up (owner,
  2026-10-17). NetApp Cloud Volumes ONTAP and Global File Cache images are on both
  lists; as before, the NVA list comes first, so they show as a network virtual
  appliance with the publisher ID netapp.
- **A managed application** shows the "Managed by" value. The list does not give its
  vendor: the page says so. The publisher of its Marketplace purchase plan shows when
  the list gives one. A query change to read the managed application's publisher is
  for a later release (owner, 2026-10-17).
- **The page**: each VM's details have "Workload type" (the type, the vendor and the
  facts) after "Why", and "Facts from your list" at the end: closed at first (a
  `<details>` element), each column that the answer used in six groups, with its value
  as read, "Not in the list" or "No value". It tells a customer why a note says
  "Check". "Disk controller" is not in it: the tool takes the controller from the size
  (owner, 2026-10-17). The block is on the page only, not in the report (owner,
  2026-10-17: the report stays short).
- **vm-summary.csv**: two new last columns, Vendor and Evidence, so that no other
  column moves. Both are empty for a standalone VM and for "Type not checked".
- **The report**: "Workload type" in each VM card, and the table "Appliances by
  vendor" in the summary (vendor, kind, count, VM names with where-words for names
  that are in the list more than once), so that a customer can send one list to each
  vendor. A name links to its card only when the report has a card for the VM: a VM
  on a modern size has none.
- Tests: `tests/evidence.test.js` (each sign, each kind, each workload type, missing
  and empty facts, the CSV columns, the report table and its links). The STE check
  also reads the Evidence column and the definition lists. 38 mutation checks, all
  caught.

## 0.9.0-beta (2026-10-17): sizes side by side, the values behind each note, the time left, the vendor of a managed application

Owner, 2026-10-17: four additions in one release. No answer changes: for the three
sample lists, a list of every note and a made-up list of 4,000 VMs, the result group,
the workload type, the stage, each series answer, the ranked sizes, which notes show
(topic, state, series) and the number of "Why" lines are the same as 0.8.0-beta. Only
words, a new table and three new query columns are added.

- **The current size beside each new size.** The details of each VM (page) and its card
  in the report have a table: vCPUs, memory (GiB), temporary disk (GiB, or "None"; NVMe
  disks say so), max NICs, max data disks, Premium SSD and generations, for the current
  size and each size that the tool shows (v5, v6, v7, Burstable). A series with no size
  has no column. A size that the size table does not have says "Not in the size table".
  The current size also shows the NICs and data disks of this VM. Where a new size has
  less than the current size or this VM (fewer vCPUs, less memory, a smaller or no
  temporary disk, fewer NICs or data disks than the VM has, no Premium SSD, not its
  generation), a note in words is under the value ("Less than the 3 NICs of this
  VM."), not only a colour. A caption and headers with scope; the table scrolls on a
  narrow screen and takes the focus. Values from `data/sizes.js` only
  (`sizeFacts` in `js/lifecycle.js`, `sizeComparison` in `js/details.js`).
- **The value behind each note.** Each problem, fact to know and "Check" note now
  says the value from the list that gave it, for example "The image
  MicrosoftWindowsServer / WindowsServer / 2016-Datacenter is not on the Microsoft list
  of OS images that support NVMe.", '"Hibernation" is Yes.', '"Primary NIC
  accelerated" is No.', "The current size Standard_D4s_v3 has a temporary disk of 32
  GiB.", "The vendor is Veeam.", and in the reasons the generation or size as written
  and the size name for "no size with the same name". Where the value is missing, the
  note says so, as before. The NVMe note for an image that the list gives, but that is
  not on the Microsoft list either way, said "the list does not give the OS image": it
  now says "this tool cannot tell if the image ... supports NVMe". So "Check:" is wider:
  the list does not give the fact, or this tool cannot judge it from what the list
  gives. The old wording said that the list did not give the OS image, also when it
  did. The "To check" hint (page), the about file and the README use this definition. The reason codes
  and which notes show did not change; the note columns of the CSV files changed in
  their words only (vm-summary.csv Before the move, Good to know, Notes;
  vm-target-sizes.csv the note columns and Reason; vm-not-checked.csv Why). The
  "Current stage" column does not change.
- **The time left to a date.** On the page ("Why") and in the report, a retirement date
  says how long is left, or how long ago it was, in whole months from the day that the
  list is planned: "Microsoft retires this series on 15 November 2029 (in 36 months).",
  "Retired. Microsoft retired this series on 30 September 2025 (12 months ago).",
  "less than 1 month" under a month. The start of the capacity growth restrictions
  (Microsoft gives only "July 2026") counts from the first day of that month: "From July
  2026 (3 months ago)". Also in the report notes and the about file. The CSV files and
  the stage in the results table keep their words. No other date is added.
- **The vendor of a managed application.** The query gives three new last columns:
  "Managed application" (the application name), "Application plan publisher" and
  "Application plan product" (`plan.publisher` and `plan.product` of the
  `Microsoft.Solutions/applications` resource, from Microsoft's ARM template reference).
  No new join: the join that gave the AVD host pool now reads host pools and managed
  applications, by one key (the host pool, else the managed application that owns the
  resource group). The resource groups join comes before it. Still three joins and two
  mv-expand. A VM in a managed application now says "Managed application. The publisher
  ID is contosoisv." with "Managed application: contoso-cbs. The Marketplace plan of
  the application is contosoisv / contoso-storage-app."; the Vendor column and
  "Appliances by vendor" use that publisher ID (no company name is made up). An
  application with no plan (a service catalog application) says so. A list without the
  new columns works as before ("The list does not give the vendor."). Sample:
  contoso-pure01.
  - Run on the owner's Azure (2026-10-17, read only): the new query parses and runs;
    2 VMs, one row each, the 35 earlier columns the same as the 0.8.0-beta query. A
    probe copy that also joined the VMs themselves through the new join gave one row
    for each VM, with the name from the joined row: the join works with a match.
  - **Test build (owner, 2026-10-17)**: a pooled AVD host pool with one Windows session
    host, and a service catalog managed application (our own definition) with one Linux
    VM in its managed resource group, both VMs stopped (deallocated). The old and new
    query each gave 2 rows; the 35 earlier columns were the same; the session host read
    "Azure Virtual Desktop" Yes and host pool type Pooled (no change through the new
    join); the managed application VM read "Managed by" Managed application and
    "Managed application" with the application name, and a blank plan (a service catalog
    application has no Marketplace plan). The old and new tool gave the same answers
    for both VMs. The raw rows are kept locally, not in the repo.
  - **Not proven on a real Marketplace managed application**: only a Marketplace offer
    has a plan, and its cost depends on the offer. The plan columns read `plan.publisher`
    and `plan.product` of the application, as Microsoft's ARM reference gives them.
  - Edge case: an AVD session host in the resource group of a managed application keeps
    its host pool, and the list then does not give the application (it is a vendor
    appliance either way).
- Tests: `tests/values.test.js` (size facts, the table and each "less" note, every
  changed note with its value and with the value missing, the reasons, whole months and
  each countdown, the stage with and without `now`, the query columns and limits, the
  managed application with and without a plan, an old list). The STE check also reads
  the size table notes, the countdown words and the new evidence. 53 mutation checks of the code and 4 of the STE check, all caught (3 caught only
  after new tests: the current size never gets a note, an equal value is not less, the
  capacity line in the report).

## After 0.9.0-beta (2026-10-27): the generation everywhere

Owner, 2026-10-27: show the generation of each VM clearly, everywhere. Before, only
"Facts from your list" (page) and the Generation column of vm-summary.csv and
vm-target-sizes.csv showed it, and those columns showed the cell as written when the
tool found Generation 2 itself, or when a service did not need it.

- **One source** (`generationShown` in `js/evidence.js`) for the page, the report and
  the three CSV files. `js/planner.js` keeps where the generation came from
  (`generationFrom`: the list, the security type, the image SKU, not needed, or
  nothing) and the note that says why (`generationNote`, still in the notes).
- **The values.** Page and report: "1" or "2" from the list; "2*" when the list does
  not give it and the tool uses Generation 2 because of the image SKU or the security
  type (Trusted launch, confidential VM); "Not given" (blank or not readable: the VM
  stays "Not checked", with its reason); "Not needed" (AKS, ARO, Azure Databricks). The
  CSV files: "Generation 1", "Generation 2", "Generation 2 (from the image SKU)",
  "Generation 2 (from the security type)", "Not given", "Not needed". No new column,
  so the other columns keep their place. A value that the tool found never looks like
  a value that the list gave.
- **Where.** The results table: a Generation column after "Current size", and a hint
  under the table that says what 2*, "Not given" and "Not needed" mean; the cell's
  title gives the note. The report: a Generation column after "Size" in each table of
  section 2, a "Generation" count in the summary (always in the order Generation 1,
  Generation 2, Generation 2*, Not given, Not needed; a value with no VM is left out),
  and a line under the name in each VM card, with the note for 2* and "Not needed". The
  same hint shows under a table that has one of these values. vm-not-checked.csv: a
  Generation column after "Current size".
- **A note fixed:** a generation that the tool cannot read (for example "3") with
  Trusted launch, or with a Generation 2 image SKU, said "The generation is empty." It
  now says "This tool cannot read the generation '3'."
- Tests: `tests/generation.test.js` (each rule on each surface, the order of the count,
  the sample). The STE check also reads the Generation column, the hint and the new
  notes. 36 mutation checks, all caught (one only after a new test: the hint under the
  summary count).

## Next

- Before each release: `node tools/set-version.mjs <version>`, then check the screen
  widths (step 6) and the STE check of all customer text.
- Refresh the size table and Microsoft's lists when the owner asks.
