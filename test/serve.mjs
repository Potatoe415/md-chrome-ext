import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { dirname, extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const types = {
  '.md': 'text/plain; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.svg': 'image/svg+xml',
};

// ?html serves the file as text/html, like a forge page whose URL ends in .md.
export function serve(port = 8765) {
  const server = createServer(async (req, res) => {
    const url = new URL(req.url, 'http://x');
    const path = normalize(join(root, decodeURIComponent(url.pathname)));
    if (!path.startsWith(root)) return res.writeHead(403).end();
    try {
      const body = await readFile(path);
      const type = url.searchParams.has('html') ? 'text/html; charset=utf-8' : types[extname(path)];
      res.writeHead(200, { 'Content-Type': type ?? 'application/octet-stream' }).end(body);
    } catch {
      res.writeHead(404).end();
    }
  });
  return new Promise((resolve) => server.listen(port, () => resolve(server)));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await serve();
  console.log('http://localhost:8765/test/sample.md');
}
