import { strict as assert } from 'node:assert';
import { runWorkflow } from './workflow-engine.js';
import { grantPermission } from './permission-store.js';

const projectId='workflow-test';
const userId='workflow-test-user';
await grantPermission(userId,projectId,'READ_PROJECT');
await grantPermission(userId,projectId,'WRITE_PROJECT');

const result=await runWorkflow({id:'test',name:'test',nodes:[
{id:'a',type:'WriteFile',config:{path:'workflow-test.txt',content:'ok'}},
{id:'b',type:'ReadFile',config:{path:'workflow-test.txt'}},
{id:'c',type:'Condition',config:{value:true}},
{id:'d',type:'Log',config:{message:'done'}}
],edges:[{from:'a',to:'b'},{from:'b',to:'c'},{from:'c',to:'d'}]},projectId,userId);
assert.equal((result.b as {content:string}).content,'ok');
assert.equal((result.c as {result:boolean}).result,true);
console.log('BMZ AI workflow test: OK');