import { promises as fs } from 'node:fs';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import type {
  AgentAction,
  AgentPlan,
  CoreObservation,
  PermissionLevel,
} from '../../shared/contracts.js';
import { authorizeAction } from './orchestrator.js';
import type { ModelProvider } from './model-provider.js';
import { createSandboxWorkspace, type SandboxWorkspace } from './sandbox-core.js';
import { scaffoldAndroidApp } from './app-builder.js';
import { listWorkspaceFiles, readWorkspaceFile } from './workspace-service.js';
import { commitWorkspaceToGitHub } from './github-write.js';
import { hasPermission } from './permission-store.js';
import { getTool, validateToolCall } from './tool-registry.js';
import {
  readFileInSandbox,
  deleteFileInSandbox,
  runCommandInSandbox,
  writeFileInSandbox,
} from './sandbox-tools.js';

const MAX_ITERATIONS = 40;

function maskSecrets(value: string): string {
  return value
    .replace(/(OPENAI_API_KEY|GITHUB_TOKEN|BMZ_API_KEY|API_KEY|SECRET|PASSWORD)\s*[=:]\s*[^\s\n]+/gi, '$1=[MASKED]')
    .replace(/gh[pousr]_[A-Za-z0-9_\-]{20,}/g, '[MASKED_GITHUB_TOKEN]')
    .replace(/sk-[A-Za-z0-9_-]{20,}/g, '[MASKED_API_KEY]');
}

async function inspectWorkspace(workspace: SandboxWorkspace): Promise<CoreObservation> {
  const entries = await fs.readdir(workspace.directory, { withFileTypes: true });
  const names = entries.slice(0, 100).map((entry) => entry.name);
  return {
    action: 'inspect_workspace',
    ok: true,
    summary: names.length
      ? `تم فحص مساحة العمل: ${names.join(', ')}`
      : 'مساحة العمل فارغة.',
  };
}

async function executeAction(
  projectId: string | undefined,
  userId: string | undefined,
  action: AgentAction,
  level: PermissionLevel,
): Promise<CoreObservation> {
  const decision = authorizeAction(action, level);
  if (!decision.allowed) {
    return { action: action.type, ok: false, summary: decision.reason };
  }

  const required = action.type === 'github_commit' ? 'GITHUB_PUSH' : action.type === 'delete_file' ? 'DELETE_FILE' : ['write_file','scaffold_app'].includes(action.type) ? 'WRITE_PROJECT' : ['run_command','build_android','test'].includes(action.type) ? 'RUN_COMMAND' : 'READ_PROJECT';
  if (userId && !(await hasPermission(userId, projectId ?? null, required as any))) return { action: action.type, ok: false, summary: 'الصلاحية المطلوبة غير ممنوحة.' };

  try {
    const workspace = await createSandboxWorkspace(projectId);

    if (action.type === 'inspect_workspace') return inspectWorkspace(workspace);

    if (action.type === 'list_files') {
      const result = await listWorkspaceFiles(projectId ?? 'ephemeral');
      return { action: action.type, ok: true, summary: `تم العثور على ${result.files.length} ملفًا.`, stdout: result.files.join('\\n') };
    }

    if (action.type === 'read_file') {
      const result = await readFileInSandbox(projectId, action.path);
      return {
        action: action.type,
        ok: true,
        summary: `تمت قراءة الملف ${action.path}.`,
        stdout: maskSecrets(result.content.slice(0, 20000)),
      };
    }

    if (action.type === 'github_commit') {
      if (!projectId) throw new Error('لا يمكن مزامنة مساحة عمل غير مرتبطة بمشروع GitHub.');
      const result = await commitWorkspaceToGitHub(projectId, userId ?? '', action.message ?? 'BMZ AI: تحديث المشروع');
      return { action: action.type, ok: true, summary: `تم إنشاء Commit على GitHub: ${result.commitSha}${result.buildTriggered ? ' وتم تشغيل بناء Android.' : ''}` };
    }

    if (action.type === 'preview_web') {
      const result = await readWorkspaceFile(projectId ?? 'ephemeral', 'index.html');
      return { action: action.type, ok: true, summary: 'تم تجهيز index.html للمعاينة.', stdout: result.content.slice(0, 100000) };
    }

    if (action.type === 'scaffold_app') {
      const result = await scaffoldAndroidApp(projectId);
      return { action: action.type, ok: true, summary: `تم إنشاء مشروع Android فعلي داخل Sandbox: ${result.files.length} ملفات.` };
    }

    if (action.type === 'build_android') {
      const result = await runCommandInSandbox(projectId, 'gradle', ['--no-daemon', 'assembleDebug']);
      return { action: action.type, ok: result.code === 0, summary: result.code === 0 ? 'تم بناء APK Android بنجاح عبر Gradle.' : `فشل بناء APK برمز ${result.code}.`, stdout: maskSecrets(result.stdout), stderr: maskSecrets(result.stderr) };
    }

    if (action.type === 'delete_file') {
      await deleteFileInSandbox(projectId, action.path);
      return { action: action.type, ok: true, summary: `تم حذف الملف ${action.path} داخل Sandbox.` };
    }

    if (action.type === 'write_file') {
      await writeFileInSandbox(projectId, action.path, action.content);
      return {
        action: action.type,
        ok: true,
        summary: `تم إنشاء/تحديث الملف ${action.path} داخل Sandbox.`,
      };
    }

    if (action.type === 'run_command') {
      const result = await runCommandInSandbox(projectId, action.command, action.args ?? []);
      return {
        action: action.type,
        ok: result.code === 0,
        summary: result.code === 0 ? 'نجح تنفيذ الأمر.' : `فشل الأمر برمز ${result.code}.`,
        stdout: maskSecrets(result.stdout),
        stderr: maskSecrets(result.stderr),
      };
    }

    const packagePath = path.join(workspace.directory, 'package.json');
    try {
      const packageJson = JSON.parse(await fs.readFile(packagePath, 'utf8')) as { scripts?: Record<string, string> };
      const scripts = packageJson.scripts ?? {};
      const selected = ['test', 'build', 'typecheck', 'lint'].find((name) => typeof scripts[name] === 'string');
      if (selected) {
        const result = await runCommandInSandbox(projectId, 'npm', ['run', selected]);
        return {
          action: 'test',
          ok: result.code === 0,
          summary: result.code === 0 ? `نجح npm run ${selected}.` : `فشل npm run ${selected} برمز ${result.code}.`,
          stdout: maskSecrets(result.stdout),
          stderr: maskSecrets(result.stderr),
        };
      }
    } catch {
      // لا يوجد package.json صالح؛ ننتقل إلى الاختبار الداخلي.
    }

    const testPath = '.bmz-test.txt';
    const testValue = 'BMZ AI test: OK';
    const target = path.join(workspace.directory, testPath);
    await fs.writeFile(target, testValue, 'utf8');
    const value = await fs.readFile(target, 'utf8');
    await fs.rm(target, { force: true });
    return {
      action: 'test',
      ok: value === testValue,
      summary: value === testValue ? 'نجح الاختبار الداخلي لمساحة العمل.' : 'فشل الاختبار الداخلي.',
      stdout: value,
    };
  } catch (error) {
    return {
      action: action.type,
      ok: false,
      summary: error instanceof Error ? error.message : 'حدث خطأ أثناء التنفيذ.',
    };
  }
}

async function requestToolAction(provider: ModelProvider | undefined, prompt: string, allowed: string[]): Promise<AgentAction | null> {
  if (!provider?.generateToolCall || provider.name === 'unconfigured') return null;
  try {
    const tools = allowed.map(name => getTool(name)).filter((tool): tool is NonNullable<ReturnType<typeof getTool>> => Boolean(tool))
      .map(tool => ({name:tool.name,description:tool.description,parameters:tool.inputSchema}));
    const call = await provider.generateToolCall(prompt, tools);
    if (!call || !allowed.includes(call.name)) return null;
    return validateToolCall(call.name, call.arguments);
  } catch { return null; }
}
async function requestContinuation(provider: ModelProvider | undefined, goal: string, observations: CoreObservation[]): Promise<AgentAction | null> {
  return requestToolAction(provider, 'أنت حلقة القرار داخل BMZ AI. اختر أداة واحدة فقط إذا لم يكتمل الهدف. لا تكتف بالتلخيص.\\n'+`الهدف: ${goal}\\nآخر الملاحظات: ${JSON.stringify(observations.slice(-12))}`, ['read_file','write_file','run_command','scaffold_app','build_android','preview_web','test','list_files']);
}
async function requestRepair(provider: ModelProvider | undefined, goal: string, observation: CoreObservation): Promise<AgentAction | null> {
  return requestToolAction(provider, 'أنت مكوّن الإصلاح داخل BMZ AI. اختر أداة واحدة فقط لإصلاح الفشل داخل Sandbox. لا تستخدم مسارات مطلقة أو shell مركب.\\n'+`المهمة: ${goal}\\nالفشل: ${JSON.stringify(observation)}`, ['read_file','write_file','run_command','test']);
}
export async function runCoreLoop(
  projectId: string | undefined,
  plan: AgentPlan,
  level: PermissionLevel = 'sandbox',
  userId?: string,
  provider?: ModelProvider,
): Promise<{
  status: 'completed' | 'failed';
  message: string;
  iterations: number;
  observations: CoreObservation[];
}> {
  const observations: CoreObservation[] = [];
  const workspaceProjectId = projectId ?? `run-${randomUUID()}`;
  const queue: AgentAction[] = plan.steps
    .map((step) => step.action)
    .filter((action): action is AgentAction => Boolean(action));
  const needsVerification = queue.some((action) => ['write_file','run_command','scaffold_app','build_android'].includes(action.type));
  if (needsVerification && !queue.some((action) => action.type === 'test')) queue.push({ type: 'test' });

  if (!queue.length) queue.push({ type: 'inspect_workspace' }, { type: 'test' });

  let iterations = 0;

  while (queue.length && iterations < MAX_ITERATIONS) {
    const action = queue.shift()!;
    iterations += 1;
    const observation = await executeAction(workspaceProjectId, userId, action, level);
    observations.push(observation);

    if (observation.ok) {
      if (!queue.length && iterations < MAX_ITERATIONS && action.type !== 'test') {
        const next = await requestContinuation(provider, plan.goal, observations);
        if (next) queue.push(next);
      }
      continue;
    }

    const repair = await requestRepair(provider, plan.goal, observation);
    if (repair && iterations < MAX_ITERATIONS) {
      observations.push({
        action: 'inspect_workspace',
        ok: true,
        summary: 'تم طلب إجراء إصلاح من مكوّن الاستدلال داخل BMZ AI.',
      });
      queue.unshift(repair);
      if (action.type === 'test') queue.push({ type: 'test' });
      continue;
    }

    if (action.type === 'test' || queue.length === 0) {
      return {
        status: 'failed',
        message: `توقفت دورة BMZ AI بعد فشل العملية: ${observation.summary}`,
        iterations,
        observations,
      };
    }
  }

  if (queue.length > 0) {
    return {
      status: 'failed',
      message: 'تجاوزت دورة BMZ AI الحد الآمن لعدد عمليات التنفيذ.',
      iterations,
      observations,
    };
  }

  const failed = observations.some((item) => !item.ok);
  return {
    status: failed ? 'failed' : 'completed',
    message: failed
      ? 'اكتملت دورة BMZ AI مع أخطاء تحتاج إلى معالجة.'
      : 'اكتملت دورة BMZ AI: خطة ثم تنفيذ ثم تحقق داخل Sandbox.',
    iterations,
    observations,
  };
}
