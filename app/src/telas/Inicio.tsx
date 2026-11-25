// Início: o tema, as fontes das fotos e o botão de gerar. Embaixo, o caminho sem IA.
import { useState } from 'react';
import { toast } from 'sonner';
import { Loader2, Palette, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { MenuDeFontes, useFontes } from '@/components/MenuDeFontes';
import { useDados } from '@/dados';
import { gerarSugestoes } from '@/fluxo';
import { pecaNova, type Rascunho } from '@/rascunho';

interface Props { r: Rascunho; mudar: (m: Partial<Rascunho>) => void }

export function TelaInicio({ r, mudar }: Props) {
  const { semIa, atualizarConfig } = useDados();
  const [gerando, setGerando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [fontes, setFontes] = useFontes();

  async function gerar() {
    if (!fontes.length) { setErro('Escolha pelo menos uma fonte de fotos em "Buscar fotos em".'); return; }
    setGerando(true);
    setErro(null);
    // aviso num toast (não ocupa a tela): some sozinho quando as ideias chegam
    // sem spinner; a segunda linha na mesma cor da primeira
    const aviso = toast('Escrevendo as ideias e procurando as fotos…', { description: 'Pode levar até um minuto.', duration: Infinity, classNames: { description: '!text-current' } });
    try {
      mudar(await gerarSugestoes(r.tema.trim()));
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      toast.dismiss(aviso);
      setGerando(false);
      atualizarConfig();
    }
  }

  // modo livre: uma peça sem campos prontos; o texto vai onde a pessoa clicar (ferramenta T)
  const manual = () => mudar({ tela: 'editor', modo: 'manual', modelo: null, ativa: 0, nome: '', pecas: [pecaNova('livre')], sujo: false, formato: 'story' });

  return (
    <div className="flex flex-1 items-center justify-center px-6 py-10">
      <form className="w-full max-w-2xl space-y-4" onSubmit={(e) => { e.preventDefault(); if (r.tema.trim()) gerar(); }}>
        <h1 className="pb-2"><img src="/logo-creator.svg" alt="Paintzoas Creator Plus" className="mx-auto h-24" /></h1>
        <Textarea
          autoFocus
          rows={3}
          value={r.tema}
          disabled={gerando}
          onChange={(e) => mudar({ tema: e.target.value })}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); if (r.tema.trim() && !semIa) gerar(); } }}
          placeholder="Qual é a boa de hoje? Frete grátis até domingo, camiseta nova, a segunda-feira chegando de novo…"
          aria-label="Tema da peça"
          className="min-h-28 resize-none p-4 text-base md:text-base"
        />
        {/* embaixo da caixa: as fontes à esquerda e o gerar à direita, como nas interfaces de IA */}
        <div className="flex items-center justify-between gap-3">
          <MenuDeFontes fontes={fontes} onMudar={setFontes} alinhar="start" />
          <Button type="submit" size="lg" disabled={gerando || !r.tema.trim() || Boolean(semIa)}>
            {gerando ? <Loader2 className="animate-spin" /> : <Sparkles />}
            {gerando ? 'Gerando…' : 'Gerar ideias'}
          </Button>
        </div>
        {(erro || semIa) && <p className="text-center text-sm text-destructive">{erro ?? semIa}</p>}
        <Button type="button" variant="secondary" size="lg" className="w-full" onClick={manual} disabled={gerando}>
          <Palette /> Montar à mão, sem IA
        </Button>
      </form>
    </div>
  );
}
