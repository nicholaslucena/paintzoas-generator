// Dados que todas as telas usam: layouts, estilos, formatos e o uso da IA hoje.
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { api, type Config, type Inicio } from './api';

interface Dados {
  inicio: Inicio;
  config: Config;
  atualizarConfig: () => void;
  /** null = pode usar a IA; senão, o motivo (curto) de não poder. */
  semIa: string | null;
}

const Contexto = createContext<Dados | null>(null);
export const useDados = () => useContext(Contexto)!;

function quando(iso: string) {
  const d = new Date(iso);
  const hora = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  return d.toDateString() === new Date().toDateString() ? `hoje às ${hora}` : `amanhã às ${hora}`;
}

export function motivoSemIa(c: Config): string | null {
  if (!c.temGemini) return 'IA desligada: falta a chave do Gemini.';
  if (c.uso.esgotadoAte) return `Acabaram os pedidos grátis de hoje. A IA volta ${quando(c.uso.esgotadoAte)}.`;
  return null;
}

export function ProvedorDeDados({ children, carregando, falha }: { children: ReactNode; carregando: ReactNode; falha: (erro: string) => ReactNode }) {
  const [inicio, setInicio] = useState<Inicio | null>(null);
  const [config, setConfig] = useState<Config | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([api.inicio(), api.config()]).then(([i, c]) => { setInicio(i); setConfig(c); }).catch((e: Error) => setErro(e.message));
  }, []);
  const atualizarConfig = useCallback(() => { api.config().then(setConfig).catch(() => {}); }, []);

  if (erro) return falha(erro);
  if (!inicio || !config) return carregando;
  return <Contexto.Provider value={{ inicio, config, atualizarConfig, semIa: motivoSemIa(config) }}>{children}</Contexto.Provider>;
}
