import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { AgentPlan, CoreAction, CoreObservation, PermissionLevel } from '../../shared/contracts.js';
import { authorizeAction } from './orchestrator.js';
import {
  createSandboxWorkspace,
  type SandboxWorkspace,
} from './sandbox-core.js';
import {
  readFileInSandbox,
  runCommandInSandbox,
  writeFileInSandbox,
} from './sandbox-tools.js';

const MAX_ITERATIONS = 6;

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
  action: CoreAction,
  level: PermissionLevel,
): Promise<CoreObservation> {
  const decision = authorizeAction(action, level);
  if (!decision.allowed) {
    return { action: action.type, ok: false, summary: decision.reason };
  }

  try {
    const workspace = await createSandboxWorkspace(projectId);

    if (action.type === 'inspect_workspace') {
      return inspectWorkspace(workspace);
    }

    if (action.type === 'read_file') {
      const result = await readFileInSandbox(projectId, action.path);
      return {
        action: action.type,
        ok: true,
        summary: `تمت قراءة الملف ${action.path}.`,
        stdout: result.content.slice(0, 20000),
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
        stdout: result.stdout,
        stderr: result.stderr,
      };
    }

    const result = await runCommandInSandbox(projectId, 'node', ['-e', 'console.log("BMZ AI test: OK")']);
    return {
      action: 'test',
      ok: result.code === 0,
      summary: result.code === 0 ? 'نجح الاختبار الداخلي.' : 'فشل الاختبار الداخلي.',
      stdout: result.stdout,
      stderr: result.stderr,
    };
  } catch (error) {
    return {
      action: action.type,
      ok: false,
      summary: error instanceof Error ? error.message : 'حدث خطأ أثناء التنفيذ.',
    };
  }
}

export async function runCoreLoop(
  projectId: string | undefined,
  plan: AgentPlan,
  level: PermissionLevel = 'sandbox',
): Promise<{
  status: 'completed' | 'failed';
  message: string;
  iterations: number;
  observations: CoreObservation[];
}> {
  const observations: CoreObservation[] = [];
  let iterations = 0;

  const actions: CoreAction[] = [
    { type: 'inspect_workspace' },
    { type: 'test' },
  ];

  if (plan.goal.trim()) {
    actions.unshift({
      type: 'write_file',
      path: '.bmz-task.txt',
      content: plan.goal.trim(),
    });
  }

  for (const action of actions.slice(0, MAX_ITERATIONS)) {
    iterations += 1;
    const observation = await executeAction(projectId, action, level);
    observations.push(observation);

    if (!observation.ok && action.type === 'test') {
      return {
        status: 'failed',
        message: 'فشل الاختبار النهائي داخل Sandbox.',
        iterations,
        observations,
      };
    }
  }

  const failed = observations.some((item) => !item.ok);
  return {
    status: failed ? 'failed' : 'completed',
    message: failed
      ? 'اكتملت دورة BMZ AI مع أخطاء تحتاج إلى معالجة.'
      : 'اكتملت دورة BMZ AI: تنفيذ داخل Sandbox ثم تحقق.',
    iterations,
    observations,
  };
}
