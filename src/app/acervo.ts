// Acervo de fotos (library/library.json + library/images/) e histórico de peças (pecas/).
// Toda foto usada no estúdio entra aqui sozinha, com a fonte quando vem da busca.
// Os arquivos passam pelo armazém: disco no computador, Blob na Vercel.
import path from 'node:path';
import crypto from 'node:crypto';
import sharp from 'sharp';
import { z } from 'zod';
import { Variante } from '../esquemas.ts';
import { armazem } from './armazem.ts';

const ARQUIVO_ACERVO = 'library/library.json';

const fracao = z.number().min(0).max(1);
const Caixa = z.object({ x: fracao, y: fracao, w: fracao, h: fracao });
export const USOS = ['organico', 'promo'] as const;

/** Item do acervo, no formato do handover (seção 6), com os nomes de campo de lá. */
export const ItemAcervo = z.object({
  id: z.string(),
  file: z.string(),               // relativo a library/
  miniatura: z.string(),          // relativo a library/
  largura: z.number(),
  altura: z.number(),
  source: z.object({ name: z.string(), url: z.string().default(''), license: z.string().default('') }),
  uso_permitido: z.array(z.enum(USOS)).default([]),
  pessoas_reconheciveis: z.boolean().default(true),
  descricao: z.string().default(''),
  energia: z.array(z.string()).default([]),
  rostos: z.array(Caixa).default([]),
  areas_livres: z.array(z.string()).default([]),
  luminancia_por_regiao: z.object({ top: z.number(), meio: z.number(), bottom: z.number() }),
  cor_dominante: z.string(),
  adicionada_em: z.string(),
});
export type ItemAcervo = z.infer<typeof ItemAcervo>;

/** O que quem usa preenche ao guardar uma foto. */
export const NovoItem = z.object({
  image: z.string(),              // relativo ao gerador (library/uploads/...)
  source: z.object({ name: z.string().default('Enviada por você'), url: z.string().default(''), license: z.string().default('') }).default({ name: 'Enviada por você', url: '', license: '' }),
  uso_permitido: z.array(z.enum(USOS)).default([]),
  pessoas_reconheciveis: z.boolean().default(true),
  descricao: z.string().default(''),
  rostos: z.array(Caixa).default([]),
});

export async function lerAcervo(): Promise<ItemAcervo[]> {
  const dados = await armazem.ler(ARQUIVO_ACERVO);
  return dados ? z.array(ItemAcervo).parse(JSON.parse(dados.toString('utf8'))) : [];
}
async function gravarAcervo(itens: ItemAcervo[]) {
  await armazem.gravar(ARQUIVO_ACERVO, JSON.stringify(itens, null, 2) + '\n');
}

/** Luminância média de cada terço (cima, meio, baixo) e a cor dominante, medidas no sharp. */
async function medirFoto(arquivo: Buffer) {
  const { data, info } = await sharp(arquivo).rotate().resize(60, 60, { fit: 'fill' }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const lin = (c: number) => { const v = c / 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
  const tercos = [0, 0, 0];
  for (let y = 0; y < info.height; y++) for (let x = 0; x < info.width; x++) {
    const i = (y * info.width + x) * 3;
    tercos[Math.min(2, Math.floor((y / info.height) * 3))] += 0.2126 * lin(data[i]) + 0.7152 * lin(data[i + 1]) + 0.0722 * lin(data[i + 2]);
  }
  const porTerco = (info.width * info.height) / 3;
  const { dominant } = await sharp(arquivo).stats();
  const hex = (n: number) => n.toString(16).padStart(2, '0');
  const r2 = (v: number) => Math.round(v * 100) / 100;
  return {
    luminancia_por_regiao: { top: r2(tercos[0] / porTerco), meio: r2(tercos[1] / porTerco), bottom: r2(tercos[2] / porTerco) },
    cor_dominante: `#${hex(dominant.r)}${hex(dominant.g)}${hex(dominant.b)}`,
  };
}

export async function guardarNoAcervo(dados: z.infer<typeof NovoItem>): Promise<ItemAcervo> {
  const conteudo = dados.image.startsWith('library/') ? await armazem.ler(dados.image) : null;
  if (!conteudo) throw new Error('Foto não encontrada. Envie de novo.');
  const id = crypto.createHash('sha1').update(conteudo).digest('hex').slice(0, 12);
  const itens = await lerAcervo();
  const existente = itens.find((i) => i.id === id);
  const ext = path.extname(dados.image).toLowerCase();
  const file = `images/${id}${ext}`;
  const miniatura = `images/${id}.min.jpg`;
  if (!(await armazem.existe(`library/${file}`))) await armazem.gravar(`library/${file}`, conteudo);
  await armazem.gravar(`library/${miniatura}`, await sharp(conteudo).rotate().resize(480, 480, { fit: 'inside' }).jpeg({ quality: 80 }).toBuffer());
  const meta = await sharp(conteudo).metadata();
  const girada = (meta.orientation ?? 1) >= 5;
  const item: ItemAcervo = ItemAcervo.parse({
    ...existente,
    id, file, miniatura,
    largura: girada ? meta.height : meta.width,
    altura: girada ? meta.width : meta.height,
    // usar de novo uma foto já guardada não apaga a fonte nem os usos que ela já tinha
    source: existente && dados.source.name === 'Enviada por você' ? existente.source : dados.source,
    uso_permitido: dados.uso_permitido.length ? dados.uso_permitido : existente?.uso_permitido ?? [],
    pessoas_reconheciveis: dados.pessoas_reconheciveis,
    descricao: dados.descricao || existente?.descricao || '',
    rostos: dados.rostos.length ? dados.rostos : existente?.rostos ?? [],
    ...(await medirFoto(conteudo)),
    adicionada_em: existente?.adicionada_em ?? new Date().toISOString(),
  });
  await gravarAcervo([item, ...itens.filter((i) => i.id !== id)]);
  return item;
}

export async function atualizarItem(id: string, mudancas: Partial<ItemAcervo>): Promise<ItemAcervo> {
  const itens = await lerAcervo();
  const i = itens.findIndex((x) => x.id === id);
  if (i < 0) throw new Error('Foto não encontrada no acervo.');
  itens[i] = ItemAcervo.parse({ ...itens[i], ...mudancas, id });
  await gravarAcervo(itens);
  return itens[i];
}

// ---------- histórico de peças ----------
export const Rascunho = z.object({
  variante: Variante,
  seed: z.number().int(),
  anuncio: z.boolean().default(false),
  /** Nome dado no editor (duplo clique no título); sem nome, o título vem dos textos. */
  titulo: z.string().optional(),
  /** O que o editor precisa para reabrir (foto, textos, estilos…), guardado como veio. */
  editor: z.record(z.string(), z.unknown()),
});

/**
 * Peça salva = a receita (variante + seed) e uma miniatura. O PNG não é guardado: baixar de
 * Minhas peças roda o motor de novo, com o mesmo resultado. Peças antigas (23/11) ainda têm
 * story.png e feed.png; a miniatura delas é o story.
 */
export interface PecaSalva {
  id: string;
  salva_em: string;
  titulo: string;
  layout: string;
  miniatura: string | null;          // caminho relativo a pecas/
  variante: z.infer<typeof Variante>;
  seed: number;
  anuncio: boolean;
  editor: Record<string, unknown>;
}

export async function listarPecas(): Promise<PecaSalva[]> {
  // uma listagem só (no Blob, cada listagem conta na cota) e depois o peca.json de cada uma
  const chaves = new Set(await armazem.listar('pecas/'));
  const ids = [...new Set([...chaves].map((c) => c.split('/')[1]))].filter((id) => chaves.has(`pecas/${id}/peca.json`));
  const pecas = await Promise.all(ids.map(async (id) => {
    const dados = await armazem.ler(`pecas/${id}/peca.json`);
    if (!dados) return null;
    const mini = ['mini.jpg', 'story.png'].find((f) => chaves.has(`pecas/${id}/${f}`));
    return { ...JSON.parse(dados.toString('utf8')), miniatura: mini ? `${id}/${mini}` : null } as PecaSalva;
  }));
  return pecas.filter((p): p is PecaSalva => p !== null).sort((a, b) => b.salva_em.localeCompare(a.salva_em));
}

export async function salvarPeca(id: string | undefined, rascunho: z.infer<typeof Rascunho>, miniatura: Buffer | null): Promise<PecaSalva> {
  const agora = new Date();
  const novoId = id && /^[\w-]+$/.test(id) ? id : agora.toISOString().replace(/\D/g, '').slice(0, 14) + '-' + crypto.randomBytes(2).toString('hex');
  if (miniatura) await armazem.gravar(`pecas/${novoId}/mini.jpg`, miniatura);
  // PNGs de antes deste formato saem quando a peça é salva de novo
  for (const f of ['story.png', 'feed.png']) if (await armazem.existe(`pecas/${novoId}/${f}`)) await armazem.apagarTudo(`pecas/${novoId}/${f}`);
  const textos = Object.values(rascunho.variante.slots).flat().filter(Boolean);
  const dados = {
    id: novoId,
    salva_em: agora.toISOString(),
    titulo: rascunho.titulo?.trim().slice(0, 120) || textos.join(' · ').slice(0, 120) || 'Sem texto',
    layout: rascunho.variante.layout,
    variante: rascunho.variante,
    seed: rascunho.seed,
    anuncio: rascunho.anuncio,
    editor: rascunho.editor,
  };
  await armazem.gravar(`pecas/${novoId}/peca.json`, JSON.stringify(dados, null, 2) + '\n');
  return { ...dados, miniatura: miniatura ? `${novoId}/mini.jpg` : null };
}

export async function apagarPeca(id: string) {
  if (!/^[\w-]+$/.test(id)) throw new Error('Peça inválida.');
  await armazem.apagarTudo(`pecas/${id}/`);
}
