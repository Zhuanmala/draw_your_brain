# draw your brain

A lightweight infinite-canvas thinking app built with [tldraw](https://tldraw.dev/).

## Features

- Full tldraw canvas for sketching, text, shapes, arrows, and notes.
- A floating color palette for draggable sticky notes.
- A default project named `we build it` on the home canvas.
- A GitHub issue entry point for feature ideas and app improvements.
- Draggable child-canvas nodes for splitting large projects into a navigable knowledge graph.
- Per-canvas persistence, so each nested canvas keeps its own drawing space.
- Cloudflare Worker + Durable Object sync for real-time multiplayer when deployed.
- R2-backed upload storage for canvas images and videos.
- Dropped notes use tldraw's native note shape, so they can be moved, selected, edited, and styled like regular canvas content.

## Local Development

```bash
npm install
npm run dev
```

Open `http://localhost:5173/` in your browser.

Local Vite development uses browser-local persistence by default. To test the Cloudflare sync path locally, build once and run Wrangler:

```bash
npm run build
npm run worker:dev
```

For local sync in Vite, set `VITE_ENABLE_SYNC=true` and run the app behind a worker that serves `/api/connect`, `/api/uploads`, and `/api/unfurl`.

## Build

```bash
npm run build
```

## Multiplayer Deployment

This app deploys as one Cloudflare Worker that serves the Vite build and the tldraw sync backend.

Data storage:

- Room state: Cloudflare Durable Object SQLite, one room per canvas.
- Large assets: Cloudflare R2 bucket named `draw-your-brain-assets`.
- Project and canvas registry: currently mirrored in each client and discoverable from canvas-link nodes; move this to a shared metadata table when adding login and permissions.
- Feature feedback: GitHub Issues.

Before deploying:

```bash
npx wrangler r2 bucket create draw-your-brain-assets
npx wrangler r2 bucket create draw-your-brain-assets-preview
npm run deploy
```

For GitHub Actions deployment, add these repository secrets:

- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`

Pushing to `main` then runs `.github/workflows/deploy-cloudflare.yml`.

## License

This project is based on the tldraw Vite template. The tldraw SDK is provided under the [tldraw license](https://github.com/tldraw/tldraw/blob/main/LICENSE.md).
