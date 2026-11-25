// Barrinha do uso da IA hoje (os dois modelos juntos; cada um tem cerca de 20 pedidos grátis por dia).
import { Sparkles } from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useDados } from '@/dados';
import { cn } from '@/lib/utils';

export function UsoIa() {
  const { config, semIa } = useDados();
  if (!config.temGemini) return <span className="text-xs text-muted-foreground">IA desligada</span>;
  const usados = config.modelos.reduce((s, m) => s + m.pedidos, 0);
  const total = config.modelos.reduce((s, m) => s + (m.limite ?? 20), 0);
  const pct = Math.min(100, (usados / total) * 100);
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className="flex items-center gap-2" aria-label={`IA hoje: ${usados} de ${total} pedidos`}>
          <Sparkles className="size-3.5 text-muted-foreground" />
          <Progress value={pct} className={cn('h-1.5 w-28', (semIa || pct >= 85) && '[&>div]:bg-destructive')} />
        </div>
      </TooltipTrigger>
      <TooltipContent className="text-left">
        {semIa ?? `IA hoje: ${usados} de ${total} pedidos`}
        {config.modelos.map((m) => <div key={m.id} className="opacity-80">{m.nome}: {m.pedidos} de {m.limite ?? '~20'}</div>)}
      </TooltipContent>
    </Tooltip>
  );
}
