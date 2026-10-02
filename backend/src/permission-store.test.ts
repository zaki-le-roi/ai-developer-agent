import { strict as assert } from 'node:assert';
process.env.BMZ_DATA_ROOT=process.env.BMZ_DATA_ROOT??'/tmp/bmz-ai-test';
const {grantPermission,hasPermission,revokePermission}=await import('./permission-store.js');
const user='permission-test';
const grant=await grantPermission(user,null,'RUN_COMMAND');
assert.equal(await hasPermission(user,null,'RUN_COMMAND'),true);
assert.equal(await revokePermission(grant.id,user),true);
assert.equal(await hasPermission(user,null,'RUN_COMMAND'),false);
console.log('BMZ AI permission test: OK');