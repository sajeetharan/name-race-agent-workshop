# Azure deployment and cleanup

The live workshop app uses an existing, explicitly approved shared Linux plan.
No new plan instance was provisioned. Do not modify or delete that shared plan.
Additional traffic still uses the subscription's normal quotas and billing.

## Package a tested release

```powershell
npm run check
pwsh -File .\scripts\package-deploy.ps1
```

The script ships compiled JavaScript and the installed production dependency tree.
It refuses native Windows dependencies; this app's runtime dependencies are JavaScript.
It does not ship source credentials, room data, development dependencies or a build step.

## App settings

Configure these privately on **your new app**, not the shared plan or another app:

- `PUBLIC_BASE_URL`: exact HTTPS app origin, without trailing slash.
- `HOST_PASSWORD`: a random private value of at least 16 characters.
- `RACE_DATA_DIR`: `/home/data/name-race`.
- `WEBSITES_ENABLE_APP_SERVICE_STORAGE`: `true`.
- `SCM_DO_BUILD_DURING_DEPLOYMENT`: `false` for this prebuilt release.
- Startup command: `npm start`; Node runtime: `NODE:24-lts`.

```powershell
az webapp deploy --subscription YOUR_SUBSCRIPTION --resource-group YOUR_GAME_GROUP `
  --name YOUR_GAME_APP --src-path .\name-race-release.zip --type zip
```

Check `/healthz`, host login, QR joining in a separate browser and an actual race.
Never claim a deployment works from an upload response alone.

## Stop the demo

Delete rooms in the host UI. If the app is no longer needed, delete **only your
game app** and its dedicated group after checking its contents. Do not delete a
shared hosting plan or other applications. An ephemeral subscription can expire;
do not promise this demo URL is permanent.
