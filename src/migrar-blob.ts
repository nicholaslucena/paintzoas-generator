// Sobe as fotos (library/) e as peças salvas (pecas/) deste computador para o Blob da Vercel.
// Uso: npm run migrar  (precisa de BLOB_READ_WRITE_TOKEN no .env)
// Pode rodar de novo: o que já está lá não sobe outra vez. Nada é apagado, nem aqui nem lá.
// Cada arquivo enviado conta 1 operação avançada (o plano grátis tem 2.000 por mês).
import './design-system.ts'; // lê o .env
import { put, list } from '@vercel/blob';
import { armazem, tipoDe, NA_NUVEM } from './app/armazem.ts';

if (NA_NUVEM) {
  console.error('Rode sem PZ_ARMAZEM=blob: o script lê do disco deste computador.');
  process.exit(1);
}
if (!process.env.BLOB_READ_WRITE_TOKEN) {
  console.error('Falta BLOB_READ_WRITE_TOKEN no .env (Vercel > Storage > o Blob > .env.local).');
  process.exit(1);
}

// "armazem" aqui é o disco (sem PZ_ARMAZEM=blob): é de onde as coisas saem
const locais = [...await armazem.listar('library/'), ...await armazem.listar('pecas/')];

const jaLa = new Set<string>();
let cursor: string | undefined;
do {
  const r = await list({ cursor, limit: 1000 });
  for (const b of r.blobs) jaLa.add(b.pathname);
  cursor = r.hasMore ? r.cursor : undefined;
} while (cursor);

const faltam = locais.filter((c) => !jaLa.has(c));
console.log(`${locais.length} arquivos aqui, ${faltam.length} para subir.`);
let n = 0;
for (const chave of faltam) {
  const dados = await armazem.ler(chave);
  if (!dados) continue;
  await put(chave, dados, { access: 'private', addRandomSuffix: false, allowOverwrite: true, contentType: tipoDe(chave) });
  console.log(`${++n}/${faltam.length} ${chave} (${(dados.length / 1024 / 1024).toFixed(1)} MB)`);
}
console.log('Pronto.');
