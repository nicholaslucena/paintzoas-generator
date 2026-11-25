// Imperfeição programada: quebra de linha, rotação, recuo, tamanho e linha de base.
// Tudo sai de um aleatório com seed, então o mesmo JSON gera sempre a mesma peça.

export const REGRAS = {
  rotacaoGraus: 3,      // cada linha gira entre −3° e +3°
  baseEm: 0.05,         // cada palavra sobe ou desce até 0,05em
  recuoLargura: 0.04,   // cada linha entra de 0 a 4% da largura da peça
  tamanho: 0.08,        // cada linha varia ±8% do tamanho
  palavrasPorLinha: [2, 5] as const,
};

/** mulberry32: aleatório de 32 bits, rápido e reproduzível. */
export function aleatorio(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Seed derivada (FNV-1a) de várias partes: campanha, variante, campo. */
export function seedDe(...partes: (string | number)[]): number {
  let h = 0x811c9dc5;
  for (const ch of partes.join('\u0000')) {
    h ^= ch.codePointAt(0)!;
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h;
}

export interface Linha {
  palavras: { texto: string; baseEm: number }[];
  rotacao: number;   // graus
  recuo: number;     // fração da largura da peça
  tamanho: number;   // multiplicador do tamanho base
}

// Palavras que não devem ficar sozinhas no fim de uma linha ("NÃO GOSTEI do / cupom")
const PENDURADAS = new Set('a o e é as os um uma do da dos das de no na nos nas em com pra pro por que se ao à meu minha seu sua'.split(' '));

/**
 * Quebras de linha candidatas para um texto. O render testa cada uma e fica com a que
 * deixa o texto maior dentro do espaço. "|" ou quebra de linha no texto forçam a quebra.
 */
export function candidatas(texto: string, maxLinhas: number): string[][][] {
  const manual = texto.split(/\s*(?:\||\n)\s*/).filter(Boolean);
  if (manual.length > 1) return [manual.map((l) => l.split(/\s+/))];

  const palavras = texto.trim().split(/\s+/);
  const n = palavras.length;
  const [minP, maxP] = REGRAS.palavrasPorLinha;
  const saida: string[][][] = [];

  for (let linhas = 1; linhas <= Math.min(maxLinhas, n); linhas++) {
    let melhor: { divisao: string[][]; nota: number } | null = null;
    for (const cortes of combinacoes(n - 1, linhas - 1)) {
      const divisao: string[][] = [];
      let ini = 0;
      for (const c of [...cortes, n - 1]) { divisao.push(palavras.slice(ini, c + 1)); ini = c + 1; }
      const contagens = divisao.map((l) => l.length);
      // 2 a 5 palavras por linha; com poucas palavras, aceita linha de 1
      const minimo = n >= minP * linhas ? minP : 1;
      if (contagens.some((c) => c < minimo || c > maxP)) continue;
      const tamanhos = divisao.map((l) => l.join(' ').length);
      const maior = Math.max(...tamanhos);
      const media = tamanhos.reduce((s, t) => s + t, 0) / linhas;
      const desvio = tamanhos.reduce((s, t) => s + (t - media) ** 2, 0) / linhas;
      const penduradas = divisao.slice(0, -1).filter((l) => PENDURADAS.has(l[l.length - 1].toLowerCase())).length;
      const nota = maior * 10 + Math.sqrt(desvio) + penduradas * 60;
      if (!melhor || nota < melhor.nota) melhor = { divisao, nota };
    }
    if (melhor) saida.push(melhor.divisao);
  }
  return saida;
}

function* combinacoes(n: number, k: number, ini = 0, atual: number[] = []): Generator<number[]> {
  if (atual.length === k) { yield atual; return; }
  for (let i = ini; i < n; i++) yield* combinacoes(n, k, i + 1, [...atual, i]);
}

/** Aplica a imperfeição às linhas. A mesma seed dá sempre as mesmas rotações e deslocamentos. */
export function imperfeitas(linhas: string[][], seed: number): Linha[] {
  // Um sorteio por linha e um por palavra: a linha 2 gira igual em qualquer quebra testada
  const entre = (r: () => number, a: number, b: number) => a + (b - a) * r();
  return linhas.map((palavras, i) => {
    const r = aleatorio(seedDe(seed, 'linha', i));
    return {
      rotacao: round(entre(r, -REGRAS.rotacaoGraus, REGRAS.rotacaoGraus), 2),
      recuo: round(entre(r, 0, REGRAS.recuoLargura), 4),
      tamanho: round(entre(r, 1 - REGRAS.tamanho, 1 + REGRAS.tamanho), 3),
      palavras: palavras.map((texto, j) => {
        const rp = aleatorio(seedDe(seed, 'palavra', i, j));
        return { texto, baseEm: round(entre(rp, -REGRAS.baseEm, REGRAS.baseEm), 3) };
      }),
    };
  });
}

const round = (v: number, casas: number) => Math.round(v * 10 ** casas) / 10 ** casas;
