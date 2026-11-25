// Login de uma pessoa só (quando o .env tem EDITOR_SENHA). O Portao vem antes de tudo: sem login,
// mostra esta tela; logado (ou sem senha configurada), abre o editor. O cookie vale 30 dias.
import { createContext, useContext, useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { api } from '@/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const Sessao = createContext<{ exige: boolean; sair: () => void }>({ exige: false, sair: () => {} });
/** Para o "Sair" do topo: só aparece quando o login está ligado. */
export const useSessao = () => useContext(Sessao);

export function Portao({ children }: { children: React.ReactNode }) {
  const [estado, setEstado] = useState<{ exige: boolean; entrou: boolean } | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  useEffect(() => { api.sessao().then(setEstado).catch((e: Error) => setErro(e.message)); }, []);

  const sair = () => { api.sair().finally(() => location.reload()); };
  if (erro) return <div className="grid h-dvh place-items-center p-6 text-center text-sm text-destructive">{erro}</div>;
  if (!estado) return <div className="grid h-dvh place-items-center text-sm text-muted-foreground">Abrindo o editor…</div>;
  if (estado.exige && !estado.entrou) return <TelaLogin aoEntrar={() => setEstado({ ...estado, entrou: true })} />;
  return <Sessao.Provider value={{ exige: estado.exige, sair }}>{children}</Sessao.Provider>;
}

function TelaLogin({ aoEntrar }: { aoEntrar: () => void }) {
  const [usuario, setUsuario] = useState('');
  const [senha, setSenha] = useState('');
  const [entrando, setEntrando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function entrar(e: React.FormEvent) {
    e.preventDefault();
    setEntrando(true);
    setErro(null);
    try { await api.entrar(usuario, senha); aoEntrar(); }
    catch (err) { setErro((err as Error).message); setSenha(''); }
    finally { setEntrando(false); }
  }

  return (
    <div className="flex h-dvh items-center justify-center px-6">
      <form className="w-full max-w-sm space-y-5" onSubmit={entrar}>
        <img src="/logo.svg" alt="Paintzoas" className="mx-auto h-12" />
        <div className="space-y-2">
          <Label htmlFor="usuario">Usuário</Label>
          <Input id="usuario" autoFocus autoComplete="username" value={usuario} onChange={(e) => setUsuario(e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="senha">Senha</Label>
          <Input id="senha" type="password" autoComplete="current-password" value={senha} onChange={(e) => setSenha(e.target.value)} />
        </div>
        {erro && <p className="text-sm text-destructive" role="alert">{erro}</p>}
        <Button type="submit" size="lg" className="w-full" disabled={entrando || !usuario || !senha}>
          {entrando && <Loader2 className="animate-spin" />} Entrar
        </Button>
      </form>
    </div>
  );
}
