# Workflows

BMZ AI Workflows are executable directed graphs, not drawings.

Implemented nodes:
- ManualTrigger / WebhookTrigger / ScheduleTrigger
- RunCommand
- ReadFile / WriteFile / DeleteFile
- Condition / Loop / Delay
- HttpRequest with HTTPS + allowlist/private-network protection
- Log

Every node is validated, executed in the Sandbox where applicable, and publishes start/completion/failure events. Stored workflows are user/project scoped. Webhook triggers require an HMAC signature.

The registry is designed for additional GitHub, AI, messaging, database and notification adapters without coupling them to the mobile UI.
