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
  if (/(android|أندرويد|اندرويد|apk|تطبيق|mobile|app)/i.test(value)) {
    steps.splice(1, 0, { id: 'scaffold', title: 'إنشاء مشروع Android فعلي', status: 'pending', action: { type: 'scaffold_app', platform: 'android' } });
    steps.push({ id: 'android-build', title: 'بناء APK عبر Gradle', status: 'pending', action: { type: 'build_android' } });
  }
  if (test || !inspect || steps.some((step) => step.action?.type === 'scaffold_app')) {
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
  if (!['inspect_workspace', 'list_files', 'read_file', 'write_file', 'run_command', 'scaffold_app', 'build_android', 'preview_web', 'github_commit', 'test'].includes(String(item.type))) return false;
  if (item.type === 'read_file') return typeof item.path === 'string';
  if (item.type === 'write_file') return typeof item.path === 'string' && typeof item.content === 'string';
  if (item.type === 'run_command') {
    return typeof item.command === 'string' &&
      (item.args === undefined || (Array.isArray(item.args) && item.args.every((arg) => typeof arg === 'string')));
  }
  return ['inspect_workspace', 'list_files', 'scaffold_app', 'build_android', 'preview_web', 'github_commit', 'test'].includes(String(item.type));
}

export async function createPlan(goal: string, provider?: ModelProvider): Promise<AgentPlan> {
  const fallback = fallbackPlan(goal);
  if (!provider || provider.name === 'unconfigured') return fallback;
  try {
    const raw = extractJson(await provider.generate([
      'أنت مخطط التنفيذ الرئيسي داخل BMZ AI، وهدفك إنجاز طلب المستخدم فعليًا داخل مساحة المشروع، وليس كتابة تقرير أو لعبة تجريبية.',
      'حلّل المشروع أولًا، ثم أنشئ خطة تنفيذ كاملة ومترابطة. إذا كان المطلوب إنشاء تطبيق فأنشئ الملفات الفعلية المطلوبة، وإذا كان المطلوب إصلاحًا فاقرأ الملفات ذات الصلة قبل تعديلها، ثم اختبر النتيجة.',
      'لا تكتفِ بإنشاء قالب ترحيبي عندما يطلب المستخدم تطبيقًا حقيقيًا. يجب أن تتضمن الخطة ملفات الواجهة والمنطق والموارد والإعدادات والاختبارات اللازمة بحسب الطلب.',
      'استخدم read_file قبل تعديل ملف موجود عندما تحتاج معرفة محتواه. استخدم write_file لإنشاء/تعديل الملفات. استخدم run_command فقط للأوامر المسموح بها. بعد التغييرات استخدم test، وعند طلب Android استخدم build_android أيضًا.',
      'الأنواع المسموحة فقط: inspect_workspace, list_files, read_file, write_file, run_command, scaffold_app, build_android, preview_web, github_commit, test.',
      'أرجع JSON فقط بالشكل {"steps":[{"id":"...","title":"...","action":{...}}]}. لا تضف نصًا خارج JSON.',
      'قسّم العمل إلى خطوات صغيرة قابلة للتنفيذ، ولا تتجاوز 40 خطوة.',
      `الطلب: ${goal}`,
    ].join('\\n'))) as Record<string, unknown>;
    if (!Array.isArray(raw.steps) || !raw.steps.length) return fallback;
    const steps = raw.steps
      .slice(0, 40)
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
