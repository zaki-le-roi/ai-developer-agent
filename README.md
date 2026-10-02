# BMZ AI

BMZ AI is a real mobile developer-agent platform.

**B = Business, M = Market, Z = Zaki, AI = Artificial Intelligence.**

## Repository structure

- `mobile/` — Expo/React Native phone application and control surface.
- `backend/` — independent Node.js/TypeScript API on port **4000**.
- `sandbox/` — controlled workspace and command-execution layer; it is not a full OS/container isolation boundary.
- `shared/` — shared contracts.
- `web/` — legacy/reference code; it is not used as the BMZ AI backend.

## Current foundation

- Real phone UI with Expo SDK 55.
- Independent Express + TypeScript backend.
- `GET /health` health check.
- `POST /api/agent` agent entry point.
- Planner, Orchestrator and Permissions foundations.
- Default backend port: **4000**.

## Target execution flow

```
Phone → BMZ AI Core → Planner → Orchestrator → Permissions → Workspace/Sandbox → Tests → Repair Loop → Result → Phone
```

Sensitive operations require explicit permission. Secrets belong on the backend, never in the mobile application.

See [ARCHITECTURE.md](./ARCHITECTURE.md).
