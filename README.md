# Fabulous Cartz

## Production deployment (Replit)

One published service serves the built storefront at `/`, the admin console at
`/backoffice/` and the API at `/backoffice/api/v1` (and `/api/v1`).

```bash
npm run build:deploy   # storefront + admin + Prisma client + backend build
npm run start:deploy   # migrate, seed on first boot, then start Fastify
```

Set `JWT_SECRET`, `REFRESH_SECRET` and `PUBLIC_BASE_URL=https://fabulous.fospe.com`
in Replit Secrets before publishing. See [backend/README.md](backend/README.md#replit-single-service-deployment)
for the full contract, env defaults and troubleshooting.

---

This template provides a minimal setup to get React working in Vite with HMR and some Oxlint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the Oxlint configuration

If you are developing a production application, we recommend enabling type-aware lint rules by installing `oxlint-tsgolint` and editing `.oxlintrc.json`:

```json
{
  "$schema": "./node_modules/oxlint/configuration_schema.json",
  "plugins": ["react", "typescript", "oxc"],
  "options": {
    "typeAware": true
  },
  "rules": {
    "react/rules-of-hooks": "error",
    "react/only-export-components": ["warn", { "allowConstantExport": true }]
  }
}
```

See the [Oxlint rules documentation](https://oxc.rs/docs/guide/usage/linter/rules) for the full list of rules and categories.
