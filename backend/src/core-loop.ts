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
import {
  readFileInSandbox,
  runCommandInSandbox,
  writeFileInSandbox,
} from './sandbox-tools.js';

const MAX_ITERATIONS = 8;

function maskSecrets(value: string): string {
  return value
    .replace(/(OPENAI_API_KEY|GITHUB_TOKEN|BMZ_API_KEY|API_KEY|SECRET|PASSWORD)\\s*[=:]\\s*[^\\s\\n]+/gi, '$1=[MASKED]')
    .replace(/gh[pousr]_[A-Za-z0-9_\\-]{20,}/g, '[MASKED_GITHUB_TOKEN]')
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
  action: AgentAction,
  level: PermissionLevel,
): Promise<CoreObservation> {
  const decision = authorizeAction(action, level);
  if (!decision.allowed) {
    return { action: action.type, ok: false, summary: decision.reason };
  }

  try {
    const workspace = await createSandboxWorkspace(projectId);

    if (action.type === 'inspect_workspace') return inspectWorkspace(workspace);

    if (action.type === 'read_file') {
      const result = await readFileInSandbox(projectId, action.path);
      return {
        action: action.type,
        ok: true,
        summary: `تمت قراءة الملف ${action.path}.`,
        stdout: maskSecrets(result.content.slice(0, 20000)),
      };
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

function extractJson(text: string): unknown {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('لم يُرجع مكوّن الإصلاح إجراء JSON صالحًا.');
  return JSON.parse(text.slice(start, end + 1)) as unknown;
}

function isAction(value: unknown): value is AgentAction {
  if (!value || typeof value !== 'object') return false;
  const item = value as Record<string, unknown>;
  if (typeof item.type !== 'string') return false;
  if (!['inspect_workspace', 'read_file', 'write_file', 'run_command', 'test'].includes(item.type)) return false;
  if (item.type === 'read_file' && typeof item.path !== 'string') return false;
  if (item.type === 'write_file' && (typeof item.path !== 'string' || typeof item.content !== 'string')) return false;
  if (item.type === 'run_command') {
    if (typeof item.command !== 'string') return false;
    if (item.args !== undefined && (!Array.isArray(item.args) || item.args.some((arg) => typeof arg !== 'string'))) return false;
  }
  return true;
}

async function requestRepair(
  provider: ModelProvider | undefined,
  goal: string,
  observation: CoreObservation,
): Promise<AgentAction | null> {
  if (!provider || provider.name === 'unconfigured') return null;

  try {
    const generated = await provider.generate([
      'أنت مكوّن الإصلاح داخل BMZ AI نفسه.',
      'حلّل نتيجة العملية الفاشلة واقترح إجراءً واحدًا فقط لإصلاحها داخل Sandbox.',
      'أرجع JSON فقط بالشكل {"action":{...}}.',
      'الأنواع المسموحة: read_file, write_file, run_command, test.',
      'لا تستخدم مسارات مطلقة. لا تستخدم أوامر shell مركبة.',
      `المهمة: ${goal}`,
      `النتيجة الفاشلة: ${JSON.stringify(observation)}`,
    ].join('\n'));
    const parsed = extractJson(generated);
    if (!parsed || typeof parsed !== 'object') return null;
    const action = (parsed as Record<string, unknown>).action;
    return isAction(action) ? action : null;
  } catch {
    return null;
  }
}

export async function runCoreLoop(
  projectId: string | undefined,
  plan: AgentPlan,
  level: PermissionLevel = 'sandbox',
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

  if (!queue.length) queue.push({ type: 'inspect_workspace' }, { type: 'test' });

  let iterations = 0;

  while (queue.length && iterations < MAX_ITERATIONS) {
    const action = queue.shift()!;
    iterations += 1;
    const observation = await executeAction(workspaceProjectId, action, level);
    observations.push(observation);

    if (observation.ok) continue;

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
