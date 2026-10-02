export type PermissionLevel = 'read_only' | 'sandbox' | 'approval_required' | 'real_execution';

export type PlanStepStatus = 'pending' | 'running' | 'completed' | 'failed';

export type AgentPlanStep = {
  id: string;
  title: string;
  status: PlanStepStatus;
};

export type AgentPlan = {
  goal: string;
  steps: AgentPlanStep[];
};

export type AgentRequest = {
  message: string;
  projectId?: string;
};

export type CoreAction =
  | { type: 'inspect_workspace' }
  | { type: 'read_file'; path: string }
  | { type: 'write_file'; path: string; content: string }
  | { type: 'run_command'; command: string; args?: string[] }
  | { type: 'test' };

export type CoreObservation = {
  action: CoreAction['type'];
  ok: boolean;
  summary: string;
  stdout?: string;
  stderr?: string;
};

export type AgentExecution = {
  status: 'awaiting_execution' | 'running' | 'completed' | 'failed';
  message: string;
  iterations: number;
  observations: CoreObservation[];
};

export type AgentResponse = {
  success: boolean;
  projectId: string | null;
  plan?: AgentPlan;
  execution?: AgentExecution;
  assistantMessage?: string;
  error?: string;
};
