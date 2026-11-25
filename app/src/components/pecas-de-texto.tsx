// Peças pequenas usadas no texto: esquema do layout, escolha de cor e campo com contador.
import { useEffect, useRef, useState } from 'react';
import { Plus, X } from 'lucide-react';
import type { Campo, Estilo } from '@/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { contar, nomeDoEstilo, type Cor } from '@/rascunho';
import { useDados } from '@/dados';

// ---------- esquema do layout (as barras coloridas dos cartões) ----------
const ESQUEMAS: Record<string, [string, string][]> = {
  'setup-punchline': [['top-[8%]', 'rosa'], ['bottom-[8%]', 'azul']],
  topo: [['top-[8%]', 'rosa'], ['top-[20%]', 'rosa']],
  lista: [['top-[8%]', 'vermelho'], ['bottom-[30%]', 'azul'], ['bottom-[19%]', 'rosa'], ['bottom-[8%]', 'menta']],
};
export function EsquemaLayout({ id, className }: { id: string; className?: string }) {
  const { inicio } = useDados();
  const cor = (n: string) => inicio.estilos.find((e) => e.nome === n)?.cor ?? '#999';
  return (
    <div className={cn('relative aspect-[9/16] w-14 shrink-0 overflow-hidden rounded-md bg-neutral-700', className)} aria-hidden>
      {(ESQUEMAS[id] ?? []).map(([pos, n], i) => (
        <span key={i} className={cn('absolute left-[12%] h-[7%] rounded-sm', pos, i % 2 ? 'w-[60%]' : 'w-[76%]')} style={{ background: cor(n) }} />
      ))}
    </div>
  );
}

// ---------- cor de cada voz ----------
// "A" (o motor escolhe a mais legível), uma cor livre (seletor + hex) ou um estilo com contorno do site.
const HEX = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i;
/** "#abc", "abc" ou "#aabbcc" → "#aabbcc"; null se não for hex. */
export function normalizarHex(t: string): string | null {
  const m = t.trim().match(HEX);
  if (!m) return null;
  const h = m[1].length === 3 ? [...m[1]].map((c) => c + c).join('') : m[1];
  return `#${h.toLowerCase()}`;
}

export function EscolhaDeCor({ valor, onMudar, tamanho = 'normal' }: { valor: string; onMudar: (v: string) => void; tamanho?: 'normal' | 'pequeno' }) {
  const { inicio } = useDados();
  const d = tamanho === 'pequeno' ? 'size-5' : 'size-6';
  const contornos = inicio.estilos.filter((e) => e.contorno);
  // cor chapada na tela: a hex escolhida ou, em peças antigas, a de uma cor com nome (ex.: rosa)
  const nomeada = inicio.estilos.find((e) => e.nome === valor && !e.contorno);
  const corLivre = normalizarHex(valor) ?? nomeada?.cor ?? null;
  const [texto, setTexto] = useState(corLivre ?? '');
  const campoHex = useRef<HTMLInputElement>(null);
  // enquanto a pessoa digita, o campo fica como ela escreveu ("#abc" não vira "#aabbcc" no meio)
  useEffect(() => { if (document.activeElement !== campoHex.current) setTexto(corLivre ?? ''); }, [corLivre]);
  const bolinha = (nome: string, conteudo: React.ReactNode, estilo?: Estilo) => (
    <Tooltip key={nome || 'auto'}>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={nome ? nomeDoEstilo(nome) : 'Automática (a mais legível)'}
          aria-pressed={valor === nome}
          onClick={() => onMudar(nome)}
          className={cn(d, 'grid place-items-center rounded-full border text-[10px] font-semibold transition',
            valor === nome ? 'ring-2 ring-foreground ring-offset-2 ring-offset-background' : 'hover:scale-110')}
          style={estilo ? { background: estilo.cor, borderColor: estilo.contorno ?? 'transparent', borderWidth: estilo.contorno ? 3 : 1 } : undefined}
        >
          {conteudo}
        </button>
      </TooltipTrigger>
      <TooltipContent>{nome ? nomeDoEstilo(nome) : 'Automática (a mais legível)'}</TooltipContent>
    </Tooltip>
  );
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {bolinha('', 'A')}
      <Tooltip>
        <TooltipTrigger asChild>
          <label className={cn(d, 'relative cursor-pointer rounded-full border transition',
            corLivre ? 'ring-2 ring-foreground ring-offset-2 ring-offset-background' : 'hover:scale-110',
            !corLivre && 'bg-[conic-gradient(red,yellow,lime,cyan,blue,magenta,red)]')}
            style={corLivre ? { background: corLivre } : undefined}>
            <input type="color" aria-label="Escolher cor" className="absolute inset-0 size-full cursor-pointer opacity-0"
              value={corLivre ?? '#ffffff'} onChange={(e) => onMudar(e.target.value)} />
          </label>
        </TooltipTrigger>
        <TooltipContent>Escolher cor</TooltipContent>
      </Tooltip>
      <Input ref={campoHex} aria-label="Cor em hexadecimal" placeholder="#hex" spellCheck={false} maxLength={7}
        className={cn('font-mono', tamanho === 'pequeno' ? 'h-6 w-20 px-1.5 text-xs' : 'h-7 w-24 px-2 text-xs')}
        value={texto}
        onChange={(e) => { setTexto(e.target.value); const h = normalizarHex(e.target.value); if (h) onMudar(h); }}
        onBlur={() => setTexto(corLivre ?? '')} />
      {contornos.map((e) => bolinha(e.nome, null, e))}
    </div>
  );
}

function Contador({ n, max }: { n: number; max: number }) {
  return <span className={cn('text-xs tabular-nums', n > max ? 'font-medium text-destructive' : 'text-muted-foreground')}>{n}/{max}</span>;
}

// ---------- campo de texto (texto corrido ou lista) ----------
interface PropsCampo {
  nome: string;
  campo: Campo;
  valor: string | string[];
  onMudar: (v: string | string[]) => void;
  /** Com cor: mostra as bolinhas (no editor da peça). */
  cor?: Cor;
  onCor?: (c: Cor) => void;
  autoFocus?: boolean;
  onEnter?: () => void;
}

/** "|" e Enter quebram a linha no motor; na caixa de texto, "|" aparece como Enter. */
const paraCaixa = (t: string) => t.replace(/\s*\|\s*/g, '\n');

export function CampoTexto({ nome, campo, valor, onMudar, cor, onCor, autoFocus, onEnter }: PropsCampo) {
  const rotulo = campo.label ?? nome;
  if (campo.list) {
    const itens = Array.isArray(valor) ? valor : [valor];
    const cores = Array.isArray(cor) ? cor : [];
    const mudarItem = (i: number, v: string) => onMudar(itens.map((x, j) => (j === i ? v : x)));
    return (
      <div className="space-y-2">
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-sm font-medium">{rotulo}</span>
          <span className="text-xs text-muted-foreground">até {campo.max_lines} itens de {campo.max_chars} letras</span>
        </div>
        {itens.map((item, i) => (
          <div key={i} className="space-y-1.5">
            <div className="flex items-center gap-2">
              <Input
                value={item}
                autoFocus={autoFocus && i === 0}
                aria-label={`${rotulo}, item ${i + 1}`}
                onChange={(e) => mudarItem(i, e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) onEnter?.(); }}
              />
              <Contador n={contar(item)} max={campo.max_chars} />
              <Button type="button" variant="ghost" size="icon-sm" aria-label="Tirar item" disabled={itens.length <= 1}
                onClick={() => { onMudar(itens.filter((_, j) => j !== i)); onCor?.(cores.filter((_, j) => j !== i)); }}>
                <X />
              </Button>
            </div>
            {onCor && <EscolhaDeCor tamanho="pequeno" valor={cores[i] ?? ''} onMudar={(v) => { const c = [...cores]; c[i] = v || null; onCor(c); }} />}
          </div>
        ))}
        <Button type="button" variant="outline" size="sm" disabled={itens.length >= campo.max_lines} onClick={() => onMudar([...itens, ''])}>
          <Plus /> Item
        </Button>
      </div>
    );
  }
  const texto = typeof valor === 'string' ? valor : valor.join(' | ');
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <label htmlFor={`campo-${nome}`} className="text-sm font-medium">{rotulo}</label>
        <Contador n={contar(texto)} max={campo.max_chars} />
      </div>
      <Textarea
        id={`campo-${nome}`}
        rows={2}
        autoFocus={autoFocus}
        value={paraCaixa(texto)}
        onChange={(e) => onMudar(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) onEnter?.(); }}
        className="resize-none"
      />
      {campo.hint && <p className="text-xs text-muted-foreground">{campo.hint} Enter quebra a linha.</p>}
      {onCor && <EscolhaDeCor valor={typeof cor === 'string' ? cor : ''} onMudar={onCor} />}
    </div>
  );
}
