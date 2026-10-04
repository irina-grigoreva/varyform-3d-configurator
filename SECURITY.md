# Security

The current VARYFORM release has no user accounts. The security model is described below so that a deployment can be reviewed honestly.

## Reporting

Please report suspected vulnerabilities privately to the repository owner instead of opening a public issue.

## Security model

| Area | Control |
| --- | --- |
| Pricing | Prices, BOM and dimensions are always recalculated by the Fastify API from the stored configuration. WooCommerce ignores browser-supplied price/BOM/dimensions and re-verifies every project before classic checkout. |
| Project editing | Each saved project has a random 256-bit edit token. Only its SHA-256 hash is stored; comparison is constant-time. The token is returned once on creation, kept in browser `localStorage`, never returned by `GET`, never sent to WordPress and never logged. |
| API errors | A central Fastify error handler returns fixed JSON messages. Validation → 400, body limit → 413, rate limit → 429 (with `Retry-After`), unknown route → 404, anything else → generic 500. Stack traces, SQL/driver messages and `DATABASE_URL` are never sent to clients. |
| API limits | 16 KB JSON body limit, strict JSON schemas (no extra properties), per-IP rate limit of 12 writes/minute (`POST`/`PUT`). Set `TRUST_PROXY=true` behind a hosting proxy so limits apply per client IP. |
| CORS | API: only the origins in `WEB_ORIGIN`. WordPress REST bridge: only the configured Configurator URL origin. |
| Logging | Production logs at `info`. Request logs contain method, URL and IP only — request bodies are not logged, and `authorization`, `cookie` and `editToken` paths are redacted defensively. |
| Secrets | `DATABASE_URL` is read only by the API/migrations from the environment. Nuxt receives only `NUXT_PUBLIC_*` values (API URL and shop URL). |
| WordPress bridge | Cart mutations require the exact configured `Origin`, a custom `X-Varyform-Request` header and a user-bound `varyform_cart` nonce (`X-Varyform-Nonce`). A general `wp_rest` nonce is never exposed cross-origin. Server-to-server fetches use `wp_remote_get` with redirects disabled, a 128 KB response cap and WordPress unsafe-URL protection (loopback hosts are allowed only when `WP_ENVIRONMENT_TYPE` is `local`/`development`). Output is escaped; customers never see raw JSON, BOM, price snapshots or edit tokens. |

Known gaps, by design for this milestone: no accounts or token rotation/revocation, browser-held edit tokens (XSS would expose them), no CSP headers configured in Nuxt, no abuse monitoring beyond rate limits.

## Dependency advisories

`npm audit` on 2026-10-04 (after upgrading `drizzle-orm` to `0.45.3`): **15 entries (4 moderate, 11 high)**, all transitive or build/dev-time. `npm audit fix --force` is intentionally **not** used: it proposes breaking downgrades (`nuxt@3.15.1`, `drizzle-kit@0.18.1`).

| Package | Severity | Direct? | Path | Reachable from the running app? | Assessment |
| --- | --- | --- | --- | --- | --- |
| `drizzle-orm` < 0.45.2 (GHSA-gpj5-g38j-94v9, SQL identifier escaping) | high | direct (API) | — | No (static identifiers) | **Fixed** by upgrading to `0.45.3`. Identifiers were never user-controlled. |
| `node-forge` ≤ 1.4.0 (GHSA-86w9-cpqp-85rv, RSA PKCS#1 v1.5 signature verification) | high | transitive | `nuxt → @nuxt/cli → listhen → node-forge`; `nitropack → listhen` | No | Used only by the Nuxt CLI/dev listener for local TLS certificates. Not present in `.output/server`. No published fix; only remedy offered is a Nuxt 3 downgrade. The remaining high entries (`listhen`, `@nuxt/cli`, `nitropack`, `@nuxt/nitro-server`, `@nuxt/vite-builder`, `nuxt`) are this same chain. |
| `braces` 3.0.3 (GHSA-vfj7-8cjw-p6xm, deeply nested pattern DoS) | high | transitive | `globby → fast-glob → micromatch → braces` | No | Build tooling only; the app never passes user input to glob/brace expansion. Every published `braces` version is affected, so `npm audit fix` cannot resolve it. `micromatch`, `fast-glob`, `globby` are the same chain. |
| `esbuild` ≤ 0.24.2 / 0.27.3–0.28.0 (GHSA-67mh-4wv8-2f99, GHSA-g7r4-m6w7-qqqr) | moderate | transitive | `drizzle-kit → @esbuild-kit/* → esbuild@0.18`; `tsup → esbuild@0.27` | No | Advisories concern esbuild's **dev server** (`serve`), which is never started. `drizzle-kit` runs only for migrations, `tsup` only for the API build. `@esbuild-kit/core-utils`, `@esbuild-kit/esm-loader`, `drizzle-kit` are the same chain. |

Production runtime dependencies of the API bundle are limited to `fastify`, `@fastify/cors`, `@fastify/rate-limit`, `dotenv`, `drizzle-orm` and `pg`. Re-run `npm audit` before each deployment and upgrade Nuxt/Drizzle Kit/tsup when patched releases appear.
