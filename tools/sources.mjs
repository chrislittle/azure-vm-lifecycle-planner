// The Microsoft Learn pages that the tool's data and words come from, and how to read
// the facts from each one. tools/watch-sources.mjs reads them each week and compares
// them with tools/source-snapshot.json (what we read at the last refresh).
//
// It reads the published pages, not a GitHub repo: Microsoft retires most public
// Microsoft Learn documentation repos by the end of December 2026.
// It reads the whole article - every sentence, list item and table row - because
// some facts are only in a sentence (for example "v6 and v7 series are Current").
// This runs in GitHub Actions or on a computer, never in the page.

const LEARN = 'https://learn.microsoft.com/en-us';
const VM = `${LEARN}/azure/virtual-machines`;

// Every Microsoft Learn page that data/*.js or js/*.js cites (a test keeps this list
// complete). id: the file name of its report; name: for the issue title.
export const SOURCES = [
    ['retirements', 'Retirements and capacity growth restrictions', `${VM}/sizes/lifecycle/retirements-and-capacity-restrictions`],
    ['end-of-life', 'End of Life sizes list', `${VM}/sizes/lifecycle/end-of-life-sizes-list`],
    ['lifecycle', 'Lifecycle overview', `${VM}/sizes/lifecycle/lifecycle-overview`],
    ['v6-v7-overview', 'v6 and v7 modernization overview', `${VM}/sizes/lifecycle/sizes-v6-v7-modernization-overview`],
    ['v6-v7-plan', 'v6 and v7 modernization plan', `${VM}/sizes/lifecycle/sizes-v6-v7-modernization-plan`],
    ['v5-overview', 'v5 modernization overview', `${VM}/sizes/lifecycle/sizes-v5-modernization-overview`],
    ['retired-guide', 'Retired sizes modernization guide', `${VM}/sizes/lifecycle/retirement/retired-sizes-modernization-guide`],
    ['av1-retirement', 'Av1 series retirement', `${VM}/sizes/lifecycle/retirement/av1-series-retirement`],
    ['nvme', 'OS images that support NVMe', `${VM}/enable-nvme-interface`],
    ['naming', 'VM naming conventions', `${VM}/vm-naming-conventions`],
    ['disk-encryption', 'Migrate from Azure Disk Encryption to encryption at host', `${VM}/disk-encryption-migrate`],
    ['b-family', 'B family sizes', `${VM}/sizes/general-purpose/b-family`],
    ['dsv5', 'Dsv5 series', `${VM}/sizes/general-purpose/dsv5-series`],
    ['dv4', 'Dv4 series', `${VM}/sizes/general-purpose/dv4-series`],
    ['ddv4', 'Ddv4 series', `${VM}/sizes/general-purpose/ddv4-series`],
    ['dav4', 'Dav4 series', `${VM}/sizes/general-purpose/dav4-series`],
    ['dasv4', 'Dasv4 series', `${VM}/sizes/general-purpose/dasv4-series`],
    ['ev5', 'Ev5 series', `${VM}/sizes/memory-optimized/ev5-series`],
    ['ev4', 'Ev4 series', `${VM}/sizes/memory-optimized/ev4-series`],
    ['edv4', 'Edv4 series', `${VM}/sizes/memory-optimized/edv4-series`],
    ['eav4', 'Eav4 series', `${VM}/sizes/memory-optimized/eav4-series`],
    ['easv4', 'Easv4 series', `${VM}/sizes/memory-optimized/easv4-series`],
    ['capacity-resilience', 'Well-Architected Framework: capacity resilience', `${LEARN}/azure/well-architected/design-guides/capacity-resilience`],
].map(([id, name, url]) => ({ id, name, url }));

const point = (n) => { try { return String.fromCodePoint(n); } catch { return ' '; } };
const decode = (s) => s
    .replace(/&nbsp;|&#160;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
    .replace(/&#39;|&#x27;|&apos;/g, "'").replace(/&#(\d+);/g, (_, n) => point(+n))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => point(parseInt(n, 16))).replace(/&amp;/g, '&');
const inline = (h) => decode(h.replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim();

// The article: after the page's metadata block, before its feedback section. Both
// marks are on every Microsoft Learn page; without them the page is not read.
export function articleOf(html) {
    const meta = html.indexOf('id="article-metadata"');
    const start = meta < 0 ? -1 : html.indexOf('<div class="content">', meta);
    const mark = html.indexOf('id="site-user-feedback-footer"');
    const end = mark < 0 ? -1 : html.lastIndexOf('<', mark);   // the start of that tag
    if (start < 0 || end < 0 || end < start) throw new Error('The page does not have the Microsoft Learn article layout. Microsoft can have changed the page.');
    return html.slice(start, end);
}

// Every line of the article, as "section heading :: text". A table row reads
// "section :: header 1 | header 2 = cell 1 | cell 2". Code samples (<pre>) and
// footnote numbers (<sup>) are left out: they change often and mean nothing here.
export function readArticle(html) {
    let a = articleOf(html)
        .replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<style[\s\S]*?<\/style>/gi, '')
        .replace(/<pre[\s\S]*?<\/pre>/gi, '')
        // Footnote marks only (1, 2, *): a <sup> with words in it is text.
        .replace(/<sup[^>]*>\s*[\d,*†‡]+\s*<\/sup>/gi, '')
        // The tab bar and the alert labels ("Note", "Important") are not facts.
        .replace(/<ul[^>]*role="tablist"[\s\S]*?<\/ul>/gi, '').replace(/(<div class="(NOTE|IMPORTANT|WARNING|TIP|CAUTION)"[^>]*>\s*)<p>[^<]*<\/p>/g, '$1')
        .replace(/<!--[\s\S]*?-->/g, '');
    const tables = [];
    a = a.replace(/<table[\s\S]*?<\/table>/gi, (t) => {
        const rows = (t.match(/<tr[\s\S]*?<\/tr>/gi) || []).map((r) => (r.match(/<t[hd][\s\S]*?<\/t[hd]>/gi) || []).map(inline));
        tables.push(rows);
        return `\n\u0000T${tables.length - 1}\u0000\n`;
    });
    // Headings keep their level; other block tags end a line. Inline tags (links,
    // bold, code) stay inside the line.
    // A tab panel is a section of its own, named by its tab: its lines do not take
    // the heading of the tab before it.
    a = a.replace(/<section[^>]*role="tabpanel"[^>]*data-tab="([^"]*)"[^>]*>/gi, (_, tab) => `\n\u0001t${tab}\n`);
    a = a.replace(/<h([1-4])\b[^>]*>([\s\S]*?)<\/h\1>/gi, (_, l, t) => `\n\u0001${l}${inline(t)}\n`)
        .replace(/<\/?(p|li|ul|ol|div|br|dt|dd|dl|section|blockquote|tr|td|th|table|tbody|thead)\b[^>]*>/gi, '\n');
    const facts = [];
    const path = [];
    for (const raw of a.split('\n')) {
        const line = raw.trim();
        if (!line) continue;
        if (line.startsWith('\u0001')) {
            // Levels: h1 and h2, then h3, then a tab, then h4.
            const at = { 1: 0, 2: 0, 3: 1, t: 2, 4: 3 }[line[1]];
            path.length = at;
            path[at] = line[1] === 't' ? `tab ${line.slice(2)}` : line.slice(2);
            continue;
        }
        const section = path.filter((x) => x).join(' > ') || '(top)';
        const t = /^\u0000T(\d+)\u0000$/.exec(line);
        if (t) {
            const rows = tables[Number(t[1])];
            const head = (rows[0] || []).join(' | ');
            for (const r of rows.slice(1)) if (r.some((c) => c)) facts.push(`${section} :: ${head} = ${r.join(' | ')}`);
            continue;
        }
        const text = inline(line);
        if (text) facts.push(`${section} :: ${text}`);
    }
    return facts;
}

// The date of the last change to the page, as Microsoft Learn shows it ("Last
// updated on"): the updated_at meta tag. '' when there is none.
export function pageDate(html) {
    const m = /<meta name="updated_at" content="(\d{4}-\d{2}-\d{2})/i.exec(html);
    return m ? m[1] : '';
}

// Read one source: { facts: [...] (sorted, duplicates kept), pageUpdatedUtc }, or
// throws with the reason.
export async function readSource(source, fetchText) {
    const html = await fetchText(source.url);
    const facts = readArticle(html);
    if (facts.length < 3) throw new Error(`The article has only ${facts.length} lines. Microsoft can have changed the page.`);
    return { facts: facts.sort(), pageUpdatedUtc: pageDate(html) };
}

// The difference between two lists of facts, with duplicates counted:
// { added, removed }.
export function diffFacts(before, now) {
    const count = (list) => list.reduce((m, f) => m.set(f, (m.get(f) || 0) + 1), new Map());
    const b = count(before), n = count(now);
    const added = [], removed = [];
    for (const [f, k] of n) for (let i = b.get(f) || 0; i < k; i++) added.push(f);
    for (const [f, k] of b) for (let i = n.get(f) || 0; i < k; i++) removed.push(f);
    return { added, removed };
}
