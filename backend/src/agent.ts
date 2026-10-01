import type { AgentResponse, AgentRequest } from '../../shared/contracts.js';
import { createPlan } from './planner.js';
import { prepareExecution } from './orchestrator.js';

export function handleAgentRequest(request: AgentRequest): AgentResponse {
  const plan = createPlan(request.message);
  const execution = prepareExecution(plan, { level: 'read_only' });

  return {
    success: true,
    projectId: request.projectId ?? null,
    plan,
    execution,
  };
}
