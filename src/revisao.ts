// Página local para ver todas as variantes lado a lado e aprovar.
import type { Campanha, Margens } from './esquemas.ts';
import type { Ret, MedidaSlot } from './qa.ts';

export interface Peca {
  id: string;
  formato: string;
  layout: string;
  textos: Record<string, string | string[]>;
  arquivo: string | null;
  medida?: { w: number; h: number; safe: Margens };
  rostos?: Ret[];
  cores: Record<string, string | string[]>;
  fontePx?: Record<string, number>;
  /** Caixa de cada campo e de cada linha (já girada), em pixels da peça. */
  medidas?: Record<string, MedidaSlot>;
  erros: string[];
  avisos: string[];
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
const pct = (v: number, total: number) => `${(v / total) * 100}%`;

function figura(p: Peca): string {
  const guias = p.medida ? (() => {
    const { w, h, safe } = p.medida;
    const segura = `<div class="guia segura" style="left:${pct(safe.left, w)};top:${pct(safe.top, h)};right:${pct(safe.right, w)};bottom:${pct(safe.bottom, h)}"></div>`;
    const rostos = (p.rostos ?? []).map((r) => `<div class="guia rosto" style="left:${pct(r.x, w)};top:${pct(r.y, h)};width:${pct(r.w, w)};height:${pct(r.h, h)}"></div>`).join('');
    return segura + rostos;
  })() : '';
  const imagem = p.arquivo
    ? `<a class="peca" href="${esc(p.arquivo)}" style="aspect-ratio:${p.medida ? `${p.medida.w}/${p.medida.h}` : 'auto'}"><img src="${esc(p.arquivo)}" alt="${esc(`${p.id} ${p.formato}`)}" loading="lazy">${guias}</a>`
    : `<div class="peca vazia">não gerada</div>`;
  const cores = Object.entries(p.cores).map(([slot, cor]) => `${esc(slot)}: ${esc([cor].flat().join(', '))}`).join(' · ');
  const lista = (itens: string[], classe: string) => itens.length ? `<ul class="${classe}">${itens.map((i) => `<li>${esc(i)}</li>`).join('')}</ul>` : '';
  return `<figure>
    ${imagem}
    <figcaption><b>${esc(p.formato)}</b>${cores ? ` <span class="cores">${cores}</span>` : ''}</figcaption>
    ${lista(p.erros, 'erros')}${lista(p.avisos, 'avisos')}
  </figure>`;
}

export function paginaRevisao(campanha: Campanha, pecas: Peca[]): string {
  const ids = [...new Set(pecas.map((p) => p.id))];
  const blocos = ids.map((id) => {
    const doId = pecas.filter((p) => p.id === id);
    const textos = Object.entries(doId[0].textos).map(([slot, t]) => `<div><span class="slot">${esc(slot)}</span> ${esc([t].flat().join(' · '))}</div>`).join('');
    return `<section>
      <header><h2>${esc(id)} <span class="layout">${esc(doId[0].layout)}</span></h2>${textos}</header>
      <div class="formatos">${doId.map(figura).join('')}</div>
    </section>`;
  }).join('');

  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(campanha.id)} · revisão</title>
<style>
  @font-face { font-family: 'Paintzoas'; src: url('/fonts/Paintzoas.woff2') format('woff2'); }
  * { box-sizing: border-box; }
  body { margin: 0; padding: 32px; font: 15px/1.45 'Helvetica Neue', Helvetica, Arial, sans-serif; color: #111; background: #f3f1ec; }
  h1 { font: 56px/1 'Paintzoas', sans-serif; margin: 0 0 8px; }
  .topo { display: flex; align-items: baseline; gap: 24px; flex-wrap: wrap; margin-bottom: 32px; }
  label { cursor: pointer; user-select: none; }
  section { background: #fff; border-radius: 6px; padding: 24px; margin-bottom: 32px; }
  header { margin-bottom: 16px; }
  h2 { font: 32px/1 'Paintzoas', sans-serif; margin: 0 0 8px; }
  .layout { font: 14px 'Helvetica Neue', Helvetica, Arial, sans-serif; color: #707070; margin-left: 8px; }
  .slot { display: inline-block; min-width: 88px; color: #707070; }
  .formatos { display: flex; gap: 24px; flex-wrap: wrap; align-items: flex-start; }
  figure { margin: 0; width: min(360px, 100%); }
  .peca { position: relative; display: block; width: 100%; background: #ddd; }
  .peca img { display: block; width: 100%; height: 100%; }
  .vazia { aspect-ratio: 9/16; display: grid; place-items: center; color: #707070; }
  figcaption { margin-top: 8px; }
  .cores { color: #707070; }
  ul { margin: 8px 0 0; padding-left: 18px; }
  .erros li { color: #b00020; }
  .avisos li { color: #707070; }
  .guia { position: absolute; display: none; pointer-events: none; }
  .guia.segura { border: 2px dashed #00e5ff; }
  .guia.rosto { border: 2px solid #ff00c8; }
  body.guias .guia { display: block; }
  #zoom { position: fixed; inset: 0; background: rgba(0,0,0,.88); display: none; overflow: auto; cursor: zoom-out; }
  #zoom.aberto { display: block; }
  #zoom img { display: block; margin: 24px auto; max-width: none; }
</style>
</head>
<body>
<div class="topo">
  <h1>${esc(campanha.id)}</h1>
  <label><input type="checkbox" id="guias"> mostrar área segura e rostos</label>
</div>
${blocos}
<div id="zoom"><img alt=""></div>
<script>
  document.getElementById('guias').addEventListener('change', (e) => document.body.classList.toggle('guias', e.target.checked));
  const zoom = document.getElementById('zoom');
  document.querySelectorAll('a.peca').forEach((a) => a.addEventListener('click', (e) => {
    e.preventDefault(); zoom.querySelector('img').src = a.getAttribute('href'); zoom.classList.add('aberto'); zoom.scrollTo(0, 0);
  }));
  zoom.addEventListener('click', () => zoom.classList.remove('aberto'));
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') zoom.classList.remove('aberto'); });
</script>
</body>
</html>`;
}
