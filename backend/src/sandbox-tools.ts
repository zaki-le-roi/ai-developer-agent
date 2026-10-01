import { promises as fs } from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createSandboxWorkspace } from './sandbox-core.js';

const allowed = new Set(['node', 'npm', 'npx', 'tsc']);

function safePath(root: string, relativePath: string): string {
  const target = path.resolve(root, relativePath);
  const relative = path.relative(root, target);
  if (relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('المسار خارج Sandbox غير مسموح.');
  return target;
}

export async function writeFileInSandbox(projectId: string | undefined, relativePath: string, content: string) {
  const workspace = await createSandboxWorkspace(projectId);
  const target = safePath(workspace.directory, relativePath);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, content, 'utf8');
  return { workspaceId: workspace.id, path: relativePath };
}

export async function readFileInSandbox(projectId: string | undefined, relativePath: string) {
  const workspace = await createSandboxWorkspace(projectId);
  const target = safePath(workspace.directory, relativePath);
  return { workspaceId: workspace.id, path: relativePath, content: await fs.readFile(target, 'utf8') };
}

export async function runCommandInSandbox(projectId: string | undefined, command: string, args: string[] = []) {
  if (!allowed.has(command)) throw new Error('الأمر غير مسموح داخل Sandbox.');
  const workspace = await createSandboxWorkspace(projectId);
  return new Promise<{ workspaceId: string; code: number; stdout: string; stderr: string }>((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: workspace.directory,
      shell: false,
      windowsHide: true,
      timeout: 30000,
      env: { PATH: process.env.PATH ?? '', NODE_ENV: 'test' },
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk.toString(); });
    child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
    child.on('error', reject);
    child.on('close', (code) => resolve({
      workspaceId: workspace.id,
      code: code ?? 1,
      stdout: stdout.slice(0, 100000),
      stderr: stderr.slice(0, 100000),
    }));
  });
}
