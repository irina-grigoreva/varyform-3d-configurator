# VARYFORM architecture

Detailed engineering notes. See the [README](../README.md) for the overview and [DEPLOYMENT.md](./DEPLOYMENT.md) for production setup.

## Structure

```text
apps/
  web/                 Nuxt 4 + Vue 3 + TypeScript + Pinia + Three.js
    app/
      components/      Small controls, the lazily loaded 3D viewer and SVG elevation views
      pages/           Configurator page and public /project/[id] route
      stores/          The single reactive configuration source
      utils/export/    Browser PDF rendering (lazy) and safe file downloads
      utils/api/       Typed project persistence and WooCommerce bridge clients
  api/                 Fastify 5 API, Drizzle schema/repository and SQL migrations
packages/
  domain/
    src/index.ts       Configuration validation, placed parts, BOM and pricing
    src/drawing.ts     Front/side projections, dimensions and viewport fitting
    src/export/
      dxf/             DXF document generation (`@varyform/domain/dxf` entry)
      pdf/             Project-sheet data mapping from configuration and BOM
    test/              Domain, drawing and export unit tests
  shared/              API request/response types built on domain Configuration
wordpress/
  varyform-woocommerce/ OOP WooCommerce bridge plugin and dependency-free tests
```

## Client loading strategy

The configurator shell (controls, SVG drawing, BOM, pricing, save/cart) hydrates first. Heavy optional code is split into on-demand chunks:

- **Three.js viewer** — `ConfiguratorViewer.vue` is a Vue async component rendered inside `<ClientOnly>`. SSR and the download phase show `ViewerPlaceholder` ("Preparing your model"); a load failure shows an inline error instead of breaking the page. The viewer stays mounted (`v-show`) when switching to Drawing, so the camera orbit and the single WebGL context survive mode switches.
- **PDF** — `buildProjectPdf` and `jsPDF` (plus jsPDF's optional `html2canvas`/`canvg`/`DOMPurify`) load on the first **Download PDF** click.
- **DXF** — `@varyform/domain/dxf` and `@tarikjabiri/dxf` load on the first **Export DXF** click.

ES module caching means a repeated export does not download the library again. Rolldown still reports the lazy Three.js chunk as larger than 500 kB; it is intentionally isolated and loaded only for the 3D view.

The web client and API are separate applications. Only `packages/domain` owns product calculations; transport contracts live in `packages/shared` and reference the domain `Configuration` type rather than redefining it.

## Domain model

`Configuration` is the single source of truth in Pinia. `calculateParts(configuration)` derives placed parts in millimetres; `calculateBom(parts)` groups parts by type, material and all three dimensions; `calculatePrice(configuration, parts)` produces a preliminary estimate. The viewer maps these same parts to Three.js, while the front and side SVG elevations project those parts into 2D. No independent shelf/panel layout is maintained by the rendering components.

The design rules use equal clear section widths after accounting for the outer panels and dividers. Clear section width must be at least 120 mm; configurations below this limit are rejected by domain validation and cannot produce parts. Each section receives a top board, a base board and the configured number of internal shelves. Side panels and dividers span the carcass height. Optional legs occupy a 100 mm allowance within the configured overall height, and the back panel is a 6 mm inset panel. The preliminary price is a material-area estimate plus a simple hardware allowance, not a production quote.

## Shared 3D and 2D calculations

- All production dimensions, `Part.dimensions`, and `Part.position` values are millimetres. Configuration bounds and section widths come from the domain layer.
- Three.js uses metres. `ConfiguratorViewer.vue` has the single `mmToMeters` conversion at the scene boundary; domain functions never import Three.js or Vue.
- `calculateFrontDrawingGeometry(configuration, parts)` and `calculateSideDrawingGeometry(configuration, parts)` project the existing placed parts into SVG rectangle primitives. Front view displays cabinet width/height; side view maps the part depth onto its horizontal axis. Projected duplicates (for example, front/back legs in front view) are collapsed only for visual projection; BOM quantities remain unchanged.
- `calculateSectionWidths` and `calculateShelfPositions` are reused for dimensions. Dimension-line endpoints, extension lines, labels and drawing bounds are calculated in the domain layer; SVG components render these primitives with technical line markers and do not calculate furniture sizes.
- Manufacturing and drawing geometry use millimetres. `calculateDrawingBounds` finds the extent of the projected parts and dimension annotations. `fitDrawingToViewport` is the centralized conversion boundary: it maps those mm bounds into an SVG `viewBox` sized for the measured viewport, preserving the aspect ratio and a pixel-based margin. SVG then maps viewBox coordinates to screen pixels; zoom changes only this viewBox and never changes manufacturing dimensions or dimension labels.
- `TechnicalDrawing.vue` observes the drawing stage with `ResizeObserver` and recalculates the fitted viewBox on resize. The 3D and drawing surfaces stay mounted while switching modes, preserving the Three.js camera state and current configuration.
- Front elevation includes overall width/height, clear section widths and equal internal shelf pitch. Side elevation includes overall height/depth, shelves, back panel and legs.
- Domain validation rejects section layouts with less than `MIN_SECTION_CLEAR_WIDTH` (120 mm) of clear width after subtracting the outer boards and dividers. The UI only commits a configuration when this validation succeeds, so a slider or stepper cannot generate an invalid model.

The `3D | Drawing` mode and `Front | Side` elevation controls do not mutate the configuration. The BOM disclosure lists grouped part name, quantity, width, height, depth/thickness and material.

```ts
interface Configuration {
  width: number
  height: number
  depth: number
  sections: number
  shelves: number
  materialThickness: 18 | 25
  material: MaterialId
  backPanel: boolean
  legs: LegType
}

interface Part {
  id: string
  type: PartType
  label: string
  material: MaterialId | 'back-panel' | 'metal'
  dimensions: { width: number; height: number; depth: number }
  position: { x: number; y: number; z: number }
  quantity: number
}

interface BomItem {
  type: PartType
  label: string
  material: Part['material']
  dimensions: Part['dimensions']
  quantity: number
}
```

Pure domain functions are exported from `@varyform/domain`: `validateConfiguration`, `calculateParts`, `calculateBom`, `calculateShelfPositions`, `calculateSectionWidths`, `calculatePrice` and `calculateBoundingDimensions`.

## DXF and PDF exports

- `buildDxfDocument(configuration)` validates the configuration, derives placed parts and calls the same front/side drawing geometry used by the SVG elevations. DXF coordinates are manufacturing millimetres (DXF `$INSUNITS = 4`); SVG viewBox fitting and screen scaling are never included. The front elevation uses its product outline centred about X=0 with its base at Y=0. The side elevation is placed to the right with a gap. CAD coordinates use Y-up, so the exporter only flips the drawing coordinate orientation; it does not scale product dimensions.
- DXF layers are `OUTLINE`, `PANELS`, `SHELVES`, `DIMENSIONS` and `TEXT`. Outlines and part rectangles use closed `LWPOLYLINE` entities; extension/dimension/arrow strokes use `LINE`; labels use `TEXT`. Standard entities and millimetre units make the files suitable for common DXF viewers including LibreCAD, FreeCAD and AutoCAD-compatible tools.
- DXF builders are exported from the dedicated `@varyform/domain/dxf` entry (not the main domain entry) so the DXF writer is only bundled into the lazily loaded export chunk.
- The domain package uses [`@tarikjabiri/dxf`](https://www.npmjs.com/package/@tarikjabiri/dxf), a TypeScript DXF writer with layers, units and standard polyline/line/text entities. Tests inspect the generated DXF entity data and verify front/side outline extents against the configured manufacturing sizes.
- `buildProjectSheetData(configuration, projectId)` derives the canonical dimensions, price, grouped BOM, front drawing and side drawing for PDF use. The PDF renderer lazily loads [`jsPDF`](https://www.npmjs.com/package/jspdf) in the browser, adds the current WebGL canvas snapshot to the cover, and draws both elevations as vector line/rectangle/text primitives directly from the shared drawing geometry. The PDF has a configuration/price/3D cover, separate A3 vector drawing pages, and a grouped BOM specification page.
- The PDF snapshot is rendered from the current Three.js scene and camera into a separate 1600 × 2000 WebGL canvas. UI controls are not part of that canvas; the temporary renderer's WebGL context is explicitly released after each capture. PDFs use the saved project ID, or a temporary `TMP-…` ID for an unsaved configuration; long project names are shrunk/ellipsized to stay inside the page margins. Filenames include the current overall width, height and material finish.
- UI export actions do not persist or send project data to a server. Failures are surfaced in the configurator and duplicate clicks are disabled while generation is running.
- These exports are project-sheet previews, not manufacturing release documents. DXF contains 2D elevations (not CNC/toolpath data or cut optimization) and simple line/text dimensions rather than associative CAD dimension objects. PDF pricing remains the current preliminary estimate, and PDF dimensions/annotations are not a signed production approval.

## Project persistence architecture

```text
Nuxt web (Pinia Configuration)
        │ JSON request: Configuration + optional projectName
        ▼
Fastify API ── validates with packages/domain ── recalculates Parts / BOM / price / dimensions
        │
        ▼
PostgreSQL projects (JSONB configuration + schema_version + price snapshot + edit-token hash)
```

- `apps/web` owns the configurator UI, Pinia state, public project route and typed HTTP client. It sends only the current `Configuration` and optional project name; browser-calculated price/BOM values are never accepted as project data.
- `apps/api` is a standalone Fastify 5 application. Routes perform request validation and delegate to `projectService`; the service imports `validateConfiguration`, `calculateParts`, `calculateBom`, `calculatePrice` and `calculateBoundingDimensions` from the same `@varyform/domain` package used by the UI.
- `packages/shared` contains transport contracts and imports `Configuration`, `BomItem` and `Dimensions` as types from `@varyform/domain`. The product configuration interface is not duplicated between client and server.
- `packages/domain` remains the only source for product dimensions and manufacturing rules. API `GET` and `PUT` recompute derived parts, BOM, price and overall dimensions from the persisted or submitted configuration.

### PostgreSQL schema and migrations

The `projects` table contains:

| Column | Purpose |
| --- | --- |
| `id` | Internal serial primary key; never exposed as the project URL |
| `public_id` | Unique random `VRF-` identifier used by `/project/:id` (legacy `MDL-` IDs from before the VARYFORM rename remain readable) |
| `configuration` | Canonical JSONB configuration |
| `calculated_price` | Integer price snapshot for audit/debugging; never authoritative on reads |
| `schema_version` | Configuration schema version (currently `1`) |
| `project_name` | Optional trimmed name, max 100 characters |
| `edit_token_hash` | SHA-256 digest of a 256-bit random edit token |
| `created_at`, `updated_at` | UTC timestamps |

The migration is checked in at `apps/api/drizzle/0000_calm_fenris.sql`. Drizzle Kit applies pending migrations with `npm run db`; no manual pgAdmin setup is needed. Drizzle ORM with `pg` was selected for typed table access, small runtime overhead, and ordinary PostgreSQL migrations without introducing a large generated client.

### API endpoints

Base URL defaults to `http://localhost:3001/api`.

| Method | Path | Access | Behavior |
| --- | --- | --- | --- |
| `POST` | `/projects` | Public, rate limited | Validate configuration, calculate current project values, persist, return project and one-time edit token |
| `GET` | `/projects/:id` | Public | Load by public ID and recalculate BOM, price and dimensions |
| `PUT` | `/projects/:id` | Edit token required, rate limited | Validate token and new configuration, recalculate and update project |

Errors use `{ "error": { "code": "...", "message": "..." } }`. Invalid configurations return `400`, invalid edit token `403`, missing project or unknown route `404`, oversized bodies `413` (payloads are limited to 16 KiB), rate-limited writes `429` with `Retry-After`, and unexpected failures a sanitized `500`. CORS is restricted to the comma-separated origins in `WEB_ORIGIN` (default `http://localhost:3000`), and create/update each allow 12 requests per minute per client IP (`TRUST_PROXY=true` behind a hosting proxy).

Public IDs use 128 random bits from `crypto.randomUUID()` and are protected by a unique database constraint. The unguessable 256-bit edit token is returned only when a project is created; PostgreSQL stores only its SHA-256 hash. `GET` is public and never returns the token. The Nuxt client stores the raw token in per-project `localStorage`, never in the share URL. A project link is read-only by default; a browser with the stored token can explicitly choose **Continue editing** and then **Save changes**.

The save panel accepts an optional project name; the value is trimmed and control characters are rejected server-side. The name appears on the shared project and PDF cover. PDF/DXF remain client-generated from the shared domain calculations.

### Environment and local development

Copy `.env.example` to `.env` and adjust `DATABASE_URL` if needed. The example targets the local Compose database. The Compose service binds PostgreSQL only to `127.0.0.1`; its `trust` authentication is for local development only and must not be reused in production.

```powershell
npm install
docker compose up -d db
npm run db
npm run dev
```

`npm run dev` starts Nuxt and Fastify together; `npm run dev:api` starts only the API. `npm run build` builds both the API bundle and the Nuxt application. `npm run typecheck`, `npm run lint` and `npm run test` include the API workspace and existing domain tests. The API production bundle can be launched with `npm run start --workspace @varyform/api`.

### Persistence limitations

- This milestone has no user accounts, authentication, token rotation/revocation, project ownership, delete endpoint, or optimistic concurrency. Anyone with the edit token can update the project; anyone with the public ID can view it.
- The edit token is held in browser `localStorage`; production authentication and secure session storage should replace the current bearer-token model. Protect the frontend against XSS before relying on browser-held tokens.
- `calculated_price` is retained for diagnostics only. Every API response recalculates current price/BOM/dimensions, so a later pricing-rule change takes effect when reading an old project.
- `schema_version` is stored, but automatic migration of older configuration versions has not been needed yet. Production schema evolution should add explicit version-to-version data migrations.
- CORS and per-IP rate limits are baseline controls, not substitutes for production edge controls, abuse monitoring, or authentication.

## WooCommerce bridge

```text
Browser → Nuxt configurator → Fastify API → PostgreSQL
           │ project ID only
           ▼
        WordPress VARYFORM bridge → Fastify GET /api/projects/:id
           ▼                                  │
        WooCommerce cart ← server-verified configuration, BOM and price
           ▼
        WooCommerce order item snapshot
```

The OOP plugin lives under `wordpress/varyform-woocommerce/`; plugin-specific installation and settings are documented in its [README](./wordpress/varyform-woocommerce/README.md). It uses one published WooCommerce simple product as a cart container, does not calculate any furniture data, and obtains the authoritative price from the existing public Fastify project endpoint over WordPress's `wp_remote_get`. No separate integration endpoint or secret is needed because this GET response is already the public project contract, and server-to-server communication does not require widening Fastify CORS.

The browser first saves the current project, then submits only its public ID to the plugin's WP REST cart endpoint. A narrow bridge nonce (`X-Varyform-Nonce`, action `varyform_cart`), configured Origin allowlist and required custom request header protect the cross-origin browser flow. The bridge deliberately does not use a general `wp_rest` nonce: core REST cookie auth discards the logged-in user when `X-WP-Nonce` is absent, so the bridge restores the customer from the WordPress auth cookie and binds its nonce to that user. Logged-in customers therefore add to their own persistent cart, while no all-purpose REST nonce is exposed to the configurator origin. The browser uses canonical trailing-slash REST URLs and includes credentials so WooCommerce session cookies persist across the cross-origin request; the REST handler explicitly initializes the WooCommerce cart before adding the item. The plugin ignores client price/BOM/dimensions, validates the server response, and stores an API-verified configuration/BOM/price snapshot on the cart line. Price is set before WooCommerce totals. A duplicate project refreshes its snapshot while remaining quantity 1; different project IDs remain distinct lines.

Before classic checkout creates an order, the plugin fetches every VARYFORM project again. If the API is unavailable or returns invalid data checkout fails closed. A changed project refreshes the cart snapshot and requires customer review. At order creation the verified cart configuration, dimensions, BOM and price are copied to private order item metadata, so later edits to a shared project do not alter historical orders. Admin sees project ID/name/dimensions/material/layout/price, an escaped BOM table and a project link; the raw `_varyform_*` keys are hidden from WooCommerce's generic item-meta table and edit form. Customers (order-received page and My Account → Orders → order details) see only configuration ID/dimensions/material and a **View configuration** link; no configuration/BOM JSON, edit token, hashes, price snapshot or WordPress meta keys are rendered.

The order details always show the **purchased snapshot**. The **View project / View configuration** link opens the *current* public VARYFORM project, which may have been edited after the purchase (the edit-token holder can update a shared project). This is intentional: the link is a convenience to the live viewer and its PDF/DXF exports, while the order line remains the historical record. PDF and DXF generation remains in the Nuxt application rather than being duplicated in PHP.

Classic checkout fires both `woocommerce_check_cart_items` and `woocommerce_after_checkout_validation` in one request. The bridge verifies each project with Fastify once per request (memoized) and does not re-add a message that is already queued as an error notice, so an outage produces exactly one message per configuration while the error notice still blocks order creation. An unavailable API also rejects new cart adds with a sanitized error.

Run a local WordPress + MySQL demo using `docker compose -f docker-compose.wordpress.yml up -d`, complete the WordPress installer at `http://localhost:8080`, install/activate WooCommerce from WordPress → Plugins, then activate the mounted VARYFORM Bridge plugin. Create the VARYFORM base product and set API URL (`http://host.docker.internal:3001` for a host-run API), configurator URL (`http://localhost:3000`), product ID and timeout in WooCommerce → Settings → VARYFORM. Set `NUXT_PUBLIC_WORDPRESS_URL=http://localhost:8080` in the Nuxt environment. `trust`/local passwords are not used for the WP database, but all Compose credentials are demo-only.

