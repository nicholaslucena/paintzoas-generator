// O rascunho em andamento: o tema e as peças (as 3 sugestões da IA, os 3 formatos do modo
// manual ou uma peça salva reaberta). Fica no navegador e volta ao abrir o editor de novo.
import { useCallback, useEffect, useRef, useState } from 'react';
import type { Caixa, Campo, Formato, Inicio, Layout, PecaSalva, Textos, Variante } from './api';

export type Cor = string | (string | null)[];
export interface Fonte { name: string; url: string; license: string }

export interface FotoEscolhida {
  id: string | null;      // id no acervo (null: ainda não entrou)
  image: string;          // caminho que o motor lê
  url: string;
  miniatura: string;
  largura: number;
  altura: number;
  nome: string;
  descricao: string;
  fonte?: Fonte;          // de onde veio (busca); vai para o acervo ao salvar
}

/** Lugar de um texto livre num formato: canto de cima à esquerda e tamanho, em frações da peça. */
export interface LugarDoTexto { x: number; y: number; tamanho: number; /** quebra de linha própria do formato (vinda do modelo) */ texto?: string }
/**
 * Texto livre (ferramenta de texto). x, y e tamanho são a base; cada formato pode ter o seu lugar
 * (`formatos`): mover ou redimensionar no banner não mexe no story. Sem lugar próprio, vale a base.
 */
export interface TextoLivre { id: string; texto: string; cor: string; x: number; y: number; tamanho: number; formatos?: Partial<Record<Formato, LugarDoTexto>> }
/** O texto livre como fica num formato (o lugar dele ali, ou a base). */
export const livreNo = (l: TextoLivre, f: Formato): TextoLivre => ({ ...l, ...(l.formatos?.[f] ?? {}) });

export interface PecaEstado {
  layout: string;
  textos: Textos;
  estilos: Record<string, Cor>;
  foto: FotoEscolhida | null;
  foco: [number, number];
  zoom: number;
  rostos: Caixa[];
  seed: number;
  posicoes: Record<string, [number, number]>;  // texto movido na peça
  livres: TextoLivre[];   // textos fora dos campos do layout
  /** Modelo de onde a peça veio (Meme, Só no topo, Lista): os campos dele viram textos livres no editor. */
  modelo?: string;
  pecaId: string | null;  // em Minhas peças
}

export interface Rascunho {
  tela: 'inicio' | 'editor';
  tema: string;
  modo: 'ia' | 'manual' | 'salva';
  modelo: string | null;  // qual Gemini fez as sugestões
  pecas: PecaEstado[];
  ativa: number;
  anuncio: boolean;
  nome: string;           // título no canto de cima (duplo clique renomeia)
  formato: Formato;       // o que está na tela: story, feed ou banner
  mostrarSegura: boolean; // área segura por cima da peça
  estilosAbertos?: boolean; // faixa "Estilos de post" aberta (modo IA)
  /** Mudou algo desde a última vez que foi salva (ou nunca foi salva): Nova peça pergunta antes de descartar. */
  sujo?: boolean;
}

const CHAVE = 'pz-rascunho-v4';
export const novaSeed = () => Math.floor(Math.random() * 1e9);
export const pecaNova = (layout: string, m: Partial<PecaEstado> = {}): PecaEstado => ({
  layout, textos: {}, estilos: {}, foto: null, foco: [0.5, 0.5], zoom: 1, rostos: [], seed: novaSeed(), posicoes: {}, livres: [], pecaId: null, ...m,
});
export const rascunhoNovo = (): Rascunho => ({ tela: 'inicio', tema: '', modo: 'manual', modelo: null, pecas: [], ativa: 0, anuncio: false, nome: '', formato: 'story', mostrarSegura: true });

/** Foto guardada por versões antigas do editor (com { acervo: { id } } e sem miniatura). */
function normalizarFoto(f: unknown): FotoEscolhida | null {
  if (!f || typeof f !== 'object') return null;
  const x = f as FotoEscolhida & { acervo?: { id: string } };
  return { ...x, id: x.id ?? x.acervo?.id ?? null, miniatura: x.miniatura ?? x.url, descricao: x.descricao ?? '', nome: x.nome ?? '' };
}

/** Peça salva → peça no editor (vale para as salvas por qualquer versão do editor). */
export function deSalva(p: PecaSalva): PecaEstado {
  const e = p.editor as Partial<PecaEstado> & { foto?: unknown };
  return pecaNova(p.variante.layout, {
    textos: (e.textos as Textos) ?? p.variante.slots,
    estilos: (e.estilos as Record<string, Cor>) ?? {},
    foto: normalizarFoto(e.foto),
    foco: p.variante.focus,
    zoom: p.variante.zoom,
    rostos: p.variante.faces,
    seed: p.seed,
    posicoes: p.variante.posicoes ?? {},
    // o estado do editor guarda o lugar dos textos em cada formato; a variante salva só tem o do story
    livres: (e.livres as TextoLivre[] | undefined) ?? p.variante.livres ?? [],
    pecaId: p.id,
  });
}

export function useRascunho() {
  const [r, setR] = useState<Rascunho>(() => {
    try { const s = localStorage.getItem(CHAVE); return s ? { ...rascunhoNovo(), ...JSON.parse(s) } : rascunhoNovo(); } catch { return rascunhoNovo(); }
  });
  useEffect(() => { localStorage.setItem(CHAVE, JSON.stringify(r)); }, [r]);

  // Ctrl+Z: as versões anteriores das peças (só desta sessão). Mudanças seguidas em menos de
  // meio segundo (arrastar o seletor de cor, digitar) viram um passo só.
  const historico = useRef<Pick<Rascunho, 'pecas' | 'ativa' | 'formato' | 'anuncio'>[]>([]);
  const ultimoPasso = useRef(0);
  const mudar = useCallback((m: Partial<Rascunho> | ((r: Rascunho) => Partial<Rascunho>), opcoes: { historico?: boolean } = {}) => {
    setR((atual) => {
      const mudanca = typeof m === 'function' ? m(atual) : m;
      // começar outra peça (gerar, montar à mão, abrir uma salva): o histórico recomeça
      if ('tela' in mudanca || 'modo' in mudanca) historico.current = [];
      else if (opcoes.historico !== false && ('pecas' in mudanca || 'formato' in mudanca || 'anuncio' in mudanca)) {
        const agora = Date.now(), topo = historico.current.at(-1);
        // (a mesma mudança pode ser calculada duas vezes no modo de desenvolvimento: não empilha repetido)
        if (agora - ultimoPasso.current > 500 && topo?.pecas !== atual.pecas) {
          historico.current.push({ pecas: atual.pecas, ativa: atual.ativa, formato: atual.formato, anuncio: atual.anuncio });
          if (historico.current.length > 100) historico.current.shift();
        }
        ultimoPasso.current = agora;
      }
      // mexer nas peças, no nome ou no anúncio deixa o rascunho "sujo" (a não ser que a mudança diga o contrário)
      const suja = !('sujo' in mudanca) && ('pecas' in mudanca || 'nome' in mudanca || 'anuncio' in mudanca);
      return { ...atual, ...mudanca, ...(suja ? { sujo: true } : {}) };
    });
  }, []);
  /** Volta um passo (Ctrl+Z). Devolve false se não há o que desfazer. */
  const desfazer = useCallback(() => {
    const anterior = historico.current.pop();
    if (!anterior) return false;
    ultimoPasso.current = 0;
    setR((atual) => ({ ...atual, ...anterior, sujo: true }));
    return true;
  }, []);
  return [r, mudar, setR, desfazer] as const;
}

// ---------- texto ----------
/** Conta como o motor: "|" e Enter (quebras de linha) valem um espaço. */
export const contar = (t: string) => t.replace(/\s*[|\n]\s*/g, ' ').trim().length;

export function valorDoCampo(p: PecaEstado, nome: string, campo: Campo): string | string[] {
  const t = p.textos[nome];
  if (campo.list) return Array.isArray(t) ? t : typeof t === 'string' && t ? t.split(/\s*\|\s*/) : ['', '', ''];
  return Array.isArray(t) ? t.join(' | ') : t ?? '';
}

/** A receita que o motor desenha, num formato (os textos livres no lugar deles naquele formato). */
export function variante(p: PecaEstado, layout: Layout, formato: Formato): Variante {
  const slots: Textos = {}, colors: Record<string, string | string[]> = {};
  for (const [nome, c] of Object.entries(layout.campos)) {
    const t = valorDoCampo(p, nome, c);
    const cor = p.estilos[nome];
    if (Array.isArray(t)) {
      const usados = t.map((s, i) => (s.trim() ? i : -1)).filter((i) => i >= 0);
      slots[nome] = usados.length ? usados.map((i) => t[i].trim()) : '';
      // uma cor para a lista toda (paleta) ou uma por item (peças antigas)
      if (typeof cor === 'string') { if (cor) colors[nome] = cor; }
      else if (usados.some((i) => cor?.[i])) colors[nome] = usados.map((i) => cor?.[i] || '');
    } else {
      slots[nome] = t;
      if (typeof cor === 'string' && cor) colors[nome] = cor;
    }
  }
  return { layout: layout.id, image: p.foto?.image ?? '', focus: p.foco, zoom: p.zoom, faces: p.rostos, slots, colors, posicoes: p.posicoes ?? {},
    // só os que têm texto: uma caixa recém-criada, ainda vazia, não muda a peça
    livres: (p.livres ?? []).map((l) => { const { formatos: _, ...noFormato } = livreNo(l, formato); return noFormato; }).filter((l) => l.texto.trim()),
    // o editor deixa a foto andar para qualquer lado (o descoberto sai preto)
    enquadramento: 'livre' };
}

// ---------- enquadramento ----------
/** O mesmo recorte que o motor faz (enquadrar em src/motor.ts, enquadramento livre), em frações da foto. */
export function recorte(p: PecaEstado, inicio: Inicio, formato: Formato): Caixa {
  const { largura: iw, altura: ih } = p.foto!;
  const [w, h] = inicio.medidas[formato];
  const escala = Math.max(w / iw, h / ih) * p.zoom;
  const cw = w / escala, ch = h / escala;
  // enquadramento livre (o do editor): o recorte pode sair da foto; o que sobra sai preto
  return { x: p.foco[0] - cw / iw / 2, y: p.foco[1] - ch / ih / 2, w: cw / iw, h: ch / ih };
}

export const NOMES_ESTILO: Record<string, string> = { 'h3-especial': 'H3 especial (com contorno)', hero: 'Hero (com contorno)' };
export const nomeDoEstilo = (n: string) => NOMES_ESTILO[n] ?? n.charAt(0).toUpperCase() + n.slice(1);

/** Tem algo que se perderia ao descartar: mudou desde a última vez que foi salvo e tem foto ou texto. */
export function temAlgoNaoSalvo(r: Rascunho): boolean {
  // qualquer mudança desde a última vez que foi salva (ou nunca salva): sair sempre avisa
  return Boolean(r.sujo) && r.pecas.length > 0;
}

/**
 * Campos do modelo → textos livres, no lugar e no tamanho em que o motor os encaixou (a prévia
 * já medida). Texto corrido vira um texto com as mesmas quebras de linha; lista vira um texto por item.
 */
export function camposParaLivres(peca: { medidas?: Record<string, { linhas: { texto: string; caixa: Caixa }[] }>; fontePx?: Record<string, number>; cores: Record<string, string | string[]> },
  w: number, h: number): TextoLivre[] {
  const livres: TextoLivre[] = [];
  const id = () => Math.random().toString(36).slice(2, 8);
  const arred = (v: number) => Math.round(v * 1000) / 1000;
  for (const [campo, m] of Object.entries(peca.medidas ?? {})) {
    if (campo.startsWith('livre-') || !m?.linhas.length) continue;
    const lado = Math.min(w, h); // o tamanho do texto livre é em fração do lado menor da peça
    const tamanho = arred((peca.fontePx?.[campo] ?? 0.07 * lado) / lado);
    const cor = peca.cores[campo];
    if (Array.isArray(cor)) {
      m.linhas.forEach((l, i) => livres.push({ id: id(), texto: l.texto, cor: cor[i] ?? '', x: arred(l.caixa.x / w), y: arred(l.caixa.y / h), tamanho }));
    } else {
      livres.push({
        id: id(), texto: m.linhas.map((l) => l.texto).join('\n'), cor: cor ?? '', tamanho,
        x: arred(Math.min(...m.linhas.map((l) => l.caixa.x)) / w), y: arred(Math.min(...m.linhas.map((l) => l.caixa.y)) / h),
      });
    }
  }
  return livres;
}
