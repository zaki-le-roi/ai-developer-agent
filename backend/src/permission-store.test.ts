import { strict as assert } from 'node:assert';
import { grantPermission,hasPermission,revokePermission } from './permission-store.js';
process.env.BMZ_DATA_ROOT=process.env.BMZ_DATA_ROOT??'/tmp/bmz-ai-test';
const user='permission-test';
const grant=await grantPermission(user,null,'RUN_COMMAND');
assert.equal(await hasPermission(user,null,'RUN_COMMAND'),true);
assert.equal(await revokePermission(grant.id,user),true);
assert.equal(await hasPermission(user,null,'RUN_COMMAND'),false);
console.log('BMZ AI permission test: OK');