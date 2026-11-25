// Minhas peças: cada cartão abre a peça no editor, baixa (o motor gera de novo) ou apaga.
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { ChevronDown, Download, Loader2, MoreHorizontal, Trash2 } from 'lucide-react';
import { api, NOMES_FORMATO, type Formato, type Layout, type PecaSalva } from '@/api';
import { useDados } from '@/dados';
import { deSalva, variante } from '@/rascunho';
import { Button } from '@/components/ui/button';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Skeleton } from '@/components/ui/skeleton';
import { baixar, zip } from '@/lib/arquivos';
import { renderizar } from '@/previas';

/**
 * O PNG não fica guardado: o motor gera de novo a partir da receita salva (mesmo resultado).
 * Com o estado do editor salvo junto, cada formato usa o lugar dos textos naquele formato.
 */
async function pngDaPeca(p: PecaSalva, formato: Formato, layouts: Layout[]): Promise<Blob> {
  const noEditor = deSalva(p), layout = layouts.find((l) => l.id === noEditor.layout);
  const pronta = await renderizar(layout ? variante(noEditor, layout, formato) : p.variante, p.seed, formato, p.anuncio);
  if (!pronta.blob) throw new Error(pronta.peca.erros.join(' ') || 'A peça não pôde ser gerada.');
  return pronta.blob;
}

export function TelaPecas({ aoAbrir }: { aoAbrir: (p: PecaSalva) => void }) {
  const { inicio } = useDados();
  const [pecas, setPecas] = useState<PecaSalva[] | null>(null);
  const [baixando, setBaixando] = useState<string | null>(null);
  const [apagar, setApagar] = useState<PecaSalva | null>(null);

  const carregar = () => api.pecas().then(setPecas).catch((e: Error) => { toast.error(e.message); setPecas([]); });
  useEffect(() => { carregar(); }, []);

  async function baixarPeca(p: PecaSalva, formatos: Formato[]) {
    setBaixando(p.id);
    try {
      const arquivos = await Promise.all(formatos.map(async (f): Promise<[string, Blob]> => [`paintzoas-${f}-${p.id}.png`, await pngDaPeca(p, f, inicio.layouts)]));
      if (arquivos.length === 1) baixar(arquivos[0][1], arquivos[0][0]);
      else baixar(await zip(arquivos), `paintzoas-${p.id}.zip`);
    } catch (e) {
      toast.error(`Não consegui baixar: ${(e as Error).message}`);
    } finally {
      setBaixando(null);
    }
  }

  async function confirmarApagar() {
    if (!apagar) return;
    try { await api.apagarPeca(apagar.id); setPecas((l) => l?.filter((x) => x.id !== apagar.id) ?? null); }
    catch (e) { toast.error((e as Error).message); }
    setApagar(null);
  }

  return (
    <div className="mx-auto w-full max-w-6xl px-6 py-10">
      <h1 className="mb-6 text-xl font-semibold">Minhas peças</h1>
      {pecas === null ? (
        <div className="grid grid-cols-2 gap-5 sm:grid-cols-3 lg:grid-cols-5">
          {Array.from({ length: 5 }, (_, i) => <Skeleton key={i} className="aspect-[9/16] rounded-xl" />)}
        </div>
      ) : !pecas.length ? (
        <p className="text-muted-foreground">Nenhuma peça salva ainda. No editor, use Salvar.</p>
      ) : (
        <div className="grid grid-cols-2 gap-5 sm:grid-cols-3 lg:grid-cols-5">
          {pecas.map((p) => (
            <article key={p.id} className="flex flex-col overflow-hidden rounded-xl border bg-card">
              <button type="button" onClick={() => aoAbrir(p)} className="block bg-muted" aria-label={`Abrir ${p.titulo}`}>
                {p.miniatura ? <img src={`/pecas/${p.miniatura}`} alt="" className="aspect-[9/16] w-full object-cover" /> : <div className="aspect-[9/16]" />}
              </button>
              <div className="flex flex-1 flex-col gap-3 p-3">
                <div className="flex-1 space-y-0.5">
                  <p className="line-clamp-2 text-sm">{p.titulo}</p>
                  <p className="text-xs text-muted-foreground">{new Date(p.salva_em).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}</p>
                </div>
                <div className="flex items-center gap-1.5">
                  <Button size="sm" className="flex-1" onClick={() => aoAbrir(p)}>Abrir</Button>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button size="sm" variant="outline" disabled={baixando === p.id} aria-label="Baixar">
                        {baixando === p.id ? <Loader2 className="animate-spin" /> : <Download />}<ChevronDown />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      {(['story', 'feed', 'banner', 'banner-celular'] as Formato[]).map((f) => <DropdownMenuItem key={f} onSelect={() => baixarPeca(p, [f])}>{NOMES_FORMATO[f]}</DropdownMenuItem>)}
                      <DropdownMenuItem onSelect={() => baixarPeca(p, ['story', 'feed', 'banner', 'banner-celular'])}>Tudo (.zip)</DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button size="icon-sm" variant="ghost" aria-label="Mais"><MoreHorizontal /></Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem variant="destructive" onSelect={() => setApagar(p)}><Trash2 /> Apagar</DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}

      <AlertDialog open={apagar !== null} onOpenChange={(aberto) => { if (!aberto) setApagar(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Apagar esta peça?</AlertDialogTitle>
            <AlertDialogDescription>Ela sai de Minhas peças e não dá para desfazer. A foto continua guardada.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Voltar</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={confirmarApagar}>Apagar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
