export type PermissionLevel = 'read_only' | 'sandbox' | 'approval_required' | 'real_execution';

export type PlanStepStatus = 'pending' | 'running' | 'completed' | 'failed';

export type AgentAction =
  | { type: 'inspect_workspace' }
  | { type: 'list_files' }
  | { type: 'read_file'; path: string }
  | { type: 'write_file'; path: string; content: string }
  | { type: 'run_command'; command: string; args?: string[] }
  | { type: 'scaffold_app'; platform?: 'android' }
  | { type: 'build_android' }
  | { type: 'preview_web' }
  | { type: 'github_commit'; message?: string }
  | { type: 'test' };

export type AgentPlanStep = { id: string; title: string; status: PlanStepStatus; action?: AgentAction };
export type AgentPlan = { goal: string; steps: AgentPlanStep[] };
export type AgentRequest = { message: string; projectId?: string; sessionId?: string; permissionLevel?: PermissionLevel; approvalToken?: string };
export type CoreAction = AgentAction;
export type CoreObservation = { action: CoreAction['type']; ok: boolean; summary: string; stdout?: string; stderr?: string };
export type AgentExecution = { status: 'awaiting_execution' | 'running' | 'completed' | 'failed'; message: string; iterations: number; observations: CoreObservation[] };
export type ApprovalRequest = { id: string; projectId: string | null; action: string; reason: string; createdAt: string; expiresAt: string; approved: boolean };
export type AgentSession = { id: string; projectId: string | null; createdAt: string; updatedAt: string };
export type AgentResponse = { success: boolean; projectId: string | null; sessionId?: string; approval?: ApprovalRequest; plan?: AgentPlan; execution?: AgentExecution; assistantMessage?: string; error?: string };
