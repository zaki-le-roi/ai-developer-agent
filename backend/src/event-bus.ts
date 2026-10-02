export type BmzEvent={type:string;projectId?:string|null;taskId?:string|null;timestamp:string;data:Record<string,unknown>};
type Listener=(event:BmzEvent)=>void;
const listeners=new Set<Listener>();
export function publish(event:Omit<BmzEvent,'timestamp'>){const value={...event,timestamp:new Date().toISOString()};for(const listener of listeners) listener(value);return value;}
export function subscribe(listener:Listener){listeners.add(listener);return()=>listeners.delete(listener);}
