import { promises as fs } from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createSandboxWorkspace } from './sandbox-core.js';

const allowed = new Set(['npm', 'npx', 'tsc', 'gradle', 'git']);

function validateCommand(command: string, args: string[]): void {
  if (!allowed.has(command)) throw new Error('الأمر غير مسموح داخل Sandbox.');
  const first = args[0] ?? '';
  if (command === 'git' && !['status','diff','clone','checkout','branch'].includes(first)) throw new Error('أمر Git غير مسموح داخل Sandbox.');
  if (command === 'git' && ['clone'].includes(first)) { const url=args[1]??''; if(!/^https:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+(?:\.git)?$/.test(url)) throw new Error('يسمح بالـ clone من GitHub HTTPS فقط.'); }
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
const DEFAULT_TIMEOUT_MS = 120000;
const INSTALL_TIMEOUT_MS = 300000;
const ANDROID_TIMEOUT_MS = 600000;
const MAX_FILE_BYTES = 2_000_000;
const MAX_CONCURRENT_PROCESSES = 2;
let activeProcesses = 0;

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

export async function deleteFileInSandbox(projectId: string | undefined, relativePath: string) {
  const workspace = await createSandboxWorkspace(projectId);
  const target = safePath(workspace.directory, relativePath);
  await fs.rm(target, { recursive: true, force: false });
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
  if(activeProcesses>=MAX_CONCURRENT_PROCESSES) throw new Error('تم بلوغ الحد الآمن للعمليات المتزامنة داخل Sandbox.');
  if (args.length > 50 || args.some((arg) => arg.length > 4000)) {
    throw new Error('معطيات الأمر تتجاوز الحدود المسموح بها.');
  }

  const workspace = await createSandboxWorkspace(projectId);
  return new Promise<{ workspaceId: string; code: number; stdout: string; stderr: string }>((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: workspace.directory,
      shell: false,
      windowsHide: true,
      timeout: command === 'gradle' ? ANDROID_TIMEOUT_MS : (command === 'npm' && ['install','ci'].includes(args[0] ?? '') ? INSTALL_TIMEOUT_MS : DEFAULT_TIMEOUT_MS),
      env: {
        PATH: process.env.PATH ?? '',
        NODE_ENV: 'test',
        ...(process.env.JAVA_HOME ? { JAVA_HOME: process.env.JAVA_HOME } : {}),
        ...(process.env.ANDROID_HOME ? { ANDROID_HOME: process.env.ANDROID_HOME } : {}),
        ...(process.env.ANDROID_SDK_ROOT ? { ANDROID_SDK_ROOT: process.env.ANDROID_SDK_ROOT } : {}),
        ...(process.env.GRADLE_USER_HOME ? { GRADLE_USER_HOME: process.env.GRADLE_USER_HOME } : {}),
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

export async function makeDirectoryInSandbox(projectId:string|undefined,relativePath:string){const workspace=await createSandboxWorkspace(projectId);const target=safePath(workspace.directory,relativePath);await fs.mkdir(target,{recursive:true});return{workspaceId:workspace.id,path:relativePath};}
export async function renameInSandbox(projectId:string|undefined,from:string,to:string){const workspace=await createSandboxWorkspace(projectId);const source=safePath(workspace.directory,from);const target=safePath(workspace.directory,to);await fs.mkdir(path.dirname(target),{recursive:true});await fs.rename(source,target);return{workspaceId:workspace.id,from,to};}
export async function searchInSandbox(projectId:string|undefined,needle:string){if(!needle.trim())throw new Error('نص البحث مطلوب.');const workspace=await createSandboxWorkspace(projectId);const matches:string[]=[];async function walk(dir:string){for(const e of await fs.readdir(dir,{withFileTypes:true})){if(['.git','node_modules','.gradle'].includes(e.name))continue;const p=path.join(dir,e.name);if(e.isDirectory())await walk(p);else{try{const s=await fs.readFile(p,'utf8');if(s.includes(needle))matches.push(path.relative(workspace.directory,p).split(path.sep).join('/'));}catch{}}}}await walk(workspace.directory);return{workspaceId:workspace.id,needle,files:matches.slice(0,500)};}
