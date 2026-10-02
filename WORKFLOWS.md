# Workflows

Workflows are directed graphs of executable nodes. A workflow is submitted to `POST /api/workflows/run` with a project ID.

Implemented executable node types:

- `RunCommand` — executes an allowlisted Sandbox command.
- `ReadFile` — reads a project file.
- `WriteFile` — writes a project file.
- `Delay` — bounded delay.

Every node publishes start/completion/failure events. Cycles and blocked graphs are rejected.

The engine is intentionally adapter-based so triggers, GitHub, HTTP, messaging, scheduling and AI nodes can be added without coupling them to the mobile UI.
