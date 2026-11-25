# Handoff: editor de peças Paintzoas (para a próxima sessão)

## Repositório próprio (25/11/2026)
- O editor saiu da pasta `generator/` do repo `paintzoas` e virou este repositório (`C:\dev\paintzoas-generator`, repo `paintzoas-generator` no GitHub). Os caminhos `generator/...` citados abaixo agora são a raiz daqui.
- **Marca:** cópia em `marca/` (`custom.css` + `Paintzoas.woff2`), atualizada por `npm run marca` a partir de paintzoas.vercel.app. Antes era lida do repo `paintzoas` (`nuvemshop/` e `fonts/`).
- **Ficaram de fora:** o editor antigo (`app-antigo/`), os atalhos Instalar/Abrir Paintzoas e `out/`. A foto da campanha de teste veio para `campaigns/assets/`.
- As 10 peças de teste saem idênticas aqui, byte a byte.
- **Próximo passo:** deploy num projeto próprio da Vercel. Falta trocar o disco pelo Vercel Blob (fotos, acervo, peças, contador da IA), transformar o servidor numa função e reduzir fotos acima de 4,5 MB no navegador.


## Fluxo simplificado (24/11, tarde): substitui as telas de tema/formato/ideias/foto abaixo
- **Início:** só o campo do tema, "Gerar ideias" e o link "Pular a IA e montar à mão".
- **IA:** `/api/sugestoes` faz 1 pedido (`sugerirPecas` em `src/ia.ts`). Volta uma peça por estilo (Meme, Só no topo, Lista), cada uma com uma busca em inglês. O servidor procura a foto sem IA e pega a primeira que baixar. A foto fica em `library/uploads` e só entra no acervo quando a peça é salva.
- **Editor:**
  - Dentro da área escura da imagem, no alto (sem barra separada; a moldura começa abaixo deles): à esquerda, o nome (duplo clique renomeia; vai como título em Minhas peças); à direita, "Gerar de novo" (só no modo IA), Salvar e Baixar ▾ (os 4 formatos + .zip).
  - No centro: a peça, em Story, Feed, Banner do site (2048×740) ou Banner no celular (820×1111). As medidas e áreas seguras estão em `config/formats.json`.
  - Embaixo da peça: Zoom, "Área segura" (com escurecimento fora dela), Sortear letras, "É anúncio pago" (só no story) e Trocar foto ▾ (Buscar foto / Enviar do computador).
  - Embaixo de tudo: "Estilos de post" (miniaturas centralizadas) e "Criar novo".
  - Sem foto, a moldura mostra "Buscar foto" e, menor, "Enviar do computador".
- **Texto:** clicar edita; arrastar move. O deslocamento vai em `variante.posicoes` (frações da peça) e o motor aplica antes do encaixe (`pz.mover` em `src/pagina.js`), então o QA mede o texto no lugar novo.
- **Arrasto sem espera (24/11, noite):**
  - **Prévia rápida:** a prévia do editor pede `rapida` em `/api/prever`. A peça vem em JPEG e junto vem a camada só com as letras (PNG transparente; classe `.so-texto` em `layouts/_base.css`).
  - **Durante o gesto:** enquanto se arrasta texto ou foto, mexe no zoom ou espera a peça nova, o editor monta a peça no navegador: a foto em CSS e as letras recortadas dessa camada, campo a campo, a partir de `peca.medidas`.
  - **Rascunho:** o movimento vai direto no estilo dos elementos (`requestAnimationFrame`); o rascunho só grava ao soltar.
  - **Miniatura:** a peça aberta usa a prévia do editor, para não disputar a fila com ela.
  - **Velocidade:** medido em 24/11, o motor foi de ~1.200 ms para ~460 ms na prévia rápida e ~770 ms no PNG final. A captura usada para medir o contraste agora sai em PNG de compressão rápida (mesmos pixels). O recorte da foto fica guardado quando só o texto muda. O `fundoAtras` abre a captura uma vez só. As 10 peças de teste continuam iguais, byte a byte.
- **Cor:** no editor de texto ficam "A" (automática), o seletor de cor do sistema com campo hex e os estilos com contorno (Hero, H3 especial). As 4 cores com nome saíram da tela, mas peças antigas com elas continuam abrindo. O motor aceita `#rrggbb` em `colors` como cor chapada, com o mesmo QA de contraste (3:1).
- **Barra de ferramentas (25/11):** em pé, no alto à esquerda, logo abaixo do título. Tem:
  - Texto (T): clica na peça e cria um texto livre ali.
  - Formato ▸: Story, Feed, Banner do site, Banner no celular e "É anúncio pago", só no story.
  - Zoom: abre e fecha um slider vertical ao lado.
  - Sortear letras.
  - Área segura: liga e desliga.
  - Foto ▸: Buscar foto ou Enviar do computador.
  - A linha de controles embaixo da peça saiu.
- **Texto livre:** fica em `variante.livres`, com x e y do canto de cima à esquerda e o tamanho da letra, tudo em frações da peça.
  - O motor desenha cada um como um campo a mais (`livre-<id>`, `pz.criarLivres`), com tamanho fixo, sem encaixe e sem a escala do layout. A quebra de linha é a de quem escreveu.
  - O QA olha só área segura, rosto e contraste.
  - No editor: clicar edita (com Remover), arrastar move, a alça do canto muda o tamanho.
  - Um texto livre vazio sai da peça ao fechar o painel.
- **Modo livre (25/11, tarde):** "Pular a IA" abre uma peça só, no layout `livre` (`layouts/livre/`, sem campos). Nada de caixa de texto pronta: o texto vai onde a pessoa clicar.
  - O layout livre fica fora das sugestões da IA.
  - Os modelos (Meme, Só no topo, Lista) são só da IA. "Criar novo" sempre acrescenta uma peça livre, sem menu, com a mesma foto.
  - As miniaturas ("Estilos de post") só aparecem no modo IA. Nos outros modos, a peça fica com a tela toda.
- **Topo do palco (25/11):** à esquerda, o título e, embaixo dele, o formato e os avisos; à direita, Salvar e Baixar, vazados (outline).
  - **Barra de ferramentas:** fica em pé, à esquerda, abaixo do título, com dicas e menus abrindo para o lado. Não tem mais o Formato.
  - **Formato da peça:** dropdown embaixo do nome da peça, no topo à esquerda (fora da área da foto). No story, também tem "É anúncio pago". Na barra, o clique às vezes selecionava a foto em vez de abrir o menu.
  - **Avisos do QA:** ficam ao lado do formato, escondidos num botão "N erros nesta peça" (vermelho) ou "N avisos nesta peça" (amarelo), que abre a lista. A faixa do topo tem TOPO = 92.
  - **Topo e barra seguram o clique** (`stopPropagation` no pointerdown): nada passa para a foto embaixo deles.
  - **Faixa do topo:** opaca (`bg-neutral-950`), com altura fixa.
  - **Paleta do texto selecionado:** aparece embaixo da barra.
  - **Alças da foto:** nunca ficam embaixo da barra.
  - **Peça nova:** começa sempre em Story ("Gerar ideias", "Montar à mão", abrir de Minhas peças).
  - **Estilos de post:** a faixa volta aberta a cada sugestão nova.
- **Tamanho do texto livre:** em fração do lado menor da peça (no story e no feed, a largura; no banner, a altura). Antes era da largura, e no banner (2048×740) o texto ficava quase 3× maior em relação à altura.
- **Lugar dos textos por formato (25/11):** cada texto livre tem a base (x, y, tamanho) e um lugar próprio por formato (`formatos` no `TextoLivre`, em `rascunho.ts`).
  - `livreNo(l, formato)` dá o texto como fica num formato, e `variante(p, layout, formato)` monta a receita do motor naquele formato (o motor não mudou).
  - **Mover ou redimensionar:** grava só no formato da tela.
  - **Mudar o texto ou a cor:** vale para todos (o texto novo apaga as quebras próprias de cada formato).
  - **Conversão dos modelos:** o modelo é encaixado nos 4 formatos. O story vira a base, e cada outro formato ganha o lugar, o tamanho e a quebra de linha do próprio encaixe.
  - **Peças salvas:** guardam os lugares no estado do editor. O download em cada formato (Minhas peças) usa o lugar daquele formato.
- **Home:** caixa do tema com letra de 16 px. "Escrevendo as ideias…" virou um toast sem spinner (as duas linhas na mesma cor) que some quando as ideias chegam.
- **`.env.example`:** modelo com `GEMINI_API_KEY`, `EDITOR_USUARIO`, `EDITOR_SENHA`, `EDITOR_SEGREDO` e `PZ_PORTA` explicados. Vai para o git; o `.env` não.
- **Login (25/11):** `src/app/sessao.ts` e `app/src/telas/Login.tsx` (o `Portao` vem antes de tudo, em `main.tsx`). Senha no `.env`, criada com `npm run senha`; o passo a passo está no HANDOFF.md.
  - Sem login, só abre a casca da página (`index`, scripts, estilos, logo, fonte) e `/api/sessao`. O resto (`/api/*`, `/biblioteca`, `/pecas`) responde 401.
  - O cookie `pz_sessao` é assinado com `EDITOR_SEGREDO`, HttpOnly, e vale 30 dias.
  - Senha errada demora 1 segundo. "Sair" fica no topo.
  - Se a sessão vence no meio do uso, a página recarrega e cai no login.
- **Fotos sem pintura (25/11):** a marca usa só foto.
  - A busca do Wikimedia exclui painting, drawing, illustration, engraving, poster, map etc. (`SEM_ARTE_COMMONS`) e pede 5× mais resultados, porque a licença e o tamanho cortam muitos.
  - Em todas as fontes, sai a candidata cujo título indica pintura ou desenho, em várias línguas (`ehArte` em `src/acervos/busca.ts`).
  - O prompt (`src/ia.ts`, regra da "busca") pede só fotografia de pessoas reais.
- **Tirar a foto:** Delete com a foto selecionada, ou Foto › "Tirar a foto". A peça volta ao fundo cinza.
- **Fontes de foto (menu "Buscar fotos em"):** componente `MenuDeFontes`, usado na home (abaixo do tema) e na janela "Buscar foto". A escolha é a mesma nas duas telas (`pz-fontes` no navegador) e é o que "Gerar ideias" usa.
  - **Item de cada fonte:** mini-imagem, nome e `descricao` (em `config/acervos.json`).
  - **Mini-imagem:** vem de `GET /api/fontes/amostra?id=`, a primeira foto de uma busca por "family photograph" naquela fonte ("portrait" traz pintura no Wikimedia). Fica guardada enquanto o servidor estiver aberto.
  - **Dica do botão:** não muda o consumo da IA, só a velocidade. A busca de fotos não usa o Gemini; o custo das fontes é tempo e limite dos próprios acervos (os 429).
- **Edição no lugar:** a janela de texto saiu. O duplo clique (ou o T, num texto novo) abre uma caixa em cima do próprio texto, na fonte Paintzoas (`@font-face` em `app/src/index.css`, servida por `/fonts`).
  - Enter quebra a linha; clicar fora ou Ctrl+Enter confirma; Esc desiste.
  - Texto vazio sai da peça. Delete apaga o texto selecionado.
- **Home:** sem "Nova peça" no topo (o botão grande já cria). "Montar à mão, sem IA" é um botão secundário com ícone de paleta, o mesmo ícone do item no menu Nova peça.
- **Todo texto é texto livre (25/11, noite):**
  - **Conversão:** os modelos (Meme, Só no topo, Lista) ficam só como ponto de partida. Quando a prévia medida de uma peça de modelo chega ao editor, `camposParaLivres` (em `rascunho.ts`) troca os campos por textos livres no mesmo lugar, tamanho e cor. A peça vira `layout: "livre"` e guarda o modelo de origem em `modelo` (para o nome da miniatura).
  - **Listas:** cada item vira um texto.
  - **Peças salvas antigas:** passam pela mesma conversão ao abrir.
  - **Ancoragem:** no motor, o (x, y) do texto livre é o canto de cima à esquerda das letras (`pz.ancorarLivres`, depois de cada encaixe). A conversão fica fiel, e o texto nasce onde se clica.
- **Ctrl+Z (Cmd+Z):** desfaz a última mudança da peça (texto, cor, lugar, tamanho, foto, formato, anúncio).
  - O histórico fica em `useRascunho` (`rascunho.ts`), até 100 passos, só nesta sessão. Mudanças seguidas em menos de meio segundo contam como um passo.
  - Começar outra peça zera o histórico. A conversão automática dos modelos não entra nele.
  - Digitando num campo, vale o desfazer do próprio campo.
- **Ferramenta T:** a paleta aparece assim que o T é ativado, e o texto novo nasce na cor escolhida (`corNova`).
- **Cor na hora:** ao trocar o preenchimento na paleta, as letras do texto são pintadas no navegador (a camada só de letras como máscara CSS) até a peça do servidor chegar, cerca de 0,5 s depois. A peça não esmaece nesse meio tempo. Trocando só o contorno, espera a peça do servidor.
- **Topo da peça:** "Formato" (rótulo) + dropdown + botão de avisos, alinhados por baixo com Salvar e Baixar. A linha "Sugestões do Gemini …" embaixo das miniaturas saiu.
- **Sair da peça (25/11, noite):** qualquer saída com mudança não salva (`sujo`) pergunta antes: logo, Nova peça, Minhas peças, abrir outra peça e Sair (logout). "Descartar" joga a peça fora; "Voltar" fica nela.
- **Topo do site:** "Minhas peças" em preto (não parece desativado); "Sair" vermelho, com ícone, afastado das outras ações.
- **Faixa "Sugestões geradas por IA"** (antes "Estilos de post").
- **Nova peça:** é um menu com "Gerar com IA" (vai para o tema) e "Montar à mão" (peça livre vazia). O logo faz o mesmo que "Gerar com IA".
  - A peça aberta é descartada. Se tiver algo não salvo (`sujo` no rascunho, mais foto ou texto), aparece "Descartar a peça atual?". Abrir uma peça de Minhas peças passa pelo mesmo aviso.
  - Salvar limpa o `sujo`.
  - "Gerar de novo" saiu.
- **Contextual (25/11, noite):**
  - **Seleção:** clicar na foto seleciona a foto e mostra alças nos 4 cantos. Clicar num texto seleciona o texto e mostra a paleta embaixo da barra. Clicar fora da foto ou apertar Esc tira a seleção.
  - **Alças da foto:** redimensionam sempre de forma proporcional, com o canto oposto parado. O tamanho é o `zoom` (de 0,2 a 5; abaixo de 1, sobra preto). Se o canto sai da tela, a alça fica presa na borda. O slider de zoom saiu.
  - **Painel de texto:** o botão de confirmar é "OK".
  - **Texto:** o duplo clique edita (o painel só tem o texto). Delete apaga o texto livre selecionado.
  - **Barra:** o zoom saiu dela. O T voltou a ser um botão só, e o texto nasce sem contorno.
- **Paleta (Illustrator):** um quadrado de preenchimento, que começa em "A" (automática), e um de contorno, que começa em "nenhum" (risco vermelho). Cada um abre o seletor de cor e o campo hex.
  - No motor, o valor vai como: `""` (automática), `#rrggbb`, `<preenchimento>+#rrggbb` (com contorno dessa cor, no desenho e na largura do contorno do site) ou `+#rrggbb` (contorno escolhido e preenchimento automático).
  - Nas listas, a paleta pinta a lista toda.
  - Peças antigas com estilos de nome (rosa, hero…) continuam abrindo.
- **Foto livre:** o editor manda `enquadramento: "livre"`. A foto anda nos dois sentidos, sempre com ao menos 10% dela na peça, e o que fica descoberto sai preto.
  - Com o foco dentro do limite, o resultado é o mesmo do "cobrir", byte a byte.
  - Sem o campo (campanhas, peças antigas), vale "cobrir", como sempre.
- **Estilos de post:** a faixa recolhe pelo título. Fica guardado em `estilosAbertos`.
- **Texto livre:** a cor automática escolhe só entre as cores sem contorno.
- **`npm run dev`:** o servidor roda com `node --watch` e reinicia sozinho quando o código muda.
- **Sem foto:** dá para escrever e escolher estilo antes da foto. O motor usa um fundo cinza liso (`#404040`) e ignora rostos. Salvar e Baixar continuam pedindo foto.
- **Buscar foto:** as fontes ficam num dropdown "Buscar em: todas / N de M".
- **Saíram da tela:** troca Story/Feed separada (agora é o seletor de formato), marcar rostos, sugestões de busca e as ideias por formato.
- Testado no navegador em 24/11 (sem IA): modo manual, buscar foto do acervo, editar texto, arrastar texto, banner do site, Criar novo, renomear. As 10 peças de teste continuam iguais, byte a byte. **Não testado:** "Gerar ideias" com a IA nova e o envio pelo menu da foto.

## Estado em 24/11/2026 (fim do dia): o fluxo novo está pronto localmente
- **Página nova** em `app/` (Vite + React + Tailwind + shadcn, preset Nova). `npm run dev` → http://127.0.0.1:5175 (configuração `editor-dev` no `.claude/launch.json`). `npm run build` gera `app/dist`, que o `npm run app` serve na 4175. O `app/` tem o próprio `package.json` (`npm install` dentro de `app/`).
- **Feito e testado no navegador (sem gastar IA):** tema → formato → texto à mão → busca sem IA → foto do acervo → editor (texto editado em cima da peça com cor por voz e Enter quebrando a linha, arraste, zoom pelo controle, Story/Feed, rostos por cima da prévia, revisão), Baixar Story/Feed/.zip (zip montado no navegador; CRC conferido com o zlib), Salvar, Minhas peças (abrir, baixar, apagar). Baixar uma peça salva roda o motor de novo: deu o mesmo PNG, byte a byte, que o salvo em 23/11.
- **IA:** só `gemini-3.5-flash` e, de reserva, `gemini-3.5-flash-lite` (decisão de 24/11). "Gerar 5 ideias" foi testado em 24/11: o 3.5 Flash ficou sem responder e o Lite respondeu. Detalhes em "Gemini às vezes responde 503" no `HANDOFF.md`. **Não testados:** Sugerir 5 buscas, Pesquisar com IA, Marcar com IA (usam o mesmo caminho de pedido). Nem a escolha de uma foto da busca (baixar + guardar no acervo), para não pôr foto de teste no acervo.
- **Servidor:** `/api/ideias` (5 ideias sem foto), `/api/sugestoes-busca`, `/api/prever` por formato com o PNG em base64 e `medidas` (caixa de cada linha) na `peca`. Saíram `/api/png`, `/api/zip`, `/api/sugerir-textos` e `POST /api/config`. Peças salvas guardam a receita + `mini.jpg` (sem PNG). A chave do Gemini vem de `GEMINI_API_KEY`: no computador, de `.env` (fora do git); na Vercel, da variável do projeto.
- **Motor:** usa `playwright-core` e, quando `VERCEL` existe, o Chromium da `@sparticuz/chromium` (ainda não testado lá). As 10 peças de `campaigns/teste.json` continuam iguais, byte a byte.
- A página antiga está em `app-antigo/` só para consulta; apagar quando a nova for aprovada.
- `Instalar.cmd`/`Abrir Paintzoas.cmd` não instalam nem constroem a página nova (vão sair com a Vercel).
- **Vercel:** o plano está em `C:\Users\nluce\.claude\plans\` (Fase 0 em diante). A pessoa pediu para só mexer nisso depois de aprovar o editor local.

Escrito em 24/11/2026. Antes de mexer, leia este arquivo inteiro e depois a seção "Gerador de peças promocionais" do `HANDOFF.md` da raiz, onde estão o histórico e as decisões.

## O que existe hoje
- **Editor local:** `npm run dev` abre http://127.0.0.1:5175 (servidor em 4175). A configuração `editor-dev` em `.claude/launch.json` serve para o `preview_start`.
- **Motor:** `src/motor.ts` gera PNG + QA a partir de uma variante, e é o mesmo motor da CLI (`npm run render -- campaigns/teste.json`). O PNG do editor é idêntico, byte a byte, ao da CLI.
- **Telas atuais:**
  - **Tela 1 (escolher a foto):** busca com caixas "Buscar em" (6 fontes), chave "Usar IA na busca", envio de foto e fotos já guardadas.
  - **Tela 2 (estúdio):** moldura do story parada com a foto que anda e cresce atrás dela, tipo de peça, texto com sugestões da IA, prévia (a tela divide depois do tipo), botão "Baixar ▾" (Story, Feed, Tudo .zip), Salvar e Começar outra.
  - **Minhas peças:** grade de peças salvas.
- **IA:** Gemini, plano grátis, com a chave em `.env` (`GEMINI_API_KEY=...`, fora do git). Cuidado: o que o Claude Code grava em `%APPDATA%` (comandos dele e servidores do painel) fica numa cópia isolada que o Windows de verdade não vê; por isso a chave saiu de lá em 25/11. Todo o acesso passa por `src/ia.ts`. Modelos: só `gemini-3.5-flash` e `gemini-3.5-flash-lite`, cada um com a própria cota por dia (em torno de 20; o número exato só aparece num 429). O contador fica em `%APPDATA%\paintzoas\uso.json` e zera à meia-noite do Pacífico.
- **Código:** `src/app/servidor.ts` (rotas), `src/app/acervo.ts` (acervo + peças), `src/acervos/busca.ts` (fontes de foto), `app/index.html`, `app/editor.js`, `app/editor.css` (HTML, CSS e JS puros, sem build).

## Regras que não mudam (decisões do usuário)
- **Nunca usar a API paga da Anthropic.** A IA é sempre o Gemini grátis.
- **O conteúdo é de quem usa.** A Black Friday do `HANDOVER.md` é só exemplo.
- **Sem menu de origem e direitos e sem "estampa em produto".** As fotos vão sozinhas para o acervo.
- **Sem recursos não pedidos e sem texto verboso na interface.** Mensagens curtas.
- **Sem zoom pela rodinha do mouse:** dispara sem querer.
- **IA sempre opcional e explícita:** quem usa precisa entender que a cota é pequena (20 por dia) e escolher quando gastar.

## O que mudar agora (pedido de 24/11)

### Novo fluxo, nesta ordem
1. **Tema.** Um campo de texto com placeholder que mostre o melhor jeito de usar. Ex.: `Ex.: frete grátis até domingo, coleção nova de camisetas, segunda-feira de novo`.
2. **Formato (tipo de peça).** Meme, Só no topo ou Lista, em cartões.
3. **A IA gera 5 ideias de texto** a partir do tema e do formato. Ainda não há foto: o pedido vai sem imagem. Quem usa escolhe uma, e o texto continua editável depois.
4. **Imagem.** Como o texto já existe, há dois caminhos:
   1. **Pesquisar com IA,** só quando houver cota: a IA transforma o texto em termos e ordena os resultados. Gasta 2 pedidos.
   2. **5 sugestões de busca geradas pela IA a partir do texto.** Botões clicáveis; cada clique roda a busca **sem** IA nas fontes marcadas. Gasta 1 pedido para gerar as 5.
   - Continuam: enviar foto do computador, "Fotos que você já guardou" e as caixas "Buscar em".
5. **Editor da peça,** no estilo editor de story:
   - **Uma tela só, sem dividir:** a área segura já aparece na foto.
   - **Enquadramento:** arrastar a foto e o zoom continuam como estão (moldura parada, foto que cresce).
   - **Zoom só pelo controle:** sem rodinha do mouse. O rótulo passa a ser **"Zoom"**.
   - **Texto editável na própria peça:** clicar no texto sobre a peça edita ali mesmo, e "salvar" confirma.
   - Baixar, Salvar e Começar outra ficam embaixo, como hoje.

### Visual
- **Usar shadcn e deixar de lado o visual Paintzoas nesta ferramenta.** A peça gerada continua com a fonte e as cores da marca; quem muda é só a interface do editor.
- **Decidido em 24/11: React + shadcn de verdade.**
  - **Migração:** `app/` vira Vite + React + Tailwind + shadcn/ui, com build em `app/dist`, servido pelo mesmo `servidor.ts`. As rotas `/api/*` não mudam.
  - **Instalação:** o `Instalar.cmd`/`.command` passa a rodar também o build. O usuário final não deve precisar de nada além de dar dois cliques.
  - **Desenvolvimento:** usar o servidor do Vite com proxy para `/api` (porta 4175) e acrescentar a configuração em `.claude/launch.json`.

### Minhas peças
- Cada cartão terá **Abrir** (botão principal), **Baixar ▾** (Story, Feed, Tudo, igual ao do editor) e **⋯** com **Apagar**.

### Topo
- Clicar no logo ou em "+ Nova peça" (topo, à direita, ao lado de Minhas peças) leva para o início (tela 1 do fluxo).

## Onde mexer
| O quê | Arquivo |
|---|---|
| 5 ideias de texto **sem foto** (tema + formato + limites do `spec.json` + `config/brand-voice.md`) | `src/ia.ts`: adaptar `sugerirTextos` (hoje exige foto e devolve 10); opção sem imagem e `quantas: 5` |
| 5 sugestões de busca a partir do texto | `src/ia.ts`: nova função no padrão de `termosDeBusca` (termos em inglês, só a cena, sem década nem emoção: o Commons volta vazio com "1950s" e traz pinturas com "disgust") |
| Rotas novas ou ajustadas | `src/app/servidor.ts` (`/api/sugerir-textos` aceitar sem `image`; nova `/api/sugestoes-busca`) |
| Novo fluxo e editor | `app/` (reescrever conforme a decisão sobre o shadcn) |
| Texto editável sobre a peça | Hoje a prévia é um PNG do servidor (`/api/prever`). Para editar clicando, use uma camada de texto posicionada pelas caixas que o motor já mede (`peca.medidas`/linhas) ou um campo flutuante sobre a linha clicada. Ao salvar, re-renderize pelo motor, que continua sendo a única fonte do PNG final. |
| Zoom sem rodinha | `app/editor.js`: remover o `wheel` em `ligarEnquadramento` |
| Cartões de Minhas peças | `listarPecas` em `app/editor.js`; o zip já existe em `/api/zip` (as peças salvas ficam em `pecas/<id>/story.png` e `feed.png`, então falta uma rota de zip para peça salva) |

## Gasto de IA no fluxo novo (para mostrar a quem usa)
| Passo | Pedidos ao Gemini |
|---|---|
| 5 ideias de texto | 1 |
| 5 sugestões de busca | 1 |
| Pesquisar com IA | 2 |
| Marcar rostos com IA | 1 |

Uma peça típica gasta 2 pedidos, então os 20 por dia dão umas 10 peças. O contador de uso já existe: `usoDeHoje` em `src/ia.ts` e `mostrarUsoDaIa` em `app/editor.js`.

## Como verificar
- `npm run tipos` sem erros.
- `npm run render -- campaigns/teste.json` gera as mesmas 10 peças (compare os hashes antes e depois de mexer no motor).
- No `preview_start editor-promo`, percorrer o fluxo inteiro: tema → formato → 5 ideias → escolher → sugestões de busca → foto → editor (arrastar, zoom pelo controle, editar o texto clicando) → baixar → salvar → Minhas peças (abrir, baixar, apagar).
- **A cota é de 20 pedidos por dia: teste a IA com poucos pedidos e avise o usuário antes de gastar.**

## Em aberto
- `config/brand-voice.md` ainda está sem as legendas reais dela. Sem elas, as ideias saem sem o tom dela.
- **Não testados:** `Abrir Paintzoas.cmd` e os `.command` do Mac. O `Instalar.cmd` funcionou. No Mac, os `.command` precisam do bit de execução no git (`git update-index --chmod=+x`) ao commitar.
- **Chave do Gemini:** o usuário colou a chave no chat em 23/11; sugerir gerar outra.
- **Dados de teste locais, fora do git:** itens em `library/` (hero da loja, foto do Commons, foto do Flickr) e uma peça em `pecas/`.
- **Vercel:** o editor vai num projeto próprio da Vercel, separado do site da loja (veja "Repositório próprio" no topo).


---

## Notas que estavam no HANDOFF.md do repo paintzoas (até 25/11)
> Os caminhos `generator/...` abaixo são a raiz deste repositório.

### Gerador de peças promocionais (`generator/`, 23/11/2026)
> **Próxima sessão: comece por `generator/HANDOFF-EDITOR.md`.** Ele tem o fluxo novo pedido em 24/11: tema → formato → 5 ideias de texto → imagem → editor estilo story, com shadcn. Ainda não foi implementado.

Especificação: `generator/HANDOVER.md` (memes no estilo do @paintzoas). O conteúdo das peças é de quem usa: a Black Friday do handover e `campaigns/teste.json` são só exemplos, não prazo nem pedido. O foco agora é o caminho de quem usa: um editor local com prévia ao vivo (plano em andamento).

| Comando (dentro de `generator/`) | O que faz |
|---|---|
| `npm install` | Uma vez. Usa o mesmo Chromium do Playwright que `ferramentas/`. |
| `npm run render -- campaigns/<arquivo>.json` | Gera `out/<campanha>/<formato>/<variante>.png`, `qa.json` e a página de revisão. Sai com código 1 se alguma peça tem erro. |
| `npm run revisar` | Abre a página de revisão em http://127.0.0.1:4174/ (área segura e rostos podem ser ligados por cima). |
| `npm run tipos` | Confere os tipos. O Node 24 roda o TypeScript direto, sem build. |

- Fonte e cores vêm do design system (`fonts/Paintzoas.woff2` e o bloco `[tokens]` do `custom.css`), nunca de cópia. `config/estilos.json` liga o nome usado em `colors` na campanha ao design system. Cor chapada: rosa `--pz-rosa-hover`, menta `--pz-coral-contorno`, azul `--pz-azul`, vermelho `--pz-coral`. Com contorno: `hero` (coral, contorno menta 0,055em) e `h3-especial` (azul, contorno azul-escuro 0,07em), lidos das regras do slideshow e de "Em destaque" no `custom.css`; o desenho do contorno (16 cópias em `text-shadow`) também é copiado de lá a cada render. **Lilás, amarelo e creme não existem no design system**: o render recusa essas cores até alguém decidir.
- **Contorno nas peças (decisão de 23/11):** o `HANDOVER.md` proibia contorno; a pessoa decidiu usar os estilos com contorno do design system para ter mais variedade. Sombra, degradê e fundo atrás do texto continuam proibidos.
- Pronto: layouts `setup-punchline`, `topo` (1 ou 2 linhas no topo, campo `texto`) e `lista` (campo `titulo` no topo e `itens` na base, um item por linha), todos em story e feed. Imperfeição com seed (`src/handwriting.ts`), QA de estouro, margem segura, contraste 3:1, comprimento, rosto (quando a variante informa `faces`) e caracteres que a Paintzoas não desenha.
- Na campanha, `itens` é uma lista (`["20% OFF", "frete grátis"]`) e `colors.itens` pode ser um estilo por item. Cada parte com cor própria é uma "voz": um campo de texto corrido, ou cada item da lista.
- Estilo automático: as vozes sem estilo na campanha são escolhidas juntas, não uma por vez. Prioridade: tom chapado que passa de 3:1, depois contorno. Cada voz tem estilo próprio, com uma exceção (decisão de 23/11): hero e H3 especial podem se repetir entre itens da mesma lista (desde que não em itens vizinhos) e entre um item e o título. Entre campos de texto corrido (setup e punchline, por exemplo) continuam diferentes. Texto com contorno não passa pelo teste de 3:1 (o contorno separa a letra da foto), e o encaixe reserva o espaço do contorno.
- Entrelinha: duas linhas giradas para lados opostos se aproximam numa ponta. O encaixe mede cada par já girado e desce a de baixo só o que falta para ficar com 0,08em de folga. As maiúsculas da Paintzoas ocupam de 7% a 81% da altura da linha (medido), então essa conta pela caixa basta.
- Faixa de área de texto: por layout (`text_area` no `spec.json`), 20–35% como no handover. No `topo`, 8–35%: 1 ou 2 linhas não chegam a 20% nem no tamanho máximo.
- O zero da Paintzoas tem o lado esquerdo reto e se lê como "D" ("PAINTZOAS20" vira "PAINTZOAS2D"). Cuidado com códigos de cupom que tenham zero.
- Na variante: `focus` = ponto da foto que fica no centro; `zoom`; `seed` para sortear de novo só aquela peça; `|` no texto força a quebra de linha.
- O recorte e o zoom da foto são feitos no sharp, não no CSS: escalada pelo Chromium, a mesma peça variava 1/255 em alguns pixels entre um render e outro. Renders seguidos dão os mesmos arquivos (conferido com as 10 peças de teste).
- A rotação de cada linha empurra cantos para fora do campo; o encaixe compensa (desce o bloco, anda a linha) antes de medir.
- Teste: `campaigns/teste.json` usa o hero da loja (`figma/assets/home-hero.png`) só para testar a mecânica. Os cartazes têm texto embaralhado ("THRED ALUMINUM FAST"), cara de imagem gerada por IA; não serve para as peças de verdade.
- Tamanho do texto: o encaixe acha o maior tamanho que cabe no campo (22% da altura no story, 25% no feed, limites em `font_px`) e multiplica por `text_scale` do `spec.json` (hoje 1). Em 23/11 testamos 0,75 e a pessoa preferiu o tamanho maior. Para mudar o tamanho, use o `text_scale`: só baixar o campo faz o encaixe quebrar em menos linhas, e a letra quase não diminui.
- **Fluxo do editor (refeito em 23/11 a pedido):** tela 1 "Escolha a foto": busca grande, miniaturas embaixo, envio de foto, fotos já guardadas e botão Próximo. Tela 2 "Estúdio": começa numa coluna só (foto e tipo de peça lado a lado); a tela só divide em montagem + prévia depois de escolher o tipo. A moldura do story fica parada no meio; arrastar move a foto, e aproximar (controle ou rodinha) aumenta a foto, não diminui a moldura. "Marcar rosto" desenha caixas. Download num botão "Baixar ▾" (Story, Feed, Tudo em .zip) junto de Salvar e Começar outra. Configurações viraram o ícone de engrenagem do Phosphor (regular, MIT, `app/icone-config.svg`). "Começo e virada" passou a se chamar "Meme".
- **Sem menu de origem e direitos (decisão de 23/11):** a pessoa recusou o formulário e a opção "estampa em produto". Toda foto usada vai sozinha para "Fotos que você já guardou", com fonte, link e licença preenchidos automaticamente quando vem da busca, ou "Enviada por você". Não há aviso de uso permitido. Logo oficial em `generator/app/logo.svg` (copiado de `Documents/Trabalho/Paintzoas/_assets/logo_oficial.svg`; é diferente de `icones/logo.svg`).
- **Limite real do Gemini grátis:** **20 pedidos por dia por modelo** (medido no `gemini-3.8-flash`, que não é mais usado; o do 3.5 Flash e do Lite só aparece quando o Google devolver um 429. O Google informa no erro 429: `GenerateRequestsPerDayPerProjectPerModel-FreeTier`, `quotaValue 20`). Cada busca gasta 2, cada sugestão 1 ou 2 e cada foto guardada 1. Os limites de cada modelo aparecem em https://ai.dev/rate-limit. A mensagem do editor diz se o limite estourado é por minuto ou por dia e em quanto tempo volta.
- **Busca com ou sem IA (escolha de quem usa):** uma chave "Usar IA na busca" fica ao lado do campo, desligada por padrão e lembrada no navegador.
  - Sem IA, a busca é literal e não gasta pedidos; funciona melhor em inglês e descrevendo a cena.
  - Com IA, cada busca gasta 2 pedidos.
  - A página mostra os pedidos usados hoje por este editor. A contagem fica em `%APPDATA%\paintzoas\uso.json` e o dia segue o fuso do Pacífico, como a cota do Google. O limite de cada modelo é aprendido do próprio erro 429.
  - Com a cota esgotada, a chave e o "Sugerir textos" ficam desligados e dizem até quando.
- **Editor local** (`Abrir Paintzoas.cmd` / `.command`, ou `npm run app`; http://127.0.0.1:4175). Instruções para quem usa: `generator/COMO-USAR.md`.
  - Código: `src/app/servidor.ts` + `app/` (HTML/JS puros) sobre o motor `src/motor.ts`, o mesmo da CLI. O PNG baixado é idêntico, byte a byte, ao da CLI.
  - A prévia avisa quando a foto vai ser ampliada mais de 2× (sai borrada).
  - Pronto: foto (subir, acervo, buscar), layout, texto com contador, cor por parte, enquadrar arrastando, zoom, marcar rosto, QA ao vivo com os rótulos dos campos, baixar, Minhas peças (salvar, reabrir, apagar).
  - Fotos, acervo e peças ficam fora do git (`generator/.gitignore`). Se a Vercel for publicada pela linha de comando, considerar um `.vercelignore` com `generator/`.
- **IA: Gemini, plano gratuito, nunca a API paga da Anthropic.** Tudo em `src/ia.ts`, SDK `@google/genai` 3.6.1. **Só `gemini-3.5-flash` e, de reserva, `gemini-3.5-flash-lite`** (decisão de 24/11: o 2.5 vai ser descontinuado; nada de 3.7/3.8). A lista é `MODELOS` em `src/ia.ts`; não há mais troca de modelo em Configurações.
  - A chave fica em `generator/.env` (`GEMINI_API_KEY=...`, fora do git); na Vercel, na variável do projeto. A página nunca recebe a chave de volta.
- **Login do editor (25/11):** uma pessoa só, com usuário e senha.
  - Rodar `npm run senha` em `generator/`. Ele pergunta usuário e senha (a senha não aparece) e imprime 3 linhas: `EDITOR_USUARIO`, `EDITOR_SENHA` (hash scrypt, não a senha) e `EDITOR_SEGREDO`.
  - Colar no `generator/.env` e reiniciar o `npm run dev`. Na Vercel, criar as 3 variáveis no projeto (não precisa do Vercel Authentication).
  - Sem `EDITOR_SENHA`, o editor fica aberto.
  - Usos: sugerir 10 textos (foto + ideia + limites do layout + `config/brand-voice.md`; opção que passa do limite é descartada e pedida de novo); ler a foto ao guardar no acervo (descrição, energia, rostos em caixas 0–1000, áreas livres; não apaga rostos marcados à mão); termos de busca e ordem das fotos achadas.
  - Sem chave ou sem cota: mensagem clara e o resto segue.
  - **Testado com a chave real em 23/11:** 10 textos em ~16 s, todos no limite; rosto marcado no lugar certo; busca escolhida e explicada pela IA.
  - O Gemini às vezes responde 503 ("alta demanda") ou nem responde.
    - **Como o editor reage (desde 24/11):** num 503 rápido, tenta mais uma vez no mesmo modelo depois de 2 s. Sem resposta em 35 s, sem cota (429) ou com o modelo fora (404), passa para o 3.5 Flash Lite.
    - **Cota e log:** modelo já sem cota hoje nem é tentado. Cada tentativa vai para o log do servidor (`Gemini <modelo>: respondeu` / `erro 503` / `sem resposta em 35 s`). A tela diz qual modelo deu as ideias e as sugestões. O contador conta cada tentativa, inclusive as que falharam.
    - **Teste de 24/11:** o 3.5 Flash ficou 35 s sem responder e o 3.5 Flash Lite respondeu as 5 ideias, todas em maiúsculas, sem diferença na peça porque a Paintzoas é unicase. Antes disso, com o 3.8, o 3.7 e o 2.5 na lista, duas tentativas falharam em todos.
  - Termos de busca: só a cena (quem, fazendo o quê, onde), sem década nem emoção. O Commons volta vazio com "1950s", e com "disgust" devolve pinturas.
  - Plano gratuito: não tem busca do Google pela IA, e o Google pode usar o que é enviado.
- **Busca de fotos** (`src/acervos/busca.ts`, fontes em `config/acervos.json`): caixas "Buscar em" na tela 1, lembradas no navegador. Busca direto em cada fonte marcada, ao mesmo tempo, e intercala os resultados.
  - **Wikimedia Commons:** API; só `pd*` ou `cc0`, e só fotos com 1000 px ou mais. Imagem em até 1920 px pela API, inclusive de TIFF.
  - **New Old Stock:** página de busca do Tumblr (`/search/{q}`); fotos em 1280 px.
  - **Contas do Flickr (Schlesinger `99902797@N03`, State Archives NSW `27331537@N06`):** lê o JSON da página de busca da conta (sem a API paga). Só licenças 7, 9 e 10; imagem em 1024 px (`_b`).
  - **Europeana (tópicos 1653 retrato de estúdio, 1654 fotojornalismo):** API pública com a chave de demonstração `api2demo`, só JPEG e domínio público ou CC0. Se der limite, uma chave própria é grátis.
  - Acervos pequenos só acham com poucas palavras: se a frase inteira não achar nada, o editor tenta as duas palavras mais longas separadas.
  - **Fora da lista:** Library of Congress (bloqueia programas; as fotos da FSA estão no Commons) e o arquivo de arte asiática da Smithsonian (não aparece na API aberta deles). O "procure também" com links saiu.
  - O navegador baixa a foto escolhida; o servidor só baixa como plano B, e só imagens que apareceram na busca.
- **Atalhos:** `Instalar.cmd` testado (instala e baixa o Chromium); `Abrir Paintzoas.cmd` e os `.command` do Mac não testados. Para o Mac, os `.command` precisam do bit de execução no git (`git update-index --chmod=+x`) quando forem commitados.
- Em aberto: pasta `references/` (01–07, não veio junto), decisão sobre lilás/amarelo/creme.

