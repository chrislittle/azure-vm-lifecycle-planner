// Sets the release version: node tools/set-version.mjs 0.1.0-beta
//
// Every link from the page to its own files carries ?v=<version>, so after an
// update a browser loads the new files together and never mixes them with old
// ones it keeps in its cache. This is not a build step: it only edits the
// version text in the files, which stay plain and readable.
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';

const version = process.argv[2];
if (!/^\d+\.\d+\.\d+(-[a-z0-9.]+)?$/.test(version || '')) {
    console.error('Give a version, for example: node tools/set-version.mjs 0.1.0-beta');
    process.exit(1);
}
const root = new URL('../', import.meta.url);
const edit = (path, fn) => {
    const url = new URL(path, root);
    const before = readFileSync(url, 'utf8');
    const after = fn(before);
    if (after !== before) writeFileSync(url, after);
};

writeFileSync(new URL('js/version.js', root), `// The release version. Set it with tools/set-version.mjs.\nexport default '${version}';\n`);
for (const f of readdirSync(new URL('js/', root))) {
    edit(`js/${f}`, (s) => s.replace(/(from\s+['"])(\.{1,2}\/[^'"?]+\.js)(\?v=[^'"]*)?(['"])/g, `$1$2?v=${version}$4`));
}
edit('index.html', (s) => s
    .replace(/(href="style\.css)(\?v=[^"]*)?"/, `$1?v=${version}"`)
    .replace(/(src="js\/page\.js)(\?v=[^"]*)?"/, `$1?v=${version}"`));
console.log(`Version set to ${version}.`);
