import type { AgentPlan, CoreAction, PermissionLevel } from '../../shared/contracts.js';
import { canExecuteInSandbox, type PermissionContext } from './permissions.js';

export type ExecutionDecision =
  | { allowed: true }
  | { allowed: false; reason: string };

export function prepareExecution(
  plan: AgentPlan,
  permissions: PermissionContext,
): { status: 'ready' | 'awaiting_execution'; message: string } {
  if (!canExecuteInSandbox(permissions)) {
    return { status: 'awaiting_execution', message: 'الخطة جاهزة، لكن التنفيذ يحتاج إلى صلاحية Sandbox.' };
  }
  return { status: 'ready', message: `الخطة جاهزة للتنفيذ داخل Sandbox: ${plan.steps.length} خطوات.` };
}

export function authorizeAction(action: CoreAction, level: PermissionLevel): ExecutionDecision {
  if (level === 'read_only') {
    return action.type === 'inspect_workspace' || action.type === 'list_files' || action.type === 'read_file'
      ? { allowed: true }
      : { allowed: false, reason: 'هذا الإجراء يحتاج إلى صلاحية تنفيذ.' };
  }
  if (action.type === 'github_commit' && level !== 'approval_required') return { allowed: false, reason: 'إرسال التغييرات إلى GitHub يحتاج إلى approval_required.' };
  if (level === 'sandbox' || level === 'approval_required') {
    return action.type === 'inspect_workspace' || action.type === 'list_files' || action.type === 'read_file' || action.type === 'write_file' || action.type === 'run_command' || action.type === 'scaffold_app' || action.type === 'build_android' || action.type === 'preview_web' || action.type === 'github_commit' || action.type === 'test'
      ? { allowed: true }
      : { allowed: false, reason: 'الإجراء غير مدعوم في Sandbox.' };
  }
  return { allowed: false, reason: 'مستوى real_execution غير مفعّل: لا يسمح BMZ AI حاليًا بتنفيذ عمليات خارج Sandbox.' };
}

export function classifyMessage(message: string): 'inspect' | 'build' | 'test' {
  const value = message.toLowerCase();
  if (/(اختبر|test|فحص|تحقق)/i.test(value)) return 'test';
  if (/(اقرأ|اعرض|افحص|تحليل|inspect|read)/i.test(value)) return 'inspect';
  return 'build';
}