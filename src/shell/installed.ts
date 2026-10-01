// Which optional apps (src/release.ts OPTIONAL_APPS) this person has installed: a short list in their own files, so it
// follows them to every device and never changes anyone else's desktop. A missing or damaged list means none.
import type { FileSystem } from '../fs/fs.ts';
import { OPTIONAL_APPS } from '../release.ts';

export const INSTALLED_PATH = '/System/apps.json';

/** Only names that are optional apps in this release; anything else in the file is ignored. */
export function cleanInstalled(raw: unknown): string[] {
  const list = raw && typeof raw === 'object' ? (raw as { installed?: unknown }).installed : null;
  if (!Array.isArray(list)) return [];
  return [...new Set(list.filter((id): id is string => typeof id === 'string' && OPTIONAL_APPS.includes(id)))];
}

export async function readInstalled(fs: FileSystem): Promise<string[]> {
  try {
    return cleanInstalled(JSON.parse(await fs.readText(INSTALLED_PATH)));
  } catch {
    return [];
  }
}

export async function writeInstalled(fs: FileSystem, ids: string[]): Promise<void> {
  await fs.ensureFolder('/System', { hidden: true });
  await fs.writeText(INSTALLED_PATH, JSON.stringify({ installed: cleanInstalled({ installed: ids }) }), { hidden: true });
}
