import type { PermissionLevel } from '../../shared/contracts.js';

export type PermissionContext = {
  level: PermissionLevel;
};

export function canRead(context: PermissionContext): boolean {
  return true;
}

export function canExecuteInSandbox(context: PermissionContext): boolean {
  return context.level === 'sandbox' ||
    context.level === 'approval_required' ||
    context.level === 'real_execution';
}

export function requiresApproval(context: PermissionContext): boolean {
  return context.level === 'approval_required' || context.level === 'real_execution';
}
