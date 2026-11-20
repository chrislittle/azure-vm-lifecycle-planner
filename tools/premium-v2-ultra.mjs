// The uncached limits for Ultra Disk and Premium SSD v2 of each v6 and v7 size that this
// tool suggests (data/premium-v2-ultra-limits.js, 0.9.8-beta).
//
// Azure's resource SKU list gives one uncached disk limit for each size (UncachedDiskIOPS,
// UncachedDiskBytesPerSecond): the Premium SSD column of the size pages. The v6 and v7 size
// pages on Microsoft Learn also give a second, separate column, "Uncached Ultra Disk and
// Premium SSD v2 IOPS" and "... Throughput (MBps)" (Standard_D2s_v6: 3,750 IOPS for Premium
// SSD, 4,167 IOPS for Premium SSD v2 and Ultra Disk). The v5 pages have no such column.
//
// This tool reads that column from the pages as they are in tools/source-snapshot.json,
// not from the network, so the data file is always what the snapshot says:
//
//   node tools/watch-sources.mjs --update      save what the pages say now (the weekly check)
//   node tools/premium-v2-ultra.mjs --update   rebuild data/premium-v2-ultra-limits.js from it
//   node tools/premium-v2-ultra.mjs            check: exit 1 when the data file is not the same
//
// A test checks that the data file is what this tool writes from the snapshot. When the
// weekly check opens an issue for one of these pages, run both commands, then the tests.
import { readFileSync, writeFileSync } from 'node:fs';

const root = new URL('../', import.meta.url);

// The pages (ids of tools/sources.mjs): each v6 and v7 series that this tool suggests.
export const PAGE_IDS = ['dsv6', 'ddsv6', 'dlsv6', 'dldsv6', 'dasv6', 'dadsv6', 'dalsv6', 'daldsv6', 'esv6', 'edsv6', 'easv6', 'eadsv6', 'ebsv6', 'ebdsv6', 'falsv6',
    'dsv7', 'ddsv7', 'dlsv7', 'dldsv7', 'dasv7', 'dadsv7', 'dalsv7', 'daldsv7', 'esv7', 'edsv7', 'easv7', 'eadsv7', 'falsv7', 'faldsv7'];

// A number as the page writes it: "4,167" -> 4167. null for anything else (a dash, "N/A").
const number = (text) => { const t = String(text ?? '').replace(/,/g, '').trim(); return /^\d+$/.test(t) ? Number(t) : null; };

// The column from the lines of one page (tools/sources.mjs, readArticle): a table row reads
// "section :: header 1 | header 2 = cell 1 | cell 2". { size: { iops, mbps } }, in the order
// of the page. A size with no number in either column is left out: no value is made up.
export function ultraLimits(facts) {
    const out = {};
    for (const f of facts) {
        const row = /^[^:]*tab sizestorageremote :: (.*?) = (.*)$/.exec(f);
        if (!row) continue;
        const head = row[1].split(' | ');
        const cells = row[2].split(' | ');
        const iops = head.findIndex((h) => /^Uncached Ultra Disk and Premium SSD v2 IOPS$/i.test(h));
        const mbps = head.findIndex((h) => /^Uncached Ultra Disk and Premium SSD v2 Throughput \((MBps|MB\/s)\)$/i.test(h));
        if (iops < 0 && mbps < 0) continue;
        const v = { iops: iops < 0 ? null : number(cells[iops]), mbps: mbps < 0 ? null : number(cells[mbps]) };
        if (/^Standard_/.test(cells[0]) && (v.iops !== null || v.mbps !== null)) out[cells[0]] = v;
    }
    return out;
}

// The data of the file, from the snapshot: { pages: [{ id, url, updatedUtc, readUtc, sizes }] }.
// The address without "/en-us", as the other data files cite a page.
export function limitsData(snapshot) {
    return {
        pages: PAGE_IDS.map((id) => {
            const s = snapshot[id];
            if (!s) throw new Error(`The page ${id} is not in tools/source-snapshot.json. Add it to tools/sources.mjs and run node tools/watch-sources.mjs --update.`);
            const sizes = ultraLimits(s.facts);
            if (!Object.keys(sizes).length) throw new Error(`The page ${id} has no column "Uncached Ultra Disk and Premium SSD v2 IOPS" in the snapshot. Check the page.`);
            return { id, url: s.url.replace('https://learn.microsoft.com/en-us/', 'https://learn.microsoft.com/'), updatedUtc: s.pageUpdatedUtc, readUtc: s.readUtc, sizes };
        }),
    };
}

// data/premium-v2-ultra-limits.js as text: one line for each size, so that a change of a page
// changes only its lines.
export function limitsText(data) {
    const q = JSON.stringify;
    const page = (p) => [`    {"id": ${q(p.id)}, "url": ${q(p.url)}, "updatedUtc": ${q(p.updatedUtc)}, "readUtc": ${q(p.readUtc)}, "sizes": {`,
        Object.entries(p.sizes).map(([n, v]) => `      ${q(n)}: {"iops": ${q(v.iops)}, "mbps": ${q(v.mbps)}}`).join(',\n'), '    }}'].join('\n');
    return ['// The uncached limits for Ultra Disk and Premium SSD v2 of each v6 and v7 size that this tool',
        '// suggests: a separate column on the Microsoft Learn size page of each series. Azure\'s',
        '// resource SKU list (data/sizes.js) gives only the Premium SSD column. iops: IOPS; mbps: MBps',
        '// (10^6 bytes per second, as the pages say). updatedUtc: the date that Microsoft Learn shows',
        '// for the page; readUtc: the day this tool read it. Made by tools/premium-v2-ultra.mjs from',
        '// tools/source-snapshot.json: do not change it by hand.',
        'export default {', '  "pages": [', data.pages.map(page).join(',\n'), '  ]', '};', ''].join('\n');
}

async function main() {
    const snapshot = JSON.parse(readFileSync(new URL('tools/source-snapshot.json', root), 'utf8'));
    const text = limitsText(limitsData(snapshot));
    const file = new URL('data/premium-v2-ultra-limits.js', root);
    if (process.argv.includes('--update')) {
        writeFileSync(file, text);
        console.log('data/premium-v2-ultra-limits.js written from the snapshot. Run node tools/readme-facts.mjs and the tests.');
        return;
    }
    const now = readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
    if (now !== text) { console.log('data/premium-v2-ultra-limits.js is not what the snapshot gives. Run node tools/premium-v2-ultra.mjs --update.'); process.exit(1); }
    console.log('data/premium-v2-ultra-limits.js agrees with the snapshot.');
}

// Run only as a command, not when a test imports it.
if (process.argv[1] && /[\\/]tools[\\/]premium-v2-ultra\.mjs$/.test(process.argv[1])) await main();
