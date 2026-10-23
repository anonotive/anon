const http = require('http');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const root = process.cwd();
const port = 8080;

const mime = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.geojson': 'application/geo+json; charset=utf-8'
};

// Gzip/Brotli 可压缩类型（.ttf 是未压缩轮廓字体，Brotli 可再省约 55%）
const COMPRESSIBLE = new Set(['.html', '.css', '.js', '.json', '.geojson', '.svg', '.ttf']);

// 缓存策略：HTML 每次取新，libs/assets 走长缓存
function cacheHeader(ext, filePath) {
  if (filePath.endsWith('index.html')) return 'no-cache, no-store, must-revalidate';
  if (ext === '.html') return 'no-cache';
  return 'public, max-age=31536000, immutable';
}

function sendFile(res, filePath, ext, stat) {
  const type = mime[ext] || 'application/octet-stream';
  const cache = cacheHeader(ext, filePath);

  // 压缩：优先 Brotli（压缩率比 gzip 高约 15-20%），不支持则回退 gzip
  const acceptEnc = res.req.headers['accept-encoding'] || '';
  if (COMPRESSIBLE.has(ext) && stat.size > 512) {
    if (acceptEnc.includes('br') && typeof zlib.createBrotliCompress === 'function') {
      res.writeHead(200, {
        'Content-Type': type,
        'Content-Encoding': 'br',
        'Cache-Control': cache,
        'Vary': 'Accept-Encoding'
      });
      fs.createReadStream(filePath)
        .pipe(zlib.createBrotliCompress({
          params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 5 }
        }))
        .pipe(res);
      return;
    }
    if (acceptEnc.includes('gzip')) {
      res.writeHead(200, {
        'Content-Type': type,
        'Content-Encoding': 'gzip',
        'Cache-Control': cache,
        'Vary': 'Accept-Encoding'
      });
      fs.createReadStream(filePath)
        .pipe(zlib.createGzip({ level: 6 }))
        .pipe(res);
      return;
    }
  }

  // 不压缩的正常输出（图片、字体、视频走这里）
  res.writeHead(200, {
    'Content-Type': type,
    'Content-Length': stat.size,
    'Cache-Control': cache
  });
  fs.createReadStream(filePath).pipe(res);
}

const server = http.createServer((req, res) => {
  // 给 res 挂 req 引用供 sendFile 用
  res.req = req;
  let urlPath = req.url.split('?')[0];

  if (urlPath === '/favicon.ico') {
    res.writeHead(204); res.end(); return;
  }
  if (urlPath === '/') urlPath = '/index.html';
  const filePath = path.join(root, urlPath);

  fs.stat(filePath, (err, stat) => {
    if (err || !stat.isFile()) {
      res.writeHead(404); res.end('Not Found'); return;
    }
    const ext = path.extname(filePath).toLowerCase();
    sendFile(res, filePath, ext, stat);
  });
});

server.listen(port, () => {
  console.log(`Server running at http://localhost:${port}/  (with gzip + smart cache)`);
});
