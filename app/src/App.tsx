// Topo (logo, barrinha da IA, Nova peça, Minhas peças) e a tela atual: início (tema) ou editor.
import { useState } from 'react';
import { ChevronDown, LogOut, Palette, Plus, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { UsoIa } from '@/components/UsoIa';
import { useDados } from '@/dados';
import { cn } from '@/lib/utils';
import { deSalva, pecaNova, temAlgoNaoSalvo, useRascunho } from '@/rascunho';
import { TelaInicio } from '@/telas/Inicio';
import { TelaEditor } from '@/telas/Editor';
import { TelaPecas } from '@/telas/Pecas';
import { useSessao } from '@/telas/Login';

export function App() {
  const { inicio } = useDados();
  const [r, mudar, , desfazer] = useRascunho();
  const sessao = useSessao();
  const [vista, setVista] = useState<'criar' | 'pecas'>('criar');

  // editor sem peças (rascunho vazio ou de outra versão) volta para o início
  const p = r.pecas[r.ativa];
  const tela = r.tela === 'editor' && p && inicio.layouts.some((l) => l.id === p.layout) ? 'editor' : 'inicio';

  const naHome = vista === 'criar' && tela === 'inicio';

  // A peça aberta que não foi salva é descartada ao começar outra (com aviso, se tiver algo).
  const [aConfirmar, setAConfirmar] = useState<(() => void) | null>(null);
  const descartarE = (seguir: () => void) => { if (temAlgoNaoSalvo(r)) setAConfirmar(() => seguir); else seguir(); };
  // logo e "Nova peça › Gerar com IA" levam ao início (o campo do tema)
  const comIa = () => descartarE(() => { setVista('criar'); mudar({ tela: 'inicio', pecas: [], ativa: 0, nome: '', sujo: false, estilosAbertos: true, formato: 'story' }); });
  // Minhas peças e Sair também saem da peça aberta: o que não foi salvo é descartado (com aviso)
  const verPecas = () => { if (vista === 'pecas') return; descartarE(() => { mudar({ tela: 'inicio', pecas: [], ativa: 0, nome: '', sujo: false }); setVista('pecas'); }); };
  const sair = () => descartarE(() => { mudar({ tela: 'inicio', pecas: [], ativa: 0, nome: '', sujo: false }); sessao.sair(); });
  const aMao = () => descartarE(() => {
    setVista('criar');
    mudar({ tela: 'editor', modo: 'manual', modelo: null, ativa: 0, nome: '', pecas: [pecaNova('livre')], sujo: false, formato: 'story' });
  });

  return (
    <div className="flex h-dvh flex-col">
      {/* na home, o topo fica limpo (sem logo e sem linha): o logo grande está em cima da caixa do tema */}
      <header className={cn('flex shrink-0 items-center gap-6 px-4 py-2.5', !naHome && 'border-b')}>
        {!naHome && (
          <button type="button" onClick={comIa} aria-label="Início" className="cursor-pointer">
            <img src="/logo-creator.svg" alt="Paintzoas Creator Plus" className="h-8" />
          </button>
        )}
        <div className="ml-auto flex items-center gap-5">
          <UsoIa />
          <nav className="flex items-center gap-1">
            {/* na home o botão grande já cria: "Nova peça" só aparece fora dela */}
            {!naHome && <DropdownMenu>
              <DropdownMenuTrigger asChild><Button size="sm"><Plus /> Nova peça <ChevronDown /></Button></DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="min-w-44">
                <DropdownMenuItem onSelect={comIa}><Sparkles /> Gerar com IA</DropdownMenuItem>
                <DropdownMenuItem onSelect={aMao}><Palette /> Montar à mão</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>}
            <button type="button" onClick={verPecas} aria-current={vista === 'pecas' ? 'page' : undefined}
              className={cn('cursor-pointer rounded-md px-3 py-1.5 text-sm text-foreground transition hover:bg-secondary', vista === 'pecas' && 'bg-secondary font-medium')}>
              Minhas peças
            </button>
            {/* sair fica separado das ações do dia a dia */}
            {sessao.exige && (
              <Button variant="ghost" size="sm" onClick={sair} className="ml-6 text-destructive hover:bg-destructive/10 hover:text-destructive">
                <LogOut /> Sair
              </Button>
            )}
          </nav>
        </div>
      </header>

      <main className={cn('flex min-h-0 flex-1 flex-col', !(vista === 'criar' && tela === 'editor') && 'overflow-y-auto')}>
        {vista === 'pecas' ? (
          <TelaPecas aoAbrir={(salva) => descartarE(() => { mudar({ tela: 'editor', modo: 'salva', modelo: null, ativa: 0, pecas: [deSalva(salva)], anuncio: salva.anuncio, nome: salva.titulo, sujo: false, formato: 'story' }); setVista('criar'); })} />
        ) : tela === 'inicio' ? (
          <TelaInicio r={r} mudar={mudar} />
        ) : (
          <TelaEditor key={`${r.ativa}:${p.foto?.image ?? ''}`} r={r} mudar={mudar} desfazer={desfazer} />
        )}
      </main>

      <AlertDialog open={aConfirmar !== null} onOpenChange={(aberto) => { if (!aberto) setAConfirmar(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Descartar a peça atual?</AlertDialogTitle>
            <AlertDialogDescription>Ela não foi salva: se sair agora, ela será descartada. O que está em Minhas peças continua lá.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Voltar</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={() => { aConfirmar?.(); setAConfirmar(null); }}>Descartar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
