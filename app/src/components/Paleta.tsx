// Paleta do texto selecionado, como a do Illustrator: preenchimento (quadrado cheio) e contorno
// (quadrado vazado). O contorno começa em "nenhum" e aparece quando ganha cor; o preenchimento
// começa em "Automática" (o motor escolhe a cor mais legível sobre a foto).
//
// O valor vai para o motor como texto: "" (automática), "#rrggbb", "<preenchimento>+#rrggbb"
// (com contorno) ou "+#rrggbb" (contorno com preenchimento automático). Estilos com nome das
// peças antigas (rosa, hero…) aparecem com as cores deles e só mudam se a pessoa mexer.
import { useEffect, useRef, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { normalizarHex } from '@/components/pecas-de-texto';
import { useDados } from '@/dados';
import { cn } from '@/lib/utils';

interface Partes { preenchimento: string | null; contorno: string | null }

/** Lê o valor: preenchimento (hex, ou null = automático) e contorno (hex, ou null = nenhum). */
function ler(valor: string, estilos: { nome: string; cor: string; contorno: string | null }[]): Partes & { base: string } {
  const [base, traco] = valor.includes('+') ? valor.split('+') : [valor, ''];
  const nomeado = estilos.find((e) => e.nome === base);
  return {
    base,
    preenchimento: normalizarHex(base) ?? nomeado?.cor ?? null,
    contorno: normalizarHex(traco) ?? (nomeado?.contorno ? normalizarHex(nomeado.contorno) ?? nomeado.contorno : null),
  };
}
function montar({ preenchimento, contorno }: Partes): string {
  return contorno ? `${preenchimento ?? ''}+${contorno}` : preenchimento ?? '';
}

export function Paleta({ valor, onMudar }: { valor: string; onMudar: (v: string) => void }) {
  const { inicio } = useDados();
  const partes = ler(valor, inicio.estilos);
  const [alvo, setAlvo] = useState<'preenchimento' | 'contorno' | null>(null);
  const mudar = (m: Partial<Partes>) => onMudar(montar({ preenchimento: partes.preenchimento, contorno: partes.contorno, ...m }));

  const atual = alvo ? partes[alvo] : null;
  const [texto, setTexto] = useState(atual ?? '');
  const campoHex = useRef<HTMLInputElement>(null);
  // enquanto a pessoa digita, o campo fica como ela escreveu
  useEffect(() => { if (document.activeElement !== campoHex.current) setTexto(atual ?? ''); }, [atual, alvo]);

  const quadrado = 'absolute size-7 rounded-[3px] border border-foreground/30 transition hover:scale-105';
  return (
    <div className="relative" data-sem-arrasto>
      <div className="relative size-12" role="group" aria-label="Cores do texto">
        {/* contorno: atrás, embaixo à direita (vazado) */}
        <button type="button" aria-label={`Contorno: ${partes.contorno ?? 'nenhum'}`} aria-pressed={alvo === 'contorno'}
          onClick={() => setAlvo((a) => (a === 'contorno' ? null : 'contorno'))}
          className={cn(quadrado, 'bottom-0 right-0 grid place-items-center bg-white', alvo === 'contorno' && 'ring-2 ring-foreground ring-offset-1')}
          style={partes.contorno ? { boxShadow: `inset 0 0 0 6px ${partes.contorno}` } : undefined}>
          {!partes.contorno && <span className="block h-[2px] w-9 -rotate-45 bg-red-500" aria-hidden />}
          {partes.contorno && <span className="size-3 rounded-[1px] bg-white" aria-hidden />}
        </button>
        {/* preenchimento: na frente, em cima à esquerda */}
        <button type="button" aria-label={`Preenchimento: ${partes.preenchimento ?? 'automático'}`} aria-pressed={alvo === 'preenchimento'}
          onClick={() => setAlvo((a) => (a === 'preenchimento' ? null : 'preenchimento'))}
          className={cn(quadrado, 'left-0 top-0 grid place-items-center text-[11px] font-semibold', alvo === 'preenchimento' && 'ring-2 ring-foreground ring-offset-1',
            !partes.preenchimento && 'bg-[conic-gradient(#f9a8d4,#fde68a,#a7f3d0,#93c5fd,#f9a8d4)]')}
          style={partes.preenchimento ? { background: partes.preenchimento } : undefined}>
          {!partes.preenchimento && 'A'}
        </button>
      </div>

      {alvo && (
        <div className="absolute left-full top-0 z-30 ml-2 w-52 space-y-2 rounded-lg border bg-background p-3 shadow-lg">
          <p className="text-xs font-medium">{alvo === 'preenchimento' ? 'Preenchimento' : 'Contorno'}</p>
          <div className="flex items-center gap-2">
            <label className="relative size-8 shrink-0 cursor-pointer overflow-hidden rounded-md border"
              style={{ background: atual ?? (alvo === 'preenchimento' ? undefined : '#ffffff') }}>
              <input type="color" aria-label="Escolher cor" className="absolute inset-0 size-full cursor-pointer opacity-0"
                value={atual ?? '#ffffff'} onChange={(e) => mudar({ [alvo]: e.target.value })} />
            </label>
            <Input ref={campoHex} aria-label="Cor em hexadecimal" placeholder="#hex" spellCheck={false} maxLength={7}
              className="h-8 font-mono text-xs" value={texto}
              onChange={(e) => { setTexto(e.target.value); const h = normalizarHex(e.target.value); if (h) mudar({ [alvo]: h }); }}
              onBlur={() => setTexto(atual ?? '')} />
          </div>
          {alvo === 'preenchimento'
            ? <Button size="sm" variant={partes.preenchimento ? 'outline' : 'secondary'} className="w-full" onClick={() => mudar({ preenchimento: null })}>Automática (a mais legível)</Button>
            : <Button size="sm" variant={partes.contorno ? 'outline' : 'secondary'} className="w-full" onClick={() => mudar({ contorno: null })}>Sem contorno</Button>}
        </div>
      )}
    </div>
  );
}
