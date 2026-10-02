export type PermissionLevel='read_only'|'sandbox'|'approval_required'|'real_execution';
export type AgentAction={type:'inspect_workspace'};
export type AgentRequest={message:string;projectId?:string;sessionId?:string;permissionLevel?:PermissionLevel;approvalToken?:string};
