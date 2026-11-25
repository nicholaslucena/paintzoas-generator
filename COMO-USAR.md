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

## Publicar na Vercel
1. Na Vercel, em **Storage**, crie um **Blob** com acesso **privado** e ligue ao projeto, marcando a opção de criar o token de leitura e escrita (`BLOB_READ_WRITE_TOKEN`).
2. Nas variáveis do projeto: as do `.env` (`GEMINI_API_KEY`, `EDITOR_USUARIO`, `EDITOR_SENHA`, `EDITOR_SEGREDO`).
3. O `vercel.json` já diz como instalar e montar; não mude nada nas configurações de build.
4. Para levar as fotos e as peças deste computador: copie o `BLOB_READ_WRITE_TOKEN` para o `.env` e rode `npm run migrar`.

## Onde ficam as coisas
- **Marca:** `marca/` (cópia do `custom.css` e da fonte; não editar à mão).
- **Modelos de peça:** `layouts/`.
- **Fontes de fotos:** `config/acervos.json`.
- **Fotos guardadas e peças salvas:** no computador, `library/` e `pecas/` (fora do git). Na Vercel, no Blob.
- **Chaves e senha:** `.env`, fora do git.

Histórico e decisões do editor: `HANDOFF-EDITOR.md`.
