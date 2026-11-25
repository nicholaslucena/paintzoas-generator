// Verificações automáticas depois do render. Erro = a peça não deve ser usada como está.
import sharp from 'sharp';
import type { FormatoPronto } from './esquemas.ts';

export interface Ret { x: number; y: number; w: number; h: number }
export interface MedidaSlot { regiao: Ret; linhas: { texto: string; caixa: Ret }[] }

export const CONTRASTE_MIN = 3;

// --- contraste (fórmula do WCAG, mínimo 3:1 por decisão de marca) ---
const LIN = Array.from({ length: 256 }, (_, i) => { const c = i / 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; });
export const luminancia = (hex: string) => {
  const n = parseInt(hex.slice(1), 16);
  return 0.2126 * LIN[(n >> 16) & 255] + 0.7152 * LIN[(n >> 8) & 255] + 0.0722 * LIN[n & 255];
};
export const contraste = (a: number, b: number) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);

/** Luminância média da foto atrás de cada caixa (a partir do print sem texto). */
export async function fundoAtras(print: Buffer, caixas: Ret[], formato: FormatoPronto): Promise<number[]> {
  // abre a captura uma vez só e lê as caixas direto dos pixels (mesmo resultado de recortar cada uma)
  const { data, info } = await sharp(print).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  return caixas.map((c) => {
    const left = Math.max(0, Math.floor(c.x)), top = Math.max(0, Math.floor(c.y));
    const width = Math.min(formato.w, info.width, Math.ceil(c.x + c.w)) - left;
    const height = Math.min(formato.h, info.height, Math.ceil(c.y + c.h)) - top;
    if (width <= 0 || height <= 0) return 0;
    let soma = 0;
    for (let y = top; y < top + height; y++) {
      for (let i = (y * info.width + left) * info.channels, fim = i + width * info.channels; i < fim; i += info.channels) soma += 0.2126 * LIN[data[i]] + 0.7152 * LIN[data[i + 1]] + 0.0722 * LIN[data[i + 2]];
    }
    return soma / (width * height);
  });
}

/** Pior contraste de uma cor contra os fundos das linhas de um campo. */
export const piorContraste = (cor: string, fundos: number[]) => Math.min(...fundos.map((f) => contraste(luminancia(cor), f)));

// --- geometria ---
const dentro = (c: Ret, r: Ret, folga = 0.5) =>
  c.x >= r.x - folga && c.y >= r.y - folga && c.x + c.w <= r.x + r.w + folga && c.y + c.h <= r.y + r.h + folga;
const cruza = (a: Ret, b: Ret) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

export function areaSegura(f: FormatoPronto): Ret {
  return { x: f.safe.left, y: f.safe.top, w: f.w - f.safe.left - f.safe.right, h: f.h - f.safe.top - f.safe.bottom };
}

function lado(c: Ret, r: Ret): string {
  if (c.y < r.y) return 'em cima';
  if (c.y + c.h > r.y + r.h) return 'embaixo';
  if (c.x < r.x) return 'à esquerda';
  return 'à direita';
}

export interface Checagem {
  formato: FormatoPronto;
  medidas: Record<string, MedidaSlot>;
  encaixe: Record<string, { coube: boolean; fontePx: number }>;
  fontePx: [number, number];
  rostos: Ret[];
  areaTexto: [number, number];
  /** Nome do campo como quem usa vê (o rótulo do spec.json). */
  rotulo?: (slot: string) => string;
}

export function verificar({ formato, medidas, encaixe, fontePx, rostos, areaTexto: faixa, rotulo = (s) => s }: Checagem) {
  const erros: string[] = [];
  const avisos: string[] = [];
  const segura = areaSegura(formato);
  const nomeFormato = formato.perfil ? `${formato.nome} (${formato.perfil === 'ad' ? 'anúncio' : 'orgânico'})` : formato.nome;
  let areaTexto = 0;

  for (const [slot, m] of Object.entries(medidas)) {
    // 1. texto estourou o espaço
    if (!encaixe[slot].coube || m.linhas.some((l) => !dentro(l.caixa, m.regiao))) {
      erros.push(`"${rotulo(slot)}" não cabe no espaço nem com o tamanho mínimo (${fontePx[0]} px). Encurte o texto.`);
    }
    for (const l of m.linhas) {
      // 2. fora da margem segura
      if (!dentro(l.caixa, segura)) erros.push(`"${rotulo(slot)}", linha "${l.texto}": sai da área segura do ${nomeFormato} (${lado(l.caixa, segura)}).`);
      // 4. sobre o rosto
      if (rostos.some((r) => cruza(l.caixa, r))) erros.push(`"${rotulo(slot)}", linha "${l.texto}": fica em cima do rosto.`);
      areaTexto += l.caixa.w * l.caixa.h;
    }
  }

  const fracao = areaTexto / (formato.w * formato.h);
  if (fracao > 0 && (fracao < faixa[0] || fracao > faixa[1])) {
    avisos.push(`O texto ocupa ${Math.round(fracao * 100)}% da peça (o normal neste layout é de ${Math.round(faixa[0] * 100)}% a ${Math.round(faixa[1] * 100)}%).`);
  }
  return { erros, avisos };
}

/** 5. comprimento: acima do máximo é erro; o texto nunca é cortado. */
export function verificarTamanho(slots: Record<string, string | string[]>, limites: Record<string, { max_chars: number; max_lines: number }>, rotulo: (slot: string) => string = (s) => s) {
  const erros: string[] = [];
  for (const [slot, texto] of Object.entries(slots)) {
    const limite = limites[slot];
    if (Array.isArray(texto)) {
      if (limite && texto.length > limite.max_lines) erros.push(`"${rotulo(slot)}" tem ${texto.length} itens (máximo ${limite.max_lines}).`);
      for (const item of texto) {
        if (limite && item.length > limite.max_chars) erros.push(`"${rotulo(slot)}", item "${item}": ${item.length} caracteres (máximo ${limite.max_chars}). Encurte o item.`);
      }
      continue;
    }
    const limpo = texto.replace(/\s*\|\s*/g, ' ');
    if (limite && limpo.length > limite.max_chars) erros.push(`"${rotulo(slot)}" tem ${limpo.length} caracteres (máximo ${limite.max_chars}). Encurte o texto.`);
    const manuais = texto.split(/\s*(?:\||\n)\s*/).filter(Boolean).length;
    if (limite && manuais > limite.max_lines) erros.push(`"${rotulo(slot)}" foi quebrado em ${manuais} linhas (máximo ${limite.max_lines}).`);
  }
  return erros;
}
