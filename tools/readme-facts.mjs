// The README facts that come from the data files: counts, read dates and the version.
// Each one is between two invisible marks in README.md:
//   <!-- fact:sizes -->1,498 Azure VM sizes, read from Azure on 16 October 2026<!-- /fact -->
//
//   node tools/readme-facts.mjs           write the facts of the data files into README.md
//   node tools/readme-facts.mjs --check   exit 1 when README.md is not the same as the data
//
// A test checks that README.md is what this tool writes, so a data change that
// forgets the README fails the tests. tools/azure-sources.mjs --update,
// tools/watch-sources.mjs --update and tools/set-version.mjs run it. The weekly
// source check lists the facts that come from a source that changed.
import { readFileSync, writeFileSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

// 1498 -> "1,498" (no locale: the same text on every computer).
export const number = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');

// "a", "a and b", "a, b and c".
const list = (items) => (items.length < 2 ? items.join('') : `${items.slice(0, -1).join(', ')} and ${items.at(-1)}`);

// Read dates as words: ["2026-10-10", "2026-10-09"] -> "9 and 10 October 2026".
export function dates(isoDates) {
    const days = [...new Set(isoDates)].sort();
    if (!days.length || days.some((d) => !/^\d{4}-\d{2}-\d{2}$/.test(d))) throw new Error(`Not a list of dates: ${JSON.stringify(isoDates)}`);
    const groups = new Map();   // "October 2026" -> [9, 10]
    for (const d of days) {
        const key = `${MONTHS[Number(d.slice(5, 7)) - 1]} ${d.slice(0, 4)}`;
        groups.set(key, [...(groups.get(key) || []), Number(d.slice(8, 10))]);
    }
    return list([...groups].map(([month, ds]) => `${list(ds.map(String))} ${month}`));
}

// The storage and backup vendors that the README names, in its order. The README
// says "for example <these>, and N more vendors".
export const NAMED_VENDORS = ['NetApp', 'Pure Storage', 'Rubrik', 'Silk', 'Nasuni', 'Dell', 'Cohesity', 'WEKA', 'Veeam', 'Commvault'];

// A vendor is a company: the first word of its name. The list has some companies
// more than once (Dell has four publishers), and they count once.
const company = (name) => name.replace(/[^A-Za-z0-9 ]/g, ' ').trim().split(/\s+/)[0].toLowerCase();

// Each fact: its id (the name in the mark), the files it comes from, the sources
// that the weekly check reads for it (ids of tools/sources.mjs and of
// tools/azure-sources.mjs; the version comes from a release, not a source), where it
// is in the README (for an issue), the text before it that must not change, and its text.
export const FACTS = [
    {
        id: 'version', files: ['js/version.js'], sources: [], where: 'Status',
        text: (d) => d.version,
    },
    {
        id: 'sizes', files: ['data/sizes.js'], sources: ['azure-sizes'], where: 'Sources: size facts',
        text: (d) => {
            const count = Object.keys(d.sizes.sizes).length;
            if (count !== d.sizes.sizeCount) throw new Error(`data/sizes.js: sizeCount is ${d.sizes.sizeCount}, but it has ${count} sizes.`);
            return `${number(count)} Azure VM sizes, read from Azure on ${dates([d.sizes.readUtc])}`;
        },
    },
    {
        id: 'lifecycle-read', files: ['data/end-of-life.js', 'data/capacity.js'], sources: ['lifecycle', 'end-of-life', 'retirements'], where: 'Sources: lifecycle stages and retirement dates',
        text: (d) => dates([...d.endOfLife.sources.map((s) => s.readUtc), d.capacity.readUtc]),
    },
    {
        id: 'nvme-read', files: ['data/nvme-images.js'], sources: ['nvme'], where: 'Sources: NVMe support of the OS',
        text: (d) => dates([d.nvme.readUtc]),
    },
    {
        id: 'storage-vendors', files: ['data/storage-appliance-images.js'], sources: ['azure-catalog'], where: 'What the tool shows: storage and backup appliances',
        before: `${NAMED_VENDORS.join(', ')}, and `,
        text: (d) => {
            const all = new Set([...d.storage.vendors, ...(d.storage.galleries || [])].map((v) => company(v.vendor)));
            for (const v of NAMED_VENDORS) {
                if (!all.has(company(v))) throw new Error(`The README names ${v}, but data/storage-appliance-images.js does not have it. Change the README sentence and NAMED_VENDORS in tools/readme-facts.mjs.`);
            }
            const more = all.size - NAMED_VENDORS.length;
            if (more < 1) throw new Error('No vendor is left after the named ones. Change the README sentence and NAMED_VENDORS in tools/readme-facts.mjs.');
            return `${more} more ${more === 1 ? 'vendor' : 'vendors'}`;
        },
    },
];

// The data that the facts come from. A fresh read each time: the tools call this
// after they change a data file.
export async function loadData() {
    const load = async (p) => (await import(`${new URL(p, root).href}?read=${Date.now()}`)).default;
    return {
        version: await load('js/version.js'),
        sizes: await load('data/sizes.js'),
        endOfLife: await load('data/end-of-life.js'),
        capacity: await load('data/capacity.js'),
        nvme: await load('data/nvme-images.js'),
        storage: await load('data/storage-appliance-images.js'),
    };
}

// { id: text } for every fact. Throws when the data cannot give a fact.
export function factTexts(data) {
    return Object.fromEntries(FACTS.map((f) => [f.id, f.text(data)]));
}

// The text of one fact, from only the data that it needs.
export const factText = (id, data) => FACTS.find((f) => f.id === id).text(data);

const MARK = /<!-- fact:([a-z-]+) -->([\s\S]*?)<!-- \/fact -->/g;

// { id: text } as the README says it now. Throws when a mark is missing, twice,
// unknown, or at the start of a line (GitHub then shows the line as HTML, not text).
export function readFacts(readme) {
    const found = {};
    for (const m of readme.matchAll(MARK)) {
        const fact = FACTS.find((f) => f.id === m[1]);
        if (!fact) throw new Error(`README.md has a mark for an unknown fact: ${m[1]}.`);
        if (m[1] in found) throw new Error(`README.md has the mark for ${m[1]} two times.`);
        if (/(^|\n)[ \t]*$/.test(readme.slice(0, m.index))) throw new Error(`README.md: the mark for ${m[1]} is at the start of a line. Put text before it.`);
        if (fact.before && !readme.slice(0, m.index).replace(/\s+/g, ' ').endsWith(fact.before)) {
            throw new Error(`README.md: the text before ${m[1]} must be "${fact.before}".`);
        }
        found[m[1]] = m[2];
    }
    for (const f of FACTS) if (!(f.id in found)) throw new Error(`README.md has no mark for ${f.id}.`);
    return found;
}

// The README with each fact text put between its marks. Everything else stays.
export function fillReadme(readme, texts) {
    readFacts(readme);
    return readme.replace(MARK, (_, id) => `<!-- fact:${id} -->${texts[id]}<!-- /fact -->`);
}

// The facts that come from one source (an id of tools/sources.mjs or of
// tools/azure-sources.mjs), for an issue.
export const factsFrom = (source) => FACTS.filter((f) => f.sources.includes(source));

// The "## README" section of an issue: the facts that come from this source, what
// the README says now, and (when the check knows it) what the data will make it say.
// next: { id: text }. The section never goes into the fingerprint of an issue.
export function readmeSection(facts, readme, next = {}) {
    const lines = ['\n## README\n'];
    if (!facts.length) return [...lines, 'No README fact comes from this source.'];
    let now = {};
    try { now = readFacts(readme); } catch (e) { lines.push(`This check cannot read the facts in README.md: ${e.message}\n`); }
    lines.push('These facts in README.md come from the data of this source:', '');
    for (const f of facts) {
        const says = f.id in now ? `\`${now[f.id]}\`` : '(not found)';
        lines.push(`- ${f.where} (from ${f.files.join(', ')}): the README says ${says}.`
            + (f.id in next && next[f.id] !== now[f.id] ? ` With the data that this check read, the README says \`${next[f.id]}\`.` : ''));
    }
    lines.push('', 'After you change the data, run `node tools/readme-facts.mjs` in the same pull request. The tests fail when the README and the data do not agree.');
    return lines;
}

// Write the facts into README.md. Returns the ids of the facts that changed.
export async function writeReadme() {
    const url = new URL('README.md', root);
    const readme = readFileSync(url, 'utf8');
    const before = readFacts(readme);
    const texts = factTexts(await loadData());
    const after = fillReadme(readme, texts);
    if (after !== readme) writeFileSync(url, after);
    return FACTS.filter((f) => before[f.id] !== texts[f.id]).map((f) => f.id);
}

async function main() {
    if (process.argv.includes('--check')) {
        const readme = readFileSync(new URL('README.md', root), 'utf8');
        const now = readFacts(readme);
        const texts = factTexts(await loadData());
        const wrong = FACTS.filter((f) => now[f.id] !== texts[f.id]);
        for (const f of wrong) console.log(`${f.id}: the README says "${now[f.id]}", the data gives "${texts[f.id]}".`);
        if (wrong.length) { console.log('Run node tools/readme-facts.mjs to write them.'); process.exit(1); }
        console.log('README facts agree with the data.');
        return;
    }
    const changed = await writeReadme();
    console.log(changed.length ? `README facts written: ${changed.join(', ')}.` : 'README facts agree with the data.');
}

// Run only as a command, not when a test or another tool imports it.
if (process.argv[1] && /[\\/]tools[\\/]readme-facts\.mjs$/.test(process.argv[1])) await main();
