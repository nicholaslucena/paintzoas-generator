// Janela "Buscar foto": busca sem IA nas fontes e fotos já guardadas. O envio do computador fica
// no menu da foto do editor (enviarDoComputador, abaixo).
import { useEffect, useState } from 'react';
import { Loader2, Search } from 'lucide-react';
import { api, type Candidata, type FotoEnviada, type ItemAcervo } from '@/api';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { MenuDeFontes, useFontes } from '@/components/MenuDeFontes';
import { cn } from '@/lib/utils';
import type { FotoEscolhida } from '@/rascunho';

type Selecao = { tipo: 'busca'; c: Candidata } | { tipo: 'acervo'; item: ItemAcervo };
type Msg = { texto: string; tipo: 'info' | 'aviso' | 'erro' | 'carregando' } | null;

const deItem = (i: ItemAcervo): FotoEscolhida => ({
  id: i.id, image: i.image, url: i.url, miniatura: i.urlMiniatura, largura: i.largura, altura: i.altura,
  nome: i.descricao || i.source.name, descricao: i.descricao,
});
export const deEnvio = (f: FotoEnviada, fonte?: FotoEscolhida['fonte'], nome = f.nome): FotoEscolhida => ({
  id: null, image: f.image, url: f.url, miniatura: f.url, largura: f.largura, altura: f.altura, nome, descricao: fonte ? nome : '', fonte,
});

function Mensagem({ msg }: { msg: Msg }) {
  if (!msg) return null;
  return (
    <p className={cn('flex items-center gap-2 text-sm', msg.tipo === 'erro' ? 'text-destructive' : 'text-muted-foreground')}>
      {msg.tipo === 'carregando' && <Loader2 className="size-4 animate-spin" />}{msg.texto}
    </p>
  );
}

export function EscolherFoto({ aberta, onFechar, onEscolher }: { aberta: boolean; onFechar: () => void; onEscolher: (f: FotoEscolhida) => void }) {
  const [fontes, setFontes] = useFontes();
  const [consulta, setConsulta] = useState('');
  const [resultados, setResultados] = useState<Candidata[]>([]);
  const [acervo, setAcervo] = useState<ItemAcervo[]>([]);
  const [selecao, setSelecao] = useState<Selecao | null>(null);
  const [ocupado, setOcupado] = useState<'busca' | 'usar' | null>(null);
  const [msg, setMsg] = useState<Msg>(null);

  useEffect(() => { if (aberta) api.acervo().then(setAcervo).catch(() => setAcervo([])); }, [aberta]);

  async function buscar() {
    if (!fontes.length) { setMsg({ texto: 'Escolha pelo menos uma fonte em "Buscar fotos em".', tipo: 'aviso' }); return; }
    if (!consulta.trim()) return;
    setOcupado('busca');
    setResultados([]);
    setMsg({ texto: 'Buscando…', tipo: 'carregando' });
    try {
      const res = await api.buscar(consulta, 'setup-punchline', false, fontes);
      setResultados(res.candidatas.slice(0, 24));
      const nota = res.avisos.join(' ');
      setMsg(!res.candidatas.length ? { texto: `Nenhuma foto com essas palavras. Tente menos palavras, em inglês, descrevendo a cena. ${nota}`, tipo: 'aviso' } : nota ? { texto: nota, tipo: 'aviso' } : null);
    } catch (e) {
      setMsg({ texto: `A busca não funcionou: ${(e as Error).message}`, tipo: 'erro' });
    } finally {
      setOcupado(null);
    }
  }

  async function usar() {
    if (!selecao) return;
    if (selecao.tipo === 'acervo') { onEscolher(deItem(selecao.item)); return; }
    const c = selecao.c;
    setOcupado('usar');
    setMsg({ texto: 'Baixando a foto…', tipo: 'carregando' });
    try {
      let enviada: FotoEnviada;
      try {
        const res = await fetch(c.imagem); // o navegador baixa; se não conseguir, o editor tenta
        if (!res.ok) throw new Error(String(res.status));
        enviada = await api.enviarFoto(await res.blob(), `${c.titulo}.jpg`);
      } catch {
        enviada = await api.baixarFoto(c);
      }
      setMsg(null);
      onEscolher(deEnvio(enviada, { name: [c.fonte, c.autor].filter(Boolean).join(' · '), url: c.pagina, license: c.direitos }, c.titulo));
    } catch (e) {
      setMsg({ texto: `Não consegui baixar essa foto (${(e as Error).message}). Escolha outra.`, tipo: 'erro' });
    } finally {
      setOcupado(null);
    }
  }

  const igual = (s: Selecao) => selecao?.tipo === s.tipo && JSON.stringify(selecao) === JSON.stringify(s);
  const Miniatura = ({ s, src, legenda }: { s: Selecao; src: string; legenda: string }) => (
    <button type="button" aria-pressed={igual(s)} title={legenda} onClick={() => setSelecao(s)}
      className={cn('overflow-hidden rounded-lg border bg-card text-left transition hover:border-foreground/40', igual(s) && 'border-foreground ring-2 ring-foreground')}>
      <img src={src} alt="" loading="lazy" className="aspect-[3/4] w-full bg-muted object-cover" onError={(e) => { e.currentTarget.style.visibility = 'hidden'; }} />
      <span className="block truncate px-2 py-1 text-xs text-muted-foreground">{legenda}</span>
    </button>
  );

  return (
    <Dialog open={aberta} onOpenChange={(a) => { if (!a) onFechar(); }}>
      <DialogContent className="flex max-h-[88dvh] flex-col gap-4 sm:max-w-4xl">
        <DialogHeader><DialogTitle>Buscar foto</DialogTitle></DialogHeader>
        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto pr-1">
          <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); buscar(); }}>
            <Input autoFocus value={consulta} onChange={(e) => setConsulta(e.target.value)} placeholder="Buscar (em inglês acha mais: woman kitchen)" aria-label="Buscar foto" />
            <MenuDeFontes fontes={fontes} onMudar={setFontes} />
            <Button type="submit" variant="outline" disabled={ocupado !== null}>{ocupado === 'busca' ? <Loader2 className="animate-spin" /> : <Search />} Buscar</Button>
          </form>
          <Mensagem msg={msg} />
          {resultados.length > 0 && (
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
              {resultados.map((c) => <Miniatura key={c.imagem} s={{ tipo: 'busca', c }} src={c.miniatura} legenda={[c.fonte, c.tamanho].filter(Boolean).join(' · ')} />)}
            </div>
          )}
          {acervo.length > 0 && (
            <div className="space-y-2">
              <p className="text-sm font-medium">Fotos que você já guardou</p>
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
                {acervo.map((i) => <Miniatura key={i.id} s={{ tipo: 'acervo', item: i }} src={i.urlMiniatura} legenda={i.descricao || i.source.name} />)}
              </div>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onFechar}>Cancelar</Button>
          <Button disabled={!selecao || ocupado === 'usar'} onClick={usar}>{ocupado === 'usar' && <Loader2 className="animate-spin" />} Usar esta foto</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Envio do computador (menu da foto no editor): sobe a foto e devolve pronta para usar. */
export async function enviarDoComputador(arquivo: File): Promise<FotoEscolhida> {
  if (arquivo.size > 40 * 1024 * 1024) throw new Error('Essa foto passa de 40 MB. Use uma versão menor.');
  return deEnvio(await api.enviarFoto(arquivo, arquivo.name));
}
