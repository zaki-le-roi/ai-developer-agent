# BMZ AI

BMZ AI is a real AI Developer Agent + Workspace + Workflow Automation platform.

## Implemented foundation

- Real authentication and user-scoped projects.
- Real file workspace: read/write/delete/create directory/rename/search.
- Real allowlisted Sandbox terminal with timeouts and shell disabled.
- Agent planning + execution loop with local-model abstraction.
- Ollama support without mandatory external AI provider.
- Real task queue with Pending/Running/Paused/Waiting Approval/Failed/Completed/Cancelled and Pause/Resume/Retry/Cancel APIs.
- Real Workflow engine with validation, executable nodes, Webhook HMAC and Scheduler.
- GitHub OAuth and encrypted per-user credentials.
- GitHub repository read, branch, issue, PR, Actions and approved write operations.
- Real Preview process lifecycle and token-protected proxy.
- Playwright Browser Automation behind explicit permission and domain allowlists.
- Telegram Bot integration with encrypted token storage.
- Real-time event bus/SSE plus mobile state polling.
- Docker backend/worker/local Ollama development stack.
- CI TypeScript/build/test checks and Android/mobile build pipeline.

## Local model

Set `OLLAMA_BASE_URL` and `OLLAMA_MODEL` to use a local Ollama runtime. A compatible model endpoint can be used through `MODEL_BASE_URL`, `MODEL_NAME`, and optional `MODEL_API_KEY`.

No cloud AI provider is required by the architecture.

## Run

Backend: `cd backend && npm install && npm run build && npm start`.

Mobile: `cd mobile && npm install`, then use the Expo/Gradle workflow.

For production, run project execution inside containers/VMs, use durable database storage, HTTPS, secret management, network egress policy, and resource quotas.
