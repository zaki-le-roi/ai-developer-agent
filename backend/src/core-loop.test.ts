import { strict as assert } from 'node:assert';
import { runCoreLoop } from './core-loop.js';

const plan = {
  goal: 'اختبار دورة BMZ AI',
  steps: [
    { id: 'understand', title: 'فهم المهمة والمتطلبات', status: 'pending' as const },
    { id: 'plan', title: 'إعداد خطة تنفيذ قابلة للتحقق', status: 'pending' as const },
    { id: 'execute', title: 'تنفيذ العمليات المسموح بها داخل بيئة آمنة', status: 'pending' as const },
    { id: 'test', title: 'اختبار النتيجة ومعالجة الأخطاء', status: 'pending' as const },
  ],
};

const result = await runCoreLoop(undefined, plan, 'sandbox');

assert.equal(result.status, 'completed');
assert.equal(result.observations.some((item) => item.action === 'write_file' && item.ok), true);
assert.equal(result.observations.some((item) => item.action === 'inspect_workspace' && item.ok), true);
assert.equal(result.observations.some((item) => item.action === 'test' && item.ok), true);
console.log('BMZ AI core loop test: OK');
