// Entrada da função da Vercel (montada por src/vercel-build.ts): a API do editor, as fotos e as
// peças passam por aqui. A página vem direto de app/dist.
// O Node 24 roda os .ts direto (tira os tipos ao carregar), então o servidor é o mesmo do computador.
import { responder } from './servidor.ts';

export default function editor(req, res) {
  return responder(req, res);
}
