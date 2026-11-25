// Desenvolvimento: sobe o servidor do editor (API, porta 4175) e o Vite (página, porta 5175,
// que repassa /api para o servidor). Uso: npm run dev → http://127.0.0.1:5175
import { spawn, type ChildProcess } from 'node:child_process';
import path from 'node:path';
import { RAIZ_GERADOR } from './design-system.ts';

// --watch: o servidor reinicia sozinho quando o código dele muda (motor, IA, servidor).
// Sem isso, um servidor aberto antes de uma mudança continua rodando o código velho.
const filhos: ChildProcess[] = [
  spawn(process.execPath, ['--watch', '--watch-preserve-output', path.join(RAIZ_GERADOR, 'src', 'app', 'servidor.ts')], { stdio: 'inherit', cwd: RAIZ_GERADOR }),
  spawn(process.execPath, [path.join(RAIZ_GERADOR, 'app', 'node_modules', 'vite', 'bin', 'vite.js')], { stdio: 'inherit', cwd: path.join(RAIZ_GERADOR, 'app') }),
];
const desligar = () => { for (const f of filhos) f.kill(); process.exit(0); };
for (const f of filhos) f.on('exit', desligar);
process.on('SIGINT', desligar);
process.on('SIGTERM', desligar);
