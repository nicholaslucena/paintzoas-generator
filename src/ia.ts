// Toda a IA do gerador passa por aqui (Gemini, plano gratuito do Google AI Studio).
// Trocar de provedor depois mexe só neste arquivo. Sem chave ou sem cota, o editor segue sem IA.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { z } from 'zod';
import { GoogleGenAI, ApiError, type Part } from '@google/genai';
import { RAIZ_GERADOR } from './design-system.ts';

// ---------- chave do Gemini ----------
// Fica em generator/.env (GEMINI_API_KEY=...), fora do git. Na Vercel, na variável do projeto.
// Uma variável já definida no ambiente vale mais que o .env.
try { process.loadEnvFile(path.join(RAIZ_GERADOR, '.env')); } catch { /* sem .env: segue sem IA */ }

// ---------- contagem de uso (fora do repositório) ----------
const PASTA_CONFIG = process.platform === 'win32'
  ? path.join(process.env.APPDATA ?? path.join(os.homedir(), 'AppData', 'Roaming'), 'paintzoas')
  : path.join(os.homedir(), '.config', 'paintzoas');
/**
 * Só estes dois modelos (decisão de 24/11/2026): o 3.5 Flash e, quando ele está sobrecarregado,
 * sem resposta ou sem cota, o 3.5 Flash Lite. Cada um tem a própria cota grátis por dia.
 */
export const MODELOS = [
  { id: 'gemini-3.5-flash', nome: '3.5 Flash' },
  { id: 'gemini-3.5-flash-lite', nome: '3.5 Flash Lite' },
] as const;
const nomeDoModelo = (id: string) => MODELOS.find((m) => m.id === id)?.nome ?? id;

const chaveGemini = () => process.env.GEMINI_API_KEY?.trim() || undefined;

/**
 * O que a página pode saber da configuração: nunca as chaves em si.
 * `uso.esgotadoAte` só vem preenchido quando os dois modelos estão sem cota hoje.
 */
export const resumoConfig = () => {
  const modelos = MODELOS.map((m) => ({ ...m, ...usoDeHoje(m.id) }));
  const voltas = modelos.map((m) => m.esgotadoAte);
  const todosSemCota = voltas.every(Boolean);
  return {
    temGemini: Boolean(chaveGemini()),
    modelos,
    uso: {
      pedidos: modelos.reduce((s, m) => s + m.pedidos, 0),
      limite: null,
      esgotadoAte: todosSemCota ? (voltas as string[]).sort()[0] : null,
    },
  };
};

// ---------- uso de hoje (só os pedidos feitos por este editor) ----------
// A cota grátis do Gemini zera à meia-noite do Pacífico, então "hoje" é contado nesse fuso.
// O limite de cada modelo só é conhecido quando o Google o informa num erro 429 (quotaValue).
const ARQUIVO_USO = path.join(PASTA_CONFIG, 'uso.json');
interface Uso { dia: string; pedidos: Record<string, number>; limites: Record<string, number>; esgotado: Record<string, string> }
const diaDoGoogle = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' });
function lerUso(): Uso {
  let u: Partial<Uso> = {};
  try { u = JSON.parse(fs.readFileSync(ARQUIVO_USO, 'utf8')); } catch { /* primeiro uso */ }
  const hoje = diaDoGoogle();
  // limites aprendidos continuam valendo; contagem e esgotado zeram a cada dia
  return u.dia === hoje ? { dia: hoje, pedidos: u.pedidos ?? {}, limites: u.limites ?? {}, esgotado: u.esgotado ?? {} } : { dia: hoje, pedidos: {}, limites: u.limites ?? {}, esgotado: {} };
}
function gravarUso(u: Uso) { fs.mkdirSync(PASTA_CONFIG, { recursive: true }); fs.writeFileSync(ARQUIVO_USO, JSON.stringify(u, null, 2)); }
function contarPedido(modelo: string) { const u = lerUso(); u.pedidos[modelo] = (u.pedidos[modelo] ?? 0) + 1; gravarUso(u); }
function marcarEsgotado(modelo: string, limite: number | null, volta: string) {
  const u = lerUso();
  if (limite) u.limites[modelo] = limite;
  u.esgotado[modelo] = volta;
  gravarUso(u);
}
export function usoDeHoje(modelo: string) {
  const u = lerUso();
  const ate = u.esgotado[modelo];
  return { pedidos: u.pedidos[modelo] ?? 0, limite: u.limites[modelo] ?? null, esgotadoAte: ate && new Date(ate) > new Date() ? ate : null };
}

/** Erro que a página mostra como está: a IA ficou de fora, o resto continua. */
export class SemIa extends Error {}

let cliente: GoogleGenAI | null = null;
function gemini() {
  const geminiKey = chaveGemini();
  if (!geminiKey) throw new SemIa('A IA está desligada: falta a chave do Gemini.');
  cliente ??= new GoogleGenAI({ apiKey: geminiKey });
  return cliente;
}

/** Sobrecarregado, o Google às vezes nem responde: depois deste tempo, o pedido vai para o outro modelo. */
const ESPERA_MAXIMA_MS = 35_000;
const demorou = (e: unknown) => e instanceof Error && (e.name === 'AbortError' || e.name === 'TimeoutError');
const sobrecarga = (e: unknown) => demorou(e) || (e instanceof ApiError && (e.status === 500 || e.status === 503));
const codigo = (e: unknown) => (demorou(e) ? `sem resposta em ${ESPERA_MAXIMA_MS / 1000} s` : e instanceof ApiError ? `erro ${e.status}` : (e as Error).message.slice(0, 80));

/**
 * Pede uma resposta em JSON com esquema e valida com zod. Resposta inválida: tenta de novo.
 * O esquema JSON é escrito à mão só com o que o Gemini aceita (type, properties, items, enum, required…).
 * Ordem: 3.5 Flash; se ele estiver sobrecarregado, sem resposta ou sem cota, o 3.5 Flash Lite.
 * Um 503 rápido ganha mais uma tentativa no mesmo modelo (depois de 2 s). Cada tentativa vai para o log.
 */
async function pedirJson<T>(partes: Part[], esquemaJson: object, valida: z.ZodType<T>, tentativas = 2): Promise<{ dados: T; modelo: string }> {
  const ia = gemini();
  // modelo já sem cota hoje nem é tentado (não gasta pedido à toa)
  const modelos = MODELOS.map((m) => m.id).filter((m) => !usoDeHoje(m).esgotadoAte);
  if (!modelos.length) throw new SemIa('Acabaram os pedidos grátis de hoje no 3.5 Flash e no 3.5 Flash Lite. O resto do editor continua funcionando.');
  let ultimoErro = '';
  for (let i = 0; i < tentativas; i++) {
    let texto: string | undefined;
    let usado = '';
    const falhas: { modelo: string; erro: unknown }[] = [];
    for (const modelo of modelos) {
      try {
        for (let vez = 0; ; vez++) {
          try {
            contarPedido(modelo);
            const r = await ia.models.generateContent({
              model: modelo,
              contents: [{ role: 'user', parts: partes }],
              config: { responseMimeType: 'application/json', responseJsonSchema: esquemaJson, abortSignal: AbortSignal.timeout(ESPERA_MAXIMA_MS) },
            });
            texto = r.text;
            usado = modelo;
            console.log(`Gemini ${modelo}: respondeu.`);
            break;
          } catch (e) {
            console.warn(`Gemini ${modelo}: ${codigo(e)}.`);
            if (!(sobrecarga(e) && !demorou(e) && vez === 0)) throw e;
            await new Promise((ok) => setTimeout(ok, 2000));
          }
        }
        break;
      } catch (e) {
        falhas.push({ modelo, erro: e });
        // sem cota (429): registra até quando e tenta o outro modelo
        if (e instanceof ApiError && e.status === 429) mensagemDeLimite(e.message, modelo);
        const vaiParaOOutro = sobrecarga(e) || (e instanceof ApiError && (e.status === 429 || e.status === 404));
        if (vaiParaOOutro) continue;
        if (e instanceof ApiError && (e.status === 400 || e.status === 401 || e.status === 403)) throw new SemIa(`O Gemini recusou o pedido (${e.status}). Confira a chave do Gemini. Detalhe: ${e.message.slice(0, 200)}`);
        throw new SemIa(`Não consegui falar com o Gemini: ${(e as Error).message.slice(0, 200)}`);
      }
    }
    if (!usado) {
      const resumo = falhas.map((f) => `${nomeDoModelo(f.modelo)}: ${codigo(f.erro)}`).join('; ');
      const tudoSemCota = falhas.every((f) => f.erro instanceof ApiError && f.erro.status === 429);
      if (tudoSemCota) throw new SemIa(mensagemDeLimite((falhas.at(-1)!.erro as ApiError).message, falhas.at(-1)!.modelo));
      throw new SemIa(`O Gemini não atendeu agora (do lado do Google): ${resumo}. Tente de novo em alguns minutos.`);
    }
    try {
      const r = valida.safeParse(JSON.parse(texto ?? ''));
      if (r.success) return { dados: r.data, modelo: usado };
      ultimoErro = r.error.issues.map((x) => x.message).join('; ');
    } catch (e) {
      ultimoErro = (e as Error).message;
    }
  }
  throw new SemIa(`O Gemini respondeu num formato inesperado (${ultimoErro.slice(0, 120)}). Tente de novo.`);
}

/**
 * O Google diz no erro 429 qual limite estourou (por minuto ou por dia, e quantos pedidos)
 * e quanto esperar. A mensagem repete isso em português, sem chutar.
 */
function mensagemDeLimite(detalhe: string, modelo: string): string {
  console.warn(`Gemini 429: ${detalhe.slice(0, 1500)}`);
  const porDia = /PerDay|per[_ ]day/i.test(detalhe);
  const porMinuto = /PerMinute|per[_ ]minute/i.test(detalhe);
  const limite = detalhe.match(/limit:\s*(\d+)/i)?.[1];
  const espera = detalhe.match(/retryDelay"?\s*:\s*"?(\d+(?:\.\d+)?)s/i)?.[1];
  const quanto = limite ? ` (${limite} pedidos${porDia ? ' por dia' : porMinuto ? ' por minuto' : ''})` : '';
  if (porDia) {
    marcarEsgotado(modelo, limite ? Number(limite) : null, new Date(Date.now() + (espera ? Number(espera) * 1000 : 6 * 3600 * 1000)).toISOString());
    const horas = espera ? Math.ceil(Number(espera) / 3600) : null;
    return `A IA atingiu o limite de hoje do plano grátis do Gemini${quanto}. Volta a funcionar ${horas ? `em cerca de ${horas} hora${horas > 1 ? 's' : ''}` : 'amanhã'}; o resto do editor continua funcionando.`;
  }
  if (porMinuto) return `A IA recebeu pedidos demais em pouco tempo${quanto}. Tente de novo${espera ? ` em ${Math.ceil(Number(espera))} segundos` : ' em um minuto'}.`;
  return `O Gemini recusou por limite de uso${espera ? `; tente de novo em ${Math.ceil(Number(espera))} segundos` : ''}. Detalhe: ${detalhe.slice(0, 160)}`;
}

/** Foto reduzida para a IA (menos cota, mesma leitura). */
export async function parteDaFoto(arquivo: string, lado = 1024): Promise<Part> {
  const jpg = await sharp(arquivo).rotate().resize(lado, lado, { fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 82 }).toBuffer();
  return { inlineData: { mimeType: 'image/jpeg', data: jpg.toString('base64') } };
}

// ---------- 1. sugerir textos ----------
export interface CampoParaIa { nome: string; rotulo: string; lista: boolean; maxLetras: number; maxLinhas: number }

function vozDaMarca() {
  const arquivo = path.join(RAIZ_GERADOR, 'config', 'brand-voice.md');
  const texto = fs.existsSync(arquivo) ? fs.readFileSync(arquivo, 'utf8') : '';
  const legendas = texto.split('\n').filter((l) => /^\s*-\s+\S/.test(l)).length;
  return { texto, legendas };
}

const contaLetras = (t: string) => t.replace(/\s*\|\s*/g, ' ').trim().length;

export interface LayoutParaIa { id: string; nome: string; descricao: string; campos: CampoParaIa[] }
export interface PecaSugerida { layout: string; textos: Record<string, string | string[]>; busca: string }

/**
 * Uma peça para cada formato (Meme, Só no topo, Lista), num pedido só: o texto a partir do tema
 * e uma busca de foto em inglês para cada uma. A foto é procurada depois, sem IA.
 * Peça que passa dos limites é pedida de novo uma vez (só ela); se passar de novo, vai assim
 * mesmo e o QA do editor mostra o que encurtar.
 */
export async function sugerirPecas(p: { tema: string; layouts: LayoutParaIa[] }) {
  const voz = vozDaMarca();
  const esquemaCampo = (c: CampoParaIa) => c.lista
    ? { type: 'array', items: { type: 'string', description: `até ${c.maxLetras} letras` }, minItems: 2, maxItems: c.maxLinhas, description: c.rotulo }
    : { type: 'string', description: `${c.rotulo}: até ${c.maxLetras} letras` };
  const esquemaDe = (ls: LayoutParaIa[]) => ({
    type: 'object',
    properties: Object.fromEntries(ls.map((l) => [l.id, {
      type: 'object',
      properties: { ...Object.fromEntries(l.campos.map((c) => [c.nome, esquemaCampo(c)])), busca: { type: 'string', description: 'busca de fotografia (nunca pintura ou ilustração) em inglês, 2 a 4 palavras, só a cena' } },
      required: [...l.campos.map((c) => c.nome), 'busca'],
    }])),
    required: ls.map((l) => l.id),
  });
  const validaDe = (ls: LayoutParaIa[]) => z.object(Object.fromEntries(ls.map((l) => [l.id, z.record(z.string(), z.union([z.string(), z.array(z.string())]))])));
  const cabe = (l: LayoutParaIa, o: Record<string, string | string[]>) => typeof o.busca === 'string' && o.busca.trim() !== '' && l.campos.every((c) => {
    const v = o[c.nome];
    if (c.lista) return Array.isArray(v) && v.length >= 1 && v.length <= c.maxLinhas && v.every((x) => x.trim() && contaLetras(x) <= c.maxLetras);
    return typeof v === 'string' && v.trim() !== '' && contaLetras(v) <= c.maxLetras;
  });
  const regras = (l: LayoutParaIa) => `"${l.id}" (${l.nome}: ${l.descricao})\n${l.campos.map((c) => c.lista
    ? `  - "${c.nome}" (${c.rotulo}): lista de 2 a ${c.maxLinhas} itens, cada item com no máximo ${c.maxLetras} letras.`
    : `  - "${c.nome}" (${c.rotulo}): no máximo ${c.maxLetras} letras.`).join('\n')}`;
  const pedido = (ls: LayoutParaIa[], rejeitadas: string[]) => `Você escreve memes para o perfil @paintzoas no Instagram (cerca de 70 mil seguidores).
O estilo: uma foto antiga encontrada (álbum de família dos anos 60 a 80, ou foto de imprensa em preto e branco dos anos 40 e 50) com um texto curto, escrito em primeira pessoa, que contrasta a seriedade da foto com um desabafo de hoje: cansaço, relacionamento, deboche. Palavrão é permitido. Português do Brasil, coloquial.
Quando há uma oferta ou novidade, ela entra DENTRO da piada; nunca vira texto de anúncio ("aproveite", "imperdível", "confira").
A foto ainda não existe: ela é procurada depois com a "busca" que você sugerir, então prefira situações que uma foto antiga consiga mostrar.

Tema: ${p.tema}

Escreva UMA peça para cada formato abaixo, cada uma com um ângulo de piada diferente. Campos e limites (contam letras e espaços; nunca passe do limite):
${ls.map(regras).join('\n')}
Se a peça tem começo e virada, a virada é a parte engraçada e vai embaixo.

Em cada peça, "busca" é uma busca curta em INGLÊS (2 a 4 palavras, sem aspas) para achar a foto em acervos como Wikimedia Commons e Flickr. Fotos de arquivo são catalogadas pela CENA, não pela emoção: use quem aparece, o que está fazendo e onde (ex.: "housewife kitchen", "woman shopping grocery store", "man reading newspaper"). Nunca use década, ano ou palavras como "vintage", "disgust", "funny" ou "expression": a busca volta vazia ou traz pinturas. A marca usa só FOTOGRAFIA de pessoas reais: a busca descreve uma cena que alguém fotografou, nunca pintura, desenho, ilustração, cartaz ou retrato pintado. As buscas das peças devem ser cenas diferentes.

${voz.legendas >= 5 ? `Legendas reais dela, para copiar o tom (não copie as piadas):\n${voz.texto}\n` : ''}${rejeitadas.length ? `Estas passaram do limite e não servem: ${rejeitadas.join(' / ')}` : ''}`;

  const prontas = new Map<string, PecaSugerida>();
  const modelos = new Set<string>();
  let faltam = p.layouts;
  let ultimas: Record<string, Record<string, string | string[]>> = {};
  const rejeitadas: string[] = [];
  for (let rodada = 0; rodada < 2 && faltam.length; rodada++) {
    const { dados, modelo } = await pedirJson([{ text: pedido(faltam, rejeitadas) }], esquemaDe(faltam), validaDe(faltam));
    modelos.add(nomeDoModelo(modelo));
    ultimas = { ...ultimas, ...dados };
    for (const l of faltam) {
      const o = dados[l.id];
      if (o && cabe(l, o)) prontas.set(l.id, { layout: l.id, textos: Object.fromEntries(l.campos.map((c) => [c.nome, o[c.nome]])), busca: String(o.busca).trim() });
      else if (o) rejeitadas.push(l.campos.map((c) => [o[c.nome]].flat().join(', ')).join(' | ').slice(0, 80));
    }
    faltam = faltam.filter((l) => !prontas.has(l.id));
  }
  // passou do limite duas vezes: vai como veio (o QA mostra o que encurtar)
  for (const l of faltam) {
    const o = ultimas[l.id];
    if (o) prontas.set(l.id, { layout: l.id, textos: Object.fromEntries(l.campos.map((c) => [c.nome, o[c.nome] ?? ''])), busca: String(o.busca ?? '').trim() });
  }
  return {
    pecas: p.layouts.map((l) => prontas.get(l.id)).filter((x): x is PecaSugerida => Boolean(x)),
    modelo: [...modelos].join(' e '),
    aviso: voz.legendas < 5 ? 'Ainda não há legendas reais dela em config/brand-voice.md: as sugestões não têm o tom dela.' : null,
  };
}

// ---------- 2. ler a foto (para o acervo) ----------
const AREAS = ['top', 'bottom', 'left', 'right'] as const;
export async function lerFoto(arquivo: string) {
  const esquema = {
    type: 'object',
    properties: {
      descricao: { type: 'string', description: 'uma frase em português: quem aparece, época, expressão, situação' },
      energia: { type: 'array', items: { type: 'string' }, description: 'de 1 a 3 palavras sobre o clima (ex.: nojo, deboche, cansaço, alegria)' },
      rostos: { type: 'array', items: { type: 'array', items: { type: 'integer' }, minItems: 4, maxItems: 4 }, description: 'cada rosto como [ymin, xmin, ymax, xmax] de 0 a 1000' },
      areas_livres: { type: 'array', items: { type: 'string', enum: [...AREAS] }, description: 'regiões sem rosto nem detalhe importante, onde cabe texto grande' },
    },
    required: ['descricao', 'energia', 'rostos', 'areas_livres'],
  };
  const valida = z.object({
    descricao: z.string(),
    energia: z.array(z.string()),
    rostos: z.array(z.array(z.number()).length(4)),
    areas_livres: z.array(z.enum(AREAS)),
  });
  const { dados: r } = await pedirJson([await parteDaFoto(arquivo), { text: 'Descreva esta foto para um acervo de memes. Marque TODOS os rostos visíveis (cabeça inteira, incluindo chapéu ou cabelo) com caixas [ymin, xmin, ymax, xmax] de 0 a 1000. Diga onde há espaço vazio (parede, céu, teto, chão liso) para texto grande.' }], esquema, valida);
  const f = (v: number) => Math.min(1, Math.max(0, v / 1000));
  return {
    descricao: r.descricao,
    energia: r.energia.slice(0, 3),
    areas_livres: [...new Set(r.areas_livres)],
    rostos: r.rostos
      .map(([ymin, xmin, ymax, xmax]) => ({ x: f(xmin), y: f(ymin), w: f(xmax) - f(xmin), h: f(ymax) - f(ymin) }))
      .filter((c) => c.w > 0.005 && c.h > 0.005)
      .map((c) => Object.fromEntries(Object.entries(c).map(([k, v]) => [k, Math.round(v * 1000) / 1000])) as { x: number; y: number; w: number; h: number }),
  };
}

// ---------- 3. busca de fotos: termos e ordem ----------
export async function termosDeBusca(descricao: string) {
  const esquema = { type: 'object', properties: { termos: { type: 'array', items: { type: 'string' }, minItems: 2, maxItems: 4 } }, required: ['termos'] };
  const { dados: r } = await pedirJson([{ text: `Transforme este pedido de foto antiga em 2 a 4 buscas curtas em INGLÊS para acervos como Library of Congress e Wikimedia Commons (2 a 4 palavras cada, sem aspas, sem datas exatas).
Fotos de arquivo são catalogadas pela CENA, não pela emoção: use quem aparece, o que está fazendo e onde (ex.: "housewife kitchen", "woman shopping grocery store"). Nunca use década, ano ou palavras como "vintage", "disgust", "funny" ou "expression": as descrições dos acervos não têm essas palavras e a busca volta vazia. Pedido: "${descricao}"` }], esquema, z.object({ termos: z.array(z.string()).min(1) }));
  return r.termos.slice(0, 4);
}

/** Ordena candidatas (miniaturas) pela adequação ao pedido e ao layout. Devolve índices na ordem. */
export async function ordenarCandidatas(descricao: string, layout: string, miniaturas: Buffer[]) {
  const partes: Part[] = [];
  miniaturas.forEach((m, i) => { partes.push({ text: `Foto ${i}:` }, { inlineData: { mimeType: 'image/jpeg', data: m.toString('base64') } }); });
  partes.push({ text: `Pedido: "${descricao}". Layout: ${layout} (texto grande em cima${layout === 'topo' ? '' : ' e embaixo'}, sem cobrir rostos). Escolha as fotos que melhor servem para um meme nesse estilo: expressão forte, cara de foto antiga encontrada, espaço livre para o texto. Devolva os números das fotos da melhor para a pior, só as que servem, com um motivo curto em português.` });
  const esquema = { type: 'object', properties: { ordem: { type: 'array', items: { type: 'object', properties: { foto: { type: 'integer' }, motivo: { type: 'string' } }, required: ['foto', 'motivo'] } } }, required: ['ordem'] };
  const { dados: r } = await pedirJson(partes, esquema, z.object({ ordem: z.array(z.object({ foto: z.number().int(), motivo: z.string() })) }));
  return r.ordem.filter((o) => o.foto >= 0 && o.foto < miniaturas.length);
}
