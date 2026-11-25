// Menu "Buscar fotos em": as fontes de foto, cada uma com uma mini-imagem (a primeira foto de uma
// busca fixa nela, para mostrar o tipo de foto que traz) e uma explicação curta. Usado na tela
// inicial (fotos das sugestões) e na janela "Buscar foto". A escolha fica no navegador.
import { useEffect, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { api } from '@/api';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useDados } from '@/dados';
import { CHAVE_FONTES, fontesEscolhidas } from '@/fluxo';
import { cn } from '@/lib/utils';

/** As fontes marcadas (todas, na primeira vez), guardadas no navegador. */
export function useFontes() {
  const { inicio } = useDados();
  const [fontes, setFontes] = useState<string[]>(() => fontesEscolhidas() ?? inicio.fontes.map((f) => f.id));
  useEffect(() => { localStorage.setItem(CHAVE_FONTES, JSON.stringify(fontes)); }, [fontes]);
  return [fontes, setFontes] as const;
}

// mini-imagens já pedidas (o servidor também guarda; aqui evita pedir de novo ao reabrir o menu)
const amostras = new Map<string, Promise<string | null>>();
const amostraDe = (id: string) => {
  if (!amostras.has(id)) amostras.set(id, api.amostraDaFonte(id).then((r) => r.miniatura).catch(() => null));
  return amostras.get(id)!;
};

export function MenuDeFontes({ fontes, onMudar, className, alinhar = 'end' }: { fontes: string[]; onMudar: (f: string[]) => void; className?: string; alinhar?: 'start' | 'end' }) {
  const { inicio } = useDados();
  const [aberto, setAberto] = useState(false);
  const [imagens, setImagens] = useState<Record<string, string | null>>({});
  useEffect(() => {
    if (!aberto) return;
    for (const f of inicio.fontes) amostraDe(f.id).then((m) => setImagens((a) => (f.id in a ? a : { ...a, [f.id]: m })));
  }, [aberto, inicio.fontes]);

  const rotulo = fontes.length === inicio.fontes.length ? 'todas' : `${fontes.length} de ${inicio.fontes.length}`;
  return (
    <DropdownMenu open={aberto} onOpenChange={setAberto}>
      <Tooltip>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            <Button type="button" variant="outline" className={cn('shrink-0', className)}>Buscar fotos em: {rotulo} <ChevronDown /></Button>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent>Não muda o consumo da IA. Menos fontes deixam a busca mais rápida.</TooltipContent>
      </Tooltip>
      <DropdownMenuContent align={alinhar} className="w-80">
        {inicio.fontes.map((f) => (
          <DropdownMenuCheckboxItem key={f.id} checked={fontes.includes(f.id)} onSelect={(e) => e.preventDefault()} className="items-start gap-3 py-2"
            onCheckedChange={(v) => onMudar(v ? [...fontes, f.id] : fontes.filter((x) => x !== f.id))}>
            <span className="size-12 shrink-0 overflow-hidden rounded-md bg-muted" aria-hidden>
              {imagens[f.id] && <img src={imagens[f.id]!} alt="" className="size-full object-cover grayscale-[30%]" onError={(e) => { e.currentTarget.style.visibility = 'hidden'; }} />}
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-medium">{f.nome}</span>
              {f.descricao && <span className="block text-xs leading-snug text-muted-foreground">{f.descricao}</span>}
            </span>
          </DropdownMenuCheckboxItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
