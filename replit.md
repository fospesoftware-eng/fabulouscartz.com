# Running Fabulous Cartz on Replit

- Install dependencies with `npm ci`.
- Start the development server with `npm run dev`.
- The Vite server listens on port 5000 and allows Replit's preview proxy.
- Run `npm run build` to create and type-check the production build.
- Publishing uses Static deployment: build with `npm run build`, then serve `dist`.
- Keep the publishing rewrite from `/*` to `/index.html` so React Router pages work when opened directly.
- The default run command and preview workflow are separate from the production publishing configuration; verify both when troubleshooting publishing.
