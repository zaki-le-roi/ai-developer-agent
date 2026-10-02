export type ModelProvider={name:string;generate(prompt:string):Promise<string>};
function env(name:string){const value=process.env[name]?.trim();return value||undefined}

export function createOllamaProvider():ModelProvider|null{
  const base=env('OLLAMA_BASE_URL')??'http://127.0.0.1:11434';
  const model=env('OLLAMA_MODEL');
  if(!model)return null;
  return {name:`ollama:${model}`,generate:async(prompt:string)=>{
    const response=await fetch(`${base.endsWith('/')?base.slice(0,-1):base}/api/generate`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({model,prompt,stream:false})});
    if(!response.ok)throw new Error(`Ollama HTTP ${response.status}`);
    const data=await response.json() as {response?:unknown};
    if(typeof data.response!=='string')throw new Error('Ollama لم يُرجع نصًا صالحًا.');
    return data.response;
  }};
}

export function createOpenAICompatibleProvider():ModelProvider|null{
  const base=env('MODEL_BASE_URL');const model=env('MODEL_NAME');const key=env('MODEL_API_KEY');
  if(!base||!model)return null;
  return {name:`openai-compatible:${model}`,generate:async(prompt:string)=>{
    const response=await fetch(`${base.replace(/\\/$/,'')}/chat/completions`,{method:'POST',headers:{'Content-Type':'application/json',...(key?{Authorization:`Bearer ${key}`}: {})},body:JSON.stringify({model,messages:[{role:'user',content:prompt}],temperature:0})});
    if(!response.ok)throw new Error(`Model HTTP ${response.status}`);
    const data=await response.json() as {choices?:Array<{message?:{content?:unknown}}>};
    const content=data.choices?.[0]?.message?.content;
    if(typeof content!=='string')throw new Error('Model لم يُرجع نصًا صالحًا.');
    return content;
  }};
}

export function createModelProvider():ModelProvider{
  return createOllamaProvider()??createOpenAICompatibleProvider()??{name:'unconfigured',generate:async()=>{throw new Error('لم يتم ضبط Model Runtime. اضبط OLLAMA_MODEL أو MODEL_BASE_URL/MODEL_NAME.')}};
}
