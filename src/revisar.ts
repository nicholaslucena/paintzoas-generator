// Servidor local da página de revisão (out/<campanha>/index.html).
// Uso: npm run revisar            → lista as campanhas renderizadas
//      npm run revisar -- --abrir → abre no navegador padrão
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { exec } from 'node:child_process';
import { RAIZ_GERADOR, FONTE } from './design-system.ts';

const PORTA = 4174;
const PERMITIDAS = [path.join(RAIZ_GERADOR, 'out')];
const TIPOS: Record<string, string> = { '.html': 'text/html; charset=utf-8', '.png': 'image/png', '.json': 'application/json', '.woff2': 'font/woff2' };

http.createServer((req, res) => {
  const p = decodeURIComponent(new URL(req.url ?? '/', 'http://x').pathname);
  if (p === '/') {
    const pasta = path.join(RAIZ_GERADOR, 'out');
    const campanhas = fs.existsSync(pasta) ? fs.readdirSync(pasta).filter((d) => fs.existsSync(path.join(pasta, d, 'index.html'))) : [];
    res.writeHead(200, { 'content-type': TIPOS['.html'] });
    return res.end(`<!doctype html><meta charset="utf-8"><title>Campanhas</title><body style="font:16px Helvetica,Arial,sans-serif;padding:32px">
      <h1>Campanhas</h1>${campanhas.map((c) => `<p><a href="/out/${c}/">${c}</a></p>`).join('') || '<p>Nenhuma ainda. Rode npm run render -- campaigns/&lt;arquivo&gt;.json</p>'}`);
  }
  // a fonte vem da cópia da marca; o resto, de out/
  let arquivo = p === '/fonts/Paintzoas.woff2' ? FONTE : path.resolve(RAIZ_GERADOR, '.' + p);
  if (p.endsWith('/')) arquivo = path.join(arquivo, 'index.html');
  if ((arquivo !== FONTE && !PERMITIDAS.some((d) => arquivo.startsWith(d + path.sep))) || !fs.existsSync(arquivo) || fs.statSync(arquivo).isDirectory()) {
    res.writeHead(404); return res.end('não encontrado');
  }
  res.writeHead(200, { 'content-type': TIPOS[path.extname(arquivo)] ?? 'application/octet-stream', 'cache-control': 'no-store' });
  fs.createReadStream(arquivo).pipe(res);
}).listen(PORTA, '127.0.0.1', () => {
  const url = `http://127.0.0.1:${PORTA}/`;
  console.log(`Revisão em ${url}`);
  if (process.argv.includes('--abrir')) exec(`start "" "${url}"`);
});
