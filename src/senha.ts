// Cria o login do editor: pergunta usuário e senha e imprime as linhas para colar no .env
// (e, na Vercel, nas variáveis do projeto). A senha não aparece na tela nem fica no histórico.
// Uso: npm run senha
import crypto from 'node:crypto';
import readline from 'node:readline';
import { gerarHash } from './app/sessao.ts';

function perguntar(pergunta: string, esconder = false): Promise<string> {
  return new Promise((ok) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    if (esconder) (rl as unknown as { _writeToOutput: (s: string) => void })._writeToOutput = (s) => { if (s.startsWith(pergunta)) process.stdout.write(pergunta); };
    rl.question(pergunta, (r) => { rl.close(); if (esconder) process.stdout.write('\n'); ok(r); });
  });
}

const usuario = (await perguntar('Usuário: ')).trim();
const senha = await perguntar('Senha (não aparece): ', true);
const confirma = await perguntar('Repita a senha: ', true);
if (!usuario || !senha) { console.error('Usuário e senha não podem ficar vazios.'); process.exit(1); }
if (senha !== confirma) { console.error('As senhas não batem. Rode de novo.'); process.exit(1); }
if (senha.length < 8) console.warn('Aviso: senha com menos de 8 caracteres.');

console.log('\nCole estas 3 linhas no generator/.env (na Vercel, crie as 3 variáveis com estes valores):\n');
console.log(`EDITOR_USUARIO=${usuario}`);
console.log(`EDITOR_SENHA=${gerarHash(senha)}`);
console.log(`EDITOR_SEGREDO=${crypto.randomBytes(32).toString('base64url')}`);
console.log('\nDepois, reinicie o editor (npm run dev).');
