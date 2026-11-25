// Acervo de fotos (library/library.json + library/images/) e histórico de peças (pecas/).
// Toda foto usada no estúdio entra aqui sozinha, com a fonte quando vem da busca.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import sharp from 'sharp';
import { z } from 'zod';
import { RAIZ_GERADOR } from '../design-system.ts';
import { Variante } from '../esquemas.ts';

export const PASTA_BIBLIOTECA = path.join(RAIZ_GERADOR, 'library');
const PASTA_FOTOS = path.join(PASTA_BIBLIOTECA, 'images');
const ARQUIVO_ACERVO = path.join(PASTA_BIBLIOTECA, 'library.json');
export const PASTA_PECAS = path.join(RAIZ_GERADOR, 'pecas');

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

export function lerAcervo(): ItemAcervo[] {
  if (!fs.existsSync(ARQUIVO_ACERVO)) return [];
  return z.array(ItemAcervo).parse(JSON.parse(fs.readFileSync(ARQUIVO_ACERVO, 'utf8')));
}
function gravarAcervo(itens: ItemAcervo[]) {
  fs.mkdirSync(PASTA_BIBLIOTECA, { recursive: true });
  fs.writeFileSync(ARQUIVO_ACERVO, JSON.stringify(itens, null, 2) + '\n');
}

/** Luminância média de cada terço (cima, meio, baixo) e a cor dominante, medidas no sharp. */
async function medirFoto(arquivo: string) {
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
  const origem = path.resolve(RAIZ_GERADOR, dados.image);
  if (!origem.startsWith(PASTA_BIBLIOTECA + path.sep) || !fs.existsSync(origem)) throw new Error('Foto não encontrada. Envie de novo.');
  const conteudo = fs.readFileSync(origem);
  const id = crypto.createHash('sha1').update(conteudo).digest('hex').slice(0, 12);
  const itens = lerAcervo();
  const existente = itens.find((i) => i.id === id);
  fs.mkdirSync(PASTA_FOTOS, { recursive: true });
  const ext = path.extname(origem).toLowerCase();
  const file = `images/${id}${ext}`;
  const miniatura = `images/${id}.min.jpg`;
  if (!fs.existsSync(path.join(PASTA_BIBLIOTECA, file))) fs.writeFileSync(path.join(PASTA_BIBLIOTECA, file), conteudo);
  await sharp(conteudo).rotate().resize(480, 480, { fit: 'inside' }).jpeg({ quality: 80 }).toFile(path.join(PASTA_BIBLIOTECA, miniatura));
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
    ...(await medirFoto(path.join(PASTA_BIBLIOTECA, file))),
    adicionada_em: existente?.adicionada_em ?? new Date().toISOString(),
  });
  gravarAcervo([item, ...itens.filter((i) => i.id !== id)]);
  return item;
}

export function atualizarItem(id: string, mudancas: Partial<ItemAcervo>): ItemAcervo {
  const itens = lerAcervo();
  const i = itens.findIndex((x) => x.id === id);
  if (i < 0) throw new Error('Foto não encontrada no acervo.');
  itens[i] = ItemAcervo.parse({ ...itens[i], ...mudancas, id });
  gravarAcervo(itens);
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

export function listarPecas(): PecaSalva[] {
  if (!fs.existsSync(PASTA_PECAS)) return [];
  return fs.readdirSync(PASTA_PECAS, { withFileTypes: true })
    .filter((d) => d.isDirectory() && fs.existsSync(path.join(PASTA_PECAS, d.name, 'peca.json')))
    .map((d) => {
      const p = JSON.parse(fs.readFileSync(path.join(PASTA_PECAS, d.name, 'peca.json'), 'utf8'));
      const mini = ['mini.jpg', 'story.png'].find((f) => fs.existsSync(path.join(PASTA_PECAS, d.name, f)));
      return { ...p, miniatura: mini ? `${d.name}/${mini}` : null } as PecaSalva;
    })
    .sort((a, b) => b.salva_em.localeCompare(a.salva_em));
}

export function salvarPeca(id: string | undefined, rascunho: z.infer<typeof Rascunho>, miniatura: Buffer | null): PecaSalva {
  const agora = new Date();
  const novoId = id && /^[\w-]+$/.test(id) ? id : agora.toISOString().replace(/\D/g, '').slice(0, 14) + '-' + crypto.randomBytes(2).toString('hex');
  const pasta = path.join(PASTA_PECAS, novoId);
  fs.mkdirSync(pasta, { recursive: true });
  if (miniatura) fs.writeFileSync(path.join(pasta, 'mini.jpg'), miniatura);
  // PNGs de antes deste formato saem quando a peça é salva de novo
  for (const f of ['story.png', 'feed.png']) fs.rmSync(path.join(pasta, f), { force: true });
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
  fs.writeFileSync(path.join(pasta, 'peca.json'), JSON.stringify(dados, null, 2) + '\n');
  return { ...dados, miniatura: miniatura ? `${novoId}/mini.jpg` : null };
}

export function apagarPeca(id: string) {
  if (!/^[\w-]+$/.test(id)) throw new Error('Peça inválida.');
  fs.rmSync(path.join(PASTA_PECAS, id), { recursive: true, force: true });
}
