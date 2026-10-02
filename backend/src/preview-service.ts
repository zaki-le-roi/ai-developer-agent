import {spawn,ChildProcess} from 'node:child_process';
import {randomBytes} from 'node:crypto';
import {promises as fs} from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import {createSandboxWorkspace} from './sandbox-core.js';

type Preview={projectId:string;port:number;token:string;process:ChildProcess;startedAt:string};
const previews=new Map<string,Preview>();
let nextPort=4600;

async function detectCommand(root:string,port:number){
  try{
    const pkg=JSON.parse(await fs.readFile(path.join(root,'package.json'),'utf8')) as {scripts?:Record<string,string>};
    if(pkg.scripts?.dev)return {command:'npm',args:['run','dev','--','--host','0.0.0.0','--port',String(port)]};
    if(pkg.scripts?.start)return {command:'npm',args:['run','start','--','--host','0.0.0.0','--port',String(port)]};
  }catch{}
  try{await fs.access(path.join(root,'index.html'));return {command:process.platform==='win32'?'npx.cmd':'npx',args:['http-server','-p',String(port),'-a','0.0.0.0']};}catch{}
  throw new Error('لا يوجد dev/start script أو index.html صالح للمعاينة.');
}

export async function startPreview(projectId:string){
  const existing=previews.get(projectId);
  if(existing&&!existing.process.killed)return {port:existing.port,token:existing.token,status:'running'};
  const workspace=await createSandboxWorkspace(projectId);
  const spec=await detectCommand(workspace.directory,nextPort++);
  const child=spawn(spec.command,spec.args,{cwd:workspace.directory,shell:false,env:{...process.env,NODE_ENV:'development'},stdio:['ignore','pipe','pipe']});
  const token=randomBytes(24).toString('base64url');
  const item:Preview={projectId,port:nextPort-1,token,process:child,startedAt:new Date().toISOString()};
  previews.set(projectId,item);
  child.on('exit',()=>{if(previews.get(projectId)?.process===child)previews.delete(projectId)});
  return {port:item.port,token:item.token,status:'starting',urlPath:`/preview/${projectId}/`};
}

export function previewInfo(projectId:string,token:string){
  const item=previews.get(projectId);
  if(!item||item.token!==token)return null;
  return item;
}

export function stopPreview(projectId:string){
  const item=previews.get(projectId);
  if(!item)return false;
  item.process.kill('SIGTERM');previews.delete(projectId);return true;
}

export function proxyPreview(item:Preview,req:any,res:any,pathName:string){
  const request=http.request({hostname:'127.0.0.1',port:item.port,path:pathName||'/',method:req.method,headers:{...req.headers,host:`127.0.0.1:${item.port}`}},upstream=>{
    res.writeHead(upstream.statusCode??502,upstream.headers);upstream.pipe(res);
  });
  request.on('error',error=>{res.statusCode=502;res.end(error instanceof Error?error.message:'Preview unavailable')});
  req.pipe(request);
}