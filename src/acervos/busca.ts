// Busca de fotos sem direitos autorais conhecidos, direto em cada acervo (config/acervos.json).
// Quem usa escolhe as fontes com caixas de seleção. Os direitos vêm dos metadados de cada fonte.
import fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { RAIZ_GERADOR } from '../design-system.ts';

const AGENTE = 'PaintzoasEditor/1.0 (ferramenta local de uso pessoal)';

export interface Candidata {
  fonte: string;
  titulo: string;
  miniatura: string;   // URL da miniatura (para mostrar e para a IA ordenar)
  imagem: string;      // URL da imagem grande (para baixar)
  pagina: string;      // página da foto na fonte
  direitos: string;    // o que a fonte diz sobre direitos
  autor: string;
  data: string;
  tamanho: string;     // largura×altura da imagem que será baixada (vazio se a fonte não diz)
  motivo?: string;     // por que a IA escolheu (quando houver IA)
}

// descricao: uma frase curta, mostrada embaixo do nome no menu de fontes
const base = { id: z.string(), nome: z.string(), descricao: z.string().default('') };
const Fonte = z.discriminatedUnion('tipo', [
  z.object({ ...base, tipo: z.literal('commons') }),
  z.object({ ...base, tipo: z.literal('nos') }),
  z.object({ ...base, tipo: z.literal('flickr-conta'), nsid: z.string() }),
  z.object({ ...base, tipo: z.literal('europeana'), tema: z.number().int() }),
]);
type Fonte = z.infer<typeof Fonte>;
const ConfigAcervos = z.object({ fontes: z.array(Fonte), europeana_chave: z.string().default('api2demo') });

export function lerAcervos() {
  return ConfigAcervos.parse(JSON.parse(fs.readFileSync(path.join(RAIZ_GERADOR, 'config', 'acervos.json'), 'utf8')));
}
export const listaDeFontes = () => lerAcervos().fontes.map((f) => ({ id: f.id, nome: f.nome, descricao: f.descricao }));

const semHtml = (s: unknown) => String(s ?? '').replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/\s+/g, ' ').trim();
const ano = (s: unknown) => String(s ?? '').match(/\b(1[6-9]\d\d|20\d\d)\b/)?.[0] ?? '';

async function pegar(url: string, tipo: 'json' | 'texto') {
  const r = await fetch(url, { headers: { 'user-agent': AGENTE }, signal: AbortSignal.timeout(20000) });
  if (!r.ok) throw new Error(`respondeu ${r.status}`);
  return tipo === 'json' ? r.json() : r.text();
}

// ---------- Wikimedia Commons: só domínio público (pd) e CC0 ----------
// A marca usa foto antiga, nunca pintura ou ilustração (decisão de 25/11)
const SEM_ARTE_COMMONS = ['painting', 'paintings', 'drawing', 'drawings', 'illustration', 'engraving', 'lithograph', 'etching', 'woodcut', 'poster', 'map', 'cartoon', 'caricature', 'sketch', 'watercolor', 'canvas', 'fresco', 'miniature']
  .map((p) => `-${p}`).join(' ');
/** Título que indica pintura, desenho ou ilustração (várias línguas): sai das candidatas de qualquer fonte. */
const ARTE_NO_TITULO = /(paint(ing|ed)|drawing|illustrat|engrav|lithogra|litografia|etching|woodcut|watercolou?r|aquarel|poster|cartaz|cartoon|caricatur|sketch|gem(ä|ae)lde|zeichnung|pintura|dibujo|grabado|obraz|rysunek|schilderij|tekening|peinture|dessin|gravure|dipinto|disegno|incisione|oil on canvas)/i;
export const ehArte = (titulo: string) => ARTE_NO_TITULO.test(titulo);

async function buscarCommons(f: Fonte, termo: string, quantas: number): Promise<Candidata[]> {
  const q = new URLSearchParams({
    // só foto: tira o que tem cara de pintura, desenho ou ilustração no título, na descrição ou nas categorias
    action: 'query', generator: 'search', gsrsearch: `${termo} filetype:bitmap ${SEM_ARTE_COMMONS}`, gsrnamespace: '6', gsrlimit: String(quantas * 5), // pede mais: a licença e o tamanho cortam muitas
    // 1920 px pedido pela própria API (endereço oficial, também para TIFF); serve de miniatura e de imagem
    prop: 'imageinfo', iiprop: 'url|extmetadata|size|mime', iiurlwidth: '1920',
    iiextmetadatafilter: 'LicenseShortName|License|UsageTerms|Artist|DateTimeOriginal|ObjectName',
    format: 'json', formatversion: '2',
  });
  const j = await pegar(`https://commons.wikimedia.org/w/api.php?${q}`, 'json');
  const paginas: any[] = j.query?.pages ?? [];
  return paginas
    .sort((a, b) => (a.index ?? 0) - (b.index ?? 0))
    .map((p) => {
      const i = p.imageinfo?.[0];
      const m = i?.extmetadata ?? {};
      const licenca = String(m.License?.value ?? '').toLowerCase();
      if (!i || !(licenca.startsWith('pd') || licenca === 'cc0')) return null;
      if (Math.max(i.width, i.height) < 1000) return null; // pequena sai borrada no story
      const original = ['image/jpeg', 'image/png'].includes(i.mime) && i.width <= 4000;
      return {
        fonte: f.nome,
        titulo: semHtml(m.ObjectName?.value).replace(/\s*label QS:.*$/, '') || String(p.title).replace(/^File:/, '').replace(/\.\w+$/, ''),
        miniatura: i.thumburl, imagem: original ? i.url : i.thumburl, pagina: i.descriptionurl,
        tamanho: original ? `${i.width}×${i.height}` : `${i.thumbwidth}×${i.thumbheight}`,
        direitos: semHtml(m.UsageTerms?.value || m.LicenseShortName?.value),
        autor: semHtml(m.Artist?.value), data: ano(m.DateTimeOriginal?.value),
      } satisfies Candidata;
    })
    .filter((c): c is Candidata => c !== null)
    .slice(0, quantas);
}

// ---------- New Old Stock (Tumblr): a página de busca traz as fotos em 1280 px ----------
async function buscarNos(f: Fonte, termo: string, quantas: number): Promise<Candidata[]> {
  const html: string = await pegar(`https://nos.twnsnd.co/search/${encodeURIComponent(termo)}`, 'texto');
  const fotos = [...html.matchAll(/<img data-event="Clicked image" src="([^"]+)" alt="([^"]*)"(?: width="(\d+)" height="(\d+)")?/g)];
  const posts = [...new Set([...html.matchAll(/href="(https:\/\/nos\.twnsnd\.co\/post\/\d+\/[^"#]+)"/g)].map((m) => m[1]))];
  return fotos.slice(0, quantas).map((m, i) => ({
    fonte: f.nome, titulo: semHtml(m[2]) || 'Sem título',
    miniatura: m[1].replace(/_1280\./, '_400.'), imagem: m[1], pagina: posts[i] ?? 'https://nos.twnsnd.co/',
    tamanho: m[3] ? `${m[3]}×${m[4]}` : '',
    direitos: 'Sem restrições conhecidas',
    autor: '', data: ano(m[2]),
  }));
}

// ---------- Flickr, dentro de uma conta: a página de busca traz os dados das fotos em JSON ----------
function objetosDoFlickr(html: string): any[] {
  const marca = '{"data":{"_flickrModelRegistry":"photo-lite-models"';
  const saida: any[] = [];
  for (let i = html.indexOf(marca); i >= 0; i = html.indexOf(marca, i + 1)) {
    // acha o fim do objeto contando chaves, sem se perder dentro de textos
    let nivel = 0, dentroTexto = false, fim = -1;
    for (let j = i; j < html.length; j++) {
      const c = html[j];
      if (dentroTexto) { if (c === '\\') j++; else if (c === '"') dentroTexto = false; continue; }
      if (c === '"') dentroTexto = true;
      else if (c === '{') nivel++;
      else if (c === '}' && --nivel === 0) { fim = j + 1; break; }
    }
    if (fim < 0) break;
    try { saida.push(JSON.parse(html.slice(i, fim)).data); } catch { /* objeto que não é JSON puro: pula */ }
  }
  return saida;
}

const LICENCAS_LIVRES: Record<number, string> = {
  7: 'Sem restrições conhecidas',
  9: 'Domínio público (CC0)',
  10: 'Domínio público',
};

async function buscarFlickrConta(f: Extract<Fonte, { tipo: 'flickr-conta' }>, termo: string, quantas: number): Promise<Candidata[]> {
  const html: string = await pegar(`https://www.flickr.com/search/?user_id=${encodeURIComponent(f.nsid)}&text=${encodeURIComponent(termo)}&view_all=1`, 'texto');
  const tam = (d: any, k: string) => d.sizes?.data?.[k]?.data;
  return objetosDoFlickr(html)
    .filter((d) => LICENCAS_LIVRES[d.license] && d.ownerNsid === f.nsid)
    .map((d) => {
      const grande = ['k', 'h', 'b', 'c', 'z'].map((k) => tam(d, k)).find(Boolean);
      const mini = ['n', 'm', 'z'].map((k) => tam(d, k)).find(Boolean) ?? grande;
      if (!grande) return null;
      const https = (u: string) => (u.startsWith('//') ? `https:${u}` : u);
      const descricao = semHtml(d.description).split(/Photographer:|Catalog Record|Questions\?/)[0].trim();
      return {
        fonte: f.nome, titulo: descricao.slice(0, 140) || d.title || 'Sem título',
        miniatura: https(mini.url ?? mini.displayUrl), imagem: https(grande.url ?? grande.displayUrl).replace(/_[cz]\.jpg$/, '_b.jpg'),
        pagina: d.id ? `https://www.flickr.com/photos/${f.nsid}/${d.id}` : `https://www.flickr.com/photos/${f.nsid}/`,
        tamanho: grande.width ? (() => { const f = 1024 / Math.max(grande.width, grande.height); return `${Math.round(grande.width * f)}×${Math.round(grande.height * f)}`; })() : '',
        direitos: LICENCAS_LIVRES[d.license], autor: d.realname ?? d.username ?? '', data: ano(d.description) || ano(d.title),
      } satisfies Candidata;
    })
    .filter((c): c is Candidata => c !== null)
    .slice(0, quantas);
}

// ---------- Europeana: API pública, tópico escolhido, só domínio público e CC0, só JPEG ----------
async function buscarEuropeana(f: Extract<Fonte, { tipo: 'europeana' }>, termo: string, quantas: number, chave: string): Promise<Candidata[]> {
  const q = new URLSearchParams({ wskey: chave, query: termo, reusability: 'open', media: 'true', rows: String(quantas * 2) });
  for (const filtro of [`skos_concept:"http://data.europeana.eu/concept/${f.tema}"`, 'TYPE:IMAGE', 'MIME_TYPE:image/jpeg']) q.append('qf', filtro);
  const j = await pegar(`https://api.europeana.eu/record/v2/search.json?${q}`, 'json');
  if (j.success === false) throw new Error(j.error ?? 'erro');
  return (j.items ?? [])
    .filter((it: any) => String(it.rights?.[0] ?? '').includes('publicdomain') && it.edmIsShownBy?.[0])
    .slice(0, quantas)
    .map((it: any) => ({
      fonte: f.nome, titulo: semHtml(it.title?.[0]) || 'Sem título',
      miniatura: it.edmPreview?.[0] ?? it.edmIsShownBy[0], imagem: it.edmIsShownBy[0],
      pagina: String(it.guid ?? '').split('?')[0], tamanho: '',
      direitos: String(it.rights[0]).includes('/zero/') ? 'Domínio público (CC0)' : 'Domínio público',
      autor: it.dataProvider?.[0] ?? '', data: ano(it.year?.[0]),
    }));
}

export interface ResultadoBusca { candidatas: Candidata[]; avisos: string[] }

// Imagens que a busca mostrou: só essas (e as dos acervos conhecidos) o editor aceita baixar
const permitidas = new Set<string>();

/** Busca nas fontes escolhidas, ao mesmo tempo. Fonte que falha vira aviso; as outras seguem. */
export async function buscarFotos(termos: string[], ids: string[]): Promise<ResultadoBusca> {
  const config = lerAcervos();
  const fontes = config.fontes.filter((f) => ids.includes(f.id));
  const avisos: string[] = [];
  const porFonte = await Promise.all(fontes.map(async (f) => {
    const buscar = (termo: string) => {
      if (f.tipo === 'commons') return buscarCommons(f, termo, 8);
      if (f.tipo === 'nos') return buscarNos(f, termo, 8);
      if (f.tipo === 'flickr-conta') return buscarFlickrConta(f, termo, 8);
      return buscarEuropeana(f, termo, 8, config.europeana_chave);
    };
    const comPalavras = async (termo: string) => {
      const achadas = await buscar(termo);
      const palavras = termo.split(/\s+/).filter((p) => p.length > 2).sort((a, b) => b.length - a.length);
      if (achadas.length || palavras.length < 2) return achadas;
      return (await Promise.all(palavras.slice(0, 2).map(buscar))).flat();
    };
    const lotes = await Promise.all(termos.slice(0, 2).map((termo) => comPalavras(termo)
      .catch((e: Error) => { avisos.push(`${f.nome} não respondeu (${e.message}).`); return [] as Candidata[]; })));
    return lotes.flat();
  }));
  // intercala as fontes (uma de cada), para nenhuma tomar a tela inteira
  const vistas = new Set<string>();
  const candidatas: Candidata[] = [];
  for (let i = 0; porFonte.some((l) => i < l.length); i++) {
    for (const lista of porFonte) {
      const c = lista[i];
      if (c && !vistas.has(c.imagem) && !ehArte(c.titulo)) { vistas.add(c.imagem); candidatas.push(c); permitidas.add(c.imagem); }
    }
  }
  return { candidatas, avisos: [...new Set(avisos)] };
}

// ---------- baixar a escolhida (plano B, quando o navegador não consegue) ----------
const HOSTS_PERMITIDOS = [/\.wikimedia\.org$/, /\.staticflickr\.com$/, /\.flickr\.com$/, /\.tumblr\.com$/];
export async function baixarImagem(url: string, limite = 40 * 1024 * 1024): Promise<Buffer> {
  const u = new URL(url);
  if (u.protocol !== 'https:' || !(permitidas.has(url) || HOSTS_PERMITIDOS.some((h) => h.test(u.hostname)))) throw new Error('Só baixo imagens que apareceram na busca.');
  const r = await fetch(u, { headers: { 'user-agent': AGENTE }, signal: AbortSignal.timeout(60000) });
  if (!r.ok) throw new Error(`A fonte respondeu ${r.status} ao baixar a imagem.`);
  if (!String(r.headers.get('content-type')).startsWith('image/')) throw new Error('A fonte não devolveu uma imagem.');
  const dados = Buffer.from(await r.arrayBuffer());
  if (dados.length > limite) throw new Error('Imagem grande demais.');
  return dados;
}
