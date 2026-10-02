# Security

Current controls include path traversal protection, command allowlisting, shell-free process spawning, output bounds, timeouts, API rate limiting, secret masking, approval gates for GitHub commits, password hashing with scrypt, hashed session tokens, and SSE lifecycle cleanup.

Known remaining production hardening: move sandbox processes into a container/VM boundary, add network egress policy, complete RBAC/permission persistence, encrypt integration credentials with an external secret store, add CSRF protections for cookie sessions if cookies are introduced, and complete SSRF/domain policy for browser/HTTP tools.

The application must not claim host-level isolation until Docker/VM isolation is enabled.
