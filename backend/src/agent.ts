import type { AgentResponse, AgentRequest } from '../../shared/contracts.js';
import { createPlan } from './planner.js';
import { prepareExecution } from './orchestrator.js';
import { runCoreLoop } from './core-loop.js';
import { remember } from './memory-store.js';
import { addExecutionLog } from './execution-store.js';
import { createModelProvider } from './model-provider.js';

export async function handleAgentRequest(request: AgentRequest): Promise<AgentResponse> {
  const projectId = request.projectId ?? null;
  const provider = createModelProvider();
  const plan = await createPlan(request.message, provider);

  await addExecutionLog(projectId, request.message, 'started');
  if (projectId) {
    await remember(projectId, 'task', request.message);
  }

  const executionGate = prepareExecution(plan, { level: 'sandbox' });
  if (executionGate.status !== 'awaiting_execution') {
    return {
      success: false,
      projectId,
      plan,
      execution: {
        status: 'failed',
        message: executionGate.message,
        iterations: 0,
        observations: [],
      },
    };
  }

  for (const step of plan.steps) step.status = 'running';
  const core = await runCoreLoop(projectId ?? undefined, plan, 'sandbox', provider);

  plan.steps.forEach((step, index) => {
    step.status = index < core.iterations
      ? (core.status === 'failed' && index === core.iterations - 1 ? 'failed' : 'completed')
      : 'pending';
  });

  if (core.status === 'failed') {
    const failed = core.observations.find((item) => !item.ok);
    const message = failed?.summary ?? core.message;
    if (projectId) {
      await remember(projectId, 'error', message);
    }
    await addExecutionLog(projectId, message, 'failed');
  } else {
    if (projectId) {
      await remember(projectId, 'test', 'اكتملت دورة التنفيذ والاختبار داخل Sandbox.');
    }
    await addExecutionLog(projectId, core.message, 'completed');
  }

  let assistantMessage: string | undefined;
  if (provider.name !== 'unconfigured') {
    try {
      assistantMessage = await createModelProvider().generate(
        [
          'أنت مكوّن الاستدلال داخل BMZ AI نفسه، ولست وكيلاً خارجياً.',
          'لخّص نتيجة التنفيذ التالية بالعربية الفصحى، ولا تدّعِ تنفيذ شيء غير موجود في البيانات.',
          JSON.stringify(core.observations),
        ].join('\n'),
      );
    } catch (error) {
      await addExecutionLog(
        projectId,
        error instanceof Error ? error.message : 'فشل مكوّن الاستدلال.',
        'failed',
      );
    }
  }

  return {
    success: core.status === 'completed',
    projectId,
    plan,
    assistantMessage,
    execution: {
      status: core.status,
      message: core.message,
      iterations: core.iterations,
      observations: core.observations,
    },
  };
}
