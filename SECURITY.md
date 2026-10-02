# Security

Implemented controls include:
- scrypt password hashing and hashed bearer sessions.
- Strict user/project ownership checks.
- Server-side encrypted credentials using AES-256-GCM.
- GitHub OAuth state signing and server-side tokens.
- Shell-free command execution and command allowlisting.
- Sandbox path traversal protection.
- Output bounds and execution timeouts.
- API rate limiting.
- Approval gates for sensitive GitHub operations.
- Webhook HMAC verification.
- HTTPS/domain restrictions for HTTP and browser automation.
- Browser session isolation.
- Mobile credentials stored with Expo SecureStore.

Important deployment boundary: the current Node process sandbox is not a VM/container security boundary. Docker/VM isolation is supported as the deployment architecture, but arbitrary untrusted workloads must not be exposed publicly until host-level isolation and resource/network quotas are enforced.
