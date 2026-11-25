// Prévias renderizadas pelo motor, guardadas no navegador: o editor, as miniaturas das
// sugestões e os downloads usam a mesma peça sem pedir de novo ao servidor.
// Duas qualidades: a "rápida" (editor: JPEG + camada só com as letras) e a final (PNG, a que é
// baixada). A final serve para tudo; a rápida nunca vai para um download.
import { useEffect, useState } from 'react';
import { api, type Formato, type Peca, type Variante } from './api';
import { base64ParaBlob } from './lib/arquivos';

export interface Previa {
  chave: string;
  chaveRecorte: string;
  /** Igual entre prévias que só mudam a foto (foco, zoom) ou a posição dos textos. */
  chaveTexto: string;
  /** A variante que gerou esta prévia. */
  v: Variante;
  peca: Peca;
  /** A peça pronta: PNG final ou, na prévia rápida, JPEG. */
  blob: Blob | null;
  url: string | null;
  final: boolean;
  /** Só as letras, fundo transparente, no tamanho da peça (vem com a prévia rápida). */
  texto: string | null;
}

const cache = new Map<string, Previa>();
const ouvintes = new Set<() => void>();

export const chaveDe = (v: Variante, seed: number, formato: Formato, anuncio: boolean) => JSON.stringify([v, seed, formato, anuncio]);
export const chaveRecorteDe = (v: Variante, formato: Formato, anuncio: boolean) => JSON.stringify([v.image, v.focus, v.zoom, formato, anuncio]);
/** O que muda o desenho das letras: tudo menos o enquadramento da foto, a posição dos campos e o lugar/tamanho dos textos livres. */
export const chaveTextoDe = (v: Variante, seed: number, formato: Formato, anuncio: boolean) =>
  JSON.stringify([{ ...v, image: '', focus: null, zoom: null, posicoes: null,
    livres: (v.livres ?? []).map((l) => [l.id, l.texto, l.cor]) }, seed, formato, anuncio]); // lugar e tamanho do texto livre também se montam aqui
export const previaPronta = (chave: string) => cache.get(chave);

const soltar = (p: Previa) => {
  if (p.url) URL.revokeObjectURL(p.url);
  if (p.texto) URL.revokeObjectURL(p.texto);
};

function guardar(nova: Previa) {
  const velha = cache.get(nova.chave);
  let p = nova;
  if (velha) {
    // junta as duas: a imagem final vale mais que a rápida; a camada de texto vem da rápida
    const imagem = nova.final || !velha.final ? nova : velha;
    const texto = nova.texto ?? velha.texto;
    p = { ...nova, blob: imagem.blob, url: imagem.url, final: imagem.final, texto };
    if (imagem !== nova && nova.url) URL.revokeObjectURL(nova.url);
    if (imagem !== velha && velha.url) URL.revokeObjectURL(velha.url);
    if (texto !== velha.texto && velha.texto) URL.revokeObjectURL(velha.texto);
    cache.delete(nova.chave);
  }
  cache.set(p.chave, p);
  while (cache.size > 40) {
    const [k, antiga] = cache.entries().next().value!;
    soltar(antiga);
    cache.delete(k);
  }
  for (const f of ouvintes) f();
  return p;
}

/**
 * Renderiza (ou devolve a que já está pronta). Com canal ("editor"), um pedido mais novo do mesmo
 * canal passa na frente e este termina com o erro "superado"; sem canal, nunca é pulado.
 * Com rapida, vem a prévia do editor (JPEG + camada de texto); sem, o PNG final.
 */
export async function renderizar(v: Variante, seed: number, formato: Formato, anuncio: boolean,
  opcoes: { canal?: string; sinal?: AbortSignal; rapida?: boolean } = {}): Promise<Previa> {
  const chave = chaveDe(v, seed, formato, anuncio);
  const pronta = cache.get(chave);
  if (pronta && (opcoes.rapida ? pronta.texto : pronta.final)) return pronta;
  const res = await api.prever(v, seed, formato, anuncio, { canal: opcoes.canal, rapida: opcoes.rapida }, opcoes.sinal);
  if ('superado' in res) throw new Error('superado');
  const blob = res.blob ?? (res.png ? base64ParaBlob(res.png, res.tipo ?? 'image/png') : null);
  const texto = res.texto ? URL.createObjectURL(base64ParaBlob(res.texto, 'image/png')) : null;
  return guardar({
    chave, chaveRecorte: chaveRecorteDe(v, formato, anuncio), chaveTexto: chaveTextoDe(v, seed, formato, anuncio), v, peca: res.peca,
    blob, url: blob ? URL.createObjectURL(blob) : null, final: !opcoes.rapida, texto,
  });
}

// miniaturas: uma por vez, para não disputar o motor com a prévia do editor
let fila: Promise<unknown> = Promise.resolve();
const pedidas = new Set<string>();
export function pedirMiniatura(v: Variante, seed: number, anuncio: boolean, formato: Formato = 'story') {
  const chave = chaveDe(v, seed, formato, anuncio);
  if (cache.has(chave) || pedidas.has(chave)) return;
  pedidas.add(chave);
  fila = fila.then(() => renderizar(v, seed, formato, anuncio)).catch(() => {}).finally(() => pedidas.delete(chave));
}

/** Faz o componente desenhar de novo quando chega uma prévia nova. */
export function useCacheDePrevias() {
  const [, setVersao] = useState(0);
  useEffect(() => {
    const f = () => setVersao((x) => x + 1);
    ouvintes.add(f);
    return () => { ouvintes.delete(f); };
  }, []);
}
