import { promises as fs } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

export type ExecutionLog = {
  id: string;
  projectId: string | null;
  message: string;
  status: 'started' | 'completed' | 'failed';
  createdAt: string;
};

const dataDir = path.resolve(process.env.BMZ_DATA_ROOT ?? path.join(process.cwd(), 'backend', 'data'));
const dataFile = path.join(dataDir, 'executions.json');

async function load(): Promise<ExecutionLog[]> {
  try {
    const raw = await fs.readFile(dataFile, 'utf8');
    const value = JSON.parse(raw) as unknown;
    return Array.isArray(value) ? value as ExecutionLog[] : [];
  } catch {
    return [];
  }
}

async function save(items: ExecutionLog[]): Promise<void> {
  await fs.mkdir(dataDir, { recursive: true });
  const temp = `${dataFile}.tmp-${randomUUID()}`;
  await fs.writeFile(temp, JSON.stringify(items, null, 2), 'utf8');
  await fs.rename(temp, dataFile);
}

export async function addExecutionLog(
  projectId: string | null,
  message: string,
  status: ExecutionLog['status'],
): Promise<ExecutionLog> {
  const items = await load();
  const item = { id: randomUUID(), projectId, message, status, createdAt: new Date().toISOString() };
  items.push(item);
  await save(items);
  return item;
}

export async function listExecutionLogs(projectId?: string): Promise<ExecutionLog[]> {
  const items = await load();
  return items.filter((item) => !projectId || item.projectId === projectId);
}
