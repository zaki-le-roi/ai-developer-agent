# Development

## Backend

`cd backend`

`npm install`

`npm run build`

`npm test`

`npm run dev`

Set `BMZ_DATA_ROOT` for persistent data. Set `BMZ_SANDBOX_ROOT` for project workspaces.

## Local model

Run Ollama locally and set `OLLAMA_MODEL`. BMZ AI calls Ollama through the provider interface; no OpenAI/Anthropic/Gemini SDK is required.

## Mobile

`cd mobile && npm install && npx tsc --noEmit`

For Android APK use the repository GitHub Actions workflow.
