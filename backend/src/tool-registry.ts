import type { AgentAction } from '../../shared/contracts.js';

export type ToolRisk='low'|'medium'|'high'|'critical';
export type ToolDefinition<T extends AgentAction=AgentAction>={
  name:T['type'];
  description:string;
  risk:ToolRisk;
  inputSchema:Record<string,unknown>;
  validate:(input:unknown)=>input is T;
};

const definitions:ToolDefinition[]=[
{name:'inspect_workspace',description:'Inspect the project workspace.',risk:'low',inputSchema:{type:'object'},validate:v=>!!v&&typeof v==='object'},
{name:'list_files',description:'List project files.',risk:'low',inputSchema:{type:'object'},validate:v=>!!v&&typeof v==='object'},
{name:'read_file',description:'Read a file from the project sandbox.',risk:'low',inputSchema:{type:'object',required:['path'],properties:{path:{type:'string'}}},validate:v=>!!v&&typeof v==='object'&&typeof (v as any).path==='string'},
{name:'write_file',description:'Write a file in the project sandbox.',risk:'high',inputSchema:{type:'object',required:['path','content'],properties:{path:{type:'string'},content:{type:'string'}}},validate:v=>!!v&&typeof v==='object'&&typeof (v as any).path==='string'&&typeof (v as any).content==='string'},
{name:'delete_file',description:'Delete a project file.',risk:'critical',inputSchema:{type:'object',required:['path'],properties:{path:{type:'string'}}},validate:v=>!!v&&typeof v==='object'&&typeof (v as any).path==='string'},
{name:'run_command',description:'Run an allowlisted command in the sandbox.',risk:'high',inputSchema:{type:'object',required:['command'],properties:{command:{type:'string'},args:{type:'array',items:{type:'string'}}}},validate:v=>!!v&&typeof v==='object'&&typeof (v as any).command==='string'&&((v as any).args===undefined||Array.isArray((v as any).args))},
{name:'scaffold_app',description:'Create a supported application scaffold.',risk:'high',inputSchema:{type:'object'},validate:v=>!!v&&typeof v==='object'},
{name:'build_android',description:'Build the Android application.',risk:'high',inputSchema:{type:'object'},validate:v=>!!v&&typeof v==='object'},
{name:'preview_web',description:'Prepare the web project for live preview.',risk:'medium',inputSchema:{type:'object'},validate:v=>!!v&&typeof v==='object'},
{name:'github_commit',description:'Commit project changes to GitHub.',risk:'critical',inputSchema:{type:'object',properties:{message:{type:'string'}}},validate:v=>!!v&&typeof v==='object'},
{name:'test',description:'Run the project verification test.',risk:'medium',inputSchema:{type:'object'},validate:v=>!!v&&typeof v==='object'},
];

export function listTools(){return definitions.map(({validate,...tool})=>tool);}
export function getTool(name:string){return definitions.find(tool=>tool.name===name);}
export function validateToolCall(name:string,input:unknown):AgentAction{
  const tool=getTool(name);
  if(!tool) throw new Error(`أداة غير معروفة: ${name}`);
  if(!tool.validate(input)) throw new Error(`مدخلات غير صالحة للأداة: ${name}`);
  return input as AgentAction;
}
export function toolPolicy(name:string){return getTool(name)?.risk??'critical';}
