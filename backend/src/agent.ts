import type { AgentResponse, AgentRequest } from '../../shared/contracts.js';
import { createPlan } from './planner.js';
import { prepareExecution } from './orchestrator.js';
import { sandboxCheck } from './sandbox-core.js';
import { remember } from './memory-store.js';

export async function handleAgentRequest(request: AgentRequest): Promise<AgentResponse> {
  const plan = createPlan(request.message);
  const projectId = request.projectId ?? null;

  if (projectId) {
    remember(projectId, 'task', request.message);
  }

  const execution = prepareExecution(plan, { level: 'sandbox' });
  if (execution.status !== 'awaiting_execution') {
    return { success: false, projectId, plan, execution };
  }

  const test = await sandboxCheck(projectId ?? undefined);
  if (projectId) {
    await remember(projectId, 'test', test.ok ? 'نجح اختبار Sandbox.' : 'فشل اختبار Sandbox.');
  }

  return {
    success: test.ok,
    projectId,
    plan,
    execution: {
      status: test.ok ? 'completed' : 'failed',
      message: test.ok
        ? 'تم تنفيذ والتحقق من بيئة Sandbox بنجاح.'
        : 'فشل التحقق من بيئة Sandbox.',
    },
  };
}
