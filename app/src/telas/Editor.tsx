// Editor: em cima, o nome (duplo clique renomeia) e salvar/baixar. No centro, a peça no formato
// escolhido (story, feed ou banner), com zoom e o texto aplicado: clicar no texto edita, arrastar
// move. Embaixo (só no modo IA), as sugestões e "Criar novo", que abre uma peça livre (sem modelo).
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { ChevronDown, Download, ImagePlus, Loader2, Plus, Scan, Search, Shuffle, Trash2, TriangleAlert, Type, Upload } from 'lucide-react';
import { api, NOMES_FORMATO, type Caixa, type Campo, type Formato, type Layout, type Margens, type Peca } from '@/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuItem, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { EsquemaLayout } from '@/components/pecas-de-texto';
import { Paleta } from '@/components/Paleta';
import { EscolherFoto, enviarDoComputador } from '@/components/EscolherFoto';
import { useDados } from '@/dados';
import { baixar, carimbo, miniaturaJpeg, zip } from '@/lib/arquivos';
import { cn } from '@/lib/utils';
import { chaveDe, chaveRecorteDe, chaveTextoDe, pedirMiniatura, previaPronta, renderizar, useCacheDePrevias, type Previa } from '@/previas';
import { camposParaLivres, livreNo, novaSeed, pecaNova, recorte, valorDoCampo, variante, type Cor, type FotoEscolhida, type PecaEstado, type Rascunho, type TextoLivre } from '@/rascunho';

interface Props { r: Rascunho; mudar: (m: Partial<Rascunho> | ((r: Rascunho) => Partial<Rascunho>), opcoes?: { historico?: boolean }) => void }

const FORMATOS: Formato[] = ['story', 'feed', 'banner', 'banner-celular'];
const arred = (v: number) => Math.round(v * 1000) / 1000;
const pct = (v: number, total: number) => `${(v / total) * 100}%`;
const limitar = (v: number) => Math.min(1, Math.max(-1, arred(v)));
/** Folga em volta das letras ao recortar a camada de texto (px da peça): cabe o contorno. */
const FOLGA = 24;
/** Botão vazado (outline) sobre o palco escuro. */
const VAZADO = 'border-white/40 bg-transparent text-white hover:bg-white/10 hover:text-white dark:bg-transparent';
/** Texto livre novo: tamanho da letra em fração do lado menor da peça (no banner, a altura). */
const TAMANHO_LIVRE = 0.07;
const CAMPO_LIVRE: Campo = { label: 'Texto livre', max_chars: 120, max_lines: 6, region: 'top', list: false };
/** Fundo da peça antes de ter foto (o mesmo cinza do motor). */
const FUNDO_SEM_FOTO = '#404040';
const ehLivre = (nome: string) => nome.startsWith('livre-');
const nomeLivre = (l: TextoLivre) => `livre-${l.id}`;
const slug = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);

function useTamanho<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [tam, setTam] = useState({ w: 0, h: 0 });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setTam({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, tam] as const;
}

/** Caixa que envolve as linhas medidas do campo (ou, sem texto, um lugar na área segura). */
function caixaDoCampo(peca: Peca | null, nome: string, regiao: string, W: number, H: number, safe: Margens): Caixa {
  const linhas = peca?.medidas?.[nome]?.linhas ?? [];
  if (linhas.length) {
    const x0 = Math.min(...linhas.map((l) => l.caixa.x)), y0 = Math.min(...linhas.map((l) => l.caixa.y));
    const x1 = Math.max(...linhas.map((l) => l.caixa.x + l.caixa.w)), y1 = Math.max(...linhas.map((l) => l.caixa.y + l.caixa.h));
    return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
  }
  const w = W - safe.left - safe.right, h = H * 0.12;
  return regiao === 'bottom' ? { x: safe.left, y: H - safe.bottom - h, w, h } : { x: safe.left, y: safe.top, w, h };
}

// ---------- botão da barra de ferramentas (ícone com dica ao lado) ----------
function Ferramenta({ rotulo, ativa, disabled, onClick, children }: { rotulo: string; ativa?: boolean; disabled?: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant={ativa ? 'secondary' : 'ghost'} size="icon-sm" aria-label={rotulo} aria-pressed={ativa} disabled={disabled} onClick={onClick}>{children}</Button>
      </TooltipTrigger>
      <TooltipContent side="right">{rotulo}</TooltipContent>
    </Tooltip>
  );
}

// ---------- título (duplo clique renomeia) ----------
function Titulo({ r, mudar }: Props) {
  const [editando, setEditando] = useState(false);
  const [valor, setValor] = useState(r.nome);
  const nome = r.nome || r.tema || 'Sem título';
  if (editando) {
    const fim = (salvar: boolean) => { if (salvar) mudar({ nome: valor.trim() }); setEditando(false); };
    return (
      <Input autoFocus value={valor} onChange={(e) => setValor(e.target.value)} aria-label="Nome da peça" className="h-8 w-72 bg-background text-base font-semibold"
        onBlur={() => fim(true)} onKeyDown={(e) => { if (e.key === 'Enter') fim(true); if (e.key === 'Escape') fim(false); }} />
    );
  }
  return (
    <h1 className={cn('cursor-text truncate rounded px-1 text-base font-semibold text-white hover:bg-white/10', !r.nome && !r.tema && 'text-white/60')} title="Duplo clique para renomear"
      onDoubleClick={() => { setValor(r.nome || r.tema); setEditando(true); }}>
      {nome}
    </h1>
  );
}

// ---------- estilos de post ----------
function EstilosDePost({ r, mudar, onCriar }: Props & { onCriar: (layout: string) => void }) {
  const { inicio } = useDados();
  useCacheDePrevias();
  const [W, H] = inicio.medidas[r.formato];
  useEffect(() => {
    // a peça aberta usa a prévia do editor: pedir a miniatura dela à parte poria a prévia na fila
    for (const [i, p] of r.pecas.entries()) {
      const l = inicio.layouts.find((x) => x.id === p.layout);
      if (l && i !== r.ativa) pedirMiniatura(variante(p, l, r.formato), p.seed, r.anuncio, r.formato);
    }
  });
  const caixa = 'block h-20 overflow-hidden rounded-md ring-offset-2 ring-offset-background';
  const aberta = r.estilosAbertos !== false;
  return (
    <div className="flex flex-col items-center gap-2">
      <button type="button" onClick={() => mudar({ estilosAbertos: !aberta })} aria-expanded={aberta}
        className="flex items-center gap-1 rounded-md px-2 py-0.5 text-sm font-medium hover:bg-accent">
        Sugestões geradas por IA <ChevronDown className={cn('size-4 transition-transform', !aberta && '-rotate-90')} />
      </button>
      {aberta && <>
      <div className="flex flex-wrap items-end justify-center gap-3" role="tablist" aria-label="Sugestões geradas por IA">
        {r.pecas.map((p, i) => {
          const l = inicio.layouts.find((x) => x.id === p.layout)!;
          const nome = inicio.layouts.find((x) => x.id === (p.modelo ?? p.layout))?.nome ?? l.nome;
          const pronta = previaPronta(chaveDe(variante(p, l, r.formato), p.seed, r.formato, r.anuncio));
          return (
            <button key={i} type="button" role="tab" aria-selected={i === r.ativa} onClick={() => mudar({ ativa: i })}
              className={cn('flex flex-col items-center gap-1 rounded-lg p-1 transition', i === r.ativa ? 'bg-secondary' : 'hover:bg-accent')}>
              <span className={cn(caixa, i === r.ativa && 'ring-2 ring-foreground')} style={{ aspectRatio: `${W} / ${H}` }}>
                {pronta?.url ? <img src={pronta.url} alt="" className="size-full object-cover" />
                  : p.foto ? <Skeleton className="size-full rounded-none" />
                  : <EsquemaLayout id={p.layout} className="h-full w-auto rounded-none" />}
              </span>
              <span className="text-xs text-muted-foreground">{nome}</span>
            </button>
          );
        })}
        {/* sem modelo: os modelos são só das sugestões da IA; a peça nova é livre (texto onde clicar) */}
        <button type="button" onClick={() => onCriar('livre')} className="flex flex-col items-center gap-1 rounded-lg p-1 transition hover:bg-accent">
          <span className={cn(caixa, 'grid place-items-center border border-dashed text-muted-foreground')} style={{ aspectRatio: `${W} / ${H}` }}><Plus className="size-5" /></span>
          <span className="text-xs text-muted-foreground">Criar novo</span>
        </button>
      </div>
      </>}
    </div>
  );
}

export function TelaEditor({ r, mudar, desfazer }: Props & { desfazer: () => boolean }) {
  const { inicio } = useDados();
  const p = r.pecas[r.ativa];
  const layout = inicio.layouts.find((l) => l.id === p.layout) as Layout;
  const foto = p.foto;
  const formato = r.formato;
  const [W, H] = inicio.medidas[formato];
  const LADO = Math.min(W, H); // o tamanho do texto livre é em fração deste lado
  const safe = formato === 'story' ? (r.anuncio ? inicio.seguras['story-ad'] : inicio.seguras.story) : inicio.seguras[formato];

  const mudarPeca = (m: Partial<PecaEstado> | ((x: PecaEstado) => Partial<PecaEstado>)) =>
    mudar((a) => ({ pecas: a.pecas.map((x, i) => (i === a.ativa ? { ...x, ...(typeof m === 'function' ? m(x) : m) } : x)) }));

  // ---------- prévia ----------
  // O servidor manda a peça (JPEG) e uma camada só com as letras. Enquanto a pessoa arrasta a foto,
  // mexe no zoom ou move um texto, e até a peça nova chegar, o editor monta a peça aqui mesmo: a
  // foto em CSS e, por cima, as letras recortadas dessa camada, cada campo no lugar dele.
  useCacheDePrevias();
  const v = variante(p, layout, formato);
  const chave = chaveDe(v, p.seed, formato, r.anuncio);
  const chaveRecorte = chaveRecorteDe(v, formato, r.anuncio);
  const chaveTexto = chaveTextoDe(v, p.seed, formato, r.anuncio);
  const [ultima, setUltima] = useState<Previa | null>(() => previaPronta(chave) ?? null);
  const mostrada = ultima ? previaPronta(ultima.chave) ?? ultima : null; // a do cache pode ter ganhado a camada ou o PNG final
  const [carregando, setCarregando] = useState(false);
  const [erroPrevia, setErroPrevia] = useState<string | null>(null);
  const [gesto, setGesto] = useState<'foto' | 'zoom' | 'texto' | null>(null);
  // o que está selecionado: a foto (mostra o zoom) ou um texto (mostra a paleta), embaixo da barra
  const [selecao, setSelecao] = useState<{ tipo: 'foto' } | { tipo: 'texto'; nome: string } | null>(null);

  useEffect(() => {
    if (gesto) return; // sem foto também: o texto aparece sobre um fundo liso
    const pronta = previaPronta(chave);
    if (pronta) { setUltima(pronta); setErroPrevia(null); }
    if (pronta?.texto) return;
    const ctrl = new AbortController();
    const espera = setTimeout(async () => {
      setCarregando(true);
      try {
        const nova = await renderizar(v, p.seed, formato, r.anuncio, { canal: 'editor', sinal: ctrl.signal, rapida: true });
        if (!ctrl.signal.aborted) { setUltima(nova); setErroPrevia(null); }
      } catch (e) {
        if (!ctrl.signal.aborted && (e as Error).message !== 'superado') setErroPrevia((e as Error).message);
      } finally {
        if (!ctrl.signal.aborted) setCarregando(false);
      }
    }, pronta ? 0 : 120);
    return () => { clearTimeout(espera); ctrl.abort(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chave, gesto]);

  const emDia = mostrada?.chave === chave;
  useEffect(() => {
    if (!Object.keys(layout.campos).length || !emDia) return;
    // O modelo é encaixado nos 4 formatos (cada um tem a sua proporção) e cada texto ganha o lugar,
    // o tamanho e a quebra de linha daquele formato. O story vira a base.
    let cancelado = false;
    const medidaDe = (f: Formato) => (f === formato && mostrada?.peca.medidas
      ? Promise.resolve(mostrada.peca)
      : renderizar(variante(p, layout, f), p.seed, f, r.anuncio).then((x) => x.peca));
    Promise.all(FORMATOS.map((f) => medidaDe(f).then((peca) => [f, peca] as const))).then((medidas) => {
      if (cancelado) return;
      const porFormato = Object.fromEntries(medidas.map(([f, peca]) => [f, camposParaLivres(peca, ...inicio.medidas[f])]));
      const livres: TextoLivre[] = (porFormato.story ?? []).map((base, i) => ({
        ...base,
        formatos: Object.fromEntries(FORMATOS.filter((f) => f !== 'story' && porFormato[f]?.length === porFormato.story.length).map((f) => {
          const l = porFormato[f][i];
          return [f, { x: l.x, y: l.y, tamanho: l.tamanho, ...(l.texto !== base.texto ? { texto: l.texto } : {}) }];
        })),
      }));
      const indice = r.ativa;
      // a conversão não conta como mudança da pessoa: o "sujo" fica como estava
      mudar((a) => ({
        pecas: a.pecas.map((x, i) => (i === indice && x.layout === layout.id
          ? { ...x, layout: 'livre', modelo: x.modelo ?? x.layout, textos: {}, estilos: {}, posicoes: {}, livres: [...livres, ...(x.livres ?? [])] } : x)),
        sujo: a.sujo,
      }), { historico: false }); // automático: não vira passo do Ctrl+Z
    }).catch(() => { /* a prévia mostra o erro */ });
    return () => { cancelado = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [emDia, mostrada, layout.id]);
  // montar aqui: durante um gesto ou até a peça nova chegar, se só mudou a foto ou a posição dos textos
  const montar = Boolean(mostrada?.texto) && mostrada!.chaveTexto === chaveTexto && (gesto !== null || !emDia);
  const mostraImagem = !montar && !gesto && Boolean(mostrada?.url) && mostrada!.chaveRecorte === chaveRecorte;
  const desatualizada = mostraImagem && !emDia;
  const pecaNaTela = mostrada && (montar || mostrada.chaveRecorte === chaveRecorte) ? mostrada.peca : null;

  // ---------- palco: moldura parada, foto que anda e cresce ----------
  const [palcoRef, palco] = useTamanho<HTMLDivElement>();
  // o título e os botões ficam no alto do palco: a moldura começa abaixo deles
  const TOPO = 104, livreH = Math.max(0, palco.h - TOPO - 12);
  // a barra de ferramentas fica em pé, à esquerda: a moldura não passa por cima dela
  const LATERAL = 68, livreW = Math.max(0, palco.w - 2 * LATERAL);
  let mh = livreH, mw = (mh * W) / H;
  if (mw > livreW) { mw = livreW; mh = (mw * H) / W; }
  const moldura = { left: (palco.w - mw) / 2, top: TOPO + (livreH - mh) / 2, width: mw, height: mh };
  const centro = { x: moldura.left + mw / 2, y: moldura.top + mh / 2 };
  const rc = foto ? recorte(p, inicio, formato) : null;
  const s = foto && rc ? mw / (rc.w * foto.largura) : 1;
  const camada = foto && rc ? {
    left: centro.x - (rc.x + rc.w / 2) * foto.largura * s, top: centro.y - (rc.y + rc.h / 2) * foto.altura * s,
    width: foto.largura * s, height: foto.altura * s,
  } : null;

  // Arrastos: o movimento vai direto no estilo dos elementos, um quadro por vez (requestAnimationFrame),
  // sem passar pelo rascunho. O rascunho só muda ao soltar.
  const quadro = useRef(0);
  const noProximoQuadro = (f: () => void) => { cancelAnimationFrame(quadro.current); quadro.current = requestAnimationFrame(f); };
  useEffect(() => () => cancelAnimationFrame(quadro.current), []);

  const camadaRef = useRef<HTMLDivElement>(null);
  const alcasRef = useRef<HTMLDivElement>(null); // as 4 alças, por cima de tudo, no mesmo lugar da foto
  const naFotoEAlcas = (f: (el: HTMLDivElement) => void) => { for (const el of [camadaRef.current, alcasRef.current]) if (el) f(el); };
  const arrasto = useRef<{ x: number; y: number; centro: [number, number]; novo: [number, number]; rw: number; rh: number; s: number } | null>(null);
  // enquadramento livre: a foto anda para qualquer lado (o descoberto sai preto), mas sempre
  // fica um pedaço dela na peça (10% da largura e da altura)
  const limitarCentro = ([x, y]: [number, number], rw: number, rh: number): [number, number] => {
    const mx = 0.1 * Math.min(rw, 1), my = 0.1 * Math.min(rh, 1);
    return [arred(Math.min(1 + rw / 2 - mx, Math.max(-rw / 2 + mx, x))), arred(Math.min(1 + rh / 2 - my, Math.max(-rh / 2 + my, y)))];
  };
  function aoApertar(e: React.PointerEvent<HTMLDivElement>) {
    if (e.button !== 0 || (e.target as HTMLElement).closest('[data-sem-arrasto]')) return;
    // clicou fora da foto: tira a seleção
    const r0 = camadaRef.current?.getBoundingClientRect();
    if (!foto || !rc || !r0 || e.clientX < r0.left || e.clientX > r0.right || e.clientY < r0.top || e.clientY > r0.bottom) { setSelecao(null); return; }
    setSelecao({ tipo: 'foto' });
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* ponteiro que já saiu */ }
    const c: [number, number] = [rc.x + rc.w / 2, rc.y + rc.h / 2];
    arrasto.current = { x: e.clientX, y: e.clientY, centro: c, novo: c, rw: rc.w, rh: rc.h, s };
    setGesto('foto');
  }
  function aoMover(e: React.PointerEvent<HTMLDivElement>) {
    const a = arrasto.current;
    if (!a || !foto) return;
    const dx = (e.clientX - a.x) / (a.s * foto.largura), dy = (e.clientY - a.y) / (a.s * foto.altura);
    a.novo = limitarCentro([a.centro[0] - dx, a.centro[1] - dy], a.rw, a.rh);
    const px = (a.centro[0] - a.novo[0]) * a.s * foto.largura, py = (a.centro[1] - a.novo[1]) * a.s * foto.altura;
    noProximoQuadro(() => naFotoEAlcas((el) => { el.style.translate = `${px}px ${py}px`; }));
  }
  function aoSoltar() {
    const a = arrasto.current;
    if (!a) return;
    arrasto.current = null;
    cancelAnimationFrame(quadro.current);
    naFotoEAlcas((el) => { el.style.translate = ''; });
    if (a.novo[0] !== a.centro[0] || a.novo[1] !== a.centro[1]) mudarPeca({ foco: a.novo });
    setGesto(null);
  }

  // Redimensionar a foto pelos cantos: sempre proporcional, com o canto oposto parado.
  // O tamanho é o zoom (1 = cobre a peça; menos que 1 sobra preto) e o canto parado decide o foco.
  const redim = useRef<{ oposto: [number, number]; canto: [number, number]; inicio: [number, number]; alca: HTMLElement; alcaAntes: [string, string]; w: number; h: number; zoom: number; novo: { left: number; top: number; w: number; h: number } } | null>(null);
  const ZOOM_MIN = 0.2, ZOOM_MAX = 5;
  function apertarAlca(e: React.PointerEvent<HTMLElement>, cx: 0 | 1, cy: 0 | 1) {
    if (e.button !== 0 || !camada) return;
    e.stopPropagation();
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* ponteiro que já saiu */ }
    const canto: [number, number] = [camada.left + cx * camada.width, camada.top + cy * camada.height];
    const oposto: [number, number] = [camada.left + (1 - cx) * camada.width, camada.top + (1 - cy) * camada.height];
    const r0 = palcoRef.current!.getBoundingClientRect();
    // a alça pode estar presa na borda da tela (canto da foto fora dela): conta a partir de onde o arrasto começou
    const inicio: [number, number] = [e.clientX - r0.left, e.clientY - r0.top];
    redim.current = { oposto, canto, inicio, alca: e.currentTarget, alcaAntes: [e.currentTarget.style.left, e.currentTarget.style.top], w: camada.width, h: camada.height, zoom: p.zoom, novo: { ...camada, w: camada.width, h: camada.height } };
    setGesto('zoom');
  }
  function moverAlca(e: React.PointerEvent<HTMLElement>) {
    const a = redim.current, palcoEl = palcoRef.current;
    if (!a || !palcoEl) return;
    const r0 = palcoEl.getBoundingClientRect();
    const x = e.clientX - r0.left, y = e.clientY - r0.top;
    // quanto o ponteiro andou na diagonal da foto (projeção), em proporção a onde começou
    const [ox, oy] = a.oposto, [qx, qy] = a.canto, [sx, sy] = a.inicio;
    const dx = qx - ox, dy = qy - oy;
    let k = ((x - ox) * dx + (y - oy) * dy) / Math.max(1, (sx - ox) * dx + (sy - oy) * dy);
    k = Math.min(ZOOM_MAX / a.zoom, Math.max(ZOOM_MIN / a.zoom, k));
    const w = a.w * k, h = a.h * k;
    a.novo = { left: Math.min(ox, ox + dx * k), top: Math.min(oy, oy + dy * k), w, h };
    const n = a.novo;
    noProximoQuadro(() => {
      naFotoEAlcas((el) => { el.style.left = `${n.left}px`; el.style.top = `${n.top}px`; el.style.width = `${n.w}px`; el.style.height = `${n.h}px`; });
      a.alca.style.left = `${x}px`; a.alca.style.top = `${y}px`; // a alça vai junto com o ponteiro
    });
  }
  function soltarAlca() {
    const a = redim.current;
    if (!a || !foto || !camada) return;
    redim.current = null;
    cancelAnimationFrame(quadro.current);
    // devolve ao React (ele desenha a foto e as alças a partir do zoom e do foco novos)
    a.alca.style.left = a.alcaAntes[0]; a.alca.style.top = a.alcaAntes[1];
    naFotoEAlcas((el) => { el.style.left = `${camada.left}px`; el.style.top = `${camada.top}px`; el.style.width = `${camada.width}px`; el.style.height = `${camada.height}px`; });
    setGesto(null);
    const k = a.novo.w / a.w;
    if (Math.abs(k - 1) < 0.001) return;
    const zoom = Math.round(a.zoom * k * 1000) / 1000;
    // o foco é o ponto da foto que fica no centro da moldura
    const foco: [number, number] = [(centro.x - a.novo.left) / a.novo.w, (centro.y - a.novo.top) / a.novo.h];
    const rw = (rc?.w ?? 1) / k, rh = (rc?.h ?? 1) / k;
    mudarPeca({ zoom, foco: limitarCentro(foco, rw, rh) });
  }

  // ---------- texto: clicar edita, arrastar move ----------
  const [editando, setEditando] = useState<string | null>(null);
  const [rascunhoTexto, setRascunhoTexto] = useState<{ valor: string | string[]; cor: Cor } | null>(null);
  // Arrastar o meio move; arrastar a alça do canto (só no texto livre) muda o tamanho da letra.
  const movendo = useRef<{ nome: string; modo: 'mover' | 'tamanho'; x: number; y: number; dx: number; dy: number; base: [number, number]; escala: number; largura: number; arrastou: boolean } | null>(null);
  const [arrastando, setArrastando] = useState<string | null>(null); // campo sendo arrastado (passou de 4 px)
  const livres = (p.livres ?? []).map((l) => livreNo(l, formato)); // cada texto no lugar dele neste formato
  const livreDe = (nome: string) => (ehLivre(nome) ? livres.find((l) => nomeLivre(l) === nome) : undefined);
  const livreMostrado = (nome: string) => (ehLivre(nome) ? mostrada?.v.livres?.find((l) => nomeLivre(l) === nome) : undefined);
  // quanto cada campo já andou (e, no texto livre, cresceu) desde a prévia que está na tela, em px do palco
  const posMostrada = mostrada?.v.posicoes ?? {};
  const medido = (nome: string) => Boolean(pecaNaTela?.medidas?.[nome]?.linhas.length);
  const desvio = (nome: string): [number, number] => {
    if (!pecaNaTela || !medido(nome)) return [0, 0];
    const l = livreDe(nome), l0 = livreMostrado(nome);
    if (l && l0) return [(l.x - l0.x) * mw, (l.y - l0.y) * mh];
    const [x, y] = p.posicoes?.[nome] ?? [0, 0], [x0, y0] = posMostrada[nome] ?? [0, 0];
    return [(x - x0) * mw, (y - y0) * mh];
  };
  const escalaDe = (nome: string) => {
    const l = livreDe(nome), l0 = livreMostrado(nome);
    return l && l0 && medido(nome) ? l.tamanho / l0.tamanho : 1;
  };
  /** O texto livre cresce a partir do canto de cima à esquerda dele (o mesmo ponto que o motor usa). */
  const origemDe = (nome: string, caixa: Caixa) => {
    const l0 = livreMostrado(nome);
    if (!l0) return undefined;
    return `${(l0.x * W - caixa.x) / W * mw}px ${(l0.y * H - caixa.y) / H * mh}px`;
  };
  /** Caixa de um campo (ou texto livre) na peça: a medida pelo motor ou, sem medida, um lugar provável. */
  function caixaDe(nome: string): Caixa {
    const l = livreDe(nome);
    if (l && !medido(nome)) return { x: l.x * W, y: l.y * H, w: Math.max(l.tamanho * LADO * 4, 60), h: l.tamanho * LADO * 1.3 };
    return caixaDoCampo(pecaNaTela, nome, layout.campos[nome]?.region ?? 'top', W, H, safe);
  }
  const doCampo = (nome: string) => palcoRef.current?.querySelectorAll<HTMLElement>(`[data-campo="${CSS.escape(nome)}"]`) ?? [];
  function apertarTexto(e: React.PointerEvent<HTMLElement>, nome: string, modo: 'mover' | 'tamanho' = 'mover') {
    if (e.button !== 0) return;
    e.stopPropagation();
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* ponteiro que já saiu */ }
    const botao = palcoRef.current?.querySelector<HTMLElement>(`button[data-campo="${CSS.escape(nome)}"]`);
    movendo.current = { nome, modo, x: e.clientX, y: e.clientY, dx: 0, dy: 0, base: desvio(nome), escala: escalaDe(nome), largura: botao?.offsetWidth ?? 100, arrastou: false };
  }
  function moverTexto(e: React.PointerEvent<HTMLElement>, nome: string) {
    const m = movendo.current;
    if (!m || m.nome !== nome) return;
    m.dx = e.clientX - m.x; m.dy = e.clientY - m.y;
    if (!m.arrastou) {
      if (Math.hypot(m.dx, m.dy) < 4) return;
      m.arrastou = true;
      setArrastando(nome); setGesto('texto');
    }
    if (m.modo === 'tamanho') {
      const k = m.escala * Math.min(6, Math.max(0.2, (m.largura + m.dx) / m.largura));
      noProximoQuadro(() => { for (const el of doCampo(nome)) el.style.scale = String(k); });
      return;
    }
    const t = `${m.base[0] + m.dx}px ${m.base[1] + m.dy}px`;
    noProximoQuadro(() => { for (const el of doCampo(nome)) el.style.translate = t; });
  }
  function soltarTexto(nome: string, cancelou = false) {
    const m = movendo.current;
    movendo.current = null;
    cancelAnimationFrame(quadro.current);
    // devolve ao React: ele desenha o campo no lugar (e tamanho) novo a partir do rascunho
    for (const el of doCampo(nome)) { el.style.translate = `${desvio(nome)[0]}px ${desvio(nome)[1]}px`; el.style.scale = String(escalaDe(nome)); }
    setArrastando(null);
    setGesto(null);
    if (!m || cancelou) return;
    setSelecao({ tipo: 'texto', nome });
    if (!m.arrastou) return; // não arrastou: só seleciona (o duplo clique edita)
    const l = livreDe(nome);
    if (l && m.modo === 'tamanho') {
      const k = Math.min(6, Math.max(0.2, (m.largura + m.dx) / m.largura));
      mudarLivre(l.id, { tamanho: Math.min(0.5, Math.max(0.01, arred(l.tamanho * k))) });
    } else if (l) {
      mudarLivre(l.id, { x: Math.min(2, Math.max(-1, arred(l.x + m.dx / mw))), y: Math.min(2, Math.max(-1, arred(l.y + m.dy / mh))) });
    } else {
      const [x0, y0] = p.posicoes?.[nome] ?? [0, 0];
      mudarPeca((x) => ({ posicoes: { ...(x.posicoes ?? {}), [nome]: [limitar(x0 + m.dx / mw), limitar(y0 + m.dy / mh)] } }));
    }
  }

  // ---------- cor (paleta): um valor para o campo todo ou para o texto livre ----------
  const corDe = (nome: string): string => {
    const l = livreDe(nome);
    if (l) return l.cor;
    const c = p.estilos[nome];
    return typeof c === 'string' ? c : ''; // lista com uma cor por item (peças antigas): mostra a automática
  };
  const [corViva, setCorViva] = useState<{ nome: string; cor: string } | null>(null);
  useEffect(() => { if (emDia) setCorViva(null); }, [emDia]); // a peça certa chegou: a pintura de agora some
  /** Cor de preenchimento de um valor da paleta (hex ou estilo com nome); null = automática. */
  const preenchimentoDe = (cor: string) => {
    const base = cor.split('+')[0];
    if (/^#[0-9a-f]{6}$/i.test(base)) return base;
    return inicio.estilos.find((e) => e.nome === base)?.cor ?? null;
  };
  const pintar = (nome: string, cor: string) => {
    // só quando muda o preenchimento (mudando só o contorno, a pintura cobriria o contorno de agora)
    setCorViva(preenchimentoDe(cor) !== preenchimentoDe(corDe(nome)) ? { nome, cor } : null);
    const l = livreDe(nome);
    if (l) mudarLivre(l.id, { cor });
    else mudarPeca((x) => ({ estilos: { ...x.estilos, [nome]: cor } }));
  };

  // ---------- texto livre: a ferramenta T cria um onde a pessoa clicar ----------
  const [ferramenta, setFerramenta] = useState<'texto' | null>(null);
  const [corNova, setCorNova] = useState(''); // cor do próximo texto (paleta aberta com a ferramenta T)
  const mudarLivre = (id: string, m: Partial<TextoLivre> | null) =>
    mudarPeca((x) => ({ livres: m ? (x.livres ?? []).map((l) => (l.id === id ? aplicarNoFormato(l, m) : l)) : (x.livres ?? []).filter((l) => l.id !== id) }));
  /** Lugar e tamanho mudam só no formato da tela; texto e cor valem para todos (o texto novo apaga as quebras próprias de cada formato). */
  function aplicarNoFormato(l: TextoLivre, m: Partial<TextoLivre>): TextoLivre {
    const { x, y, tamanho, ...resto } = m;
    const novo: TextoLivre = { ...l, ...resto };
    if ('texto' in resto && l.formatos) {
      novo.formatos = Object.fromEntries(Object.entries(l.formatos).map(([f, lugar]) => { const { texto: _, ...sem } = lugar!; return [f, sem]; }));
    }
    if (x !== undefined || y !== undefined || tamanho !== undefined) {
      const agora = livreNo(l, formato);
      novo.formatos = { ...(novo.formatos ?? {}), [formato]: { ...(novo.formatos?.[formato] ?? {}), x: x ?? agora.x, y: y ?? agora.y, tamanho: tamanho ?? agora.tamanho } };
    }
    return novo;
  }
  function criarLivre(e: React.MouseEvent<HTMLDivElement>) {
    const r0 = e.currentTarget.getBoundingClientRect();
    const novo: TextoLivre = {
      id: Math.random().toString(36).slice(2, 8), texto: '', cor: corNova, tamanho: TAMANHO_LIVRE, // na cor escolhida com a ferramenta T
      x: arred((e.clientX - r0.left) / r0.width), y: arred((e.clientY - r0.top) / r0.height - (TAMANHO_LIVRE * LADO) / H / 2),
    };
    mudarPeca((x) => ({ livres: [...(x.livres ?? []), novo] }));
    setFerramenta(null);
    setSelecao({ tipo: 'texto', nome: nomeLivre(novo) });
    abrirTexto(nomeLivre(novo), novo);
  }

  function abrirTexto(nome: string, novo?: TextoLivre) {
    const l = novo ?? livreDe(nome);
    setEditando(nome);
    if (l) { setRascunhoTexto({ valor: l.texto, cor: l.cor }); return; }
    const c = layout.campos[nome];
    setRascunhoTexto({ valor: valorDoCampo(p, nome, c), cor: p.estilos[nome] ?? (c.list ? [] : '') });
  }
  function salvarTexto() {
    if (!editando || !rascunhoTexto) return;
    const nome = editando, l = livreDe(nome);
    if (l) {
      const texto = String(rascunhoTexto.valor);
      mudarLivre(l.id, texto.trim() ? { texto } : null);
    } else {
      mudarPeca((x) => ({ textos: { ...x.textos, [nome]: rascunhoTexto.valor } })); // a cor fica na paleta
    }
    setEditando(null);
  }
  /** Fecha sem salvar; um texto livre que ficou vazio sai da peça. */
  function fecharTexto() {
    const l = editando ? livreDe(editando) : undefined;
    if (l && !l.texto.trim()) mudarLivre(l.id, null);
    setEditando(null);
  }
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { if (editando) fecharTexto(); else setSelecao(null); setFerramenta(null); }
      const digitando = (e.target as HTMLElement).closest('input, textarea, [contenteditable]');
      // Ctrl+Z (Cmd+Z no Mac) desfaz a última mudança da peça; digitando, vale o desfazer do próprio campo
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === 'z' && !digitando && !editando) {
        e.preventDefault();
        if (!desfazer()) toast('Nada para desfazer.');
        return;
      }
      if ((e.key === 'Delete' || e.key === 'Backspace') && !digitando && !editando) {
        if (selecao?.tipo === 'texto') {
          const l = livreDe(selecao.nome);
          if (l) { e.preventDefault(); mudarLivre(l.id, null); setSelecao(null); }
        } else if (selecao?.tipo === 'foto') { e.preventDefault(); tirarFoto(); }
      }
    };
    window.addEventListener('keydown', tecla);
    return () => window.removeEventListener('keydown', tecla);
  });
  const naMoldura = (c: Caixa) => ({ left: pct(c.x, W), top: pct(c.y, H), width: pct(c.w, W), height: pct(c.h, H) });

  // ---------- foto: buscar ou enviar ----------
  const [buscando, setBuscando] = useState(false);
  const arquivoRef = useRef<HTMLInputElement>(null);
  function usarFoto(f: FotoEscolhida) {
    setBuscando(false);
    // no modo manual, a foto vale também para os estilos que ainda não têm
    mudar((a) => ({ pecas: a.pecas.map((x, i) => (i === a.ativa || (a.modo === 'manual' && !x.foto) ? { ...x, foto: f, foco: [0.5, 0.5], zoom: 1, rostos: [] } : x)) }));
  }
  /** Tira a foto da peça (volta o fundo cinza e os botões de buscar e enviar). */
  function tirarFoto() {
    setSelecao(null);
    mudarPeca({ foto: null, foco: [0.5, 0.5], zoom: 1, rostos: [] });
  }
  async function enviar(arquivo: File) {
    const t = toast.loading('Enviando a foto…');
    try { usarFoto(await enviarDoComputador(arquivo)); toast.dismiss(t); }
    catch (e) { toast.error((e as Error).message, { id: t }); }
  }

  // ---------- estilos: criar novo ----------
  function criarNovo(id: string) {
    setEditando(null);
    mudar((a) => {
      const atualP = a.pecas[a.ativa];
      const nova = pecaNova(id, atualP?.foto ? { foto: atualP.foto, foco: atualP.foco, zoom: atualP.zoom, rostos: atualP.rostos } : {});
      return { pecas: [...a.pecas, nova], ativa: a.pecas.length };
    });
  }

  // ---------- ações ----------
  const [ocupado, setOcupado] = useState<'baixar' | 'salvar' | null>(null);
  const base = slug(r.nome || r.tema) || 'paintzoas';

  async function baixarFormatos(formatos: Formato[]) {
    setOcupado('baixar');
    try {
      const prontas = await Promise.all(formatos.map((f) => renderizar(variante(p, layout, f), p.seed, f, r.anuncio)));
      const arquivos = prontas.map((x, i): [string, Blob] => {
        if (!x.blob) throw new Error(x.peca.erros.join(' ') || 'A peça não pôde ser gerada.');
        return [`${base}-${formatos[i]}-${carimbo()}.png`, x.blob];
      });
      if (arquivos.length === 1) baixar(arquivos[0][1], arquivos[0][0]);
      else baixar(await zip(arquivos), `${base}-${carimbo()}.zip`);
    } catch (e) {
      toast.error(`Não consegui baixar: ${(e as Error).message}`);
    } finally {
      setOcupado(null);
    }
  }

  async function salvar() {
    if (!foto) return;
    setOcupado('salvar');
    try {
      // a foto entra em "Fotos que você já guardou" quando a peça é salva
      let f = foto;
      if (!f.id) {
        try { const item = await api.guardarNoAcervo(f.image, f.descricao || f.nome, f.fonte); f = { ...f, id: item.id }; } catch { /* a peça salva igual */ }
      }
      const pecaComFoto = { ...p, foto: f };
      const story = await renderizar(variante(pecaComFoto, layout, 'story'), p.seed, 'story', r.anuncio);
      const mini = story.blob ? await miniaturaJpeg(story.blob) : null;
      const salva = await api.salvarPeca(p.pecaId,
        { variante: variante(pecaComFoto, layout, 'story'), seed: p.seed, anuncio: r.anuncio, titulo: r.nome || undefined, editor: { ...pecaComFoto, tema: r.tema } }, mini);
      mudar((a) => ({ pecas: a.pecas.map((x, i) => (i === a.ativa ? { ...x, pecaId: salva.id, foto: f } : x)), sujo: false }));
      toast.success(p.pecaId ? 'Atualizada em Minhas peças.' : 'Salva em Minhas peças.');
    } catch (e) {
      toast.error(`Não consegui salvar: ${(e as Error).message}`);
    } finally {
      setOcupado(null);
    }
  }

  const erros = pecaNaTela?.erros ?? [], avisos = pecaNaTela?.avisos ?? [];

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* palco */}
      <div
        ref={palcoRef}
        className={cn('relative min-h-0 flex-1 touch-none overflow-hidden bg-neutral-900 select-none', foto && (gesto === 'foto' ? 'cursor-grabbing' : 'cursor-grab'))}
        onPointerDown={aoApertar} onPointerMove={aoMover} onPointerUp={aoSoltar} onPointerCancel={aoSoltar}
      >
        {palco.w > 0 && (
          <>
            <div data-sem-arrasto onPointerDown={(e) => e.stopPropagation()}
              className="absolute inset-x-0 top-0 z-20 flex items-end justify-between gap-3 bg-neutral-950 px-5 py-3.5" style={{ height: TOPO - 6 }}>
              <div className="flex min-w-0 flex-col items-start gap-1.5">
                <div className="min-w-0 max-w-full [&>*]:max-w-fit"><Titulo r={r} mudar={mudar} /></div>
                {/* embaixo do nome: o formato da peça e, ao lado, os avisos (escondidos num botão) */}
                <div className="flex items-center gap-2">
                  <span className="text-sm text-white/70">Formato</span>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="outline" size="sm" className={VAZADO} aria-label="Formato da peça">
                        {NOMES_FORMATO[formato]}{formato === 'story' && r.anuncio ? ' (anúncio)' : ''} <ChevronDown />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent side="bottom" align="start" className="min-w-48">
                      <DropdownMenuRadioGroup value={formato} onValueChange={(f) => mudar({ formato: f as Formato })}>
                        {FORMATOS.map((f) => <DropdownMenuRadioItem key={f} value={f}>{NOMES_FORMATO[f]}</DropdownMenuRadioItem>)}
                      </DropdownMenuRadioGroup>
                      {formato === 'story' && (
                        <>
                          <DropdownMenuSeparator />
                          <DropdownMenuCheckboxItem checked={r.anuncio} onCheckedChange={(anuncio) => mudar({ anuncio })} onSelect={(e) => e.preventDefault()}>É anúncio pago</DropdownMenuCheckboxItem>
                        </>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                  {(() => {
                    const problemas = [...(erroPrevia ? [erroPrevia] : []), ...erros];
                    const total = problemas.length + avisos.length;
                    if (!total) return null;
                    const temErro = problemas.length > 0;
                    return (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button type="button" aria-live="polite"
                            className={cn('flex h-7 items-center gap-1.5 rounded-full px-2.5 text-xs font-medium transition',
                              temErro ? 'bg-red-500/20 text-red-200 hover:bg-red-500/30' : 'bg-amber-400/20 text-amber-100 hover:bg-amber-400/30')}>
                            <TriangleAlert className="size-3.5" />
                            {temErro ? `${problemas.length} ${problemas.length > 1 ? 'erros' : 'erro'} nesta peça` : `${avisos.length} ${avisos.length > 1 ? 'avisos' : 'aviso'} nesta peça`}
                            <ChevronDown className="size-3.5" />
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent side="bottom" align="start" className="max-h-72 w-96 space-y-1.5 overflow-y-auto p-3 text-xs leading-snug">
                          {problemas.map((x) => <p key={x} className="text-destructive">{x}</p>)}
                          {avisos.map((x) => <p key={x} className="text-muted-foreground">{x}</p>)}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    );
                  })()}
                </div>
              </div>
              <div className="flex shrink-0 items-center justify-end gap-2">
              <Button variant="outline" size="sm" className={VAZADO} disabled={!foto || ocupado !== null} onClick={salvar}>{ocupado === 'salvar' && <Loader2 className="animate-spin" />} Salvar</Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" className={VAZADO} disabled={!foto || ocupado !== null}>{ocupado === 'baixar' ? <Loader2 className="animate-spin" /> : <Download />} Baixar <ChevronDown /></Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {FORMATOS.map((f) => <DropdownMenuItem key={f} onSelect={() => baixarFormatos([f])}>{NOMES_FORMATO[f]}</DropdownMenuItem>)}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onSelect={() => baixarFormatos(FORMATOS)}>Tudo (.zip)</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              </div>
            </div>

            {camada && <div className="absolute bg-black" style={moldura} />}
            {camada && <div ref={camadaRef} className="absolute" style={camada}><img src={foto!.url} alt="" draggable={false} className="size-full" /></div>}

            <div className="pointer-events-none absolute" style={{ ...moldura, boxShadow: '0 0 0 100vmax rgb(23 23 23 / 0.75)', background: foto ? undefined : FUNDO_SEM_FOTO }}>
              {mostraImagem && <img src={mostrada!.url!} alt="Prévia da peça" draggable={false} className={cn('absolute inset-0 size-full transition-opacity', desatualizada && !corViva && 'opacity-60')} />}
              {montar && Object.entries(mostrada!.peca.medidas ?? {}).map(([nome, med]) => {
                // as letras do campo, recortadas da camada de texto (com folga para o contorno)
                if (!med?.linhas.length || (ehLivre(nome) && !livreDe(nome))) return null;
                const x0 = Math.max(0, Math.min(...med.linhas.map((l) => l.caixa.x)) - FOLGA), y0 = Math.max(0, Math.min(...med.linhas.map((l) => l.caixa.y)) - FOLGA);
                const x1 = Math.min(W, Math.max(...med.linhas.map((l) => l.caixa.x + l.caixa.w)) + FOLGA), y1 = Math.min(H, Math.max(...med.linhas.map((l) => l.caixa.y + l.caixa.h)) + FOLGA);
                const [dx, dy] = desvio(nome);
                return (
                  <div key={nome} data-campo={nome} aria-hidden className="absolute overflow-hidden"
                    style={{ left: pct(x0, W), top: pct(y0, H), width: pct(x1 - x0, W), height: pct(y1 - y0, H), translate: `${dx}px ${dy}px`, scale: String(escalaDe(nome)), transformOrigin: origemDe(nome, { x: x0, y: y0, w: x1 - x0, h: y1 - y0 }) }}>
                    <img src={mostrada!.texto!} alt="" draggable={false} className="absolute max-w-none"
                      style={{ left: `${(-x0 / (x1 - x0)) * 100}%`, top: `${(-y0 / (y1 - y0)) * 100}%`, width: `${(W / (x1 - x0)) * 100}%`, height: `${(H / (y1 - y0)) * 100}%` }} />
                  </div>
                );
              })}
              {/* cor nova na hora (enquanto a peça do servidor não chega): as letras do texto pintadas com a cor escolhida */}
              {corViva && !emDia && mostrada?.texto && (() => {
                const med = mostrada.peca.medidas?.[corViva.nome], cor = preenchimentoDe(corViva.cor);
                if (!med?.linhas.length || !cor) return null;
                const x0 = Math.max(0, Math.min(...med.linhas.map((l) => l.caixa.x)) - FOLGA), y0 = Math.max(0, Math.min(...med.linhas.map((l) => l.caixa.y)) - FOLGA);
                const x1 = Math.min(W, Math.max(...med.linhas.map((l) => l.caixa.x + l.caixa.w)) + FOLGA), y1 = Math.min(H, Math.max(...med.linhas.map((l) => l.caixa.y + l.caixa.h)) + FOLGA);
                const [dx, dy] = desvio(corViva.nome);
                const mascara = `url(${mostrada.texto})`;
                return (
                  <div aria-hidden className="absolute" style={{
                    left: pct(x0, W), top: pct(y0, H), width: pct(x1 - x0, W), height: pct(y1 - y0, H),
                    translate: `${dx}px ${dy}px`, scale: String(escalaDe(corViva.nome)), transformOrigin: origemDe(corViva.nome, { x: x0, y: y0, w: x1 - x0, h: y1 - y0 }),
                    backgroundColor: cor, maskImage: mascara, WebkitMaskImage: mascara,
                    maskSize: `${mw}px ${mh}px`, WebkitMaskSize: `${mw}px ${mh}px`,
                    maskPosition: `${(-x0 / W) * mw}px ${(-y0 / H) * mh}px`, WebkitMaskPosition: `${(-x0 / W) * mw}px ${(-y0 / H) * mh}px`,
                    maskRepeat: 'no-repeat', WebkitMaskRepeat: 'no-repeat',
                  }} />
                );
              })()}
              {r.mostrarSegura && (
                <div className="absolute inset-0 overflow-hidden">
                  <div className="absolute border-2 border-dashed border-white outline outline-1 outline-black/60"
                    style={{ left: pct(safe.left, W), right: pct(safe.right, W), top: pct(safe.top, H), bottom: pct(safe.bottom, H), boxShadow: '0 0 0 100vmax rgb(0 0 0 / 0.45)' }} />
                </div>
              )}
              {!foto && (
                <div data-sem-arrasto className="pointer-events-auto absolute left-1/2 top-1/2 z-[1] flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-2">
                  <Button variant="secondary" onClick={() => setBuscando(true)}><Search /> Buscar foto</Button>
                  <Button variant="ghost" size="sm" className="text-white/80 hover:bg-white/10 hover:text-white" onClick={() => arquivoRef.current?.click()}><Upload /> Enviar do computador</Button>
                </div>
              )}
              {gesto !== 'foto' && gesto !== 'zoom' && [...Object.keys(layout.campos), ...livres.map(nomeLivre)].map((nome) => {
                const l = livreDe(nome), c = l ? CAMPO_LIVRE : layout.campos[nome];
                const vazio = l ? !l.texto.trim() : ![valorDoCampo(p, nome, c)].flat().some((x) => x.trim());
                const caixa = caixaDe(nome);
                const [dx, dy] = desvio(nome);
                return (
                  <button key={nome} type="button" data-sem-arrasto data-campo={nome} aria-label={`${c.label ?? nome}: clique seleciona, duplo clique edita, arraste para mover`}
                    onPointerDown={(e) => apertarTexto(e, nome)}
                    onPointerMove={(e) => moverTexto(e, nome)}
                    onPointerUp={() => soltarTexto(nome)}
                    onPointerCancel={() => soltarTexto(nome, true)}
                    onDoubleClick={() => abrirTexto(nome)}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); abrirTexto(nome); } }}
                    className={cn('group pointer-events-auto absolute z-[2] touch-none rounded-sm outline-2 outline-offset-4 transition-[outline-color] hover:outline hover:outline-white/80',
                      arrastando === nome ? 'cursor-grabbing outline outline-white' : 'cursor-move',
                      (editando === nome || (selecao?.tipo === 'texto' && selecao.nome === nome)) && 'outline outline-white',
                      vazio && 'grid place-items-center border border-dashed border-white/70 text-sm text-white')}
                    style={{ ...naMoldura(caixa), translate: `${dx}px ${dy}px`, scale: String(escalaDe(nome)), transformOrigin: origemDe(nome, caixa) }}>
                    {vazio && (l ? 'Texto' : `+ ${c.label ?? nome}`)}
                    {l && !vazio && (
                      <span role="presentation" title="Arraste para mudar o tamanho"
                        className="absolute -bottom-2.5 -right-2.5 size-3 cursor-nwse-resize rounded-[2px] border border-neutral-900 bg-white opacity-0 transition-opacity group-hover:opacity-100"
                        onPointerDown={(e) => apertarTexto(e, nome, 'tamanho')}
                        onPointerMove={(e) => moverTexto(e, nome)}
                        onPointerUp={(e) => { e.stopPropagation(); soltarTexto(nome); }}
                        onPointerCancel={(e) => { e.stopPropagation(); soltarTexto(nome, true); }} />
                    )}
                  </button>
                );
              })}
              {ferramenta !== null && (
                <div data-sem-arrasto className="pointer-events-auto absolute inset-0 z-[3] cursor-crosshair" onClick={criarLivre}
                  aria-label="Clique onde o texto deve ficar" />
              )}
            </div>

            {selecao?.tipo === 'foto' && camada && gesto !== 'foto' && (
              <div data-sem-arrasto aria-label="Tamanho da foto: arraste um canto" className="pointer-events-none absolute inset-0 z-10">
                <div ref={alcasRef} className="absolute outline outline-1 outline-white/70" style={camada} />
                {([[0, 0], [1, 0], [0, 1], [1, 1]] as const).map(([cx, cy]) => {
                  // canto da foto; se ele sai da tela, a alça fica presa na borda
                  const x = Math.min(palco.w - 10, Math.max(LATERAL, camada.left + cx * camada.width)); // nunca embaixo da barra
                  const y = Math.min(palco.h - 10, Math.max(TOPO, camada.top + cy * camada.height));
                  return (
                    <span key={`${cx}${cy}`} role="presentation"
                      className={cn('pointer-events-auto absolute size-3 rounded-[2px] border border-neutral-900 bg-white shadow', cx === cy ? 'cursor-nwse-resize' : 'cursor-nesw-resize')}
                      style={{ left: x, top: y, translate: '-50% -50%' }}
                      onPointerDown={(e) => apertarAlca(e, cx, cy)} onPointerMove={moverAlca} onPointerUp={soltarAlca} onPointerCancel={soltarAlca} />
                  );
                })}
              </div>
            )}

            {/* barra de ferramentas: em pé, à esquerda, abaixo do título; embaixo dela, a paleta do texto selecionado */}
            <div data-sem-arrasto onPointerDown={(e) => e.stopPropagation()} className="absolute left-3 z-30 flex flex-col items-start gap-2" style={{ top: TOPO }}>
              <div className="flex flex-col gap-0.5 rounded-lg border bg-background p-1 shadow-lg">
              <Ferramenta rotulo={ferramenta ? 'Clique na peça para pôr o texto (Esc cancela)' : 'Texto'} ativa={ferramenta !== null}
                onClick={() => { setFerramenta((f) => (f ? null : 'texto')); setEditando(null); }}><Type /></Ferramenta>
              <Ferramenta rotulo="Sortear letras" onClick={() => mudarPeca({ seed: novaSeed() })}><Shuffle /></Ferramenta>
              <Ferramenta rotulo="Área segura" ativa={r.mostrarSegura} onClick={() => mudar({ mostrarSegura: !r.mostrarSegura })}><Scan /></Ferramenta>
              <DropdownMenu>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <DropdownMenuTrigger asChild><Button variant="ghost" size="icon-sm" aria-label={foto ? 'Trocar foto' : 'Foto'}><ImagePlus /></Button></DropdownMenuTrigger>
                  </TooltipTrigger>
                  <TooltipContent side="right">{foto ? 'Trocar foto' : 'Foto'}</TooltipContent>
                </Tooltip>
                <DropdownMenuContent side="right" align="start">
                  <DropdownMenuItem onSelect={() => setBuscando(true)}><Search /> Buscar foto</DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => arquivoRef.current?.click()}><Upload /> Enviar do computador</DropdownMenuItem>
                  {foto && <><DropdownMenuSeparator /><DropdownMenuItem variant="destructive" onSelect={tirarFoto}><Trash2 /> Tirar a foto</DropdownMenuItem></>}
                </DropdownMenuContent>
              </DropdownMenu>
              </div>
              {/* com a ferramenta T ativa, a paleta já aparece: o texto novo nasce na cor escolhida */}
              {ferramenta === 'texto' ? (
                <div className="rounded-lg border bg-background p-1.5 shadow-lg" aria-label="Cor do texto novo">
                  <Paleta valor={corNova} onMudar={setCorNova} />
                </div>
              ) : selecao?.tipo === 'texto' && (livreDe(selecao.nome) || layout.campos[selecao.nome]) && (
                <div className="rounded-lg border bg-background p-1.5 shadow-lg">
                  <Paleta valor={corDe(selecao.nome)} onMudar={(v) => pintar(selecao.nome, v)} />
                </div>
              )}
            </div>

            {/* edição no lugar (duplo clique): a caixa fica em cima do próprio texto, do tamanho dele.
                Enter quebra a linha; clicar fora ou Ctrl+Enter confirma; Esc desiste. */}
            {editando && rascunhoTexto && (() => {
              const l = livreDe(editando);
              const c = l ? CAMPO_LIVRE : layout.campos[editando];
              if (!c) return null;
              const caixa = caixaDe(editando);
              const [dx, dy] = desvio(editando);
              const valor = [rascunhoTexto.valor].flat().join('\n');
              const linhas = valor.split('\n');
              const fonte = Math.min(64, Math.max(14, (l ? l.tamanho * LADO : pecaNaTela?.fontePx?.[editando] ?? 0.06 * LADO) * (mw / W)));
              return (
                <textarea data-sem-arrasto autoFocus aria-label="Texto" spellCheck={false} value={valor} rows={Math.max(1, linhas.length)}
                  onFocus={(e) => e.currentTarget.select()}
                  onChange={(e) => setRascunhoTexto((d) => d && { ...d, valor: c.list ? e.target.value.split('\n') : e.target.value })}
                  onBlur={salvarTexto}
                  onKeyDown={(e) => {
                    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); fecharTexto(); }
                    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); salvarTexto(); }
                  }}
                  className="absolute z-30 resize-none overflow-hidden rounded-md bg-black/80 px-2 py-1 leading-tight text-white uppercase outline-2 outline-white [font-family:Paintzoas,sans-serif] focus:outline"
                  style={{
                    left: moldura.left + (caixa.x / W) * mw + dx, top: moldura.top + (caixa.y / H) * mh + dy, fontSize: fonte,
                    minWidth: Math.max((caixa.w / W) * mw, 140), width: `${Math.max(6, ...linhas.map((x) => x.length)) + 2}ch`,
                  }} />
              );
            })()}

            {carregando && !editando && (
              <div className="pointer-events-none absolute bottom-3 left-1/2 flex -translate-x-1/2 items-center gap-2 rounded-full bg-background/90 px-3 py-1 text-xs shadow">
                <Loader2 className="size-3.5 animate-spin" /> Atualizando a peça…
              </div>
            )}
          </>
        )}
      </div>


      {/* estilos de post: só no modo IA (as sugestões). No modo livre a peça fica com a tela toda. */}
      {r.modo === 'ia' && <div className="px-4 py-3"><EstilosDePost r={r} mudar={mudar} onCriar={criarNovo} /></div>}

      <EscolherFoto aberta={buscando} onFechar={() => setBuscando(false)} onEscolher={usarFoto} />
      <input ref={arquivoRef} type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" tabIndex={-1} aria-hidden
        onChange={(e) => { const f = e.target.files?.[0]; if (f) enviar(f); e.target.value = ''; }} />
    </div>
  );
}
