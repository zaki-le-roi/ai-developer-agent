import type { AgentResponse, AgentRequest } from '../../shared/contracts.js';
import { createPlan } from './planner.js';
import { prepareExecution } from './orchestrator.js';
import { sandboxCheck } from './sandbox-core.js';
import { remember } from './memory-store.js';
import { addExecutionLog } from './execution-store.js';
import { createModelProvider } from './model-provider.js';

export async function handleAgentRequest(request: AgentRequest): Promise<AgentResponse> {
  const plan = createPlan(request.message);
  await addExecutionLog(request.projectId ?? null, request.message, 'started');
  const projectId = request.projectId ?? null;

  if (projectId) {
    remember(projectId, 'task', request.message);
  }

  const execution = prepareExecution(plan, { level: 'sandbox' });
  if (execution.status !== 'awaiting_execution') {
    return { success: false, projectId, plan, execution };
  }

  const test = await sandboxCheck(projectId ?? undefined);
  let assistantMessage: string | undefined;
  if (process.env.OPENAI_API_KEY) {
    try {
      assistantMessage = await createModelProvider().generate(
        `أنت BMZ AI. حلل طلب المستخدم التالي وقدّم توجيهًا عمليًا موجزًا للخطوة التالية بعد التحقق من Sandbox:\n${request.message}`,
      );
    } catch (error) {
      await addExecutionLog(projectId, error instanceof Error ? error.message : 'فشل مزود النموذج.', 'failed');
    }
  }
  if (projectId) {
    await remember(projectId, 'test', test.ok ? 'نجح اختبار Sandbox.' : 'فشل اختبار Sandbox.');
  }
  await addExecutionLog(projectId, test.ok ? 'تم تنفيذ والتحقق من Sandbox.' : 'فشل التحقق من Sandbox.', test.ok ? 'completed' : 'failed');

  return {
    success: test.ok,
    projectId,
    plan,
    assistantMessage,
    execution: {
      status: test.ok ? 'completed' : 'failed',
      message: test.ok
        ? 'تم تنفيذ والتحقق من بيئة Sandbox بنجاح.'
        : 'فشل التحقق من بيئة Sandbox.',
    },
  };
}
