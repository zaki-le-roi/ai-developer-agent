import { promises as fs } from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createSandboxWorkspace } from './sandbox-core.js';

const allowed = new Set(['npm', 'npx', 'tsc', 'gradle']);

function validateCommand(command: string, args: string[]): void {
  if (!allowed.has(command)) throw new Error('الأمر غير مسموح داخل Sandbox.');
  const first = args[0] ?? '';
  if (command === 'npm' && !['install', 'ci', 'test', 'run'].includes(first)) {
    throw new Error('يسمح لـ npm فقط بـ install أو ci أو test أو run داخل Sandbox.');
  }
  if (command === 'npm' && first === 'run' && !['build', 'test', 'lint', 'typecheck'].includes(args[1] ?? '')) {
    throw new Error('سكريبت npm غير مسموح داخل Sandbox.');
  }
  if (command === 'gradle' && first !== '--version' && !args.includes('assembleDebug')) {
    throw new Error('يسمح لـ gradle داخل Sandbox فقط ببناء assembleDebug أو التحقق من الإصدار.');
  }
  if (command === 'npx' && first !== 'tsc') {
    throw new Error('يسمح لـ npx فقط بتشغيل tsc داخل Sandbox.');
  }
  if (command === 'tsc' && args.some((arg) => arg.startsWith('--project=') || arg === '--build')) {
    throw new Error('خيارات tsc هذه غير مسموحة داخل Sandbox.');
  }
}
const MAX_OUTPUT = 100000;
const MAX_TIMEOUT_MS = 30000;

function safePath(root: string, relativePath: string): string {
  if (!relativePath || path.isAbsolute(relativePath)) {
    throw new Error('المسار يجب أن يكون نسبيًا داخل Sandbox.');
  }
  const target = path.resolve(root, relativePath);
  const relative = path.relative(root, target);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error('المسار خارج Sandbox غير مسموح.');
  }
  return target;
}

function bounded(value: string): string {
  return value.length > MAX_OUTPUT
    ? `${value.slice(0, MAX_OUTPUT)}\n[تم اقتطاع المخرجات]`
    : value;
}

export async function writeFileInSandbox(
  projectId: string | undefined,
  relativePath: string,
  content: string,
) {
  const workspace = await createSandboxWorkspace(projectId);
  const target = safePath(workspace.directory, relativePath);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, content, 'utf8');
  return { workspaceId: workspace.id, path: relativePath };
}

export async function readFileInSandbox(projectId: string | undefined, relativePath: string) {
  const workspace = await createSandboxWorkspace(projectId);
  const target = safePath(workspace.directory, relativePath);
  return {
    workspaceId: workspace.id,
    path: relativePath,
    content: await fs.readFile(target, 'utf8'),
  };
}

export async function runCommandInSandbox(
  projectId: string | undefined,
  command: string,
  args: string[] = [],
) {
  validateCommand(command, args);
  if (args.length > 50 || args.some((arg) => arg.length > 4000)) {
    throw new Error('معطيات الأمر تتجاوز الحدود المسموح بها.');
  }

  const workspace = await createSandboxWorkspace(projectId);
  return new Promise<{ workspaceId: string; code: number; stdout: string; stderr: string }>((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: workspace.directory,
      shell: false,
      windowsHide: true,
      timeout: MAX_TIMEOUT_MS,
      env: {
        PATH: process.env.PATH ?? '',
        NODE_ENV: 'test',
      },
    });

    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => {
      stdout = bounded(stdout + chunk.toString());
    });
    child.stderr.on('data', (chunk) => {
      stderr = bounded(stderr + chunk.toString());
    });
    child.on('error', reject);
    child.on('close', (code) => resolve({
      workspaceId: workspace.id,
      code: code ?? 1,
      stdout,
      stderr,
    }));
  });
}
