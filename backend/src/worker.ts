import { listAllTasks } from './task-store.js';
import { runTask } from './task-queue.js';

const POLL_MS = Math.max(500, Number(process.env.BMZ_WORKER_POLL_MS ?? 1500));
let busy = false;

async function tick() {
  if (busy) return;
  busy = true;
  try {
    const tasks = await listAllTasks();
    const pending = tasks.filter(task => task.status === 'pending').slice(0, 4);
    await Promise.all(pending.map(task => runTask(task.id, task.userId)));
  } finally {
    busy = false;
  }
}

console.log(`BMZ AI Worker started; polling every ${POLL_MS}ms`);
void tick();
setInterval(() => { void tick(); }, POLL_MS);