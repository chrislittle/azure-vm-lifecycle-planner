// Copies query.kql and the sample list into the page: node tools/copy-files.mjs
//
// The page cannot read a file with fetch (its Content-Security-Policy stops every
// network request), so js/query.js and js/sample.js hold the same text as a module.
// Run this after a change to query.kql or samples/contoso-from-azure.csv. A test
// checks that the copies are the same as the files.
import { readFileSync, writeFileSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const copy = (from, to, comment) => {
    const text = readFileSync(new URL(from, root), 'utf8').replace(/\r\n/g, '\n');
    // String.raw keeps every backslash as it is. The files have no ` and no ${.
    if (text.includes('`') || text.includes('${')) throw new Error(`${from} has a \` or \${: it cannot go in a template literal.`);
    writeFileSync(new URL(to, root), `${comment}\nexport default String.raw\`${text}\`;\n`);
    console.log(`${from} -> ${to}`);
};
copy('query.kql', 'js/query.js',
    '// The Azure Resource Graph query, as shown on the page. The same text as query.kql\n// (tools/copy-files.mjs makes this file; a test keeps the two identical).');
copy('samples/contoso-from-azure.csv', 'js/sample.js',
    '// The sample list behind "Try the sample": samples/contoso-from-azure.csv\n// (tools/copy-files.mjs makes this file; a test keeps the two identical). Made-up machines.');
