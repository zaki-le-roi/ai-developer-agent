import { randomUUID } from 'node:crypto';

export type MemoryEntry = {
  id: string;
  projectId: string | null;
  type: 'task' | 'error' | 'solution' | 'test';
  content: string;
  createdAt: string;
};

const entries: MemoryEntry[] = [];

export function remember(projectId: string | null, type: MemoryEntry['type'], content: string): MemoryEntry {
  const entry = { id: randomUUID(), projectId, type, content, createdAt: new Date().toISOString() };
  entries.push(entry);
  return entry;
}

export function recall(projectId?: string): MemoryEntry[] {
  return entries.filter((entry) => !projectId || entry.projectId === projectId);
}
