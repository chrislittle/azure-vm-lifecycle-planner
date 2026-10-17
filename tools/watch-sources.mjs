// Weekly check of the Microsoft Learn pages (tools/sources.mjs) against
// tools/source-snapshot.json, the facts we read at the last refresh.
//
//   node tools/watch-sources.mjs              check: one report for each page
//   node tools/watch-sources.mjs --update     after a refresh: save what the pages say now,
//                                             and write the README facts of the data
//
// The check never changes the data files. For each page it writes to watch-report/:
//   <id>.md   the page changed, or this check cannot read it (the workflow opens or
//             comments on a GitHub issue);
//   <id>.ok   the page is the same as the snapshot (the workflow closes an open issue).
// Exit code 0 when it ran: a change is not a failure of the check.
import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { SOURCES, readSource, diffFacts } from './sources.mjs';
import { factsFrom, readmeSection, writeReadme } from './readme-facts.mjs';

const root = new URL('../', import.meta.url);
const snapshotUrl = new URL('tools/source-snapshot.json', root);
const MAX_BODY = 60000;   // GitHub's limit for an issue body is 65,536 characters

// A fact in a report: in a code span, so that page text cannot mention a person
// (@name), link an issue (#12) or make a link.
const code = (t) => `\`${String(t).replace(/`/g, "'")}\``;

// The issue title: one for each page, whatever the problem.
export const titleOf = (s) => `Source check: ${s.name}`;

// Which repo files cite the page (data and code), for "what to do".
function citedBy(url) {
    const path = url.replace(/^https:\/\/learn\.microsoft\.com\/en-us/, '');
    const out = [];
    for (const dir of ['data', 'js']) {
        for (const f of readdirSync(new URL(`${dir}/`, root))) {
            if (readFileSync(new URL(`${dir}/${f}`, root), 'utf8').includes(path)) out.push(`${dir}/${f}`);
        }
    }
    return out;
}

// The report for a page that changed: Markdown, at most MAX_BODY characters.
export function changeReport(s, before, now, today) {
    const { added, removed } = diffFacts(before.facts, now.facts);
    if (!added.length && !removed.length) return null;
    const many = added.length + removed.length > before.facts.length / 2;
    const lines = [
        `**The page changed.** The weekly check on ${today} found a difference in ${s.url}.`,
        `We last read it on ${before.readUtc}. Microsoft shows "last updated" ${now.pageUpdatedUtc || '(no date)'}${before.pageUpdatedUtc ? ` (was ${before.pageUpdatedUtc})` : ''}.`,
        many ? '\nMany lines changed. Microsoft can have reorganized the page: compare the page by hand.' : '',
    ];
    const section = (title, items) => (items.length ? [`\n## ${title} (${items.length})\n`, ...items.map((f) => `- ${code(f)}`)] : []);
    const cited = citedBy(s.url);
    const tail = [
        // The README facts that come from this page. Not in the fingerprint: the
        // same page change keeps the same fingerprint.
        ...readmeSection(factsFrom(s.id), readFileSync(new URL('README.md', root), 'utf8')),
        '\n## What to do\n',
        `1. Check the change on the page. These files cite it: ${cited.join(', ') || '(none)'}.`,
        '2. Update the data or the words in a pull request, so that the tests run.',
        '3. In the same pull request, run `node tools/watch-sources.mjs --update` to save the new snapshot. It also writes the README facts of the data.',
        '4. The next weekly check closes this issue when the page and the snapshot agree.',
    ];
    // The same difference gives the same fingerprint: the workflow does not post it twice.
    const print = createHash('sha256').update(JSON.stringify([added, removed])).digest('hex').slice(0, 16);
    tail.push(`\n<!-- source-check-fingerprint: ${print} -->`);
    let body = [...lines, ...section('Added on the page', added), ...section('Removed from the page', removed), ...tail].join('\n');
    if (body.length > MAX_BODY) {
        const short = [...lines, `\n${added.length} lines added and ${removed.length} lines removed: too many to list here. Compare the page by hand.`, ...tail];
        body = short.join('\n');
    }
    return body;
}

export function unreadableReport(s, error, today) {
    return [
        `**This check cannot read the page.** The weekly check on ${today} could not read ${s.url}.`,
        '', `Reason: ${error}`, '',
        'Open the page and check it by hand. If the page moved or its layout changed, update tools/sources.mjs.',
        'The next weekly check closes this issue when it can read the page and the page agrees with the snapshot.',
        `\n<!-- source-check-fingerprint: unreadable-${createHash('sha256').update(String(error)).digest('hex').slice(0, 16)} -->`,
    ].join('\n');
}

// Fetch with a time limit, three tries, and no silent move to another page. After
// 8 minutes there are no more tries, so the job (limit 15 minutes) always gets to
// open the issues, also when Microsoft Learn is down.
const deadline = Date.now() + 8 * 60 * 1000;
async function fetchText(url) {
    let last;
    for (const wait of [0, 5000, 20000]) {
        if (Date.now() + wait > deadline) { if (last) break; throw new Error('The check ran out of time before it could read this page. Microsoft Learn can be slow or down.'); }
        if (wait) await new Promise((r) => setTimeout(r, wait));
        try {
            const res = await fetch(url, { signal: AbortSignal.timeout(20000),
                headers: { 'User-Agent': 'azure-vm-lifecycle-planner source check (https://github.com/chrislittle/azure-vm-lifecycle-planner)' } });
            const want = new URL(url).pathname.replace(/\/$/, '').toLowerCase();
            const got = new URL(res.url).pathname.replace(/\/$/, '').toLowerCase();
            if (new URL(res.url).host !== 'learn.microsoft.com' || got !== want) throw Object.assign(new Error(`The page moved to ${res.url}.`), { final: true });
            if (res.status === 404 || res.status === 410) throw Object.assign(new Error(`The page answered HTTP ${res.status}: it is gone.`), { final: true });
            if (!res.ok) throw new Error(`The page answered HTTP ${res.status}.`);
            return await res.text();
        } catch (e) {
            last = e;
            if (e.final) break;
        }
    }
    throw last;
}

async function main() {
    const update = process.argv.includes('--update');
    const force = process.argv.includes('--force');
    const today = new Date().toISOString().slice(0, 10);
    const outDir = new URL('watch-report/', root);
    const snapshot = existsSync(snapshotUrl) ? JSON.parse(readFileSync(snapshotUrl, 'utf8')) : {};
    rmSync(outDir, { recursive: true, force: true });
    mkdirSync(outDir, { recursive: true });

    const next = {};
    let needLook = 0, failed = 0;
    for (const s of SOURCES) {
        let now;
        try {
            now = await readSource(s, fetchText);
        } catch (e) {
            failed++; needLook++;
            writeFileSync(new URL(`${s.id}.md`, outDir), `# ${titleOf(s)}\n${unreadableReport(s, e.message, today)}\n`);
            console.log(`${s.id}: cannot read (${e.message})`);
            continue;
        }
        const before = snapshot[s.id];
        if (update) {
            // A page that suddenly has far fewer lines is more likely a broken read.
            if (before && now.facts.length < before.facts.length * 0.8 && !force) {
                failed++;
                console.log(`${s.id}: ${now.facts.length} lines, was ${before.facts.length}. Check the page; use --force to save it.`);
                continue;
            }
            next[s.id] = { name: s.name, url: s.url, readUtc: today, pageUpdatedUtc: now.pageUpdatedUtc, facts: now.facts };
            console.log(`${s.id}: ${now.facts.length} lines`);
            continue;
        }
        if (!before) {
            needLook++;
            writeFileSync(new URL(`${s.id}.md`, outDir), `# ${titleOf(s)}\n${unreadableReport(s, 'The page is not in tools/source-snapshot.json. Run node tools/watch-sources.mjs --update.', today)}\n`);
            console.log(`${s.id}: not in the snapshot`);
            continue;
        }
        const body = changeReport(s, before, now, today);
        if (body) {
            needLook++;
            writeFileSync(new URL(`${s.id}.md`, outDir), `# ${titleOf(s)}\n${body}\n`);
            console.log(`${s.id}: changed`);
        } else {
            writeFileSync(new URL(`${s.id}.ok`, outDir), `${titleOf(s)}\n`);
            console.log(`${s.id}: no change`);
        }
    }
    if (update) {
        if (failed) { console.log('Snapshot NOT saved: fix the pages above first.'); process.exit(1); }
        writeFileSync(snapshotUrl, JSON.stringify({ about: 'Text read from Microsoft Learn pages (c) Microsoft, kept only to find changes. See tools/sources.mjs.', ...next }, null, 2) + '\n');
        console.log('Snapshot saved.');
        // The README facts (read dates) come from the data files: write them too.
        const changed = await writeReadme();
        console.log(changed.length ? `README facts written: ${changed.join(', ')}.` : 'README facts agree with the data.');
        return;
    }
    console.log(`${needLook} page(s) need a look.`);
}

// Run only as a command, not when a test imports the report functions.
if (process.argv[1] && /[\\/]tools[\\/]watch-sources\.mjs$/.test(process.argv[1])) await main();
