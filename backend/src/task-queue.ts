import { createTask, updateTask, getTask } from './task-store.js';
import { handleAgentRequest } from './agent.js';
import { publish } from './event-bus.js';

const active = new Set<string>();
const cancelled = new Set<string>();

export async function enqueueAgentTask(userId:string, projectId:string|null, message:string){
  const task=await createTask(userId,projectId,message);
  publish({type:'task.queued',projectId,taskId:task.id,data:{message}});
  return task;
}

export async function runTask(id:string,userId:string){
  if(active.has(id)) return;
  active.add(id);
  try{
    const task=await getTask(id,userId);
    if(!task) return;
    if(task.status==='cancelled') return;
    await updateTask(id,userId,{status:'running'});
    publish({type:'task.started',projectId:task.projectId,taskId:id,data:{message:task.message}});
    if(cancelled.has(id)) { await updateTask(id,userId,{status:'cancelled'}); return; }
    const result=await handleAgentRequest({message:task.message,projectId:task.projectId??undefined,userId});
    if(cancelled.has(id)) {
      await updateTask(id,userId,{status:'cancelled',result});
      publish({type:'task.cancelled',projectId:task.projectId,taskId:id,data:{result}});
      return;
    }
    const status=result.approval?'waiting_approval':result.success?'completed':'failed';
    await updateTask(id,userId,{status,result,error:result.error});
    publish({type:`task.${status}`,projectId:task.projectId,taskId:id,data:{result}});
  }catch(error){
    const message=error instanceof Error?error.message:String(error);
    const task=await getTask(id,userId);
    if(task) await updateTask(id,userId,{status:'failed',error:message});
    publish({type:'task.failed',projectId:task?.projectId,taskId:id,data:{error:message}});
  }finally{active.delete(id);cancelled.delete(id)}
}

export async function cancelTask(id:string,userId:string){
  const task=await getTask(id,userId);
  if(!task) return null;
  if(task.status==='completed'||task.status==='failed'||task.status==='cancelled') return task;
  cancelled.add(id);
  return updateTask(id,userId,{status:'cancelled'});
}