// Linha de comando: campanha (JSON) → PNG por formato + QA + página de revisão.
// Uso: npm run render -- campaigns/<arquivo>.json
import fs from 'node:fs';
import path from 'node:path';
import { RAIZ_GERADOR } from './design-system.ts';
import { Campanha, validar } from './esquemas.ts';
import { criarMotor } from './motor.ts';
import { paginaRevisao, type Peca } from './revisao.ts';

// Problema de configuração (JSON inválido, cor, formato) sai como mensagem, sem rastro de código
process.on('uncaughtException', (e) => { console.error(`\n${e.message}`); process.exit(2); });

const entrada = process.argv[2];
if (!entrada) { console.error('uso: npm run render -- campaigns/<arquivo>.json'); process.exit(1); }

const campanha = validar(Campanha, path.resolve(entrada));
const saida = path.join(RAIZ_GERADOR, 'out', campanha.id);
fs.rmSync(saida, { recursive: true, force: true });

const motor = await criarMotor();
const pecas: Peca[] = [];
try {
  for (const formato of campanha.formats) {
    for (const [i, variante] of campanha.variants.entries()) {
      const id = variante.id ?? `v${i + 1}`;
      const { png, peca } = await motor.renderizar(variante, { id, formato, seed: campanha.seed, perfilStory: campanha.story_profile });
      if (png) {
        const arquivo = path.join(saida, formato, `${id}.png`);
        fs.mkdirSync(path.dirname(arquivo), { recursive: true });
        fs.writeFileSync(arquivo, png);
        peca.arquivo = `${formato}/${id}.png`;
      }
      pecas.push(peca);
      const estado = peca.erros.length ? `${peca.erros.length} erro(s)` : 'ok';
      console.log(`${formato.padEnd(6)} ${id.padEnd(12)} ${estado}${peca.avisos.length ? `, ${peca.avisos.length} aviso(s)` : ''}`);
      for (const e of peca.erros) console.log(`         ✗ ${e}`);
      for (const a of peca.avisos) console.log(`         · ${a}`);
    }
  }
} finally {
  await motor.fechar();
}

fs.mkdirSync(saida, { recursive: true });
fs.writeFileSync(path.join(saida, 'qa.json'), JSON.stringify(pecas, null, 2));
fs.writeFileSync(path.join(saida, 'index.html'), paginaRevisao(campanha, pecas));
console.log(`\nRevisão: ${path.join(saida, 'index.html')}`);
process.exitCode = pecas.some((p) => p.erros.length) ? 1 : 0;
