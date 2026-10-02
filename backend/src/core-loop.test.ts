import { strict as assert } from 'node:assert';
import { runCoreLoop } from './core-loop.js';
import { createPlan } from './planner.js';

const plan = {
  goal: 'اختبار دورة BMZ AI',
  steps: [
    { id: 'understand', title: 'فهم المهمة والمتطلبات', status: 'pending' as const, action: { type: 'inspect_workspace' as const } },
    { id: 'plan', title: 'إعداد خطة تنفيذ قابلة للتحقق', status: 'pending' as const },
    { id: 'execute', title: 'تنفيذ العمليات المسموح بها داخل بيئة آمنة', status: 'pending' as const, action: { type: 'write_file' as const, path: '.bmz-test-task.txt', content: 'ok' } },
    { id: 'test', title: 'اختبار النتيجة ومعالجة الأخطاء', status: 'pending' as const, action: { type: 'test' as const } },
  ],
};

const planned = await createPlan('أنشئ مهمة داخل مساحة العمل');
assert.equal(planned.steps.some((step) => step.action?.type === 'write_file'), true);
assert.equal(planned.steps.some((step) => step.action?.type === 'test'), true);

const result = await runCoreLoop(undefined, plan, 'sandbox');

assert.equal(result.status, 'completed');
assert.equal(result.observations.some((item) => item.action === 'write_file' && item.ok), true);
assert.equal(result.observations.some((item) => item.action === 'inspect_workspace' && item.ok), true);
assert.equal(result.observations.some((item) => item.action === 'test' && item.ok), true);
console.log('BMZ AI core loop test: OK');
