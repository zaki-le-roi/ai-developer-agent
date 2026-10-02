# Deployment

The backend currently runs as a Node.js service and the mobile client is built with Expo prebuild/Gradle in GitHub Actions.

Required production environment values should be supplied through the deployment secret manager, never committed:

- `BMZ_API_KEY` if API-key protection is enabled.
- `BMZ_DATA_ROOT`
- `BMZ_SANDBOX_ROOT`
- Model Runtime variables.
- GitHub credentials required by server-side integration.

For production, place Sandbox execution in containers/VMs and place the database on managed durable storage before exposing arbitrary user projects to the public internet.
