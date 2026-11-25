// Motor: uma variante + um formato → PNG + QA. Usado pela linha de comando (render.ts)
// e pelo editor local (app/servidor.ts). Mantém um Chromium aberto, uma página por formato.
import fs from 'node:fs';
import path from 'node:path';
import { chromium, type Browser, type BrowserContext, type CDPSession, type Page } from 'playwright-core';
import sharp from 'sharp';
import { RAIZ_GERADOR, FONTE, lerTokens, lerEstilos, cssDoContorno, type Estilo, type Estilos } from './design-system.ts';
import { lerLayout, lerFormato, type Livre, type Variante, type FormatoPronto } from './esquemas.ts';
import { candidatas, imperfeitas, seedDe } from './handwriting.ts';
import { verificar, verificarTamanho, fundoAtras, piorContraste, contraste, luminancia, CONTRASTE_MIN, type MedidaSlot, type Ret } from './qa.ts';
import type { Peca } from './revisao.ts';

const ORIGEM = 'http://pz.local';
const TIPOS: Record<string, string> = {
  '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.woff2': 'font/woff2',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp',
};

type Texto = string | string[];
const temTexto = (t: Texto | undefined) => t !== undefined && (Array.isArray(t) ? t.some((x) => x.trim()) : Boolean(t.trim()));

/** Uma voz = um bloco com cor própria: o campo inteiro, ou cada item de uma lista. */
interface Voz { slot: string; linha: number | null; rotulo: string; pedido?: string; /** contorno escolhido com preenchimento automático */ traco?: string }

export interface PedidoRender {
  id: string;
  formato: string;
  /** Seed da campanha (ou da peça, no editor). A da variante, se houver, entra junto. */
  seed: number;
  perfilStory?: 'organic' | 'ad';
  /** No editor: se já chegou um pedido mais novo quando esta vez começar, pula a peça. */
  superado?: () => boolean;
  /**
   * Prévia do editor: a peça sai em JPEG (bem mais rápido que o PNG) e vem junto a camada só com
   * as letras, em PNG transparente, para o editor mover texto e foto sem esperar o servidor.
   * Downloads e a linha de comando não usam: o PNG final não muda.
   */
  rapida?: boolean;
}

export interface Render {
  /** PNG, ou JPEG na prévia rápida; null quando a peça não pôde ser gerada. */
  png: Buffer | null;
  /** Só na prévia rápida: as letras sobre fundo transparente, no tamanho da peça. */
  texto?: Buffer | null;
  peca: Peca;
}

export interface Motor {
  estilos: Estilos;
  /** PNG (null quando a peça não pôde ser gerada) e o resultado do QA. */
  renderizar(v: Variante, pedido: PedidoRender): Promise<Render>;
  fechar(): Promise<void>;
}

export async function criarMotor(): Promise<Motor> {
  const tokens = lerTokens();
  const { estilos, faltando } = lerEstilos(tokens);
  if (!fs.existsSync(FONTE)) throw new Error(`Fonte não encontrada: ${FONTE}`);
  // Fonte e cores do design system, servidas como CSS para os templates
  const tokensCss = `@font-face { font-family: 'Paintzoas'; src: url('/fonts/Paintzoas.woff2') format('woff2'); font-display: block; }
:root { ${Object.entries(tokens).map(([k, v]) => `${k}: ${v};`).join(' ')} }
.linha.contorno { ${cssDoContorno()} }`;

  const navegador: Browser = await abrirChromium();
  const fotos = new Map<string, Buffer>(); // foto já recortada no tamanho da peça, por URL
  const paginas = new Map<string, { contexto: BrowserContext; page: Page; cdp: CDPSession; fila: Promise<unknown> }>();
  let contador = 0;
  // Cores escolhidas no editor:
  // - "#rrggbb": cor chapada, com o mesmo QA de contraste;
  // - "<preenchimento>+#rrggbb": com contorno dessa cor (o desenho e a largura do contorno são
  //   os do site). O preenchimento é um estilo ou uma hex; vazio ("+#rrggbb") = o motor escolhe.
  const HEX = /^#[0-9a-f]{6}$/i;
  const LARGURA_CONTORNO = (estilos.hero ?? Object.values(estilos).find((e) => e.contorno))?.contorno?.largura ?? '6px';
  const livres = new Map<string, Estilo>();
  const estiloDe = (nome: string): Estilo | undefined => {
    if (estilos[nome]) return estilos[nome];
    let e = livres.get(nome);
    if (e) return e;
    if (HEX.test(nome)) e = { nome, cor: nome.toLowerCase() };
    else if (nome.includes('+')) {
      const [base, traco] = nome.split('+');
      const b = base ? estiloDe(base) : undefined;
      if (!b || !HEX.test(traco)) return undefined;
      e = { nome, cor: b.cor, contorno: { cor: traco.toLowerCase(), largura: LARGURA_CONTORNO } };
    }
    if (e) livres.set(nome, e);
    return e;
  };
  /** "+#rrggbb": contorno escolhido, preenchimento automático. */
  const soContorno = (nome?: string) => (nome && nome.startsWith('+') && HEX.test(nome.slice(1)) ? nome.slice(1) : undefined);
  // Último recorte de cada foto: ao mover só o texto, a foto é a mesma e o sharp não roda de novo
  const recortes = new Map<string, Promise<Quadro>>();
  const recortar = (imagem: string, v: Variante, formato: FormatoPronto) => {
    const chave = JSON.stringify([imagem, fs.statSync(imagem).mtimeMs, v.focus, v.zoom, v.enquadramento, formato.w, formato.h, formato.nome]);
    let q = recortes.get(chave);
    if (!q) {
      q = enquadrar(imagem, v, formato);
      q.catch(() => recortes.delete(chave));
      recortes.set(chave, q);
      while (recortes.size > 8) recortes.delete(recortes.keys().next().value!);
    }
    return q;
  };

  async function paginaDo(formato: FormatoPronto) {
    const chave = `${formato.nome}:${formato.perfil ?? ''}`;
    let p = paginas.get(chave);
    if (!p) {
      const contexto = await navegador.newContext({ viewport: { width: formato.w, height: formato.h }, deviceScaleFactor: 1 });
      await contexto.route(`${ORIGEM}/**`, async (rota) => {
        const caminho = decodeURIComponent(new URL(rota.request().url()).pathname);
        if (caminho === '/_pz/tokens.css') return rota.fulfill({ contentType: 'text/css', body: tokensCss });
        const foto = fotos.get(caminho);
        if (foto) return rota.fulfill({ contentType: 'image/png', body: foto });
        const arquivo = caminho === '/fonts/Paintzoas.woff2' ? FONTE
          : caminho.startsWith('/generator/') ? path.resolve(RAIZ_GERADOR, '.' + caminho.slice('/generator'.length)) : null;
        if (!arquivo || (arquivo !== FONTE && !arquivo.startsWith(RAIZ_GERADOR + path.sep)) || !fs.existsSync(arquivo)) return rota.fulfill({ status: 404 });
        return rota.fulfill({ contentType: TIPOS[path.extname(arquivo).toLowerCase()] ?? 'application/octet-stream', body: fs.readFileSync(arquivo) });
      });
      const page = await contexto.newPage();
      p = { contexto, page, cdp: await contexto.newCDPSession(page), fila: Promise.resolve() };
      paginas.set(chave, p);
    }
    return p;
  }

  async function renderizar(v: Variante, pedido: PedidoRender) {
    const formato = lerFormato(pedido.formato, pedido.perfilStory);
    const p = await paginaDo(formato);
    // uma peça por vez em cada página (story e feed podem rodar em paralelo)
    const vez = p.fila.then(() => renderizarNa(p.page, p.cdp, v, pedido, formato));
    p.fila = vez.catch(() => undefined);
    return vez;
  }

  async function renderizarNa(page: Page, cdp: CDPSession, v: Variante, pedido: PedidoRender, formato: FormatoPronto): Promise<Render> {
    const { id } = pedido;
    const base = { id, formato: formato.nome, layout: v.layout, textos: v.slots, medida: { w: formato.w, h: formato.h, safe: formato.safe } };
    const erros: string[] = [];
    const avisos: string[] = [];
    const sem = (motivos: string[]) => ({ png: null, peca: { ...base, arquivo: null, cores: {}, erros: motivos, avisos } });
    if (pedido.superado?.()) return sem([]);
    if (!fs.existsSync(path.join(RAIZ_GERADOR, 'layouts', v.layout, 'spec.json'))) return sem([`O layout "${v.layout}" não existe em layouts/.`]);
    const layout = lerLayout(v.layout);
    if (!layout.formats.includes(formato.nome)) return sem([`O layout ${layout.id} não tem versão para ${formato.nome}.`]);
    const limites = layout.font_px[formato.nome];
    if (!limites) throw new Error(`layouts/${layout.id}/spec.json: falta font_px.${formato.nome}`);

    // campos do layout x campos da variante. Lista: um item por linha; texto corrido: "|" quebra a linha
    const nomes = Object.keys(layout.slots);
    const rotulo = (n: string) => (n.startsWith('livre-') ? 'Texto livre' : layout.slots[n]?.label ?? n);
    for (const n of nomes) if (!temTexto(v.slots[n])) erros.push(`Falta o texto de "${rotulo(n)}".`);
    for (const n of Object.keys(v.slots)) if (!nomes.includes(n)) erros.push(`O layout ${layout.id} não tem o campo "${n}" (tem: ${nomes.join(', ')}).`);
    const slots = nomes.filter((n) => temTexto(v.slots[n]));
    const textos: Record<string, Texto> = Object.fromEntries(slots.map((n) => {
      const t = v.slots[n];
      if (layout.slots[n].list) return [n, (Array.isArray(t) ? t : t.split(/\s*(?:\||\n)\s*/)).map((x) => x.trim()).filter(Boolean)];
      return [n, Array.isArray(t) ? t.join(' | ') : t];
    }));
    erros.push(...verificarTamanho(textos, layout.slots, rotulo));

    // textos livres (ferramenta de texto do editor): entram como campos a mais, com o tamanho e o
    // lugar escolhidos à mão (sem encaixe). A cor de cada um vai junto com as dos campos.
    const livres = v.livres.filter((l) => l.texto.trim());
    const nomeLivre = (l: Livre) => `livre-${l.id}`;
    for (const l of livres) { slots.push(nomeLivre(l)); textos[nomeLivre(l)] = l.texto; }
    const cores: Record<string, string | string[]> = { ...v.colors, ...Object.fromEntries(livres.filter((l) => l.cor).map((l) => [nomeLivre(l), l.cor])) };

    // estilos pedidos (cor chapada ou contorno)
    for (const [slot, pedidoEstilo] of Object.entries(cores)) {
      for (const nome of [pedidoEstilo].flat()) {
        if (!nome || estiloDe(nome) || soContorno(nome)) continue;
        erros.push(faltando.includes(nome)
          ? `A cor "${nome}" (em "${rotulo(slot)}") ainda não existe no design system. Defina em config/estilos.json.`
          : `Estilo "${nome}" desconhecido (em "${rotulo(slot)}"). Disponíveis: ${Object.keys(estilos).join(', ')}.`);
      }
    }

    // Sem foto ainda (o editor deixa escrever antes de escolher): fundo cinza liso no lugar dela
    const imagem = v.image ? path.resolve(RAIZ_GERADOR, v.image) : null;
    if (imagem && !fs.existsSync(imagem)) return sem([...erros, `Imagem não encontrada: ${v.image}`]);

    const seedVariante = v.seed ?? id;
    const quadro = imagem ? await recortar(imagem, v, formato) : await fundoLiso(formato);
    const urlFoto = `/_pz/foto/${formato.nome}/${id}-${++contador}.png`;
    fotos.set(urlFoto, quadro.png);
    try {
      await page.goto(`${ORIGEM}/generator/layouts/${layout.id}/template.html`);
      await page.addScriptTag({ path: path.join(RAIZ_GERADOR, 'src', 'pagina.js') });
      await page.evaluate((d) => (window as any).pz.montar(d), {
        formato: { nome: formato.nome, w: formato.w, h: formato.h, safe: formato.safe },
        foto: urlFoto,
      });
      await page.evaluate(([p, w, h]) => (window as any).pz.mover(p, w, h), [v.posicoes, formato.w, formato.h] as const);
      if (livres.length) {
        await page.evaluate((d) => (window as any).pz.criarLivres(d), livres.map((l) => ({ nome: nomeLivre(l), x: l.x * formato.w, y: l.y * formato.h })));
      }
    } finally {
      fotos.delete(urlFoto);
    }
    const dadosSlots = slots.map((nome) => {
      const t = textos[nome];
      const livre = livres.find((l) => nomeLivre(l) === nome);
      if (livre) {
        // a quebra de linha é a de quem escreveu; o tamanho é o escolhido (fração da largura)
        const linhas = String(t).split(/\s*(?:\||\n)\s*/).filter(Boolean).map((x) => x.split(/\s+/));
        // em fração do lado menor da peça: no banner (largo e baixo) o texto não fica gigante
        const f = Math.max(8, Math.round(livre.tamanho * Math.min(formato.w, formato.h)));
        return { nome, candidatas: [imperfeitas(linhas, seedDe(pedido.seed, seedVariante, nome))], fontePx: [f, f] as [number, number], escala: 1 };
      }
      const opcoes = Array.isArray(t) ? [t.map((item) => item.split(/\s+/))] : candidatas(t, layout.slots[nome].max_lines);
      return { nome, candidatas: opcoes.map((linhas) => imperfeitas(linhas, seedDe(pedido.seed, seedVariante, nome))) };
    });

    // vozes: cada campo de texto corrido é uma; numa lista, cada item é uma
    const vozes: Voz[] = slots.flatMap((n): Voz[] => {
      const t = textos[n], pedidoEstilo = cores[n];
      const voz = (linha: number | null, rotuloVoz: string, pedidoVoz?: string): Voz =>
        soContorno(pedidoVoz) ? { slot: n, linha, rotulo: rotuloVoz, traco: soContorno(pedidoVoz) } : { slot: n, linha, rotulo: rotuloVoz, pedido: pedidoVoz };
      if (Array.isArray(t)) return t.map((item, i) => voz(i, `"${rotulo(n)}", item "${item}"`, Array.isArray(pedidoEstilo) ? pedidoEstilo[i] : pedidoEstilo));
      return [voz(null, `"${rotulo(n)}"`, Array.isArray(pedidoEstilo) ? pedidoEstilo[0] : pedidoEstilo)];
    });
    const escolha = new Map<Voz, string>();
    for (const voz of vozes) if (voz.pedido && estiloDe(voz.pedido)) escolha.set(voz, voz.pedido);
    const porCampo = () => Object.fromEntries(slots.map((n) => {
      const doCampo = vozes.filter((voz) => voz.slot === n);
      const nome = (voz: Voz) => escolha.get(voz) ?? null;
      return [n, Array.isArray(textos[n]) ? doCampo.map(nome) : nome(doCampo[0])];
    })) as Record<string, string | null | (string | null)[]>;
    const resolver = (e: string | null) => (e ? estiloDe(e) ?? null : null);

    type Encaixe = Record<string, { escolhida: number; fontePx: number; coube: boolean }>;
    const encaixarCom = (): Promise<Encaixe> => page.evaluate((d) => (window as any).pz.encaixarTodos(d), {
      slots: dadosSlots, fontePx: limites, largura: formato.w, escala: layout.text_scale,
      estilos: Object.fromEntries(Object.entries(porCampo()).map(([n, e]) => [n, Array.isArray(e) ? e.map(resolver) : resolver(e)])),
    });
    const medir = async (): Promise<Record<string, MedidaSlot>> => {
      const todas: Record<string, MedidaSlot> = await page.evaluate(() => (window as any).pz.medir());
      return Object.fromEntries(slots.map((n) => [n, todas[n]]));
    };
    // texto livre: o canto das letras fica onde a pessoa pôs (depois de cada encaixe)
    const posLivres = livres.map((l) => ({ nome: nomeLivre(l), x: l.x * formato.w, y: l.y * formato.h }));
    const ancorar = async () => { if (posLivres.length) await page.evaluate((d) => (window as any).pz.ancorarLivres(d), posLivres); };
    let encaixe = await encaixarCom();
    await ancorar();
    let medidas = await medir();

    // caracteres que a fonte não desenha
    const faltam: string[] = await page.evaluate((t) => (window as any).pz.semDesenho(t), slots.map((n) => [textos[n]].flat().join('')).join(''));
    if (faltam.length) avisos.push(`A Paintzoas não desenha ${faltam.map((c) => `"${c}"`).join(' ')}: ${faltam.length > 1 ? 'saem' : 'sai'} em Helvetica.`);

    // contraste: mede a foto sem o texto e escolhe o estilo das vozes que não foram definidas
    // PNG com compressão rápida: os mesmos pixels do page.screenshot, em ~80 ms em vez de ~430 ms
    await page.evaluate(() => (window as any).pz.semTexto(true));
    const fundo = Buffer.from((await cdp.send('Page.captureScreenshot', { format: 'png', optimizeForSpeed: true })).data, 'base64');
    await page.evaluate(() => (window as any).pz.semTexto(false));
    const fundosCampo: Record<string, number[]> = {};
    for (const n of slots) fundosCampo[n] = await fundoAtras(fundo, medidas[n].linhas.map((l) => l.caixa), formato);
    const fundos = (voz: Voz) => (voz.linha === null ? fundosCampo[voz.slot] : [fundosCampo[voz.slot][voz.linha]]);

    const chapados = Object.values(estilos).filter((e) => !e.contorno && e.nome !== 'vermelho');
    const comContorno = Object.values(estilos).filter((e) => e.contorno);
    // Escolhe o estilo das vozes que faltam olhando todas juntas (não uma por vez): numa lista,
    // gastar os estilos com contorno nos primeiros itens deixaria os últimos ilegíveis.
    // Custo: chapado que passa de 3:1 = 0; contorno = 1 (é o reforço, não o padrão); chapado que não passa = 100.
    // Empate: maior legibilidade somada.
    // Cada voz com estilo próprio, com uma exceção (decisões de 23/11): hero e H3 especial podem
    // se repetir entre itens da mesma lista, desde que não em itens vizinhos, e entre um item e
    // outro campo (o título fica longe da lista).
    const repeteSemProblema = (a: Voz, b: Voz, e: Estilo) => {
      if (!e.contorno) return false;
      if (a.linha !== null && b.linha !== null) return a.slot !== b.slot || Math.abs(a.linha - b.linha) > 1;
      return (a.linha !== null) !== (b.linha !== null);
    };
    const conflita = (a: Voz, b: Voz, e: Estilo) => layout.colors.distinct_between_slots && !repeteSemProblema(a, b, e);
    const abertas = vozes.filter((voz) => !escolha.has(voz));
    const fixas = [...escolha].map(([voz, nome]) => [voz, estiloDe(nome)!] as const);
    const opcoes = [...chapados, ...comContorno];
    // texto livre: o automático escolhe só cor sem contorno (o contorno vem da ferramenta "com contorno")
    // e quem já tem o contorno escolhido só precisa do preenchimento
    const opcoesDe = (voz: Voz) => (voz.slot.startsWith('livre-') || voz.traco ? chapados : opcoes);
    const legibilidade = (voz: Voz, e: Estilo) => Math.min(...fundos(voz).map((f) =>
      e.contorno ? Math.max(contraste(luminancia(e.cor), f), contraste(luminancia(e.contorno.cor), f)) : contraste(luminancia(e.cor), f)));
    const custo = (voz: Voz, e: Estilo) => (e.contorno ? 1 : legibilidade(voz, e) >= CONTRASTE_MIN ? 0 : 100);
    let melhor: { custo: number; nota: number; estilos: Estilo[] } | null = null;
    const buscar = (i: number, usados: Estilo[], c: number, nota: number) => {
      if (melhor && c > melhor.custo) return;
      if (i === abertas.length) {
        if (!melhor || c < melhor.custo || (c === melhor.custo && nota > melhor.nota)) melhor = { custo: c, nota, estilos: usados };
        return;
      }
      const ja = [...fixas, ...usados.map((e, j) => [abertas[j], e] as const)];
      const possiveis = opcoesDe(abertas[i]);
      const semConflito = possiveis.filter((e) => !ja.some(([outra, usado]) => usado === e && conflita(abertas[i], outra, e)));
      // estilos esgotados: repete (o QA avisa)
      for (const e of semConflito.length ? semConflito : possiveis) buscar(i + 1, [...usados, e], c + custo(abertas[i], e), nota + legibilidade(abertas[i], e));
    };
    buscar(0, [], 0, 0);
    abertas.forEach((voz, i) => {
      const nome = (melhor as { estilos: Estilo[] } | null)?.estilos[i].nome ?? chapados[0].nome;
      escolha.set(voz, voz.traco ? `${nome}+${voz.traco}` : nome);
    });
    const pares = [...escolha];
    if (pares.some(([a, na], i) => pares.slice(i + 1).some(([b, nb]) => na === nb && conflita(a, b, estiloDe(na)!)))) {
      avisos.push('Duas partes estão com o mesmo estilo; troca de cor marca a troca de voz.');
    }

    // 3. contraste mínimo, só para cor chapada: no contorno, o próprio contorno separa a letra da foto
    for (const voz of vozes) {
      const e = estiloDe(escolha.get(voz)!)!;
      if (e.contorno) continue;
      const pior = piorContraste(e.cor, fundos(voz));
      if (pior < CONTRASTE_MIN) {
        erros.push(`${voz.rotulo} em ${e.nome}: contraste ${pior.toFixed(1).replace('.', ',')}:1 (mínimo ${CONTRASTE_MIN}:1). Tente outra cor, um estilo com contorno, outra posição ou outra foto. Nunca um fundo atrás do texto.`);
      }
    }

    // de novo com os estilos finais: o contorno ocupa espaço e muda o encaixe
    encaixe = await encaixarCom();
    await ancorar();
    medidas = await medir();
    const png = await page.screenshot(pedido.rapida ? { type: 'jpeg', quality: 90 } : { type: 'png' });
    let texto: Buffer | null = null;
    if (pedido.rapida) {
      await page.evaluate(() => (window as any).pz.soTexto(true));
      try { texto = await page.screenshot({ type: 'png', omitBackground: true }); }
      finally { await page.evaluate(() => (window as any).pz.soTexto(false)); }
    }

    const rostos = imagem ? v.faces.map((r) => naPeca(quadro, r)) : []; // sem foto, sem rosto
    // foto ampliada demais fica borrada
    const ampliacao = formato.w / quadro.width;
    if (ampliacao > 2) avisos.push(`A foto é pequena para o ${formato.nome}: vai ser ampliada ${ampliacao.toFixed(1).replace('.', ',')}× e deve sair borrada. Use uma foto maior ou menos zoom.`);
    // Texto livre não tem espaço para caber: o QA olha só área segura e rosto
    const medidasQa = { ...medidas }, encaixeQa = { ...encaixe };
    for (const l of livres) {
      const n = nomeLivre(l), ls = medidas[n].linhas.map((x) => x.caixa);
      const x0 = Math.min(...ls.map((c) => c.x)), y0 = Math.min(...ls.map((c) => c.y));
      medidasQa[n] = { ...medidas[n], regiao: { x: x0, y: y0, w: Math.max(...ls.map((c) => c.x + c.w)) - x0, h: Math.max(...ls.map((c) => c.y + c.h)) - y0 } };
      encaixeQa[n] = { ...encaixe[n], coube: true };
    }
    const qa = verificar({ formato, medidas: medidasQa, encaixe: encaixeQa, fontePx: limites, rostos, areaTexto: layout.text_area, rotulo });
    return {
      png,
      ...(pedido.rapida ? { texto } : {}),
      peca: {
        ...base,
        rostos,
        arquivo: null,
        cores: porCampo() as Record<string, string | string[]>,
        fontePx: Object.fromEntries(slots.map((n) => [n, encaixe[n].fontePx])),
        medidas,
        erros: [...erros, ...qa.erros],
        avisos: [...avisos, ...qa.avisos],
      },
    };
  }

  return {
    estilos,
    renderizar,
    fechar: () => navegador.close(),
  };
}

/**
 * No computador: o Chromium que o Playwright instalou. Na Vercel: o da @sparticuz/chromium,
 * feito para funções serverless (vem comprimido e é aberto em /tmp na primeira chamada).
 */
async function abrirChromium(): Promise<Browser> {
  if (!process.env.VERCEL) return chromium.launch();
  const { default: serverless } = await import('@sparticuz/chromium');
  return chromium.launch({ executablePath: await serverless.executablePath(), args: serverless.args, headless: true });
}

interface Quadro { iw: number; ih: number; left: number; top: number; width: number; height: number; w: number; h: number; png: Buffer }

/**
 * Recorta a foto para a peça: cobre tudo (sem faixa vazia), deixa o ponto de foco o mais perto
 * possível do centro e aproxima com o zoom. O recorte é feito no sharp, não no navegador,
 * para o resultado ser sempre o mesmo pixel a pixel.
 */
async function enquadrar(imagem: string, v: Variante, f: FormatoPronto): Promise<Quadro> {
  const { width: nw = 1, height: nh = 1, orientation } = await sharp(imagem).metadata();
  const [iw, ih] = orientation && orientation >= 5 ? [nh, nw] : [nw, nh];
  const escala = Math.max(f.w / iw, f.h / ih) * v.zoom;
  const width = Math.min(iw, Math.round(f.w / escala)), height = Math.min(ih, Math.round(f.h / escala));
  const limitar = (x: number, max: number) => Math.round(Math.min(max, Math.max(0, x)));
  const left = limitar(v.focus[0] * iw - width / 2, iw - width);
  const top = limitar(v.focus[1] * ih - height / 2, ih - height);
  // Enquadramento livre com a foto saindo da peça: o pedaço que sobra vai sobre fundo preto.
  // Dentro dos limites, o caminho é o de sempre (mesmo resultado, byte a byte).
  if (v.enquadramento === 'livre') {
    const cw = f.w / escala, ch = f.h / escala; // o recorte, em px da foto, sem limitar
    const l0 = v.focus[0] * iw - cw / 2, t0 = v.focus[1] * ih - ch / 2;
    if (l0 < -0.5 || t0 < -0.5 || l0 + cw > iw + 0.5 || t0 + ch > ih + 0.5) return enquadrarSolto(imagem, f, iw, ih, escala, l0, t0);
  }
  const png = await sharp(imagem).rotate().extract({ left, top, width, height })
    .resize(f.w, f.h, { fit: 'fill', kernel: 'lanczos3' }).png({ compressionLevel: 1 }).toBuffer();
  return { iw, ih, left, top, width, height, w: f.w, h: f.h, png };
}

/** A parte da foto que cai dentro da peça, no lugar certo, sobre preto. */
async function enquadrarSolto(imagem: string, f: FormatoPronto, iw: number, ih: number, escala: number, l0: number, t0: number): Promise<Quadro> {
  const preto = () => sharp({ create: { width: f.w, height: f.h, channels: 3, background: '#000000' } });
  const x0 = Math.max(0, Math.floor(l0)), y0 = Math.max(0, Math.floor(t0));
  const x1 = Math.min(iw, Math.ceil(l0 + f.w / escala)), y1 = Math.min(ih, Math.ceil(t0 + f.h / escala));
  const quadro = { iw, ih, left: Math.round(l0), top: Math.round(t0), width: Math.round(f.w / escala), height: Math.round(f.h / escala), w: f.w, h: f.h };
  if (x1 <= x0 || y1 <= y0) return { ...quadro, png: await preto().png({ compressionLevel: 1 }).toBuffer() };
  // posição e tamanho do pedaço visível, em px da peça
  const px = Math.round((x0 - l0) * escala), py = Math.round((y0 - t0) * escala);
  const pw = Math.max(1, Math.round((x1 - x0) * escala)), ph = Math.max(1, Math.round((y1 - y0) * escala));
  let pedaco = sharp(await sharp(imagem).rotate().extract({ left: x0, top: y0, width: x1 - x0, height: y1 - y0 })
    .resize(pw, ph, { fit: 'fill', kernel: 'lanczos3' }).png().toBuffer());
  // o que passar da borda da peça é cortado antes de colar
  const cx = Math.max(0, -px), cy = Math.max(0, -py);
  const cw = Math.min(pw - cx, f.w - Math.max(0, px)), ch = Math.min(ph - cy, f.h - Math.max(0, py));
  if (cw <= 0 || ch <= 0) return { ...quadro, png: await preto().png({ compressionLevel: 1 }).toBuffer() };
  pedaco = pedaco.extract({ left: cx, top: cy, width: cw, height: ch });
  const png = await preto().composite([{ input: await pedaco.png().toBuffer(), left: Math.max(0, px), top: Math.max(0, py) }]).png({ compressionLevel: 1 }).toBuffer();
  return { ...quadro, png };
}

/** Fundo cinza liso no tamanho da peça, para escrever antes de escolher a foto. */
const FUNDO_SEM_FOTO = '#404040';
const fundosLisos = new Map<string, Promise<Quadro>>();
function fundoLiso(f: FormatoPronto): Promise<Quadro> {
  const chave = `${f.w}x${f.h}`;
  let q = fundosLisos.get(chave);
  if (!q) {
    q = sharp({ create: { width: f.w, height: f.h, channels: 3, background: FUNDO_SEM_FOTO } }).png().toBuffer()
      .then((png) => ({ iw: f.w, ih: f.h, left: 0, top: 0, width: f.w, height: f.h, w: f.w, h: f.h, png }));
    fundosLisos.set(chave, q);
  }
  return q;
}

/** Caixa em frações da foto original → pixels da peça. */
function naPeca(q: Quadro, r: Ret): Ret {
  const sx = q.w / q.width, sy = q.h / q.height;
  return { x: (r.x * q.iw - q.left) * sx, y: (r.y * q.ih - q.top) * sy, w: r.w * q.iw * sx, h: r.h * q.ih * sy };
}
