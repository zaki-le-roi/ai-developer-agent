import type { AgentResponse, AgentRequest } from '../../shared/contracts.js';
import { createPlan } from './planner.js';
import { prepareExecution } from './orchestrator.js';
import { runCoreLoop } from './core-loop.js';
import { remember } from './memory-store.js';
import { addExecutionLog } from './execution-store.js';
import { createModelProvider } from './model-provider.js';
import { requestApproval, consumeApproval } from './approval-store.js';
import { listWorkspaceFiles } from './workspace-service.js';

export async function handleAgentRequest(request: AgentRequest): Promise<AgentResponse> {
  const projectId = request.projectId ?? null;
  const provider = createModelProvider();
  const workspaceFiles = projectId ? (await listWorkspaceFiles(projectId)).files : [];
  const permissionLevel = request.permissionLevel ?? (/(commit|push|deploy|نشر|رفع|حذف نهائي|delete permanently|production)/i.test(request.message) ? 'approval_required' : 'sandbox');
  const plan = await createPlan(request.message, provider, workspaceFiles);

  await addExecutionLog(projectId, request.message, 'started');
  if (projectId) {
    await remember(projectId, 'task', request.message);
  }

  const needsApproval = permissionLevel === 'approval_required' || permissionLevel === 'real_execution';
  if (needsApproval) {
    if (!request.approvalToken || !(await consumeApproval(request.approvalToken))) {
      const approval = await requestApproval(
        projectId,
        permissionLevel,
        'طلب التنفيذ يتضمن عمليات تتطلب موافقة صريحة قبل المتابعة.',
      );
      return {
        success: false,
        projectId,
        approval,
        plan,
        execution: {
          status: 'awaiting_execution',
          message: 'تحتاج هذه العملية إلى موافقة صريحة قبل التنفيذ.',
          iterations: 0,
          observations: [],
        },
      };
    }
  }

  const executionGate = prepareExecution(plan, { level: permissionLevel });
  if (executionGate.status === 'awaiting_execution') {
    return {
      success: false,
      projectId,
      sessionId: request.sessionId,
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
  const core = await runCoreLoop(projectId ?? undefined, plan, permissionLevel, provider, request.userId);

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
      assistantMessage = await provider.generate(
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
    sessionId: request.sessionId,
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
