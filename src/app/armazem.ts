// Onde ficam fotos, acervo, peças salvas e o uso da IA.
// No computador: na própria pasta (library/, pecas/), como sempre.
// Na Vercel: num Blob privado, com as mesmas chaves ("library/images/x.jpg", "pecas/<id>/peca.json").
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { RAIZ_GERADOR } from '../design-system.ts';

/** Na Vercel usa o Blob; no computador, o disco. PZ_ARMAZEM=blob força o Blob (para testar e migrar). */
export const NA_NUVEM = process.env.PZ_ARMAZEM === 'blob' || (Boolean(process.env.VERCEL) && process.env.PZ_ARMAZEM !== 'disco');

const TIPOS: Record<string, string> = {
  '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp',
};
export const tipoDe = (chave: string) => TIPOS[path.extname(chave).toLowerCase()] ?? 'application/octet-stream';
const valida = (chave: string) => {
  if (!/^(library|pecas|config)\/[\w./-]+$/.test(chave) || chave.includes('..')) throw new Error(`Chave inválida: ${chave}`);
  return chave;
};
/** Fotos têm o nome pelo conteúdo (não mudam); .json e as miniaturas das peças mudam ao salvar de novo. */
const muda = (chave: string) => chave.endsWith('.json') || chave.startsWith('pecas/');

export interface Armazem {
  ler(chave: string): Promise<Buffer | null>;
  gravar(chave: string, dados: Buffer | string): Promise<void>;
  existe(chave: string): Promise<boolean>;
  /** Todas as chaves que começam com o prefixo. */
  listar(prefixo: string): Promise<string[]>;
  apagarTudo(prefixo: string): Promise<void>;
  /** Caminho de um arquivo no disco com o conteúdo da chave (o motor e o sharp leem dali). */
  noDisco(chave: string): Promise<string | null>;
}

const disco: Armazem = {
  async ler(chave) {
    const f = path.join(RAIZ_GERADOR, valida(chave));
    return fs.existsSync(f) && fs.statSync(f).isFile() ? fs.readFileSync(f) : null;
  },
  async gravar(chave, dados) {
    const f = path.join(RAIZ_GERADOR, valida(chave));
    fs.mkdirSync(path.dirname(f), { recursive: true });
    fs.writeFileSync(f, dados);
  },
  async existe(chave) { return fs.existsSync(path.join(RAIZ_GERADOR, valida(chave))); },
  async listar(prefixo) {
    const base = path.join(RAIZ_GERADOR, prefixo.split('/')[0]);
    if (!fs.existsSync(base)) return [];
    return (fs.readdirSync(base, { recursive: true, withFileTypes: true }) as fs.Dirent[])
      .filter((d) => d.isFile())
      .map((d) => path.relative(RAIZ_GERADOR, path.join(d.parentPath, d.name)).split(path.sep).join('/'))
      .filter((c) => c.startsWith(prefixo));
  },
  async apagarTudo(prefixo) {
    for (const c of await this.listar(prefixo)) fs.rmSync(path.join(RAIZ_GERADOR, c), { force: true });
    const pasta = path.join(RAIZ_GERADOR, valida(prefixo.replace(/\/$/, '')));
    if (fs.existsSync(pasta) && fs.statSync(pasta).isDirectory() && !fs.readdirSync(pasta).length) fs.rmdirSync(pasta);
  },
  async noDisco(chave) {
    const f = path.join(RAIZ_GERADOR, valida(chave));
    return fs.existsSync(f) ? f : null;
  },
};

const PASTA_TEMP = path.join(os.tmpdir(), 'paintzoas');

function blob(): Armazem {
  // carregado só na nuvem, para o computador não depender do pacote
  const sdk = import('@vercel/blob');
  const lerDoBlob = async (chave: string) => {
    const { get } = await sdk;
    const r = await get(valida(chave), { access: 'private', useCache: !muda(chave) });
    if (!r || r.statusCode !== 200 || !r.stream) return null;
    return Buffer.from(await new Response(r.stream).arrayBuffer());
  };
  return {
    ler: lerDoBlob,
    async gravar(chave, dados) {
      const { put } = await sdk;
      await put(valida(chave), dados, {
        access: 'private', addRandomSuffix: false, allowOverwrite: true, contentType: tipoDe(chave),
        ...(muda(chave) ? { cacheControlMaxAge: 60 } : {}),
      });
      // a cópia no disco (se houver) fica igual ao que foi gravado
      const f = path.join(PASTA_TEMP, chave);
      if (fs.existsSync(f)) fs.writeFileSync(f, dados);
    },
    async existe(chave) {
      const { head, BlobNotFoundError } = await sdk;
      try { await head(valida(chave)); return true; } catch (e) { if (e instanceof BlobNotFoundError) return false; throw e; }
    },
    async listar(prefixo) {
      const { list } = await sdk;
      const chaves: string[] = [];
      let cursor: string | undefined;
      do {
        const r = await list({ prefix: prefixo, cursor, limit: 1000 });
        chaves.push(...r.blobs.map((b) => b.pathname));
        cursor = r.hasMore ? r.cursor : undefined;
      } while (cursor);
      return chaves;
    },
    async apagarTudo(prefixo) {
      const { del } = await sdk;
      const chaves = await this.listar(prefixo);
      if (chaves.length) await del(chaves);
      fs.rmSync(path.join(PASTA_TEMP, prefixo), { recursive: true, force: true });
    },
    async noDisco(chave) {
      const f = path.join(PASTA_TEMP, valida(chave));
      if (fs.existsSync(f) && !muda(chave)) return f;
      const dados = await lerDoBlob(chave);
      if (!dados) return null;
      fs.mkdirSync(path.dirname(f), { recursive: true });
      fs.writeFileSync(f, dados);
      return f;
    },
  };
}

export const armazem: Armazem = NA_NUVEM ? blob() : disco;
