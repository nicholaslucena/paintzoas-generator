// Arquivos no navegador: PNG em base64, download, .zip e miniatura.

export function base64ParaBlob(b64: string, tipo: string): Blob {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: tipo });
}

export function blobParaBase64(blob: Blob): Promise<string> {
  return new Promise((ok, falha) => {
    const f = new FileReader();
    f.onload = () => ok(String(f.result).split(',')[1]);
    f.onerror = () => falha(f.error);
    f.readAsDataURL(blob);
  });
}

export function baixar(blob: Blob, nome: string) {
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement('a'), { href: url, download: nome });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** "20261124-1530", para o nome dos arquivos baixados. */
export function carimbo(d = new Date()) {
  const z = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${z(d.getMonth() + 1)}${z(d.getDate())}-${z(d.getHours())}${z(d.getMinutes())}`;
}

// ---------- .zip sem compressão (PNG já vem comprimido) ----------
const TABELA_CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(dados: Uint8Array) {
  let c = 0xffffffff;
  for (let i = 0; i < dados.length; i++) c = TABELA_CRC[(c ^ dados[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

export async function zip(arquivos: [string, Blob][]): Promise<Blob> {
  const partes: BlobPart[] = [], central: Uint8Array<ArrayBuffer>[] = [];
  let pos = 0;
  const d = new Date();
  const hora = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1);
  const dia = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
  for (const [nome, blob] of arquivos) {
    const dados = new Uint8Array(await blob.arrayBuffer());
    const n = new Uint8Array(new TextEncoder().encode(nome));
    const crc = crc32(dados);
    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true); local.setUint16(4, 20, true); local.setUint16(6, 0x0800, true);
    local.setUint16(10, hora, true); local.setUint16(12, dia, true); local.setUint32(14, crc, true);
    local.setUint32(18, dados.length, true); local.setUint32(22, dados.length, true); local.setUint16(26, n.length, true);
    const cab = new DataView(new ArrayBuffer(46));
    cab.setUint32(0, 0x02014b50, true); cab.setUint16(4, 20, true); cab.setUint16(6, 20, true); cab.setUint16(8, 0x0800, true);
    cab.setUint16(12, hora, true); cab.setUint16(14, dia, true); cab.setUint32(16, crc, true);
    cab.setUint32(20, dados.length, true); cab.setUint32(24, dados.length, true); cab.setUint16(28, n.length, true);
    cab.setUint32(42, pos, true);
    partes.push(local.buffer, n, dados);
    central.push(new Uint8Array(cab.buffer), n);
    pos += 30 + n.length + dados.length;
  }
  const tamanhoCentral = central.reduce((s, b) => s + b.length, 0);
  const fim = new DataView(new ArrayBuffer(22));
  fim.setUint32(0, 0x06054b50, true); fim.setUint16(8, arquivos.length, true); fim.setUint16(10, arquivos.length, true);
  fim.setUint32(12, tamanhoCentral, true); fim.setUint32(16, pos, true);
  return new Blob([...partes, ...central, fim.buffer], { type: 'application/zip' });
}

/** Miniatura em JPEG (base64), para o cartão de Minhas peças. */
export async function miniaturaJpeg(blob: Blob, largura = 360): Promise<string> {
  const img = await createImageBitmap(blob);
  const escala = largura / img.width;
  const canvas = Object.assign(document.createElement('canvas'), { width: largura, height: Math.round(img.height * escala) });
  canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
  img.close();
  const jpg = await new Promise<Blob>((ok) => canvas.toBlob((b) => ok(b!), 'image/jpeg', 0.82));
  return blobParaBase64(jpg);
}
