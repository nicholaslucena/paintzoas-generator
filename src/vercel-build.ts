// Monta o que a Vercel publica, no formato da Build Output API v3 (.vercel/output):
//   static/            a página (app/dist, feita pelo Vite)
//   functions/api.func o servidor do editor, com só os arquivos que ele usa
//   config.json        quais caminhos vão para a função
// Uso: npm run vercel-build (a Vercel roda sozinha no deploy, pelo vercel.json).
// O rastreador da Vercel não lê TypeScript: aqui ele recebe os .ts já sem os tipos, só para achar
// os imports. Os arquivos copiados são os originais (o Node 24 roda .ts direto).
import fs from 'node:fs';
import path from 'node:path';
import { stripTypeScriptTypes } from 'node:module';
import { nodeFileTrace } from '@vercel/nft';

const RAIZ = path.resolve(import.meta.dirname, '..');
const SAIDA = path.join(RAIZ, '.vercel', 'output');
const FUNCAO = path.join(SAIDA, 'functions', 'api.func');
const ENTRADA = 'src/app/vercel.js';
const LIMITE_MB = 250; // tamanho máximo de uma função na Vercel, descompactada

const pagina = path.join(RAIZ, 'app', 'dist', 'index.html');
if (!fs.existsSync(pagina)) throw new Error('Falta a página: rode npm run build antes.');
fs.rmSync(SAIDA, { recursive: true, force: true });

// ---------- página ----------
fs.cpSync(path.join(RAIZ, 'app', 'dist'), path.join(SAIDA, 'static'), { recursive: true });

// ---------- função ----------
const { fileList } = await nodeFileTrace([path.join(RAIZ, ENTRADA)], {
  base: RAIZ,
  readFile: async (f: string) => {
    try {
      const dados = await fs.promises.readFile(f);
      return f.endsWith('.ts') && !f.includes('node_modules') ? stripTypeScriptTypes(dados.toString('utf8')) : dados;
    } catch { return null; }
  },
});
const arquivos = new Set([...fileList].map((f) => f.split(path.sep).join('/')));

// O que o servidor lê por caminho montado (o rastreador não acha) e pacotes que escolhem arquivos na hora:
// layouts, configurações e marca; o Chromium comprimido; o sharp de cada sistema (@img); o Playwright inteiro.
const pastasInteiras = ['src', 'layouts', 'config', 'marca', 'node_modules/@sparticuz/chromium', 'node_modules/@img', 'node_modules/playwright-core'];
for (const pasta of pastasInteiras) {
  const abs = path.join(RAIZ, pasta);
  if (!fs.existsSync(abs)) continue;
  for (const d of fs.readdirSync(abs, { recursive: true, withFileTypes: true }) as fs.Dirent[]) {
    if (d.isFile()) arquivos.add(path.relative(RAIZ, path.join(d.parentPath, d.name)).split(path.sep).join('/'));
  }
}
arquivos.add('package.json'); // "type": "module"

let bytes = 0;
for (const f of arquivos) {
  const origem = path.join(RAIZ, f);
  if (!fs.existsSync(origem) || fs.statSync(origem).isDirectory()) continue;
  const destino = path.join(FUNCAO, f);
  fs.mkdirSync(path.dirname(destino), { recursive: true });
  fs.copyFileSync(origem, destino);
  bytes += fs.statSync(origem).size;
}
const mb = bytes / 1024 / 1024;
if (mb > LIMITE_MB) throw new Error(`A função ficou com ${mb.toFixed(0)} MB (máximo ${LIMITE_MB} MB).`);

fs.writeFileSync(path.join(FUNCAO, '.vc-config.json'), JSON.stringify({
  runtime: 'nodejs24.x',
  handler: ENTRADA,
  launcherType: 'Nodejs',
  shouldAddHelpers: false,
  memory: 2048,      // máximo do plano grátis; o Chromium precisa
  maxDuration: 300,  // sugestões da IA com as fotos podem demorar
  regions: ['gru1'], // São Paulo
}, null, 2));

// ---------- caminhos ----------
// Arquivos da página primeiro; o resto do editor vai para a função, com o caminho original em "__p".
fs.writeFileSync(path.join(SAIDA, 'config.json'), JSON.stringify({
  version: 3,
  routes: [
    { handle: 'filesystem' },
    { src: '^/(api|biblioteca|pecas|fonts)/(.*)$', dest: '/api?__p=/$1/$2' },
    { src: '^/tokens\\.css$', dest: '/api?__p=/tokens.css' },
  ],
}, null, 2));

console.log(`Pronto: .vercel/output (função com ${arquivos.size} arquivos, ${mb.toFixed(1)} MB).`);
