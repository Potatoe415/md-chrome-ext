// Copies the Markdown Reader of muchotools into reader/ (and its font into fonts/).
// Source folder: $MUCHOTOOLS_DIR, else ../muchotools next to this project.
import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = process.env.MUCHOTOOLS_DIR ?? join(root, '..', 'muchotools');
const out = join(root, 'reader');
const read = (p) => readFileSync(join(src, p), 'utf8');

function patch(text, from, to, what) {
  const next = text.replace(from, to);
  if (next === text) throw new Error(`sync-reader: "${what}" not found, upstream changed`);
  return next;
}

// Script order comes from the page that loads them upstream.
const astro = read('src/pages/md.astro');
const list = /const scripts = \[([\s\S]*?)\]\.map/.exec(astro);
if (!list) throw new Error('sync-reader: script list not found in src/pages/md.astro');
const scripts = [...list[1].matchAll(/'([\w-]+)'/g)].map((m) => m[1]);

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
mkdirSync(join(root, 'fonts'), { recursive: true });

copyFileSync(join(src, 'public/vendor/marked.umd.js'), join(out, 'marked.umd.js'));

// Chrome refuses to inject a file holding Unicode noncharacters ("isn't UTF-8 encoded"):
// written as \u escapes they mean the same in strings and regular expressions.
const escapeNonchars = (code) =>
  code.replace(/[\uFDD0-\uFDEF\uFFFE\uFFFF]/g, (c) => `\\u${c.charCodeAt(0).toString(16).toUpperCase()}`);

for (const name of scripts) {
  let code = escapeNonchars(read(`public/markdown-reader/${name}.js`));
  if (name === 'files') {
    code = patch(code, "{href: '/epub/'", "{href: 'https://muchotools.com/epub/'", 'EPUB Reader link');
  }
  writeFileSync(join(out, `${name}.js`), code);
}

writeFileSync(
  join(out, 'scripts.js'),
  `self.READER_SCRIPTS = ${JSON.stringify(scripts)};\n`,
);

// The font is registered by src/mount.js: a url() in injected CSS resolves against the page.
writeFileSync(
  join(out, 'design.css'),
  patch(read('src/shared/design.css'), /@font-face\s*\{[^}]*\}\s*/, '', '@font-face'),
);
copyFileSync(join(src, 'src/modules/markdown-reader/page.css'), join(out, 'page.css'));
copyFileSync(join(src, 'public/fonts/dm-sans-latin-wght.woff2'), join(root, 'fonts/dm-sans-latin-wght.woff2'));
copyFileSync(join(src, 'public/fonts/DM-Sans-OFL.txt'), join(root, 'fonts/DM-Sans-OFL.txt'));

let page = read('src/modules/markdown-reader/page.html');
page = patch(page, /\s*<a href="\/" class="home-link"[\s\S]*?<\/a>/, '', 'home link');
page = patch(page, /\s*<!-- app-launcher -->/, '', 'app launcher slot');
page = patch(page, /\s*<section class="about"[\s\S]*?<\/section>/, '', 'tool guide');
writeFileSync(join(out, 'page-html.js'), `"use strict";\nconst MR_PAGE = ${JSON.stringify(page)};\n`);

let commit = 'unknown';
try {
  commit = execFileSync('git', ['-C', src, 'rev-parse', '--short', 'HEAD'], { encoding: 'utf8' }).trim();
} catch {}
writeFileSync(join(out, 'SOURCE.txt'), `muchotools ${commit}\n${scripts.length} scripts: ${scripts.join(', ')}\n`);

console.log(`reader/ synced from ${src} (${commit})`);
