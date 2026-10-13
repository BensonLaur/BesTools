import http from 'node:http';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const mimeTypes = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/plain; charset=utf-8'
};

export function createStaticServer({ root = projectRoot, base = '/' } = {}) {
  const absoluteRoot = path.resolve(root);
  const prefix = base === '/' ? '/' : '/' + base.replace(/^\/+|\/+$/g, '') + '/';
  return http.createServer(async (request, response) => {
    if (!['GET', 'HEAD'].includes(request.method)) {
      response.writeHead(405, { Allow: 'GET, HEAD' }).end();
      return;
    }
    try {
      let pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
      if (prefix !== '/' && pathname === prefix.slice(0, -1)) {
        response.writeHead(302, { Location: prefix }).end();
        return;
      }
      if (!pathname.startsWith(prefix)) {
        response.writeHead(404).end('Not found');
        return;
      }
      pathname = pathname.slice(prefix.length);
      let file = path.resolve(absoluteRoot, pathname || 'index.html');
      // 预览服务器始终限定在项目目录，拒绝越界路径。
      if (file !== absoluteRoot && !file.startsWith(absoluteRoot + path.sep)) {
        response.writeHead(403).end('Forbidden');
        return;
      }
      let info = await stat(file);
      if (info.isDirectory()) {
        if (!pathname.endsWith('/')) {
          response.writeHead(302, { Location: prefix + pathname + '/' }).end();
          return;
        }
        file = path.join(file, 'index.html');
        info = await stat(file);
      }
      if (!info.isFile()) throw new Error('Not a regular file');
      response.writeHead(200, {
        'Content-Type': mimeTypes[path.extname(file)] || 'application/octet-stream',
        'Content-Length': info.size,
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff'
      });
      if (request.method === 'HEAD') response.end();
      else createReadStream(file).on('error', () => response.destroy()).pipe(response);
    } catch {
      response.writeHead(404).end('Not found');
    }
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const option = (name, fallback) => {
    const index = process.argv.indexOf(name);
    return index === -1 ? fallback : process.argv[index + 1];
  };
  const port = Number(option('--port', '4173'));
  const base = option('--base', '/');
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid port');
  const server = createStaticServer({ base });
  server.on('error', error => { console.error(error.message); process.exitCode = 1; });
  server.listen(port, '127.0.0.1', () => console.log('BesTools 预览：http://127.0.0.1:' + port + base));
}
