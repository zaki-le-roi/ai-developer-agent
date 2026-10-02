import type { AgentPlan, AgentAction } from '../../shared/contracts.js';
import type { ModelProvider } from './model-provider.js';

function fallbackPlan(goal: string): AgentPlan {
  const value = goal.toLowerCase();
  const inspect = /(حلل|حلّل|افحص|تحقق|inspect|review|debug|اقرأ|read)/i.test(value);
  const test = /(اختبر|اختبار|test|build|بناء|شغّل|شغل)/i.test(value);
  const steps: AgentPlan['steps'] = [
    { id: 'inspect', title: 'فحص مساحة العمل', status: 'pending', action: { type: 'inspect_workspace' } },
  ];
  if (inspect) {
    steps.push({
      id: 'read-task',
      title: 'قراءة الملفات المطلوبة',
      status: 'pending',
      action: { type: 'read_file', path: '.bmz-task.txt' },
    });
  } else {
    steps.push({
      id: 'task',
      title: 'تسجيل المهمة داخل مساحة العمل',
      status: 'pending',
      action: { type: 'write_file', path: '.bmz-task.txt', content: goal.trim() },
    });
  }
  if (/(android|أندرويد|اندرويد|apk|تطبيق|mobile|app)/i.test(value)) {\n    steps.splice(1, 0, { id: 'scaffold', title: 'إنشاء مشروع Android فعلي', status: 'pending', action: { type: 'scaffold_app', platform: 'android' } });\n    steps.push({ id: 'android-build', title: 'بناء APK عبر Gradle', status: 'pending', action: { type: 'build_android' } });\n  }\n  if (test || !inspect || steps.some((step) => step.action?.type === 'scaffold_app')) {
    steps.push({ id: 'test', title: 'اختبار المشروع', status: 'pending', action: { type: 'test' } });
  }
  return { goal: goal.trim(), steps };
}

function extractJson(text: string): unknown {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('خطة JSON غير صالحة.');
  return JSON.parse(text.slice(start, end + 1)) as unknown;
}

function isAction(value: unknown): value is AgentAction {
  if (!value || typeof value !== 'object') return false;
  const item = value as Record<string, unknown>;
  if (!['inspect_workspace', 'read_file', 'write_file', 'run_command', 'test'].includes(String(item.type))) return false;
  if (item.type === 'read_file') return typeof item.path === 'string';
  if (item.type === 'write_file') return typeof item.path === 'string' && typeof item.content === 'string';
  if (item.type === 'run_command') {
    return typeof item.command === 'string' &&
      (item.args === undefined || (Array.isArray(item.args) && item.args.every((arg) => typeof arg === 'string')));
  }
  return item.type === 'inspect_workspace' || item.type === 'test';
}

export async function createPlan(goal: string, provider?: ModelProvider): Promise<AgentPlan> {
  const fallback = fallbackPlan(goal);
  if (!provider || provider.name === 'unconfigured') return fallback;
  try {
    const raw = extractJson(await provider.generate([
      'أنت مخطط BMZ AI.',
      'أنشئ خطة تنفيذ فعلية.',
      'الأنواع المسموحة فقط: inspect_workspace, read_file, write_file, run_command, test.',
      'أرجع JSON فقط.',
      `الطلب: ${goal}`,
    ].join('\\n'))) as Record<string, unknown>;
    if (!Array.isArray(raw.steps) || !raw.steps.length) return fallback;
    const steps = raw.steps
      .slice(0, 16)
      .filter((step): step is Record<string, unknown> =>
        Boolean(step) && typeof step === 'object' && typeof (step as Record<string, unknown>).title === 'string' &&
        isAction((step as Record<string, unknown>).action),
      )
      .map((step, index) => ({
        id: typeof step.id === 'string' ? step.id : `step-${index + 1}`,
        title: String(step.title),
        status: 'pending' as const,
        action: step.action as AgentAction,
      }));
    return steps.length ? { goal: goal.trim(), steps } : fallback;
  } catch {
    return fallback;
  }
}
