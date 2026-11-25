// Roda dentro do Chromium, na página do template. Monta os campos de texto,
// escolhe o maior tamanho que cabe em cada um e devolve as medidas para o QA.
window.pz = (() => {
  const raiz = document.documentElement;

  async function montar({ formato, foto }) {
    const { w, h, safe } = formato;
    document.body.classList.add(formato.nome);
    for (const [k, v] of Object.entries({ w, h, 'safe-top': safe.top, 'safe-bottom': safe.bottom, 'safe-left': safe.left, 'safe-right': safe.right })) {
      raiz.style.setProperty(`--${k}`, `${v}px`);
    }
    const img = document.querySelector('.foto');
    img.src = foto; // já recortada no tamanho da peça
    await img.decode();
    await document.fonts.load(`100px Paintzoas`);
    await document.fonts.ready;
  }

  // Encaixa cada campo com o estilo de cada linha (cor chapada ou contorno do site).
  // O contorno ocupa espaço (padding de --pz-ow), então o estilo entra antes de medir.
  // estilos[campo] é um estilo para o campo todo, ou uma lista com um estilo por linha.
  function encaixarTodos({ slots, fontePx, largura, estilos, escala }) {
    const resultado = {};
    for (const s of slots) {
      const el = document.querySelector(`[data-slot="${s.nome}"]`);
      if (!el) throw new Error(`O template não tem o campo "${s.nome}"`);
      // texto livre: tamanho fixo (s.fontePx = [f, f]) e sem a escala do layout
      resultado[s.nome] = encaixar(el, s.candidatas, s.fontePx ?? fontePx, largura, s.escala ?? escala, estilos[s.nome]);
    }
    return resultado;
  }

  function aplicarEstilo(linha, e) {
    linha.style.setProperty('--cor', e ? e.cor : 'transparent');
    linha.classList.toggle('contorno', Boolean(e?.contorno));
    if (e?.contorno) {
      linha.style.setProperty('--pz-ow', e.contorno.largura);
      linha.style.setProperty('--pz-oc', e.contorno.cor);
    }
  }

  function desenhar(el, linhas, largura, estilo) {
    el.replaceChildren(...linhas.map((l, n) => {
      const d = document.createElement('div');
      d.className = 'linha';
      d.style.setProperty('--rot', `${l.rotacao}deg`);
      d.style.setProperty('--recuo', `${l.recuo * largura}px`);
      d.style.setProperty('--tam', String(l.tamanho));
      l.palavras.forEach((p, i) => {
        if (i) d.append(' ');
        const s = document.createElement('span');
        s.className = 'palavra';
        s.textContent = p.texto;
        s.style.setProperty('--base', `${p.baseEm}em`);
        d.append(s);
      });
      aplicarEstilo(d, Array.isArray(estilo) ? estilo[n] : estilo);
      return d;
    }));
  }

  // A rotação empurra os cantos da linha para fora do campo. Antes de medir, o bloco desce
  // (ou sobe, se ancorado embaixo) e cada linha anda para a direita só o que a rotação sobrou.
  function cabe(el, f) {
    el.style.setProperty('--f', `${f}px`);
    el.style.paddingTop = el.style.paddingBottom = '0px';
    const linhas = [...el.children];
    for (const l of linhas) l.style.setProperty('--sobra-x', '0px');
    espacar(linhas, f);
    const r = el.getBoundingClientRect();
    const caixas = linhas.map((l) => l.getBoundingClientRect());
    el.style.paddingTop = `${Math.max(0, r.top - Math.min(...caixas.map((b) => b.top)))}px`;
    el.style.paddingBottom = `${Math.max(0, Math.max(...caixas.map((b) => b.bottom)) - r.bottom)}px`;
    linhas.forEach((l, i) => l.style.setProperty('--sobra-x', `${Math.max(0, r.left - caixas[i].left)}px`));
    return linhas.every((l) => {
      const b = l.getBoundingClientRect();
      return b.left >= r.left - 0.5 && b.right <= r.right + 0.5 && b.top >= r.top - 0.5 && b.bottom <= r.bottom + 0.5;
    });
  }

  // Duas linhas giradas para lados opostos se aproximam numa ponta. Para cada par, mede a
  // menor distância entre a borda de baixo da linha de cima e a borda de cima da de baixo
  // (já giradas) e desce a de baixo só o que falta para ficar com uma folga de 0,08em.
  function espacar(linhas, f) {
    for (const l of linhas) l.style.marginTop = '0px';
    const folga = 0.08 * f;
    const borda = (l, lado) => {
      const w = l.offsetWidth, h = l.offsetHeight, cx = l.offsetLeft + w / 2, cy = l.offsetTop + h / 2;
      const t = (parseFloat(l.style.getPropertyValue('--rot')) || 0) * Math.PI / 180;
      const y = lado === 'baixo' ? h / 2 : -h / 2;
      const ponto = (x) => ({ x: cx + x * Math.cos(t) - y * Math.sin(t), y: cy + x * Math.sin(t) + y * Math.cos(t) });
      return [ponto(-w / 2), ponto(w / 2)];
    };
    const naBorda = ([p0, p1], x) => p0.y + (p1.y - p0.y) * (x - p0.x) / (p1.x - p0.x);
    for (let i = 1; i < linhas.length; i++) {
      const cima = borda(linhas[i - 1], 'baixo'), baixo = borda(linhas[i], 'cima');
      const x0 = Math.max(cima[0].x, baixo[0].x), x1 = Math.min(cima[1].x, baixo[1].x);
      if (x1 <= x0) continue;
      const menor = Math.min(naBorda(baixo, x0) - naBorda(cima, x0), naBorda(baixo, x1) - naBorda(cima, x1));
      if (menor < folga) linhas[i].style.marginTop = `${folga - menor}px`;
    }
  }

  // Testa cada quebra de linha candidata e fica com a que permite o maior tamanho;
  // depois reduz pela escala do layout (as quebras de linha continuam as mesmas)
  function encaixar(el, candidatas, [min, max], largura, escala = 1, estilo = null) {
    let melhor = null;
    candidatas.forEach((linhas, i) => {
      desenhar(el, linhas, largura, estilo);
      let f = min, coube = cabe(el, min);
      if (coube) {
        let lo = min, hi = max;
        if (cabe(el, max)) lo = max;
        else while (hi - lo > 0.5) { const m = (lo + hi) / 2; if (cabe(el, m)) lo = m; else hi = m; }
        f = Math.floor(lo);
      }
      if (!melhor || (coube && !melhor.coube) || (coube === melhor.coube && f > melhor.f)) melhor = { i, f, coube };
    });
    const f = melhor.coube ? Math.max(min, Math.floor(melhor.f * escala)) : melhor.f;
    desenhar(el, candidatas[melhor.i], largura, estilo);
    cabe(el, f);
    return { escolhida: melhor.i, fontePx: f, coube: melhor.coube };
  }

  function medir() {
    const caixa = (e) => { const b = e.getBoundingClientRect(); return { x: b.left, y: b.top, w: b.width, h: b.height }; };
    const out = {};
    for (const el of document.querySelectorAll('[data-slot]')) {
      out[el.dataset.slot] = {
        regiao: caixa(el),
        linhas: [...el.children].map((l) => ({ texto: l.textContent, caixa: caixa(l) })),
      };
    }
    return out;
  }

  // Campos movidos por quem usa: deslocamento em frações da peça. A página é reaproveitada
  // entre peças, então todo campo sem deslocamento volta para o lugar do layout.
  function mover(posicoes, w, h) {
    for (const el of document.querySelectorAll('[data-slot]')) {
      const d = posicoes[el.dataset.slot];
      el.style.translate = d ? `${d[0] * w}px ${d[1] * h}px` : '';
    }
  }

  // Textos livres: um bloco por texto, com o canto de cima à esquerda em (x, y) px da peça
  function criarLivres(lista) {
    for (const el of document.querySelectorAll('.livre')) el.remove();
    const peca = document.querySelector('.peca');
    for (const { nome, x, y } of lista) {
      const el = document.createElement('div');
      el.className = 'slot livre';
      el.dataset.slot = nome;
      el.style.left = `${x}px`;
      el.style.top = `${y}px`;
      peca.append(el);
    }
  }

  // Depois de encaixar: o canto de cima à esquerda das letras de cada texto livre fica exatamente
  // em (x, y) — o recuo e a folga da rotação não empurram o texto para longe de onde ele foi posto.
  function ancorarLivres(lista) {
    for (const { nome, x, y } of lista) {
      const el = document.querySelector(`[data-slot="${nome}"]`);
      const linhas = el ? [...el.children] : [];
      if (!linhas.length) continue;
      const caixas = linhas.map((l) => l.getBoundingClientRect());
      const dx = x - Math.min(...caixas.map((c) => c.left)), dy = y - Math.min(...caixas.map((c) => c.top));
      el.style.left = `${parseFloat(el.style.left) + dx}px`;
      el.style.top = `${parseFloat(el.style.top) + dy}px`;
    }
  }

  const semTexto = (sim) => document.body.classList.toggle('sem-texto', sim);
  // Só as letras, sem a foto e sem o fundo: a camada que o editor move durante o arrasto
  const soTexto = (sim) => document.documentElement.classList.toggle('so-texto', sim);

  // Caracteres que a Paintzoas não desenha (o navegador troca pela fonte seguinte)
  function semDesenho(texto) {
    const c = document.createElement('canvas').getContext('2d');
    const largura = (familia, ch) => { c.font = `100px ${familia}`; return c.measureText(ch).width; };
    return [...new Set(texto)].filter((ch) => !/\s/.test(ch)
      && largura('Paintzoas, "Courier New"', ch) !== largura('Paintzoas, "Times New Roman"', ch));
  }

  return { montar, mover, criarLivres, ancorarLivres, encaixarTodos, medir, semTexto, soTexto, semDesenho };
})();
