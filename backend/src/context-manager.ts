import { recall, type MemoryEntry } from './memory-store.js';

export type AgentContext={
  projectId:string|null;
  goal:string;
  relevantFiles:string[];
  memories:MemoryEntry[];
  observations:unknown[];
  constraints:string[];
};

export async function buildAgentContext(input:{projectId:string|null;goal:string;files:string[];observations?:unknown[]}):Promise<AgentContext>{
  const memories=input.projectId?await recall(input.projectId):[];
  const recent=memories.slice(0,20);
  const text=input.goal.toLowerCase();
  const relevantFiles=input.files.filter(file=>{
    const name=file.toLowerCase();
    return text.split(/\s+/).some(token=>token.length>3&&name.includes(token));
  }).slice(0,40);
  return {
    projectId:input.projectId,
    goal:input.goal,
    relevantFiles,
    memories:recent,
    observations:input.observations??[],
    constraints:['Never expose secrets','Never execute outside the project sandbox','High-risk external writes require explicit approval']
  };
}

export function compactContext(context:AgentContext){
  return JSON.stringify({
    goal:context.goal,
    files:context.relevantFiles,
    memories:context.memories.slice(0,12),
    observations:context.observations.slice(-12),
    constraints:context.constraints
  });
}
