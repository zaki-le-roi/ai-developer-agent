export type ModelTool={name:string;description:string;parameters:Record<string,unknown>};
export type ModelToolCall={name:string;arguments:Record<string,unknown>};
export type ModelProvider={name:string;generate(prompt:string):Promise<string>;generateToolCall?:(prompt:string,tools:ModelTool[])=>Promise<ModelToolCall|null>};

function env(name:string){const value=process.env[name]?.trim();return value||undefined}
const timeoutMs=Number(process.env.BMZ_MODEL_TIMEOUT_MS??60000);

async function fetchWithTimeout(url:string,init:RequestInit){
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),timeoutMs);
  try{return await fetch(url,{...init,signal:controller.signal});}
  catch(error){if(error instanceof Error&&error.name==='AbortError')throw new Error('انتهت مهلة الاتصال بمكوّن النموذج.');throw error}
  finally{clearTimeout(timer)}
}

export function createOllamaProvider():ModelProvider|null{
  const base=env('OLLAMA_BASE_URL')??'http://127.0.0.1:11434';
  const model=env('OLLAMA_MODEL');
  if(!model)return null;
  const root=base.endsWith('/')?base.slice(0,-1):base;
  return {
    name:`ollama:${model}`,
    generate:async(prompt:string)=>{
      const response=await fetchWithTimeout(`${root}/api/generate`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({model,prompt,stream:false})});
      if(!response.ok)throw new Error(`Ollama HTTP ${response.status}`);
      const data=await response.json() as {response?:unknown};
      if(typeof data.response!=='string')throw new Error('Ollama لم يُرجع نصًا صالحًا.');
      return data.response;
    },
    generateToolCall:async(prompt,tools)=>{
      const response=await fetchWithTimeout(`${root}/api/chat`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({
        model,messages:[{role:'user',content:prompt}],stream:false,
        tools:tools.map(tool=>({type:'function',function:{name:tool.name,description:tool.description,parameters:tool.parameters}}))
      })});
      if(!response.ok)throw new Error(`Ollama tool HTTP ${response.status}`);
      const data=await response.json() as {message?:{tool_calls?:Array<{function?:{name?:string;arguments?:unknown}}>}};
      const call=data.message?.tool_calls?.[0]?.function;
      if(!call?.name)return null;
      const args=typeof call.arguments==='string'?JSON.parse(call.arguments):call.arguments;
      if(!args||typeof args!=='object')return null;
      return {name:call.name,arguments:args as Record<string,unknown>};
    }
  };
}

export function createOpenAICompatibleProvider():ModelProvider|null{
  const base=env('MODEL_BASE_URL');const model=env('MODEL_NAME');const key=env('MODEL_API_KEY');
  if(!base||!model)return null;
  const root=base.endsWith('/')?base.slice(0,-1):base;
  const headers={'Content-Type':'application/json',...(key?{Authorization:`Bearer ${key}`}:{})};
  return {
    name:`openai-compatible:${model}`,
    generate:async(prompt:string)=>{
      const response=await fetchWithTimeout(`${root}/chat/completions`,{method:'POST',headers,body:JSON.stringify({model,messages:[{role:'user',content:prompt}],temperature:0})});
      if(!response.ok)throw new Error(`Model HTTP ${response.status}`);
      const data=await response.json() as {choices?:Array<{message?:{content?:unknown}}>};
      const content=data.choices?.[0]?.message?.content;
      if(typeof content!=='string')throw new Error('Model لم يُرجع نصًا صالحًا.');
      return content;
    },
    generateToolCall:async(prompt,tools)=>{
      const response=await fetchWithTimeout(`${root}/chat/completions`,{method:'POST',headers,body:JSON.stringify({
        model,messages:[{role:'user',content:prompt}],temperature:0,
        tools:tools.map(tool=>({type:'function',function:{name:tool.name,description:tool.description,parameters:tool.parameters}})),
        tool_choice:'auto'
      })});
      if(!response.ok)throw new Error(`Model tool HTTP ${response.status}`);
      const data=await response.json() as {choices?:Array<{message?:{tool_calls?:Array<{function?:{name?:string;arguments?:string}}>}}>} ;
      const call=data.choices?.[0]?.message?.tool_calls?.[0]?.function;
      if(!call?.name||!call.arguments)return null;
      const args=JSON.parse(call.arguments);
      if(!args||typeof args!=='object')return null;
      return {name:call.name,arguments:args as Record<string,unknown>};
    }
  };
}

export function createModelProvider():ModelProvider{
  return createOllamaProvider()??createOpenAICompatibleProvider()??{name:'unconfigured',generate:async()=>{throw new Error('لم يتم ضبط Model Runtime. اضبط OLLAMA_MODEL أو MODEL_BASE_URL/MODEL_NAME.')},generateToolCall:async()=>null};
}
