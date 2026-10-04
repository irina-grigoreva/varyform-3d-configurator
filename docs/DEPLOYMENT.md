# Production deployment plan

Not yet deployed. This plan uses managed services with free/low tiers; equivalents work the same way.

```text
configurator.example.com  →  Nuxt (Vercel)
api.example.com           →  Fastify (Render / Railway / Fly.io)  →  PostgreSQL (Neon / Railway)
shop.example.com          →  WordPress + WooCommerce + VARYFORM bridge plugin
```

## Critical constraint: same site for Nuxt and WordPress

The browser calls the WordPress REST bridge from the configurator with `credentials: 'include'`, so WooCommerce session and login cookies must be sent cross-origin. WordPress cookies default to `SameSite=Lax`, and browsers increasingly block third-party cookies. **Host Nuxt and WordPress on subdomains of the same registrable domain** (for example `configurator.example.com` and `shop.example.com`), both on HTTPS. A `*.vercel.app` frontend with a WordPress shop on an unrelated domain will not keep the cart session.

## 1. PostgreSQL (Neon or Railway)

1. Create a database and copy the pooled connection string, e.g. `postgres://user:password@host/db?sslmode=require`.
2. Run migrations from CI or a local shell with the production URL:

```sh
npm ci
DATABASE_URL='postgres://…?sslmode=require' npm run db
```

`npm run db` (Drizzle Kit) is idempotent; it creates `projects` with the `projects_public_id_unique` index and records applied migrations in `drizzle.__drizzle_migrations`.

## 2. Fastify API (Render web service, Railway or Fly.io)

| Setting | Value |
| --- | --- |
| Root directory | repository root (npm workspaces) |
| Node | 22.22+ or 24.15+ (`.nvmrc`) |
| Build command | `npm ci --include=dev && npm run build --workspace @varyform/api` |
| Pre-deploy / release command | `npm run db` |
| Start command | `npm run start --workspace @varyform/api` |
| Health check | `GET /health` → `{"status":"ok"}` |

Environment variables:

| Variable | Example | Notes |
| --- | --- | --- |
| `DATABASE_URL` | `postgres://…?sslmode=require` | Secret. Server-side only. |
| `NODE_ENV` | `production` | `info` log level. |
| `WEB_ORIGIN` | `https://configurator.example.com` | Comma-separated list for previews. No trailing slash. |
| `TRUST_PROXY` | `true` | Required behind the platform proxy so rate limits are per client IP. |
| `API_HOST` | `0.0.0.0` | |
| `PORT` / `API_PORT` | injected by platform | `API_PORT` overrides `PORT`. |
| `LOG_LEVEL` | *(empty)* | Optional override. |

`--include=dev` keeps `tsup` and `drizzle-kit` available when the platform sets `NODE_ENV=production` during install.

## 3. Nuxt frontend (Vercel)

| Setting | Value |
| --- | --- |
| Framework preset | Nuxt (Nitro detects Vercel automatically) |
| Root directory | repository root |
| Install command | `npm ci` |
| Build command | `npm run build --workspace @varyform/web` |
| Output | handled by the Nuxt/Vercel preset |

Environment variables (public, embedded in the client bundle — never put secrets here):

| Variable | Example |
| --- | --- |
| `NUXT_PUBLIC_API_BASE_URL` | `https://api.example.com/api` |
| `NUXT_PUBLIC_WORDPRESS_URL` | `https://shop.example.com` |

For a Node server instead of Vercel: `npm run build --workspace @varyform/web`, then `node apps/web/.output/server/index.mjs` with `PORT`/`HOST` and the same `NUXT_PUBLIC_*` variables.

## 4. WordPress + WooCommerce (managed WordPress hosting or a container)

1. HTTPS WordPress 6.4+ / PHP 8.0+, WooCommerce 8.0+. Leave `WP_ENVIRONMENT_TYPE` at `production` (keeps unsafe-URL protection for server-to-server calls). Disable `WP_DEBUG_DISPLAY`.
2. Zip `wordpress/varyform-woocommerce/` (the `tests/` folder may be omitted), upload via Plugins → Add New → Upload, activate.
3. WooCommerce → Settings → General: currency **EUR**. Site visibility: **Live**.
4. Create and publish a simple product **VARYFORM Configured Product** (placeholder price).
5. Use **classic** Cart and Checkout pages (`[woocommerce_cart]`, `[woocommerce_checkout]` shortcodes). Checkout Blocks are not supported.
6. WooCommerce → Settings → VARYFORM:

| Setting | Value |
| --- | --- |
| API Base URL | `https://api.example.com` (no `/api`) |
| Configurator URL | `https://configurator.example.com` (the only allowed REST CORS origin) |
| WooCommerce product ID | ID of the product from step 4 |
| API timeout | `5` |

7. Configure SMTP (or a transactional mail plugin) if order emails are required.

## 5. Post-deploy smoke test

1. `GET https://api.example.com/health`.
2. Configure → Save project → open the share link in a private window.
3. Download PDF and Export DXF.
4. Log in as a test customer on the shop, return to the configurator, **Add to cart** → cart shows the API price.
5. Classic checkout with a test payment method → order admin shows the VARYFORM snapshot; My Account shows ID/dimensions/material.
6. Temporarily point the plugin API URL to an invalid host → checkout shows one "could not be verified" message and no order is created; restore the URL.

## Remaining actions that require real infrastructure

- Domain/DNS and HTTPS certificates for the three hosts.
- Provider accounts, secrets (`DATABASE_URL`) and running the first migration.
- WordPress hosting, plugin upload, product and payment gateway setup.
- Replacing the README **Demo** placeholder with the live URL and capturing final screenshots.
