// Atualiza a cópia da marca (cores, contorno dos títulos e fonte) a partir do site publicado.
// O gerador lê tudo de marca/: rode quando o custom.css ou a fonte da loja mudarem.
// Uso: npm run marca
import fs from 'node:fs';
import path from 'node:path';
import { PASTA_MARCA, CSS_SITE, FONTE } from './design-system.ts';

const SITE = 'https://paintzoas.vercel.app';
const arquivos = [
  { url: `${SITE}/nuvemshop/custom.css`, destino: CSS_SITE },
  { url: `${SITE}/fonts/Paintzoas.woff2`, destino: FONTE },
];

fs.mkdirSync(PASTA_MARCA, { recursive: true });
for (const { url, destino } of arquivos) {
  const r = await fetch(url, { cache: 'no-store' });
  if (!r.ok) { console.error(`Não consegui baixar ${url} (${r.status}). Nada foi trocado.`); process.exit(1); }
  const novo = Buffer.from(await r.arrayBuffer());
  const antes = fs.existsSync(destino) ? fs.readFileSync(destino) : null;
  fs.writeFileSync(destino, novo);
  console.log(`${path.relative(process.cwd(), destino)}: ${antes?.equals(novo) ? 'igual ao publicado' : 'atualizado'} (${novo.length} bytes)`);
}
console.log('Pronto. Reinicie o editor (npm run dev) para usar a marca nova.');
