# stackshot-web

Browser-based composer that mirrors the `stackshot` CLI. Vanilla TypeScript + Vite + Shiki + Canvas. No backend.

Live site: [https://image.carrigg.dev](https://image.carrigg.dev)

Video ingest: drop or pick `mp4` / `webm` / `mov`. The clip is decoded in
the browser and stored as an animated WebP (first 12 seconds, 12 fps,
long edge ≤ 960px). The original file is discarded after conversion.

## Dev

```bash
cd src/web
npm install
npm run dev     # http://localhost:5173
npm run build   # → dist/
```

## Deploy

Production deploys on push to `main` via `.github/workflows/deploy-web.yml`
(Azure Static Web Apps). PR previews are posted on PRs that touch `src/web/`.

`src/web/public/staticwebapp.config.json` is copied into `dist/` by Vite and
sets the SPA fallback plus CSP (self + Umami).
