# Paintzoas Generator (Creator Plus)

Editor de peças de anúncio da Paintzoas: story, feed e banners da loja, com sugestões de texto e foto pela IA (Gemini, plano grátis) ou montadas à mão.

## Instalar (uma vez)
1. Instale o **Node.js 24**.
2. Nesta pasta, rode `npm install` e `npm --prefix app install`.
3. Copie o `.env.example` para `.env` e preencha (o próprio arquivo explica cada linha):
   - `GEMINI_API_KEY`: a chave grátis do Google AI Studio. Sem ela, tudo funciona, menos a IA.
   - Login (opcional): rode `npm run senha` e cole as 3 linhas que ele imprime.

## Usar
- `npm run dev` e abra http://127.0.0.1:5175. Mudanças no código entram sozinhas, sem reiniciar.

## Comandos
- `npm run marca`: atualiza a cópia da marca (cores, contorno dos títulos e fonte) a partir de paintzoas.vercel.app. Rode quando o CSS ou a fonte da loja mudarem.
- `npm run senha`: cria o usuário e a senha do login (a senha não aparece na tela).
- `npm run tipos`: confere os tipos do servidor e da página.
- `npm run render -- campaigns/teste.json`: gera as peças de teste em `out/` (para conferir que o motor não mudou).

## Onde ficam as coisas
- **Marca:** `marca/` (cópia do `custom.css` e da fonte; não editar à mão).
- **Modelos de peça:** `layouts/`.
- **Fontes de fotos:** `config/acervos.json`.
- **Fotos guardadas e peças salvas:** `library/` e `pecas/`. Ficam só no computador, fora do git.
- **Chaves e senha:** `.env`, fora do git.

Histórico e decisões do editor: `HANDOFF-EDITOR.md`.
