# stackshot-web

Browser-based composer that mirrors the `stackshot` CLI. Vanilla TypeScript + Vite + Shiki + Canvas. No backend.

## Dev

```bash
cd src/web
npm install
npm run dev     # http://localhost:5173
npm run build   # → dist/
```

## Deploying to Azure Static Web Apps (free tier)

This is a **one-time manual setup** that the Azure portal does for you:

1. Azure portal → **Create a resource** → **Static Web App** → **Free** plan.
2. Source: **GitHub**, repo: `d-carrigg/stackshot`, branch: `main`.
3. Build preset: **Custom**. Set:
   - **App location:** `src/web`
   - **Output location:** `dist`
   - **Api location:** *(leave blank — this app has no backend)*
4. Click **Review + create**. Azure adds:
   - A `.github/workflows/azure-static-web-apps-*.yml` workflow.
   - The `AZURE_STATIC_WEB_APPS_API_TOKEN` repo secret.
5. Every push to `main` deploys to production. Every PR gets a preview URL.

Repo-root `staticwebapp.config.json` configures the SPA fallback.
