import { promises as fs } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

export type MemoryEntry = {
  id: string;
  projectId: string | null;
  type: 'task' | 'error' | 'solution' | 'test';
  content: string;
  createdAt: string;
};

const dataDir = path.resolve(process.env.BMZ_DATA_ROOT ?? path.join(process.cwd(), 'backend', 'data'));
const dataFile = path.join(dataDir, 'memory.json');

async function load(): Promise<MemoryEntry[]> {
  try {
    const raw = await fs.readFile(dataFile, 'utf8');
    const value = JSON.parse(raw) as unknown;
    return Array.isArray(value) ? value as MemoryEntry[] : [];
  } catch {
    return [];
  }
}

async function save(entries: MemoryEntry[]): Promise<void> {
  await fs.mkdir(dataDir, { recursive: true });
  const temp = `${dataFile}.tmp-${randomUUID()}`;
  await fs.writeFile(temp, JSON.stringify(entries, null, 2), 'utf8');
  await fs.rename(temp, dataFile);
}

export async function remember(projectId: string | null, type: MemoryEntry['type'], content: string): Promise<MemoryEntry> {
  const entries = await load();
  const entry = { id: randomUUID(), projectId, type, content, createdAt: new Date().toISOString() };
  entries.push(entry);
  await save(entries);
  return entry;
}

export async function recall(projectId?: string): Promise<MemoryEntry[]> {
  const entries = await load();
  return entries.filter((entry) => !projectId || entry.projectId === projectId);
}
