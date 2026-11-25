// Formato dos arquivos de entrada (campanha, layout, formatos), validados com zod.
import fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { RAIZ_GERADOR } from './design-system.ts';

z.config(z.locales.pt()); // mensagens de validação em português

const fracao = z.number().min(0).max(1);
const Caixa = z.object({ x: fracao, y: fracao, w: fracao, h: fracao });

export const Variante = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/, 'use só letras minúsculas, números e hífen').optional(),
  layout: z.string(),
  image: z.string(),
  /** Ponto da foto (0 a 1) que fica o mais perto possível do centro da peça. [0.5, 0] = centro, topo. */
  focus: z.tuple([z.number().min(-2).max(3), z.number().min(-2).max(3)]).default([0.5, 0.5]),
  /**
   * "cobrir" (padrão): a foto cobre a peça toda; o foco é ajustado para não sobrar faixa vazia.
   * "livre" (editor): a foto vai para onde o foco mandar; o que ficar descoberto sai preto.
   */
  enquadramento: z.enum(['cobrir', 'livre']).default('cobrir'),
  /** Aproxima a foto a partir do ponto de foco (1 = cobre a peça; abaixo de 1, só no enquadramento livre, sobra preto). */
  zoom: z.number().min(0.2).max(5).default(1),
  /** Rostos na foto original, em frações (0 a 1). Na fase 2 vêm do library.json. */
  faces: z.array(Caixa).default([]),
  /** Muda só a imperfeição desta variante (para sortear de novo). */
  seed: z.number().int().optional(),
  /** Texto de cada campo. Num campo de lista, uma lista de itens (um por linha). */
  slots: z.record(z.string(), z.union([z.string(), z.array(z.string()).min(1)])),
  /** Estilo de cada campo; num campo de lista, pode ser um por item. */
  colors: z.record(z.string(), z.union([z.string(), z.array(z.string())])).default({}),
  /** Deslocamento de cada campo a partir do lugar do layout, em frações da peça ([x, y]; 0.1 = 10% da largura/altura). */
  posicoes: z.record(z.string(), z.tuple([z.number().min(-1).max(1), z.number().min(-1).max(1)])).default({}),
  /** Textos livres (ferramenta de texto do editor): fora dos campos do layout, com lugar e tamanho escolhidos à mão. */
  livres: z.array(z.object({
    id: z.string().regex(/^[a-z0-9]+$/),
    /** Enter ou "|" quebra a linha (a quebra é a de quem escreveu). */
    texto: z.string(),
    /** Estilo ou cor hex; vazio = o motor escolhe a mais legível. */
    cor: z.string().default(''),
    /** Canto de cima à esquerda do bloco, em frações da peça. */
    x: z.number().min(-1).max(2),
    y: z.number().min(-1).max(2),
    /** Tamanho da letra, em fração do lado menor da peça (0.06 = 6%; no story e no feed, a largura). */
    tamanho: z.number().min(0.01).max(0.5),
  })).default([]),
});
export type Livre = z.infer<typeof Variante>['livres'][number];

export const Campanha = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/, 'use só letras minúsculas, números e hífen'),
  seed: z.number().int(),
  formats: z.array(z.string()).min(1),
  story_profile: z.enum(['organic', 'ad']).optional(),
  variants: z.array(Variante).min(1),
});

export const Layout = z.object({
  id: z.string(),
  /** Nome e explicação mostrados no editor. */
  nome: z.string().default(''),
  descricao: z.string().default(''),
  formats: z.array(z.string()),
  slots: z.record(z.string(), z.object({
    max_chars: z.number().int(),   // num campo de lista: por item
    max_lines: z.number().int(),   // num campo de lista: número máximo de itens
    region: z.string(),
    /** Campo de lista: cada item numa linha, cada um com sua cor. */
    list: z.boolean().default(false),
    /** Rótulo e dica do campo no editor. */
    label: z.string().optional(),
    hint: z.string().optional(),
  })),
  image: z.object({ requires_free_area: z.array(z.string()) }).optional(),
  colors: z.object({ distinct_between_slots: z.boolean(), palette: z.string() }),
  font_px: z.record(z.string(), z.tuple([z.number(), z.number()])),
  /** Depois de achar o maior tamanho que cabe, multiplica por este fator (1 = ocupa o campo todo). */
  text_scale: z.number().min(0.3).max(1).default(1),
  /** Faixa normal da área ocupada pelo texto (fração da peça); fora dela, o QA avisa. */
  text_area: z.tuple([z.number(), z.number()]).default([0.2, 0.35]),
});

const Margens = z.object({ top: z.number(), bottom: z.number(), left: z.number(), right: z.number() });
const Formato = z.object({
  size: z.union([z.tuple([z.number(), z.union([z.number(), z.literal('auto')])]), z.literal('TODO')]),
  safe: Margens.optional(),
  safe_profiles: z.record(z.string(), Margens).optional(),
  default_profile: z.string().optional(),
  note: z.string().optional(),
  export_scale: z.number().optional(),
});

export type Campanha = z.infer<typeof Campanha>;
export type Variante = z.infer<typeof Variante>;
export type Layout = z.infer<typeof Layout>;
export type Margens = z.infer<typeof Margens>;
export interface FormatoPronto { nome: string; w: number; h: number; safe: Margens; perfil?: string }

function lerJson(arquivo: string): unknown {
  return JSON.parse(fs.readFileSync(arquivo, 'utf8'));
}

/** Lê e valida; o erro aponta o arquivo e o campo. */
export function validar<T>(esquema: z.ZodType<T>, arquivo: string): T {
  const r = esquema.safeParse(lerJson(arquivo));
  if (r.success) return r.data;
  const linhas = r.error.issues.map((i) => `  ${i.path.join('.') || '(raiz)'}: ${i.message}`);
  const nome = arquivo.startsWith(RAIZ_GERADOR + path.sep) ? path.relative(RAIZ_GERADOR, arquivo) : arquivo;
  throw new Error(`${nome} tem problemas:\n${linhas.join('\n')}`);
}

export function lerLayout(id: string): Layout {
  return validar(Layout, path.join(RAIZ_GERADOR, 'layouts', id, 'spec.json'));
}

export function lerFormato(nome: string, perfilStory?: string): FormatoPronto {
  const todos = validar(z.record(z.string(), Formato), path.join(RAIZ_GERADOR, 'config', 'formats.json'));
  const f = todos[nome];
  if (!f) throw new Error(`Formato "${nome}" não existe em config/formats.json`);
  if (f.size === 'TODO' || f.size[1] === 'auto') throw new Error(`Formato "${nome}" ainda não tem medida definida em config/formats.json`);
  const perfil = f.safe_profiles ? (perfilStory ?? f.default_profile) : undefined;
  const safe = perfil ? f.safe_profiles?.[perfil] : f.safe;
  if (!safe) throw new Error(`Formato "${nome}" sem margem segura${perfil ? ` para o perfil "${perfil}"` : ''}`);
  return { nome, w: f.size[0], h: f.size[1], safe, perfil };
}
