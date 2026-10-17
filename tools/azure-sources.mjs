// The facts that come from Azure itself, not from a Microsoft Learn page:
//   - the size table (data/sizes.js): Azure's resource SKU list, every physical region
//   - the NVA policy (data/nva-images.js): the built-in policy definition
//   - the storage and backup appliance offers (data/storage-appliance-images.js): the
//     Marketplace image catalog, and possible new vendors
//
//   node tools/azure-sources.mjs              check: one report for each source that changed
//   node tools/azure-sources.mjs --update     rebuild data/sizes.js and data/nva-images.js
//                                             (the appliance list is ours: change it by hand)
//
// It takes one sign-in token from the Azure CLI (on a computer after `az login`, in
// GitHub Actions after the read-only sign-in) and makes plain HTTPS GET requests to
// Azure Resource Manager. It only reads. Reports go to watch-report/
// like tools/watch-sources.mjs, and the same workflow step opens the issues.
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';

const root = new URL('../', import.meta.url);
const today = new Date().toISOString().slice(0, 10);

// The capabilities that the tool reads, in the order of data/sizes.js.
export const CAPABILITIES = ['vCPUs', 'vCPUsAvailable', 'MemoryGB', 'MaxResourceVolumeMB', 'PremiumIO', 'HyperVGenerations',
    'MaxNetworkInterfaces', 'MaxDataDiskCount', 'NvmeDiskSizeInMiB', 'NvmeSizePerDiskInMiB'];
export const NVA_POLICY = 'e87a87f5-e6dd-4919-be21-abb0a4ea4630';
// Regions for the Marketplace catalog: offers can differ by region.
const CATALOG_REGIONS = ['eastus', 'westeurope'];
// Publisher names that can be a storage or backup vendor (to find a new one).
// Short names count only at the start of the name, so that "contoso-dell" or
// "contosomodell" does not match.
const VENDOR_WORDS = /netapp|purestorage|rubrik|^silk|nasuni|^dell|veeam|commvault|cohesity|^weka|ctera|druva|hammerspace|hitachi|ibm.*storage|lightbits|panzura|softnas|buurst|zerto|qumulo|nutanix|veritas|arctera|^minio|datadobi|clumio|kasten|infinidat|^quantum|backup|storage/i;

// One sign-in token from the Azure CLI (it has no special characters, so no shell
// quoting can go wrong), then plain HTTPS GET requests to Azure Resource Manager.
const ARM = 'https://management.azure.com';
let token = null;
function signIn() {
    const cmd = process.platform === 'win32' ? 'az.cmd' : 'az';
    const out = execFileSync(cmd, ['account', 'get-access-token', '--resource', `${ARM}/`, '-o', 'json'], { encoding: 'utf8', shell: process.platform === 'win32' });
    const t = JSON.parse(out);
    token = t.accessToken;
    return t.subscription;
}
// A path in an error message, without the subscription ID: the message can go into a
// public GitHub issue.
export const safePath = (path) => path.split('?')[0].replace(/\/subscriptions\/[^/]+/i, '/subscriptions/<subscription>');

// GET one Azure Resource Manager path, with three tries (throttling, server errors,
// network errors) and the pages of a long list (nextLink). err.status is the HTTP status.
async function get(path, tries = 3) {
    for (let i = 1; ; i++) {
        let res;
        try {
            res = await fetch(path.startsWith('https://') ? path : `${ARM}${path}`, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(60000) });
        } catch (e) {
            if (i >= tries) throw new Error(`Azure did not answer for ${safePath(path)} (${e.name})`);
            await new Promise((r) => setTimeout(r, 5000 * i));
            continue;
        }
        if (res.ok) {
            const body = await res.json();
            if (body && Array.isArray(body.value) && body.nextLink && body.nextLink.startsWith(`${ARM}/`)) {
                const more = await get(body.nextLink, tries);
                return { ...body, value: [...body.value, ...(more.value || [])], nextLink: undefined };
            }
            return body;
        }
        if (i >= tries || (res.status !== 429 && res.status < 500)) {
            throw Object.assign(new Error(`Azure answered HTTP ${res.status} for ${safePath(path)}`), { status: res.status });
        }
        const after = Number(res.headers.get('retry-after'));
        await new Promise((r) => setTimeout(r, after > 0 && after < 120 ? after * 1000 : 5000 * i));
    }
}

// ---------------------------------------------------------------------------
// The size table
// ---------------------------------------------------------------------------

// Every physical region of the subscription.
async function physicalRegions(subscription) {
    const r = await get(`/subscriptions/${subscription}/locations?api-version=2022-12-01`);
    return r.value.filter((l) => l.metadata?.regionType === 'Physical').map((l) => l.name).sort();
}

// One region's VM sizes: { name: { family, capabilities } }.
async function regionSizes(subscription, region) {
    const filter = encodeURIComponent(`location eq '${region}'`);
    const out = {};
    for (const s of (await get(`/subscriptions/${subscription}/providers/Microsoft.Compute/skus?api-version=2021-07-01&$filter=${filter}`)).value || []) {
        if (s.resourceType !== 'virtualMachines') continue;
        const caps = {};
        for (const c of s.capabilities || []) if (CAPABILITIES.includes(c.name)) caps[c.name] = c.value;
        out[s.name] = { family: s.family, capabilities: caps };
    }
    return out;
}

// One table for all regions. Where regions disagree, the safer value: the lower
// number, the generations that every region gives, Premium SSD only when every region
// says so. Returns { sizes, differsByRegion }.
export function mergeRegions(perRegion) {
    const sizes = {};
    const differs = new Set();
    for (const region of perRegion) {
        for (const [name, s] of Object.entries(region)) {
            if (!sizes[name]) { sizes[name] = { family: s.family, capabilities: { ...s.capabilities } }; continue; }
            if (sizes[name].family !== s.family) differs.add(name);
            const a = sizes[name].capabilities;
            for (const c of CAPABILITIES) {
                const x = a[c], y = s.capabilities[c];
                if (x === y) continue;
                if (x === undefined || y === undefined) { differs.add(name); if (x === undefined) a[c] = y; continue; }
                differs.add(name);
                if (c === 'HyperVGenerations') a[c] = x.split(',').filter((g) => y.split(',').includes(g)).join(',');
                else if (c === 'PremiumIO') a[c] = x === 'True' && y === 'True' ? 'True' : 'False';
                else a[c] = String(Math.min(Number(x), Number(y)));
            }
        }
    }
    const ordered = {};
    for (const name of Object.keys(sizes).sort((a, b) => a.localeCompare(b, 'en'))) {   // the order of data/sizes.js
        const caps = {};
        for (const c of CAPABILITIES) if (sizes[name].capabilities[c] !== undefined) caps[c] = sizes[name].capabilities[c];
        ordered[name] = { family: sizes[name].family, capabilities: caps };
    }
    return { sizes: ordered, differsByRegion: [...differs].sort((a, b) => a.localeCompare(b, 'en')) };
}

// data/sizes.js as text, in its own layout (one line for each size), so that a
// refresh changes only the lines of the sizes that changed.
export function sizesText(readUtc, how, { sizes, differsByRegion }) {
    const q = JSON.stringify;
    const size = (n, s) => `    ${q(n)}: {"family": ${q(s.family)}, "capabilities": {${Object.entries(s.capabilities).map(([k, v]) => `${q(k)}: ${q(v)}`).join(', ')}}}`;
    const names = Object.keys(sizes);
    return ['export default {', `  "readUtc": ${q(readUtc)},`, `  "sizeCount": ${names.length},`, `  "how": ${q(how)},`,
        differsByRegion.length ? `  "differsByRegion": [\n${differsByRegion.map((d) => `    ${q(d)}`).join(',\n')}\n  ],` : '  "differsByRegion": [],',
        '  "sizes": {', names.map((n) => size(n, sizes[n])).join(',\n'), '  }', '};', ''].join('\n');
}

async function readSizes(subscription) {
    const regions = await physicalRegions(subscription);
    const per = [];
    for (const r of regions) per.push(await regionSizes(subscription, r));
    return { regions, ...mergeRegions(per) };
}

// The difference between two size tables, as lines for a report.
export function diffSizes(before, now) {
    const lines = [];
    for (const n of Object.keys(now)) if (!before[n]) lines.push(`Added: ${n}`);
    for (const n of Object.keys(before)) if (!now[n]) lines.push(`Removed: ${n}`);
    for (const n of Object.keys(now)) {
        if (!before[n]) continue;
        for (const c of CAPABILITIES) {
            const x = before[n].capabilities[c], y = now[n].capabilities[c];
            if (x !== y) lines.push(`Changed: ${n} ${c} ${x ?? '(none)'} -> ${y ?? '(none)'}`);
        }
    }
    return lines.sort();
}

// ---------------------------------------------------------------------------
// The NVA policy
// ---------------------------------------------------------------------------

async function readNvaPolicy() {
    const p = (await get(`/providers/Microsoft.Authorization/policyDefinitions/${NVA_POLICY}?api-version=2023-04-01`)).properties;
    return {
        version: p.metadata?.version || '',
        publishers: p.parameters.allowedPublishers.defaultValue,
        offers: p.parameters.allowedOffers.defaultValue,
    };
}

// ---------------------------------------------------------------------------
// The Marketplace catalog
// ---------------------------------------------------------------------------

const like = (value, pattern) => new RegExp(`^${pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*')}$`, 'i').test(String(value));

async function readCatalog(subscription, publishers) {
    const allPublishers = new Set();
    const offers = {};
    for (const region of CATALOG_REGIONS) {
        const base = `/subscriptions/${subscription}/providers/Microsoft.Compute/locations/${region}/publishers`;
        for (const p of await get(`${base}?api-version=2024-07-01`)) allPublishers.add(p.name);
        for (const p of publishers) {
            let list = [];
            try {
                list = (await get(`${base}/${encodeURIComponent(p)}/artifacttypes/vmimage/offers?api-version=2024-07-01`)).map((o) => o.name);
            } catch (e) {
                if (e.status !== 404) throw e;   // only "this publisher has no images here" means none
            }
            offers[p] = [...new Set([...(offers[p] || []), ...list])].sort();
        }
    }
    return { allPublishers: [...allPublishers].sort(), offers };
}

// What the catalog says against our list: offers of a listed vendor that no pattern
// covers (to review), patterns that match no offer (gone?), and possible new vendors.
export function catalogFindings(list, catalog) {
    const lines = [];
    for (const v of list.vendors) {
        const offers = catalog.offers[v.publisher] || [];
        if (!offers.length) { lines.push(`No offers found for ${v.vendor} (publisher ${v.publisher}).`); continue; }
        for (const o of offers) {
            if (!v.offers.some((p) => like(o, p)) && !(list.reviewed || []).includes(`${v.publisher}/${o}`)) lines.push(`New offer to review: ${v.vendor}: ${v.publisher}/${o}`);
        }
        for (const p of v.offers) if (p !== '*' && !offers.some((o) => like(o, p))) lines.push(`No offer matches ${v.publisher}/${p} any more.`);
    }
    for (const p of list.notVendors || []) {
        for (const o of catalog.offers[p] || []) {
            if (!(list.reviewed || []).includes(`${p}/${o}`)) lines.push(`New image from a publisher marked "not a vendor": ${p}/${o}`);
        }
    }
    const known = new Set([...list.vendors.map((v) => v.publisher.toLowerCase()), ...(list.notVendors || []).map((p) => p.toLowerCase())]);
    for (const p of catalog.allPublishers) if (VENDOR_WORDS.test(p) && !known.has(p.toLowerCase())) lines.push(`Possible new vendor: publisher ${p}`);
    return lines.sort();
}

// ---------------------------------------------------------------------------
// Reports and the data files
// ---------------------------------------------------------------------------

const code = (t) => `\`${String(t).replace(/`/g, "'")}\``;
function report(id, title, intro, lines, todo) {
    const print = createHash('sha256').update(JSON.stringify(lines)).digest('hex').slice(0, 16);
    const shown = lines.slice(0, 400);
    const body = [intro, '', ...shown.map((l) => `- ${code(l)}`), lines.length > shown.length ? `\n... and ${lines.length - shown.length} more.` : '',
        '', '## What to do', '', ...todo, '', `<!-- source-check-fingerprint: ${print} -->`].join('\n');
    writeFileSync(new URL(`watch-report/${id}.md`, root), `# Source check: ${title}\n${body}\n`);
}
const ok = (id, title) => writeFileSync(new URL(`watch-report/${id}.ok`, root), `Source check: ${title}\n`);

async function main() {
    const update = process.argv.includes('--update');
    mkdirSync(new URL('watch-report/', root), { recursive: true });
    const titles = [['azure-sizes', 'Azure VM sizes (data/sizes.js)'], ['azure-nva', 'NVA policy (data/nva-images.js)'],
        ['azure-catalog', 'Storage and backup appliances in the Marketplace (data/storage-appliance-images.js)']];
    let signedIn;
    try {
        signedIn = signIn();
    } catch (e) {
        // No token: say so for each Azure source, so that the problem gets an issue.
        for (const [id, title] of titles) report(id, title, '**This check cannot sign in to Azure.** The read-only sign-in of the workflow failed, or the Azure CLI is not signed in.', [], ['Check the `azure-read` environment and its secrets, and the federated credential of the app registration.']);
        console.log('Cannot sign in to Azure: reports written.');
        return;
    }
    const subscription = process.env.AZURE_SUBSCRIPTION_ID || signedIn;
    const sizesFile = (await import(new URL('data/sizes.js', root))).default;
    const nvaFile = (await import(new URL('data/nva-images.js', root))).default;
    const storageFile = (await import(new URL('data/storage-appliance-images.js', root))).default;

    // The size table.
    const t = 'Azure VM sizes (data/sizes.js)';
    try {
        const now = await readSizes(subscription);
        console.log(`sizes: ${Object.keys(now.sizes).length} sizes in ${now.regions.length} regions`);
        if (update) {
            const head = readFileSync(new URL('data/sizes.js', root), 'utf8').split('export default')[0];
            writeFileSync(new URL('data/sizes.js', root), head + sizesText(today, sizesFile.how, now));
        } else {
            const lines = diffSizes(sizesFile.sizes, now.sizes);
            if (lines.length) report('azure-sizes', t, `**Azure's size list changed.** The weekly check on ${today} found ${lines.length} differences from data/sizes.js (read ${sizesFile.readUtc}).`, lines,
                ['1. Run `node tools/azure-sources.mjs --update` (after `az login`) to rebuild data/sizes.js.', '2. Run the tests, and check the planner with the sample lists, in a pull request.']);
            else ok('azure-sizes', t);
        }
    } catch (e) { report('azure-sizes', t, `**This check cannot read Azure's size list.** Reason: ${e.message.split('\n')[0]}`, [], ['Check the Azure sign-in of the workflow.']); console.log(`sizes: ${e.message.split('\n')[0]}`); }

    // The NVA policy.
    const n = 'NVA policy (data/nva-images.js)';
    try {
        const now = await readNvaPolicy();
        console.log(`nva: version ${now.version}, ${now.publishers.length} publishers, ${now.offers.length} offers`);
        if (update) {
            const text = readFileSync(new URL('data/nva-images.js', root), 'utf8')
                // Replacements are functions: a "$" in a policy value stays as it is.
                .replace(/"readUtc": "[^"]*"/, () => `"readUtc": "${today}"`).replace(/"policyVersion": "[^"]*"/, () => `"policyVersion": ${JSON.stringify(now.version)}`)
                .replace(/"publishers": \[[\s\S]*?\]/, () => `"publishers": ${JSON.stringify(now.publishers, null, 2).replace(/\n/g, '\n  ')}`)
                .replace(/"offers": \[[\s\S]*?\]/, () => `"offers": ${JSON.stringify(now.offers, null, 2).replace(/\n/g, '\n  ')}`);
            writeFileSync(new URL('data/nva-images.js', root), text);
        } else {
            const lines = [];
            if (now.version !== nvaFile.policyVersion) lines.push(`Version ${nvaFile.policyVersion} -> ${now.version}`);
            for (const [k, a, b] of [['publisher', nvaFile.publishers, now.publishers], ['offer', nvaFile.offers, now.offers]]) {
                for (const x of b) if (!a.includes(x)) lines.push(`Added ${k}: ${x}`);
                for (const x of a) if (!b.includes(x)) lines.push(`Removed ${k}: ${x}`);
            }
            if (lines.length) report('azure-nva', n, `**The NVA policy changed.** The weekly check on ${today} found a difference from data/nva-images.js.`, lines,
                ['1. Run `node tools/azure-sources.mjs --update` to rebuild data/nva-images.js.', '2. Check the NetApp entry: the policy lists the storage vendor NetApp (see docs/workload-patterns.md).']);
            else ok('azure-nva', n);
        }
    } catch (e) { report('azure-nva', n, `**This check cannot read the NVA policy.** Reason: ${e.message.split('\n')[0]}`, [], ['Check the Azure sign-in of the workflow.']); console.log(`nva: ${e.message.split('\n')[0]}`); }

    // The Marketplace catalog: never changed by --update (the list is ours).
    const c = 'Storage and backup appliances in the Marketplace (data/storage-appliance-images.js)';
    if (!update) {
        try {
            const now = await readCatalog(subscription, [...storageFile.vendors.map((v) => v.publisher), ...(storageFile.notVendors || [])]);
            const lines = catalogFindings(storageFile, now);
            console.log(`catalog: ${now.allPublishers.length} publishers, ${lines.length} findings`);
            if (lines.length) report('azure-catalog', c, `**The Marketplace has offers or publishers to review.** The weekly check on ${today} compared the catalog (${CATALOG_REGIONS.join(', ')}) with data/storage-appliance-images.js.`, lines,
                ['1. For each line, decide: an appliance (add it to `vendors`), or not (add `publisher/offer` to `reviewed`, or the publisher to `notVendors`).', '2. Change data/storage-appliance-images.js in a pull request.']);
            else ok('azure-catalog', c);
        } catch (e) { report('azure-catalog', c, `**This check cannot read the Marketplace catalog.** Reason: ${e.message.split('\n')[0]}`, [], ['Check the Azure sign-in of the workflow.']); console.log(`catalog: ${e.message.split('\n')[0]}`); }
    }
}

if (process.argv[1] && /[\\/]tools[\\/]azure-sources\.mjs$/.test(process.argv[1])) await main();
