import type { AgentPlan } from '../../shared/contracts.js';
import { canExecuteInSandbox, type PermissionContext } from './permissions.js';

export function prepareExecution(
  plan: AgentPlan,
  permissions: PermissionContext,
): { status: 'awaiting_execution'; message: string } {
  if (!canExecuteInSandbox(permissions)) {
    return {
      status: 'awaiting_execution',
      message: 'الخطة جاهزة، لكن التنفيذ يحتاج إلى صلاحية Sandbox.',
    };
  }

  return {
    status: 'awaiting_execution',
    message: `الخطة جاهزة للتنفيذ داخل Sandbox: ${plan.steps.length} خطوات.`,
  };
}
