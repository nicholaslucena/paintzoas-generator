// Login de uma pessoa só, tipo senha de portfólio. Fica no .env (e, na Vercel, nas variáveis do projeto):
//   EDITOR_USUARIO  o usuário
//   EDITOR_SENHA    o hash da senha (scrypt), nunca a senha em texto; gerado por `npm run senha`
//   EDITOR_SEGREDO  um valor aleatório que assina o cookie
// Sem EDITOR_SENHA, o editor roda aberto (como no computador de quem usa).
import crypto from 'node:crypto';
import type http from 'node:http';

const COOKIE = 'pz_sessao';
const DURACAO_MS = 30 * 24 * 3600 * 1000; // 30 dias

export const exigeLogin = () => Boolean(process.env.EDITOR_SENHA?.trim());

/** "scrypt:<sal hex>:<hash hex>" — o mesmo formato que `npm run senha` gera. */
export function gerarHash(senha: string): string {
  const sal = crypto.randomBytes(16);
  return `scrypt:${sal.toString('hex')}:${crypto.scryptSync(senha, sal, 64).toString('hex')}`;
}

function senhaConfere(senha: string, guardado: string): boolean {
  const [tipo, sal, hash] = guardado.trim().split(':');
  if (tipo !== 'scrypt' || !sal || !hash) return false;
  const esperado = Buffer.from(hash, 'hex');
  const calculado = crypto.scryptSync(senha, Buffer.from(sal, 'hex'), esperado.length);
  return esperado.length > 0 && crypto.timingSafeEqual(esperado, calculado);
}

const iguais = (a: string, b: string) => {
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && crypto.timingSafeEqual(x, y);
};

/** Usuário e senha batem com o .env. */
export function credenciaisCertas(usuario: string, senha: string): boolean {
  const u = process.env.EDITOR_USUARIO?.trim() ?? '', h = process.env.EDITOR_SENHA?.trim() ?? '';
  // confere as duas sempre (mesmo tempo com usuário certo ou errado)
  const senhaOk = senhaConfere(senha, h);
  return iguais(usuario.trim(), u) && senhaOk;
}

const assinar = (valor: string) => crypto.createHmac('sha256', process.env.EDITOR_SEGREDO?.trim() || process.env.EDITOR_SENHA || '').update(valor).digest('base64url');

/** Cookie válido: "<validade>.<assinatura>", ainda dentro da validade. */
export function logado(req: http.IncomingMessage): boolean {
  const valor = (req.headers.cookie ?? '').split(/;\s*/).find((c) => c.startsWith(`${COOKIE}=`))?.slice(COOKIE.length + 1);
  if (!valor) return false;
  const [validade, assinatura] = valor.split('.');
  return Boolean(validade && assinatura) && iguais(assinatura, assinar(validade)) && Number(validade) > Date.now();
}

const seguro = (req: http.IncomingMessage) => req.headers['x-forwarded-proto'] === 'https' ? '; Secure' : '';

export function cookieDeEntrada(req: http.IncomingMessage): string {
  const validade = String(Date.now() + DURACAO_MS);
  return `${COOKIE}=${validade}.${assinar(validade)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${DURACAO_MS / 1000}${seguro(req)}`;
}
export const cookieDeSaida = (req: http.IncomingMessage) => `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${seguro(req)}`;
