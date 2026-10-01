# BMZ AI Architecture

BMZ AI = Business + Market + Zaki + AI.

## Target architecture

```
Phone
  ↓
Backend API
  ↓
Agent
  ↓
Planner
  ↓
Orchestrator
  ↓
Permissions
  ↓
Sandbox
  ├── Files
  ├── Terminal
  ├── Tests
  └── Error/Fix loop
  ↓
Preview / Result
  ↓
Phone
```

## Components

- `mobile/`: real phone application and control surface.
- `backend/`: platform brain and API.
- `sandbox/`: isolated project execution environment.
- `shared/`: contracts shared by mobile/backend/sandbox.
- `web/`: legacy/reference application and is not the BMZ AI mobile backend.

## Permission model

1. Read-only.
2. Sandbox execution.
3. Explicit approval for sensitive operations.
4. Real execution only after authorization.

## Self-improvement

BMZ AI may record tasks, attempts, errors, fixes, tests and results, then evaluate changes inside the sandbox. Meaningful system changes require explicit authorization; the agent must not arbitrarily rewrite its own security boundaries.

## Development rule

No production secrets in the mobile app. Backend secrets stay server-side.
