import { promises as fs } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

const root = path.resolve(process.env.BMZ_SANDBOX_ROOT ?? path.join(process.cwd(), 'sandbox', 'workspaces'));

export type SandboxWorkspace = { id: string; directory: string };

function inside(target: string): void {
  const relative = path.relative(root, target);
  if (relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('مسار Sandbox غير مسموح.');
}

export async function createSandboxWorkspace(projectId?: string): Promise<SandboxWorkspace> {
  const id = (projectId ?? randomUUID()).replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 80) || 'project';
  const directory = path.join(root, id);
  inside(directory);
  await fs.mkdir(directory, { recursive: true });
  return { id, directory };
}

export async function sandboxCheck(projectId?: string) {
  const workspace = await createSandboxWorkspace(projectId);
  const file = path.join(workspace.directory, '.bmz-check');
  inside(file);
  await fs.writeFile(file, 'ok', 'utf8');
  const value = await fs.readFile(file, 'utf8');
  await fs.rm(file, { force: true });
  return { ok: value === 'ok', workspaceId: workspace.id };
}
