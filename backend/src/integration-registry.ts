export type IntegrationContext={userId:string;projectId?:string|null};
export type Integration={id:string;name:string;version:string;capabilities:string[];connect(ctx:IntegrationContext,config:Record<string,unknown>):Promise<void>;execute(ctx:IntegrationContext,action:string,input:unknown):Promise<unknown>};
const registry=new Map<string,Integration>();
export function registerIntegration(integration:Integration){if(registry.has(integration.id))throw new Error('Integration موجودة مسبقًا.');registry.set(integration.id,integration);}
export function listIntegrations(){return [...registry.values()].map(x=>({id:x.id,name:x.name,version:x.version,capabilities:x.capabilities}));}
export function getIntegration(id:string){return registry.get(id);}
