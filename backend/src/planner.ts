import type { AgentPlan } from '../../shared/contracts.js';

export function createPlan(goal: string): AgentPlan {
  return {
    goal,
    steps: [
      { id: 'understand', title: 'فهم المهمة والمتطلبات', status: 'pending' },
      { id: 'plan', title: 'إعداد خطة تنفيذ قابلة للتحقق', status: 'pending' },
      { id: 'execute', title: 'تنفيذ العمليات المسموح بها داخل بيئة آمنة', status: 'pending' },
      { id: 'test', title: 'اختبار النتيجة ومعالجة الأخطاء', status: 'pending' },
    ],
  };
}
