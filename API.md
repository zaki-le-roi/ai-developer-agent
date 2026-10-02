# BMZ AI API

- `GET /health`
- `POST /api/auth/register`
- `POST /api/auth/login`
- `GET /api/auth/me`
- `GET /api/projects`
- `POST /api/projects`
- `POST /api/projects/import-github`
- `GET /api/projects/:id/files`
- `GET /api/projects/:id/file?path=...`
- `PUT /api/projects/:id/file`
- `DELETE /api/projects/:id/file`
- `POST /api/projects/:id/terminal`
- `POST /api/agent`
- `POST /api/tasks`
- `GET /api/tasks`
- `GET /api/tasks/:id`
- `POST /api/tasks/:id/cancel`
- `GET /api/events` (SSE)
- `POST /api/workflows/run`
- `POST /api/approvals/:id/approve`

Sensitive write operations should be placed behind authentication and permission middleware before public deployment.
