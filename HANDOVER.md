# Handover — Paintzoas Promo Kit

> Pipeline para gerar peças promocionais (stories, feed, banners Nuvemshop, imagens de e-mail) **no estilo do perfil @paintzoas**, para que ela foque em criar conteúdo e não em material de propaganda.
>
> Coloque este arquivo na raiz do repositório e a pasta `references/` ao lado. Leia tudo antes de escrever código.

---

## 1. Contexto

- **Perfil:** @paintzoas, ~70 mil seguidores. Loja virtual na **Nuvemshop**, já no ar.
- **Design system:** já existe (o "nano design system" do site), com fontes, cores e tokens definidos. **Não redefinir fontes nem paleta**: importar do design system.
- **Usuário final:** ela. A interação ideal é preencher um brief curto, ver 3 variações e aprovar uma.
- **Prazo imediato:** Black Friday em **sexta, 27/11/2026**. A fase 1 precisa estar pronta para isso.

## 2. A identidade visual (não negociável)

Veja `references/01..07`. Os elementos que formam a identidade:

| Elemento | Regra |
|---|---|
| **Foto** | Foto antiga *encontrada*: amadora colorida dos anos 60 a 80 (cor desbotada, cara de álbum de família) **ou** preto e branco de imprensa dos anos 40 e 50. |
| **Texto** | Manuscrito com cara de feito no Paint. Grande. Tons pastel (rosa, lilás, verde-menta, amarelo-manteiga, creme) e às vezes vermelho para ênfase. |
| **Piada** | Contraste entre a foto séria/antiga e um desabafo atual em 1ª pessoa (cansaço, relacionamento, deboche). Palavrão é permitido. |
| **Peça promocional** | **É um meme dela, não um banner.** A oferta entra *dentro* da piada. Ex.: senhora com cara de nojo, "Aiiin" em cima e "NÃO GOSTEI do cupom acabando hoje" embaixo. |

### O que NÃO fazer
- Nada de degradê, caixa sólida atrás do texto, sombra ou contorno: matam a estética amadora.
- Nada de imagem gerada por IA. A autenticidade da foto antiga é a marca.
- Nada de layout "limpo de e-commerce" (selo de desconto, botão desenhado, ícones).
- Sem arquitetura agêntica. É um pipeline determinístico com no máximo 2 ou 3 chamadas de IA pontuais.

## 3. Regras de composição (extraídas dos posts)

1. **O texto começa sempre no topo.** Quando a piada tem virada, a virada vai **embaixo, em outra cor** (refs 02, 04, 06).
2. **O texto ocupa o espaço vazio** da foto (parede, teto, papel de parede). Se o vazio é lateral, palavras empilhadas em coluna (ref 03).
3. **Nunca sobre o rosto.** A expressão é metade da piada.
4. **Tamanho:** o texto ocupa 20% a 35% da área. De 2 a 5 palavras por linha.
5. **Troca de cor = troca de voz.** Cada bloco (setup/punchline) ou cada item da lista tem cor própria.
6. **Contraste:** mínimo de **3:1** (não WCAG AA completo, porque a legibilidade imperfeita faz parte do charme). Se falhar: trocar o tom pastel → mudar a posição → descartar a foto para esse layout. **Nunca** adicionar fundo.
7. **Imperfeição programada** (obrigatória, senão a peça fica com cara de template):
   - rotação por linha: aleatória entre −3° e +3°
   - linha de base irregular: deslocamento vertical de ±0,05em por palavra
   - recuo horizontal por linha: deslocamento aleatório de 0 a 4% da largura
   - tamanho variando entre linhas: ±8%
   - **usar aleatório com seed** (seed no JSON da campanha) para o render ser reproduzível.

## 4. Layouts

| id | Descrição | Ref | Formatos |
|---|---|---|---|
| `topo` | 1 ou 2 linhas no topo | 01, 07 | story, feed |
| `setup-punchline` | setup no topo, punchline na base, 2 cores | 02, 04, 06 | story, feed |
| `coluna` | palavras empilhadas no lado vazio | 03 | story, feed |
| `lista` | título no topo + lista multicolor embaixo | 05 | story, feed |
| `polaroid` | foto com borda branca de um lado + texto manuscrito sobre fundo pastel do outro | — | banner Nuvemshop, e-mail, feed |

`polaroid` existe porque as fotos são verticais e os banners da Nuvemshop são largos (~1580×700).

Especificação de layout (exemplo):

```json
{
  "id": "setup-punchline",
  "formats": ["story", "feed"],
  "slots": {
    "setup":     { "max_chars": 40, "max_lines": 3, "region": "top" },
    "punchline": { "max_chars": 40, "max_lines": 3, "region": "bottom" },
    "image":     { "requires_free_area": ["top", "bottom"] }
  },
  "colors": { "distinct_between_slots": true, "palette": "pastel" }
}
```

## 5. Formatos (`config/formats.json`)

```json
{
  "story": {
    "size": [1080, 1920],
    "safe_profiles": {
      "organic": { "top": 250, "bottom": 320, "left": 65, "right": 65 },
      "ad":      { "top": 269, "bottom": 672, "left": 65, "right": 65 }
    },
    "default_profile": "organic"
  },
  "feed": {
    "size": [1080, 1350],
    "safe": { "top": 60, "bottom": 60, "left": 80, "right": 80 },
    "note": "a miniatura do grid do perfil corta as laterais; manter o texto longe das bordas"
  },
  "banner_nuvemshop_desktop": {
    "size": "TODO",
    "note": "varia por layout da loja (ex.: Amazonas 1580x450, Atlántico 1580x740, Bahia/Idea 1580x850, Baires/Brasília/Recife/Toluca/Uyuni 1580x700). Pegar a medida exata no painel: Layout > Personalizar."
  },
  "banner_nuvemshop_mobile": { "size": "TODO", "note": "alguns layouts aceitam imagem mobile separada" },
  "email": {
    "size": [600, "auto"],
    "export_scale": 2,
    "note": "texto essencial e CTA sempre em HTML no e-mail, nunca só na imagem"
  }
}
```

> O perfil `ad` (números da Meta para anúncios) quase inviabiliza o `setup-punchline` em story porque reserva 35% da base. Para story impulsionado, usar `topo`, `coluna` ou `lista` com a lista mais alta.

## 6. Arquitetura

```
brief (JSON) ──► [fase 2] escolher imagem ──► [fase 3] gerar textos ──► render ──► QA ──► revisão humana ──► export
                  (filtro no código +          (10 opções,               (HTML/CSS + Playwright)
                   1 chamada de visão)          ela escolhe 1)
```

**Princípio:** a IA escreve e escolhe dentro de regras, e o template monta a peça. A IA nunca define pixels, só escolhe o layout e preenche os campos.

**Ordem importante:** a imagem vem primeiro e o texto depois. A piada nasce da foto.

### Stack sugerida
- **Node + TypeScript**
- **Playwright (Chromium)** para tirar screenshot de templates HTML/CSS. Motivo: reaproveitar 100% do CSS do design system. Satori foi descartado porque suporta só um subconjunto de CSS.
- **sharp** para análise de imagem (cor dominante, luminância por região, recortes)
- **Claude API** (fases 2 e 3) com saída JSON validada por **zod**
- CLI: `npm run render -- campaigns/<arquivo>.json`

### Estrutura de pastas

```
/config
  formats.json
  brand-voice.md          # tom + 20 a 30 legendas reais dela (exemplos para a IA)
/design-system            # link ou cópia do CSS/tokens/fontes do site (NÃO editar aqui)
/layouts
  topo/ setup-punchline/ coluna/ lista/ polaroid/
    template.html
    spec.json
/library
  images/
  library.json            # metadados do acervo
/campaigns
  bf-2026.json
/src
  render.ts               # campanha → HTML → PNG por formato
  handwriting.ts          # imperfeição programada (com seed)
  qa.ts                   # verificações automáticas
  ingest.ts               # fase 2
  copy.ts                 # fase 3
/out
  <campanha>/<formato>/<variante>.png
/references               # prints do perfil (fonte da verdade estética)
```

### JSON da campanha (entrada da fase 1)

```json
{
  "id": "bf-2026",
  "seed": 42,
  "formats": ["story", "feed"],
  "variants": [
    {
      "layout": "setup-punchline",
      "image": "library/images/senhora-careta.jpg",
      "slots": { "setup": "Aiiin", "punchline": "NÃO GOSTEI do cupom acabando hoje" },
      "colors": { "setup": "lilas", "punchline": "amarelo" }
    },
    {
      "layout": "lista",
      "image": "library/images/garconete.jpg",
      "slots": {
        "titulo": "SERVINDO",
        "itens": ["20% OFF", "frete grátis", "camiseta nova", "nenhuma desculpa"]
      }
    }
  ]
}
```

### Item do acervo (`library.json`)

```json
{
  "id": "senhora-careta",
  "file": "images/senhora-careta.jpg",
  "source": { "name": "Library of Congress FSA/OWI", "url": "…", "license": "public-domain" },
  "uso_permitido": ["organico", "promo"],
  "tipo": "pb-imprensa",
  "pessoas_reconheciveis": true,
  "descricao": "mulher anos 50, careta de nojo, olhando para a câmera",
  "energia": ["nojo", "deboche"],
  "rostos": [{ "x": 0.30, "y": 0.18, "w": 0.42, "h": 0.55 }],
  "areas_livres": ["top", "bottom"],
  "luminancia_por_regiao": { "top": 0.71, "bottom": 0.22 },
  "cor_dominante": "#cfc6b0"
}
```

`uso_permitido` é **obrigatório** e o pipeline **filtra** por ele:
- `organico`: post/story normal
- `promo`: anúncio pago e peças da loja
- `merch`: estampado em produto. **Só** domínio público verificado ou foto de família com autorização por escrito.

## 7. QA automático (`qa.ts`)

Depois do render, falhar ou avisar quando:
1. **Texto estourou o espaço:** medir no DOM (`scrollHeight > clientHeight` ou bounding box fora do campo).
2. **Fora da margem segura:** bounding box de cada linha (já rotacionada) contra o `safe_profile` do formato.
3. **Contraste < 3:1:** amostrar os pixels da foto atrás do bounding box de cada linha (via sharp) e comparar com a cor do texto.
4. **Texto sobre rosto:** interseção do bounding box com `rostos` do acervo (fase 2 em diante).
5. **Comprimento:** texto acima de `max_chars` → erro, não truncar.

## 8. Fases

### Fase 1: render manual (fazer AGORA, para a Black Friday)
- [ ] Configurar o projeto (Node, TS, Playwright, sharp, zod)
- [ ] Importar fontes e tokens do design system
- [ ] `handwriting.ts` com seed
- [ ] Layouts `setup-punchline`, `lista` e `topo` em `story` e `feed`
- [ ] `render.ts` lendo o JSON da campanha
- [ ] QA 1, 2, 3 e 5
- [ ] Página HTML local mostrando todas as variantes lado a lado (para ela aprovar)
- [ ] Gerar a campanha `bf-2026` com 2 ou 3 fotos

**Critério de pronto:** ela olha as peças e diz que parecem posts dela.

### Fase 2: acervo com metadados
- `ingest.ts`: para cada imagem nova, usar sharp para cor dominante e luminância por terço, e **1 chamada de visão** para descrição, energia, rostos e áreas livres. Gravar em `library.json`.
- Licença e `uso_permitido` são preenchidos **por humano**, nunca pela IA.
- Seleção na campanha: filtro no código (uso, área livre compatível com o layout) → até 10 candidatas → 1 chamada de visão ordena e devolve `{image, layout, motivo}`.

### Fase 3: geração de texto
- Entrada: descrição da foto + oferta/brief + `brand-voice.md` (com 20 a 30 legendas reais dela como exemplos) + limites dos campos.
- Saída: **10 opções** em JSON validado por zod. Se estourar `max_chars`, pedir de novo (não truncar).
- Ela escolhe. **Ela é a editora, não a redatora.** Humor é onde a IA mais erra, então o certo é gerar volume e deixar a curadoria com ela.
- Opcional: 1 chamada de visão revisando o PNG final ("o texto cobre o rosto? a piada funciona com a foto?").

### Fase 4: outros canais
- `polaroid` para os banners Nuvemshop (desktop + mobile) e e-mail.
- No banner, avaliar usar o texto/botão nativo do painel da Nuvemshop (melhor no celular) e gerar só a imagem.

## 9. Onde achar imagens (para o acervo)

Em ordem de preferência:
1. **Fotos de família** (dela, pais, tias), com autorização de quem aparece. Exclusivas, combinam com a marca e são as mais seguras.
2. **Library of Congress, FSA/OWI**: ~1.600 coloridas (Kodachrome dos anos 30 e 40) e ~171 mil em preto e branco. Consideradas de domínio público, **mas direitos de privacidade e de imagem podem se aplicar**.
3. **Flickr Commons**: mais de 100 instituições, selo "sem restrições de direito autoral conhecidas", com API. Não é garantia: ler a declaração de direitos de cada instituição.
4. **New Old Stock**: curadoria de fotos antigas de arquivos públicos.
5. **Lotes de fotos antigas** (feiras de antiguidades, Mercado Livre). Baratos e exclusivos. Risco menor, mas não é zero.

⚠️ Fotos amadoras coloridas tiradas do Pinterest ou do Tumblr (como várias das referências) são prática comum no conteúdo orgânico, mas em **anúncio pago e principalmente em produto** viram uso comercial da imagem de pessoa reconhecível, o que no Brasil exige autorização. Marcar como `uso_permitido: ["organico"]` apenas.

## 10. Pendências (preciso de você)

- [ ] Caminho do design system no repositório do site e nomes dos arquivos das fontes manuscritas
- [ ] Mapear os nomes de cor do design system para `rosa`, `lilas`, `menta`, `amarelo`, `creme`, `vermelho`
- [ ] Medidas exatas do banner no painel da Nuvemshop (layout atual da loja)
- [ ] 20 a 30 legendas reais dela para o `brand-voice.md`
- [ ] 3 a 5 fotos para a campanha da Black Friday (com o `uso_permitido` decidido)
- [ ] Oferta da Black Friday (desconto, frete, prazo, cupom)

---

## Prompt inicial sugerido para o Claude Code

```
Leia HANDOVER.md e veja as imagens em references/. Vamos executar a Fase 1.
O design system está em <CAMINHO>. As fontes manuscritas são <ARQUIVOS>.
Comece configurando o projeto e implementando o layout setup-punchline em story,
com handwriting.ts (seed) e o QA de texto estourado e margem segura.
Renderize um exemplo com uma imagem de teste e me mostre antes de seguir para os outros layouts.
```
