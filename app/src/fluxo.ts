// Gerar as sugestões (tela inicial). As fotos vêm das fontes marcadas no menu "Buscar fotos em".
import { api } from './api';
import { pecaNova, type Rascunho } from './rascunho';

export const CHAVE_FONTES = 'pz-fontes';
export function fontesEscolhidas(): string[] | undefined {
  try { const s = localStorage.getItem(CHAVE_FONTES); return s ? JSON.parse(s) : undefined; } catch { return undefined; }
}

/** 1 pedido à IA (2 se alguma peça passar do limite): uma peça por formato, cada uma com foto. */
export async function gerarSugestoes(tema: string): Promise<Partial<Rascunho>> {
  const r = await api.sugestoes(tema, fontesEscolhidas());
  if (!r.pecas.length) throw new Error('A IA não mandou nenhuma sugestão. Tente de novo.');
  return {
    tela: 'editor',
    estilosAbertos: true, // sugestões novas: a faixa de estilos aparece aberta
    formato: 'story', // toda peça nova começa no story
    modo: 'ia',
    modelo: r.modelo,
    ativa: 0,
    pecas: r.pecas.map((s) => pecaNova(s.layout, {
      textos: s.textos,
      foto: s.foto && {
        id: null, image: s.foto.image, url: s.foto.url, miniatura: s.foto.url,
        largura: s.foto.largura, altura: s.foto.altura, nome: s.foto.nome, descricao: s.foto.nome, fonte: s.foto.fonte,
      },
    })),
  };
}
