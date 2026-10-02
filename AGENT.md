# Agent Runtime

The Agent receives a natural-language task, creates a plan, passes actions through permission checks, executes tools in the Sandbox, observes results, requests repair actions when a configured Model Runtime is available, and verifies the result.

Model Runtime configuration:

- `OLLAMA_BASE_URL` (default `http://127.0.0.1:11434`)
- `OLLAMA_MODEL`
- or `MODEL_BASE_URL`, `MODEL_NAME`, optional `MODEL_API_KEY`

No cloud AI provider is mandatory.

Agent execution is bounded by an iteration limit. Tool outputs are masked for common API-token patterns before being returned to the Agent/UI.
