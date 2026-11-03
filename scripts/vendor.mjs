import { copyFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const vendorDir = join(root, 'vendor');

const files = [
  ['node_modules/marked/lib/marked.umd.js', 'marked.umd.js'],
  ['node_modules/dompurify/dist/purify.min.js', 'purify.min.js'],
  ['node_modules/@highlightjs/cdn-assets/highlight.min.js', 'highlight.min.js'],
];

mkdirSync(vendorDir, { recursive: true });
for (const [from, to] of files) {
  copyFileSync(join(root, from), join(vendorDir, to));
  console.log(`vendor/${to}`);
}
