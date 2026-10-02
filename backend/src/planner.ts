import type { AgentAction, AgentPlan } from '../../shared/contracts.js';
import type { ModelProvider } from './model-provider.js';

function fallbackPlan(goal: string): AgentPlan {
  const lower = goal.toLowerCase();
  const inspect = /(حلل|حلّل|افحص|تحقق|inspect|analy[sz]e|review|debug)/i.test(lower);
  const test = /(اختبر|اختبار|test|build|بناء|شغّل|شغل)/i.test(lower);

  const steps: AgentPlan['steps'] = [
    {
      id: 'inspect',
      title: 'فحص مساحة العمل',
      status: 'pending',
      action: { type: 'inspect_workspace' },
    },
  ];

  if (inspect || test) {
    steps.push({
      id: 'test',
      title: 'تشغيل اختبار أساسي',
      status: 'pending',
      action: { type: 'test' },
    });
  }

  if (!inspect && !test) {
    steps.push({
      id: 'task',
      title: 'تسجيل المهمة داخل مساحة العمل',
      status: 'pending',
      action: {
        type: 'write_file',
        path: '.bmz-task.txt',
        content: goal.trim(),
      },
    });
    steps.push({
      id: 'test',
      title: 'التحقق من سلامة التنفيذ',
      status: 'pending',
      action: { type: 'test' },
    });
  }

  return { goal: goal.trim(), steps };
}

function extractJson(text: string): unknown {
  const candidate = text;
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('لم يُرجع مكوّن الاستدلال خطة JSON صالحة.');
  return JSON.parse(candidate.slice(start, end + 1)) as unknown;
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

function validatePlan(value: unknown, goal: string): AgentPlan {
  if (!value || typeof value !== 'object') throw new Error('الخطة المُولدة غير صالحة.');
  const raw = value as Record<string, unknown>;
  if (!Array.isArray(raw.steps)) throw new Error('الخطة لا تحتوي على خطوات.');
  const steps = raw.steps.slice(0, 12).flatMap((item, index) => {
    if (!item || typeof item !== 'object') return [];
    const step = item as Record<string, unknown>;
    if (typeof step.title !== 'string' || !isAction(step.action)) return [];
    return [{
      id: typeof step.id === 'string' ? step.id.slice(0, 80) : `step-${index + 1}`,
      title: step.title.slice(0, 160),
      status: 'pending' as const,
      action: step.action,
    }];
  });
  if (!steps.length) throw new Error('لم تتضمن الخطة أي إجراء صالح.');
  return { goal, steps };
}

export async function createPlan(goal: string, provider?: ModelProvider): Promise<AgentPlan> {
  const fallback = fallbackPlan(goal);
  if (!provider || provider.name === 'unconfigured') return fallback;

  try {
    const prompt = [
      'أنت مكوّن التخطيط داخل BMZ AI نفسه.',
      'حوّل طلب المستخدم إلى خطة تنفيذ صغيرة وقابلة للتحقق.',
      'لا تنفذ شيئًا بنفسك. أرجع JSON فقط بالشكل:',
      '{"steps":[{"id":"inspect","title":"...","action":{"type":"inspect_workspace"}}]}',
      'الأنواع المسموحة: inspect_workspace, read_file, write_file, run_command, test.',
      'لا تستخدم مسارات مطلقة. لا تستخدم أوامر shell المركبة.',
      'إذا لم تكن بحاجة لتعديل ملفات، ابدأ بالفحص والاختبار.',
      `طلب المستخدم: ${goal}`,
    ].join('\n');
    const generated = await provider.generate(prompt);
    return validatePlan(extractJson(generated), goal.trim());
  } catch {
    return fallback;
  }
}
