// Servidor do editor: a página (app/dist, feita pelo Vite) e a API. Uso: npm run app
// Em desenvolvimento, o Vite (npm run dev) serve a página e repassa /api para cá.
// O motor é o mesmo da linha de comando, então a prévia é a peça final.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { exec } from 'node:child_process';
import sharp, { type Metadata } from 'sharp';
import { RAIZ_GERADOR, FONTE, lerTokens } from '../design-system.ts';
import { Variante, lerLayout, lerFormato } from '../esquemas.ts';
import { criarMotor } from '../motor.ts';
import { lerAcervo, guardarNoAcervo, atualizarItem, NovoItem, ItemAcervo, Rascunho, listarPecas, salvarPeca, apagarPeca, PASTA_PECAS } from './acervo.ts';
import { SemIa, resumoConfig, sugerirPecas, lerFoto, termosDeBusca, ordenarCandidatas } from '../ia.ts';
import { buscarFotos, baixarImagem, listaDeFontes, type Candidata } from '../acervos/busca.ts';
import { exigeLogin, logado, credenciaisCertas, cookieDeEntrada, cookieDeSaida } from './sessao.ts';

const PORTA = Number(process.env.PZ_PORTA ?? 4175);
const PASTA_APP = path.join(RAIZ_GERADOR, 'app', 'dist');
const PASTA_BIBLIOTECA = path.join(RAIZ_GERADOR, 'library');
const PASTA_ENVIOS = path.join(PASTA_BIBLIOTECA, 'uploads');
const FORMATOS = ['story', 'feed', 'banner', 'banner-celular'] as const;
const TIPOS: Record<string, string> = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.woff2': 'font/woff2', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif',
};
const EXTENSOES_FOTO = new Set(['.jpg', '.jpeg', '.png', '.webp']);

const motor = await criarMotor();

// Prévia mais nova de cada formato: pedidos antigos ainda na fila são pulados
const ultimaPrevia: Record<string, number> = {};

// ---------- respostas ----------
const json = (res: http.ServerResponse, dados: unknown, status = 200) => {
  res.writeHead(status, { 'content-type': TIPOS['.json'], 'cache-control': 'no-store' });
  res.end(JSON.stringify(dados));
};
const erro = (res: http.ServerResponse, status: number, mensagem: string) => {
  if (status === 400) console.warn(`recusado: ${mensagem}`);
  return json(res, { erro: mensagem }, status);
};
const arquivo = (res: http.ServerResponse, caminho: string, extra: Record<string, string> = {}) => {
  res.writeHead(200, { 'content-type': TIPOS[path.extname(caminho).toLowerCase()] ?? 'application/octet-stream', 'cache-control': 'no-store', ...extra });
  fs.createReadStream(caminho).pipe(res);
};
const dentro = (raiz: string, alvo: string) => alvo === raiz || alvo.startsWith(raiz + path.sep);

async function corpo(req: http.IncomingMessage, limite = 40 * 1024 * 1024): Promise<Buffer> {
  const partes: Buffer[] = [];
  let total = 0;
  for await (const parte of req) {
    total += parte.length;
    if (total > limite) throw new Error('Arquivo grande demais (máximo 40 MB).');
    partes.push(parte as Buffer);
  }
  return Buffer.concat(partes);
}

/** Guarda a foto enviada (ou baixada) em library/uploads, com nome pelo conteúdo: a mesma foto não duplica. */
async function guardarEnvio(dados: Buffer, nomeOriginal: string) {
  let ext = path.extname(nomeOriginal).toLowerCase();
  let meta: Metadata;
  try { meta = await sharp(dados).metadata(); } catch { return null; }
  if (!EXTENSOES_FOTO.has(ext)) ext = meta.format === 'png' ? '.png' : meta.format === 'webp' ? '.webp' : '.jpg';
  const hash = crypto.createHash('sha1').update(dados).digest('hex').slice(0, 16);
  fs.mkdirSync(PASTA_ENVIOS, { recursive: true });
  const destino = path.join(PASTA_ENVIOS, hash + ext);
  if (!fs.existsSync(destino)) fs.writeFileSync(destino, dados);
  const girada = (meta.orientation ?? 1) >= 5;
  return {
    image: path.relative(RAIZ_GERADOR, destino).split(path.sep).join('/'),
    url: `/biblioteca/uploads/${hash}${ext}`,
    largura: girada ? meta.height : meta.width,
    altura: girada ? meta.width : meta.height,
    nome: nomeOriginal,
  };
}

/** A primeira foto da busca que baixar (sem repetir as já usadas), guardada em library/uploads. */
async function fotoPara(busca: string, candidatas: Candidata[], usadas: Set<string>) {
  for (const c of candidatas.filter((x) => !usadas.has(x.imagem)).slice(0, 4)) {
    try {
      const foto = await guardarEnvio(await baixarImagem(c.imagem), `${c.titulo}.jpg`);
      if (!foto) continue;
      usadas.add(c.imagem);
      return { ...foto, nome: c.titulo, fonte: { name: [c.fonte, c.autor].filter(Boolean).join(' · '), url: c.pagina, license: c.direitos } };
    } catch (e) {
      console.warn(`foto para "${busca}": ${(e as Error).message}`);
    }
  }
  return null;
}

// ---------- dados para a página ----------
const amostras = new Map<string, Promise<string | null>>(); // mini-imagem de cada fonte, já buscada
// os 3 estilos de post na ordem de sempre; outros (como o livre) no fim
const ordem = (id: string) => { const i = ['setup-punchline', 'topo', 'lista'].indexOf(id); return i < 0 ? 99 : i; };
function layouts() {
  return fs.readdirSync(path.join(RAIZ_GERADOR, 'layouts'), { withFileTypes: true })
    .filter((d) => d.isDirectory() && fs.existsSync(path.join(RAIZ_GERADOR, 'layouts', d.name, 'spec.json')))
    .map((d) => {
      const l = lerLayout(d.name);
      return { id: l.id, nome: l.nome || l.id, descricao: l.descricao, formatos: l.formats, campos: l.slots };
    })
    .sort((a, b) => ordem(a.id) - ordem(b.id));
}

function estilosParaPagina() {
  return Object.values(motor.estilos).map((e) => ({ nome: e.nome, cor: e.cor, contorno: e.contorno?.cor ?? null }));
}

function tokensCss() {
  return `@font-face { font-family: 'Paintzoas'; src: url('/fonts/Paintzoas.woff2') format('woff2'); font-display: block; }
:root { ${Object.entries(lerTokens()).map(([k, v]) => `${k}: ${v};`).join(' ')} }`;
}

// ---------- rotas ----------
async function atender(req: http.IncomingMessage, res: http.ServerResponse) {
  const url = new URL(req.url ?? '/', 'http://127.0.0.1');
  const p = decodeURIComponent(url.pathname);

  // ---------- login (só quando há EDITOR_SENHA no .env) ----------
  if (p === '/api/sessao') {
    if (req.method === 'GET') return json(res, { exige: exigeLogin(), entrou: !exigeLogin() || logado(req) });
    if (req.method === 'DELETE') { res.setHeader('set-cookie', cookieDeSaida(req)); return json(res, { entrou: false }); }
    if (req.method === 'POST') {
      const { usuario = '', senha = '' } = JSON.parse((await corpo(req, 10_000)).toString('utf8') || '{}') as { usuario?: string; senha?: string };
      if (!exigeLogin() || credenciaisCertas(String(usuario), String(senha))) {
        res.setHeader('set-cookie', cookieDeEntrada(req));
        return json(res, { entrou: true });
      }
      await new Promise((ok) => setTimeout(ok, 1000)); // senha errada: demora um pouco
      return erro(res, 401, 'Usuário ou senha errados.');
    }
  }
  // Sem login, só a casca da página (index, scripts e estilos gerados, logo, fonte); nada da pessoa
  if (exigeLogin() && !logado(req)) {
    const daCasca = p === '/' || p === '/index.html' || p === '/tokens.css' || p === '/fonts/Paintzoas.woff2'
      || (req.method === 'GET' && !p.startsWith('/api/') && !p.startsWith('/biblioteca/') && !p.startsWith('/pecas/') && fs.existsSync(path.join(PASTA_APP, '.' + path.normalize(p))));
    if (!daCasca) return erro(res, 401, 'Entre com usuário e senha.');
  }

  if (req.method === 'GET' && (p === '/' || p === '/index.html')) {
    const pagina = path.join(PASTA_APP, 'index.html');
    if (!fs.existsSync(pagina)) return erro(res, 404, 'A página ainda não foi gerada: rode npm run build (ou use npm run dev).');
    return arquivo(res, pagina);
  }
  if (req.method === 'GET' && p === '/tokens.css') {
    res.writeHead(200, { 'content-type': TIPOS['.css'], 'cache-control': 'no-store' });
    return res.end(tokensCss());
  }
  if (req.method === 'GET' && p === '/fonts/Paintzoas.woff2') return arquivo(res, FONTE);
  // arquivos da página (app/dist: assets/, logo…)
  if (req.method === 'GET' && !p.startsWith('/api/') && path.extname(p)) {
    const alvo = path.resolve(PASTA_APP, '.' + p);
    if (dentro(PASTA_APP, alvo) && fs.existsSync(alvo) && fs.statSync(alvo).isFile()) return arquivo(res, alvo);
  }
  // fotos da biblioteca (envios e acervo), para miniaturas e para escolher o foco
  if (req.method === 'GET' && p.startsWith('/biblioteca/')) {
    const alvo = path.resolve(PASTA_BIBLIOTECA, '.' + p.slice('/biblioteca'.length));
    if (!dentro(PASTA_BIBLIOTECA, alvo) || !fs.existsSync(alvo) || fs.statSync(alvo).isDirectory()) return erro(res, 404, 'não encontrado');
    return arquivo(res, alvo);
  }

  // Mini-imagem de cada fonte (menu "Buscar fotos em"): a primeira foto de uma busca fixa naquela
  // fonte, para mostrar o tipo de foto que ela traz. Uma busca por fonte enquanto o servidor estiver aberto.
  if (req.method === 'GET' && p === '/api/fontes/amostra') {
    const id = url.searchParams.get('id') ?? '';
    if (!listaDeFontes().some((f) => f.id === id)) return erro(res, 404, 'Fonte desconhecida.');
    if (!amostras.has(id)) {
      // "family photograph" traz foto (com "portrait", o Wikimedia devolve pinturas); "portrait" fica de reserva
      const primeira = async () => {
        for (const termo of ['family photograph', 'portrait']) {
          const c = (await buscarFotos([termo], [id])).candidatas[0];
          // o Wikimedia manda a de 1920 px; para o menu basta a de 250 (um dos tamanhos que ele gera)
          if (c) return c.miniatura.replace('/1920px-', '/250px-');
        }
        return null;
      };
      const busca = primeira().catch(() => null);
      amostras.set(id, busca);
      busca.then((m) => { if (!m) amostras.delete(id); }); // não achou: tenta de novo na próxima vez
    }
    return json(res, { miniatura: await amostras.get(id) });
  }
  if (req.method === 'GET' && p === '/api/inicio') {
    const medidas = Object.fromEntries(FORMATOS.map((f) => { const m = lerFormato(f); return [f, [m.w, m.h]]; }));
    // área segura de cada formato (o story de anúncio tem a sua), para a moldura do editor
    const seguras = { story: lerFormato('story', 'organic').safe, 'story-ad': lerFormato('story', 'ad').safe, feed: lerFormato('feed').safe, banner: lerFormato('banner').safe, 'banner-celular': lerFormato('banner-celular').safe };
    return json(res, { layouts: layouts(), estilos: estilosParaPagina(), formatos: FORMATOS, medidas, seguras, fontes: listaDeFontes() });
  }

  // Envio de foto: o corpo é o próprio arquivo. Nome pelo conteúdo, então a mesma foto não duplica.
  if (req.method === 'POST' && p === '/api/fotos') {
    const foto = await guardarEnvio(await corpo(req), decodeURIComponent(String(req.headers['x-nome'] ?? 'foto.jpg')));
    return foto ? json(res, foto) : erro(res, 400, 'Esse arquivo não é uma imagem que o gerador consiga ler (use JPG, PNG ou WebP).');
  }

  // ---------- busca de fotos ----------
  if (req.method === 'POST' && p === '/api/buscar-fotos') {
    const pedido = JSON.parse((await corpo(req)).toString('utf8')) as { descricao: string; layout: string; comIa?: boolean; fontes?: string[] };
    const descricao = String(pedido.descricao ?? '').trim();
    if (!descricao) return erro(res, 400, 'Descreva a foto que você procura.');
    const fontes = Array.isArray(pedido.fontes) ? pedido.fontes : listaDeFontes().map((f) => f.id);
    if (!fontes.length) return erro(res, 400, 'Marque pelo menos um lugar para buscar.');
    const avisos: string[] = [];
    let termos = [descricao];
    // quem usa escolhe: com IA (termos + ordem, gasta 2 pedidos) ou sem IA (busca o que foi digitado)
    let comIa = resumoConfig().temGemini && pedido.comIa === true;
    if (comIa) {
      try { termos = await termosDeBusca(descricao); } catch (e) { if (!(e instanceof SemIa)) throw e; avisos.push(e.message); comIa = false; }
    }
    const achado = await buscarFotos(termos, fontes);
    avisos.push(...achado.avisos);
    // A ordem pela IA vem depois (/api/ordenar-fotos): quem baixa as miniaturas é o navegador,
    // porque os acervos limitam pedidos de programas.
    return json(res, { termos, candidatas: achado.candidatas.slice(0, 36), avisos, comIa });
  }
  if (req.method === 'POST' && p === '/api/ordenar-fotos') {
    const pedido = JSON.parse((await corpo(req)).toString('utf8')) as { descricao: string; layout: string; miniaturas: string[] };
    const imagens = await Promise.all(pedido.miniaturas.slice(0, 16).map((b64) => sharp(Buffer.from(b64, 'base64')).resize(256, 256, { fit: 'inside' }).jpeg({ quality: 70 }).toBuffer()));
    return json(res, { ordem: await ordenarCandidatas(pedido.descricao, pedido.layout, imagens) });
  }
  if (req.method === 'POST' && p === '/api/baixar-foto') {
    const c = JSON.parse((await corpo(req)).toString('utf8')) as Candidata;
    const dados = await baixarImagem(c.imagem);
    const foto = await guardarEnvio(dados, `${c.titulo}.jpg`);
    if (!foto) return erro(res, 400, 'A fonte devolveu um arquivo que não é imagem.');
    const origem = { name: [c.fonte, c.autor].filter(Boolean).join(' · '), url: c.pagina, license: c.direitos };
    return json(res, { ...foto, origemSugerida: origem });
  }

  // Prévia de um formato. O PNG vai junto, em base64: o navegador guarda para mostrar, baixar e
  // montar o .zip. Com "canal" (a prévia do editor), um pedido mais novo do mesmo canal e formato
  // pula os antigos ainda na fila; sem canal (miniaturas, downloads), nada é pulado.
  // Com "rapida" (prévia do editor), a peça vem em JPEG e junto vem "texto": só as letras, em PNG
  // transparente, para o editor arrastar texto e foto sem esperar. Downloads pedem o PNG final.
  if (req.method === 'POST' && p === '/api/prever') {
    const pedido = JSON.parse((await corpo(req)).toString('utf8')) as { variante: unknown; seed: number; formato?: string; perfilStory?: 'organic' | 'ad'; canal?: string; rapida?: boolean };
    const formato = FORMATOS.find((f) => f === pedido.formato) ?? 'story';
    const r = Variante.safeParse(pedido.variante);
    if (!r.success) return erro(res, 400, r.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '));
    const fila = pedido.canal ? `${pedido.canal}:${formato}` : null;
    const numero = fila ? (ultimaPrevia[fila] = (ultimaPrevia[fila] ?? 0) + 1) : 0;
    const superado = () => fila !== null && numero !== ultimaPrevia[fila];
    const rapida = pedido.rapida === true;
    const { png, texto, peca } = await motor.renderizar(r.data, { id: 'peca', formato, seed: pedido.seed, perfilStory: pedido.perfilStory, superado, rapida });
    if (superado()) return json(res, { superado: true });
    return json(res, { peca, png: png ? png.toString('base64') : null, tipo: rapida ? 'image/jpeg' : 'image/png', texto: texto ? texto.toString('base64') : null });
  }

  // ---------- configuração e IA ----------
  if (req.method === 'GET' && p === '/api/config') return json(res, resumoConfig());
  // Uma peça para cada formato a partir do tema (1 pedido à IA, 2 se alguma passar do limite).
  // A foto de cada uma vem da busca que a IA sugeriu, sem IA: a primeira das fontes que baixar.
  // Ela fica em library/uploads; só entra no acervo quando a peça é salva.
  if (req.method === 'POST' && p === '/api/sugestoes') {
    const pedido = JSON.parse((await corpo(req)).toString('utf8')) as { tema: string; fontes?: string[] };
    const tema = String(pedido.tema ?? '').trim();
    if (!tema) return erro(res, 400, 'Escreva o tema primeiro.');
    const fontes = Array.isArray(pedido.fontes) && pedido.fontes.length ? pedido.fontes : listaDeFontes().map((f) => f.id);
    // o layout livre não tem campos: não entra nas sugestões da IA
    const lista = layouts().filter((l) => Object.keys(l.campos).length).map((l) => ({
      id: l.id, nome: l.nome, descricao: l.descricao,
      campos: Object.entries(l.campos).map(([nome, c]) => ({ nome, rotulo: c.label ?? nome, lista: c.list, maxLetras: c.max_chars, maxLinhas: c.max_lines })),
    }));
    const r = await sugerirPecas({ tema, layouts: lista });
    const usadas = new Set<string>();
    const pecas = [];
    // as buscas correm juntas; o download é uma por vez, para duas peças não pegarem a mesma foto
    const achados = await Promise.all(r.pecas.map((peca) => (peca.busca ? buscarFotos([peca.busca], fontes).catch(() => null) : null)));
    for (const [i, peca] of r.pecas.entries()) {
      const candidatas = achados[i]?.candidatas ?? [];
      pecas.push({ ...peca, foto: candidatas.length ? await fotoPara(peca.busca, candidatas, usadas) : null });
    }
    return json(res, { pecas, modelo: r.modelo, aviso: r.aviso });
  }
  // Lê a foto do acervo com IA e completa o que estiver vazio (rostos marcados à mão e textos dela ficam)
  if (req.method === 'POST' && p.startsWith('/api/ler-foto/')) {
    const item = lerAcervo().find((i) => i.id === p.slice('/api/ler-foto/'.length));
    if (!item) return erro(res, 404, 'Foto não encontrada no acervo.');
    const lido = await lerFoto(path.join(RAIZ_GERADOR, 'library', item.file));
    const atualizado = atualizarItem(item.id, {
      descricao: item.descricao || lido.descricao,
      energia: lido.energia,
      areas_livres: lido.areas_livres,
      rostos: item.rostos.length ? item.rostos : lido.rostos,
    });
    return json(res, { ...atualizado, url: `/biblioteca/${atualizado.file}`, urlMiniatura: `/biblioteca/${atualizado.miniatura}`, image: `library/${atualizado.file}`, rostosDaIa: !item.rostos.length });
  }

  // ---------- acervo ----------
  const comUrls = (i: ItemAcervo) => ({ ...i, url: `/biblioteca/${i.file}`, urlMiniatura: `/biblioteca/${i.miniatura}`, image: `library/${i.file}` });
  if (req.method === 'GET' && p === '/api/acervo') return json(res, lerAcervo().map(comUrls));
  if (req.method === 'POST' && p === '/api/acervo') {
    const r = NovoItem.safeParse(JSON.parse((await corpo(req)).toString('utf8')));
    if (!r.success) return erro(res, 400, r.error.issues.map((i) => i.message).join('; '));
    return json(res, comUrls(await guardarNoAcervo(r.data)));
  }
  if (req.method === 'POST' && p.startsWith('/api/acervo/')) {
    const mudancas = JSON.parse((await corpo(req)).toString('utf8'));
    const permitidas = Object.fromEntries(Object.entries(mudancas).filter(([k]) => ['uso_permitido', 'source', 'descricao', 'rostos', 'pessoas_reconheciveis'].includes(k)));
    return json(res, comUrls(atualizarItem(p.slice('/api/acervo/'.length), permitidas)));
  }

  // ---------- peças salvas ----------
  if (req.method === 'GET' && p === '/api/pecas') return json(res, listarPecas());
  if (req.method === 'POST' && p === '/api/pecas') {
    const pedido = JSON.parse((await corpo(req)).toString('utf8')) as { id?: string; rascunho: unknown; miniatura?: string };
    const r = Rascunho.safeParse(pedido.rascunho);
    if (!r.success) return erro(res, 400, r.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '));
    const mini = pedido.miniatura ? await sharp(Buffer.from(pedido.miniatura, 'base64')).resize(360, 640, { fit: 'inside' }).jpeg({ quality: 80 }).toBuffer() : null;
    return json(res, salvarPeca(pedido.id, r.data, mini));
  }
  if (req.method === 'DELETE' && p.startsWith('/api/pecas/')) { apagarPeca(p.slice('/api/pecas/'.length)); return json(res, { ok: true }); }
  if (req.method === 'GET' && p.startsWith('/pecas/')) {
    const alvo = path.resolve(PASTA_PECAS, '.' + p.slice('/pecas'.length));
    if (!dentro(PASTA_PECAS, alvo) || !fs.existsSync(alvo) || !['.png', '.jpg'].includes(path.extname(alvo))) return erro(res, 404, 'não encontrado');
    return arquivo(res, alvo);
  }

  return erro(res, 404, 'não encontrado');
}

const servidor = http.createServer((req, res) => {
  atender(req, res).catch((e: Error) => {
    console.error(e);
    // Sem IA (sem chave, sem cota): a página mostra a mensagem e segue sem IA
    if (!res.headersSent) e instanceof SemIa ? json(res, { erro: e.message, semIa: true }, 503) : erro(res, 500, e.message);
    else res.end();
  });
});
servidor.listen(PORTA, '127.0.0.1', () => {
  const endereco = `http://127.0.0.1:${PORTA}/`;
  console.log(`Editor aberto em ${endereco}`);
  if (process.argv.includes('--abrir')) {
    const abrir = process.platform === 'win32' ? `start "" "${endereco}"` : process.platform === 'darwin' ? `open "${endereco}"` : `xdg-open "${endereco}"`;
    exec(abrir);
  }
});
const desligar = async () => { servidor.close(); await motor.fechar(); process.exit(0); };
process.on('SIGINT', desligar);
process.on('SIGTERM', desligar);
