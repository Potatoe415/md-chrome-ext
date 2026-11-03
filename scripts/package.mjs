// Builds dist/markdown-coolreader-<version>.zip, the file to upload to the Chrome Web Store.
import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { crc32, deflateRawSync } from 'node:zlib';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const INCLUDE = ['manifest.json', 'THIRD_PARTY_NOTICES.txt', '_locales', 'icons', 'src', 'reader', 'vendor', 'fonts'];

const manifest = JSON.parse(readFileSync(join(root, 'manifest.json'), 'utf8'));

const files = [];
const walk = (path) => {
  if (statSync(path).isDirectory()) readdirSync(path).sort().forEach((name) => walk(join(path, name)));
  else files.push(path);
};
INCLUDE.forEach((name) => walk(join(root, name)));

const referenced = [
  ...Object.values(manifest.icons),
  ...Object.values(manifest.action.default_icon),
  manifest.background.service_worker,
  manifest.options_ui.page,
  ...manifest.content_scripts.flatMap((s) => s.js),
];
const names = new Set(files.map((f) => relative(root, f).replaceAll('\\', '/')));
const missing = referenced.filter((f) => !names.has(f));
if (missing.length) throw new Error(`package: missing ${missing.join(', ')} (run npm install and npm run assets)`);

// Minimal ZIP writer: deflated entries, no extra fields.
const local = [], central = [];
let offset = 0;
for (const file of files) {
  const name = Buffer.from(relative(root, file).replaceAll('\\', '/'));
  const data = readFileSync(file);
  const packed = deflateRawSync(data, { level: 9 });
  const crc = crc32(data);
  const head = Buffer.alloc(30);
  head.writeUInt32LE(0x04034b50, 0);
  head.writeUInt16LE(20, 4);
  head.writeUInt16LE(0x0800, 6);
  head.writeUInt16LE(8, 8);
  head.writeUInt32LE(crc, 14);
  head.writeUInt32LE(packed.length, 18);
  head.writeUInt32LE(data.length, 22);
  head.writeUInt16LE(name.length, 26);
  local.push(head, name, packed);

  const entry = Buffer.alloc(46);
  entry.writeUInt32LE(0x02014b50, 0);
  entry.writeUInt16LE(20, 4);
  entry.writeUInt16LE(20, 6);
  entry.writeUInt16LE(0x0800, 8);
  entry.writeUInt16LE(8, 10);
  entry.writeUInt32LE(crc, 16);
  entry.writeUInt32LE(packed.length, 20);
  entry.writeUInt32LE(data.length, 24);
  entry.writeUInt16LE(name.length, 28);
  entry.writeUInt32LE(offset, 42);
  central.push(entry, name);
  offset += head.length + name.length + packed.length;
}
const centralSize = central.reduce((n, b) => n + b.length, 0);
const end = Buffer.alloc(22);
end.writeUInt32LE(0x06054b50, 0);
end.writeUInt16LE(files.length, 8);
end.writeUInt16LE(files.length, 10);
end.writeUInt32LE(centralSize, 12);
end.writeUInt32LE(offset, 16);

mkdirSync(join(root, 'dist'), { recursive: true });
const out = join(root, 'dist', `markdown-coolreader-${manifest.version}.zip`);
writeFileSync(out, Buffer.concat([...local, ...central, end]));
console.log(`${relative(root, out)}: ${files.length} files, ${Math.round(statSync(out).size / 1024)} KB`);
