# BMZ AI API

- `GET /health`
- `POST /api/auth/register`
- `POST /api/auth/login`
- `GET /api/auth/me`
- `POST /api/auth/logout`
- `GET /api/permissions`
- `POST /api/permissions`
- `DELETE /api/permissions/:id`
- `GET /api/github/:id/branches`
- `GET /api/github/:id/issues`
- `GET /api/github/:id/prs`
- `GET /api/github/:id/actions`
- `POST /api/webhooks`
- `POST /api/webhooks/trigger/:token`
- `GET /api/schedules`
- `POST /api/schedules`
- `POST /api/schedules/:id/disable`
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


## إضافات التشغيل الحالية
- `GET /api/github/oauth/start` — يبدأ GitHub OAuth للمستخدم المصادق.
- `GET /api/github/oauth/callback` — يستقبل OAuth callback ويحفظ credential مشفرًا.
- `GET /api/github/oauth/status` — حالة اتصال GitHub.
- `GET/POST/PUT/DELETE /api/workflows...` — إدارة Workflows محفوظة لكل مستخدم.
- `POST /api/workflows/run` — تنفيذ Workflow محفوظ أو تعريف Workflow مباشر.
- `POST /api/projects/:id/preview/start` و`/preview/stop` — دورة حياة Preview حقيقي داخل Sandbox.
- `GET /preview/:id/...` — Proxy للـ Preview بعد token تحقق.
- `POST /api/tasks/:id/cancel` — إلغاء مهمة معروفة للمستخدم.
- `backend/src/worker.ts` / `npm run worker` — Worker منفصل لطوابير المهام.
- Model Runtime يدعم Ollama عبر `OLLAMA_BASE_URL` و`OLLAMA_MODEL` أو OpenAI-compatible endpoint اختياري.
