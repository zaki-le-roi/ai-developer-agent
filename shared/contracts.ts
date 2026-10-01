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

export type AgentResponse = {
  success: boolean;
  projectId: string | null;
  plan?: AgentPlan;
  execution?: {
    status: 'awaiting_execution' | 'completed' | 'failed';
    message: string;
  };
  assistantMessage?: string;
  error?: string;
};
