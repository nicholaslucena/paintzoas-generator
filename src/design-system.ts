// Lê fonte e cores do design system do site: a cópia em marca/ do custom.css e da fonte da loja
// (atualizada por `npm run marca`, que baixa de paintzoas.vercel.app).
// Nada é redefinido aqui: se a cor não existe no custom.css, o render recusa.
import fs from 'node:fs';
import path from 'node:path';

export const RAIZ_GERADOR = path.resolve(import.meta.dirname, '..');
/** Cópia da marca (nunca editar à mão: `npm run marca` traz a versão publicada). */
export const PASTA_MARCA = path.join(RAIZ_GERADOR, 'marca');
export const CSS_SITE = path.join(PASTA_MARCA, 'custom.css');
export const FONTE = path.join(PASTA_MARCA, 'Paintzoas.woff2');

/** Estilo de texto: cor chapada ou com o contorno pixelado dos títulos do site. */
export interface Estilo {
  nome: string;
  cor: string;                                    // #rrggbb
  contorno?: { cor: string; largura: string };    // largura em em, como no custom.css
}
export type Estilos = Record<string, Estilo>;

/** Variáveis --pz-* do bloco [tokens] do custom.css (só o :root de desktop). */
export function lerTokens(): Record<string, string> {
  const css = fs.readFileSync(CSS_SITE, 'utf8');
  const inicio = css.indexOf('/* ===== [tokens]');
  if (inicio < 0) throw new Error(`Bloco [tokens] não encontrado em ${CSS_SITE}`);
  const abre = css.indexOf('{', inicio);
  const fecha = css.indexOf('}', abre);
  const bloco = css.slice(abre + 1, fecha).replace(/\/\*[\s\S]*?\*\//g, '');
  const tokens: Record<string, string> = {};
  for (const m of bloco.matchAll(/(--pz-[\w-]+)\s*:\s*([^;]+);/g)) tokens[m[1]] = m[2].trim();
  return tokens;
}

type Entrada = { cor: string } | { contorno_do_site: string } | null;

/** Estilos das campanhas (config/estilos.json) resolvidos com os valores do design system. */
export function lerEstilos(tokens = lerTokens()): { estilos: Estilos; faltando: string[] } {
  const arquivo = path.join(RAIZ_GERADOR, 'config', 'estilos.json');
  const mapa: Record<string, Entrada> = JSON.parse(fs.readFileSync(arquivo, 'utf8'));
  const css = fs.readFileSync(CSS_SITE, 'utf8');
  const estilos: Estilos = {};
  const faltando: string[] = [];
  const cor = (valor: string, onde: string) => {
    const v = valor.trim();
    const nome = v.match(/^var\((--pz-[\w-]+)\)$/)?.[1] ?? (v.startsWith('--') ? v : null);
    const final = nome ? tokens[nome] : v;
    if (!final) throw new Error(`config/estilos.json: ${onde} usa ${v}, que não existe no custom.css`);
    return hex6(final);
  };
  for (const [nome, e] of Object.entries(mapa)) {
    if (nome.startsWith('_')) continue;
    if (!e) { faltando.push(nome); continue; }
    if ('cor' in e) { estilos[nome] = { nome, cor: cor(e.cor, `"${nome}"`) }; continue; }
    const regra = regraDoSite(css, e.contorno_do_site);
    if (!regra) throw new Error(`config/estilos.json: "${nome}" aponta para a regra ${e.contorno_do_site}, que não existe no custom.css`);
    const decl = (p: string) => regra.match(new RegExp(`(?:^|[;\\s])${p}\\s*:\\s*([^;]+);`))?.[1];
    const [largura, contorno, preenchimento] = [decl('--pz-ow'), decl('--pz-oc'), decl('color')];
    if (!largura || !contorno || !preenchimento) throw new Error(`custom.css: a regra ${e.contorno_do_site} não tem --pz-ow, --pz-oc e color`);
    estilos[nome] = { nome, cor: cor(preenchimento, `"${nome}"`), contorno: { cor: cor(contorno, `"${nome}"`), largura: largura.trim() } };
  }
  return { estilos, faltando };
}

/** Corpo da regra CSS com exatamente este seletor (sem os grupos separados por vírgula). */
function regraDoSite(css: string, seletor: string): string | null {
  for (const m of css.matchAll(/([^{}]*)\{([^{}]*)\}/g)) {
    if (m[1].replace(/\/\*[\s\S]*?\*\//g, '').trim() === seletor) return m[2];
  }
  return null;
}

/**
 * As declarações do contorno pixelado dos títulos (16 cópias da letra em text-shadow),
 * copiadas do custom.css para o render usar exatamente o mesmo desenho.
 */
export function cssDoContorno(): string {
  const css = fs.readFileSync(CSS_SITE, 'utf8');
  const bloco = [...css.matchAll(/\{([^}]*)\}/g)].map((m) => m[1]).find((b) => b.includes('--pz-on:') && b.includes('text-shadow:'));
  if (!bloco) throw new Error('custom.css: não achei a regra do contorno pixelado (--pz-on + text-shadow)');
  return bloco.trim();
}

function hex6(cor: string): string {
  const c = cor.trim().toLowerCase();
  if (/^#[0-9a-f]{3}$/.test(c)) return '#' + [...c.slice(1)].map((x) => x + x).join('');
  if (/^#[0-9a-f]{6}$/.test(c)) return c;
  throw new Error(`Cor do design system em formato não suportado: ${cor}`);
}
