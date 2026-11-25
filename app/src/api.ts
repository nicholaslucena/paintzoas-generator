// Chamadas ao servidor do editor (src/app/servidor.ts). Erros chegam como { erro } e viram Error.
import { caberNoEnvio } from './lib/arquivos';

export interface Campo {
  max_chars: number;
  max_lines: number;
  region: string;
  list?: boolean;
  label?: string;
  hint?: string;
}
export interface Layout { id: string; nome: string; descricao: string; formatos: string[]; campos: Record<string, Campo> }
export interface Estilo { nome: string; cor: string; contorno: string | null }
export interface Margens { top: number; bottom: number; left: number; right: number }
export type Formato = 'story' | 'feed' | 'banner' | 'banner-celular';
export const NOMES_FORMATO: Record<Formato, string> = { story: 'Story', feed: 'Feed', banner: 'Banner do site', 'banner-celular': 'Banner no celular' };
export interface Inicio {
  layouts: Layout[];
  estilos: Estilo[];
  formatos: Formato[];
  medidas: Record<Formato, [number, number]>;
  seguras: { story: Margens; 'story-ad': Margens; feed: Margens; banner: Margens; 'banner-celular': Margens };
  fontes: { id: string; nome: string; descricao: string }[];
}
export interface Uso { pedidos: number; limite: number | null; esgotadoAte: string | null }
export interface UsoDoModelo extends Uso { id: string; nome: string }
/** `uso.esgotadoAte` só vem preenchido quando os dois modelos estão sem cota hoje. */
export interface Config { temGemini: boolean; modelos: UsoDoModelo[]; uso: Uso }

export interface Caixa { x: number; y: number; w: number; h: number }
export interface Candidata {
  fonte: string; titulo: string; miniatura: string; imagem: string; pagina: string;
  direitos: string; autor: string; data: string; tamanho: string; motivo?: string;
}
export interface ItemAcervo {
  id: string; file: string; miniatura: string; largura: number; altura: number;
  source: { name: string; url: string; license: string };
  descricao: string; rostos: Caixa[];
  url: string; urlMiniatura: string; image: string;
}
export interface FotoEnviada { image: string; url: string; largura: number; altura: number; nome: string }
/** Uma peça sugerida pela IA: o texto, a busca e a foto que a busca achou (null se nenhuma baixou). */
export interface Sugestao {
  layout: string;
  textos: Textos;
  busca: string;
  foto: (FotoEnviada & { fonte: { name: string; url: string; license: string } }) | null;
}

export type Textos = Record<string, string | string[]>;
export interface Medida { regiao: Caixa; linhas: { texto: string; caixa: Caixa }[] }
export interface Peca {
  formato: string;
  layout: string;
  medida?: { w: number; h: number; safe: Margens };
  rostos?: Caixa[];
  cores: Record<string, string | string[]>;
  medidas?: Record<string, Medida>;
  /** Tamanho da letra escolhido para cada campo (px da peça). */
  fontePx?: Record<string, number>;
  erros: string[];
  avisos: string[];
}
export interface Variante {
  layout: string; image: string; focus: [number, number]; zoom: number; faces: Caixa[];
  slots: Textos; colors: Record<string, string | string[]>;
  /** Deslocamento de cada campo, em frações da peça. */
  posicoes: Record<string, [number, number]>;
  /** Textos livres: canto de cima à esquerda (x, y) e tamanho da letra, em frações da peça. */
  livres: { id: string; texto: string; cor: string; x: number; y: number; tamanho: number }[];
  /** "livre": a foto pode sair da peça (o descoberto sai preto); "cobrir": sempre cobre. */
  enquadramento?: 'cobrir' | 'livre';
}
export interface PecaSalva {
  id: string; salva_em: string; titulo: string; layout: string; miniatura: string | null;
  variante: Variante; seed: number; anuncio: boolean; editor: Record<string, unknown>;
}

export class ErroDaApi extends Error {
  semIa: boolean;
  constructor(mensagem: string, semIa = false) { super(mensagem); this.semIa = semIa; }
}

async function pedir<T>(url: string, corpo?: unknown, metodo = corpo === undefined ? 'GET' : 'POST', sinal?: AbortSignal): Promise<T> {
  let r: Response;
  try {
    r = await fetch(url, {
      method: metodo,
      headers: corpo === undefined ? undefined : { 'content-type': 'application/json' },
      body: corpo === undefined ? undefined : JSON.stringify(corpo),
      signal: sinal,
    });
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw e;
    throw new ErroDaApi('O editor não respondeu. Ele ainda está rodando?');
  }
  // o PNG final da prévia vem como arquivo, com a peça no cabeçalho
  if (r.ok && r.headers.get('content-type')?.startsWith('image/')) {
    return { peca: JSON.parse(decodeURIComponent(r.headers.get('x-peca') ?? 'null')), blob: await r.blob() } as T;
  }
  const dados = await r.json().catch(() => ({}));
  // a sessão venceu no meio do uso: recarrega e cai na tela de login
  if (r.status === 401 && url !== '/api/sessao') { location.reload(); throw new ErroDaApi('Entre de novo.'); }
  if (!r.ok) throw new ErroDaApi(dados.erro ?? `Algo deu errado (${r.status}).`, Boolean(dados.semIa));
  return dados as T;
}

export const api = {
  inicio: () => pedir<Inicio>('/api/inicio'),
  config: () => pedir<Config>('/api/config'),
  sessao: () => pedir<{ exige: boolean; entrou: boolean }>('/api/sessao'),
  entrar: (usuario: string, senha: string) => pedir<{ entrou: boolean }>('/api/sessao', { usuario, senha }),
  sair: () => pedir<{ entrou: boolean }>('/api/sessao', undefined, 'DELETE'),
  /** Mini-imagem de uma fonte de fotos (para o menu "Buscar fotos em"). */
  amostraDaFonte: (id: string) => pedir<{ miniatura: string | null }>(`/api/fontes/amostra?id=${encodeURIComponent(id)}`),
  sugestoes: (tema: string, fontes?: string[]) => pedir<{ pecas: Sugestao[]; modelo: string; aviso: string | null }>('/api/sugestoes', { tema, fontes }),
  buscar: (descricao: string, layout: string, comIa: boolean, fontes: string[]) =>
    pedir<{ termos: string[]; candidatas: Candidata[]; avisos: string[]; comIa: boolean }>('/api/buscar-fotos', { descricao, layout, comIa, fontes }),
  ordenar: (descricao: string, layout: string, miniaturas: string[]) =>
    pedir<{ ordem: { foto: number; motivo: string }[] }>('/api/ordenar-fotos', { descricao, layout, miniaturas }),
  baixarFoto: (c: Candidata) => pedir<FotoEnviada>('/api/baixar-foto', c),
  async enviarFoto(original: Blob, nome: string): Promise<FotoEnviada> {
    const arquivo = await caberNoEnvio(original);
    if (arquivo !== original) nome = nome.replace(/\.\w+$/, '') + '.jpg'; // reduzida: virou JPEG
    const r = await fetch('/api/fotos', { method: 'POST', body: arquivo, headers: { 'x-nome': encodeURIComponent(nome) } });
    const dados = await r.json().catch(() => ({}));
    if (!r.ok) throw new ErroDaApi(dados.erro ?? 'Não consegui enviar a foto.');
    return dados;
  },
  acervo: () => pedir<ItemAcervo[]>('/api/acervo'),
  guardarNoAcervo: (image: string, descricao: string, source?: { name: string; url: string; license: string }) =>
    pedir<ItemAcervo>('/api/acervo', { image, descricao, ...(source ? { source } : {}) }),
  mudarItem: (id: string, mudancas: Partial<Pick<ItemAcervo, 'rostos' | 'descricao'>>) => pedir<ItemAcervo>(`/api/acervo/${id}`, mudancas),
  lerFoto: (id: string) => pedir<ItemAcervo & { rostosDaIa: boolean }>(`/api/ler-foto/${id}`, {}),
  prever: (variante: Variante, seed: number, formato: Formato, anuncio: boolean, opcoes: { canal?: string; rapida?: boolean } = {}, sinal?: AbortSignal) =>
    pedir<{ superado: true } | { peca: Peca; png?: string | null; tipo?: string; texto?: string | null; blob?: Blob }>('/api/prever',
      { variante, seed, formato, perfilStory: anuncio ? 'ad' : 'organic', canal: opcoes.canal, rapida: opcoes.rapida }, 'POST', sinal),
  pecas: () => pedir<PecaSalva[]>('/api/pecas'),
  salvarPeca: (id: string | null, rascunho: { variante: Variante; seed: number; anuncio: boolean; titulo?: string; editor: unknown }, miniatura: string | null) =>
    pedir<PecaSalva>('/api/pecas', { id: id ?? undefined, rascunho, miniatura }),
  apagarPeca: (id: string) => pedir<{ ok: true }>(`/api/pecas/${id}`, undefined, 'DELETE'),
};
