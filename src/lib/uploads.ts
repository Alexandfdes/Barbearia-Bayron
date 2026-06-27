import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { randomBytes } from 'node:crypto';

// Uploads ficam no MESMO volume persistente do banco (/data em produção,
// ./data localmente). Assim a imagem do produto sobrevive a deploys.
const DB_PATH = process.env.DATABASE_PATH ?? './data/appointments.db';
export const PRODUCT_UPLOAD_DIR = join(dirname(DB_PATH), 'uploads', 'products');

/**
 * Valida um nome de arquivo de upload: só caracteres simples, sem path traversal.
 * Retorna o nome se válido, null se suspeito.
 */
export function safeUploadName(name: string): string | null {
  if (!name || name.length > 120) return null;
  if (name.includes('/') || name.includes('\\') || name.includes('..')) return null;
  if (!/^[a-zA-Z0-9._-]+$/.test(name)) return null;
  return name;
}

/** Tipos de imagem aceitos no upload de produto. */
export const IMAGE_MIME_EXT: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png':  '.png',
  'image/webp': '.webp',
};

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // 5 MB

/**
 * Salva o arquivo de imagem no volume e devolve o caminho público servido por
 * /api/products/image/. Valida tipo e tamanho; gera nome aleatório (não confia
 * no nome do cliente).
 */
export async function saveProductImage(file: File): Promise<{ path: string } | { error: string }> {
  const ext = IMAGE_MIME_EXT[file.type];
  if (!ext) return { error: 'Imagem deve ser JPG, PNG ou WEBP' };
  if (file.size > MAX_IMAGE_BYTES) return { error: 'Imagem muito grande (máx. 5 MB)' };
  const buf = Buffer.from(await file.arrayBuffer());
  const name = `${Date.now()}-${randomBytes(6).toString('hex')}${ext}`;
  await mkdir(PRODUCT_UPLOAD_DIR, { recursive: true });
  await writeFile(join(PRODUCT_UPLOAD_DIR, name), buf);
  return { path: `/api/products/image/${name}` };
}
