# Integrations

Implemented server-side integrations:
- GitHub API and OAuth credential storage.
- GitHub repository read, branch, issue, PR, Actions, commit and repository creation operations with approval gates where required.
- Telegram Bot messaging with encrypted server-side credentials and SEND_MESSAGE permission.
- Playwright Browser Automation with BROWSER_AUTOMATION permission and HTTPS domain allowlists.
- Generic Integration registry for future adapters.

Credentials never belong in the mobile application. Integration actions are exposed through authenticated backend APIs and permission checks.
