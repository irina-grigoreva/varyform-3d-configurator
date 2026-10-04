# VARYFORM WooCommerce Bridge

WordPress plugin that adds a saved VARYFORM configuration to one configured WooCommerce base product. WooCommerce never accepts a browser-calculated price or BOM.

## Requirements

- WordPress 6.4+
- PHP 8.0+
- WooCommerce 8.0+
- A reachable VARYFORM Fastify API
- A simple, published WooCommerce product to use as the `VARYFORM Configured Product` cart container

## Install

Copy this `varyform-woocommerce` directory to `wp-content/plugins/`, then activate **VARYFORM WooCommerce Bridge** in WordPress → Plugins.

Create and publish one simple product named **VARYFORM Configured Product**. Its catalog price is only a placeholder: the bridge replaces the cart line price with the EUR price returned by Fastify. Set the shop currency to EUR.

Open WooCommerce → Settings → VARYFORM and set:

| Setting | Example | Notes |
| --- | --- | --- |
| API Base URL | `https://api.example.com` | Fastify origin without `/api` |
| Configurator URL | `https://varyform.example.com` | Nuxt origin/base URL |
| WooCommerce product ID | `123` | ID of the published simple base product |
| API timeout | `5` | Seconds, clamped to 1–20 |

Set the matching frontend environment variable `NUXT_PUBLIC_WORDPRESS_URL` to the WordPress origin so the Nuxt configurator can request a short-lived REST nonce and submit the project ID.

## Cart and checkout flow

1. Nuxt saves the current configuration first, then requests a nonce from `/wp-json/varyform/v1/nonce`.
2. Nuxt submits only `{ "projectId": "VRF-..." }` to `/wp-json/varyform/v1/cart`, with the bridge nonce in `X-Varyform-Nonce` and `X-Varyform-Request: 1`. Browser-supplied price, BOM and dimensions are ignored.
3. The bridge validates the project ID, requests `GET {API Base URL}/api/projects/{id}` server-to-server using WordPress HTTP API, and validates the response shape and matching ID.
4. The verified configuration, dimensions, material, price, BOM and public URL are stored in WooCommerce cart/session data. The base product line gets the API-authoritative EUR price before WooCommerce totals are calculated.
5. The classic checkout validation hook asks Fastify again before an order can be created. API unavailability blocks checkout. If project content changed, the verified cart snapshot is refreshed and checkout requires the customer to review the updated line and submit again.
6. The order line receives private `_varyform_*` snapshot metadata from the verified cart row. Admin/customer order views render only useful fields (admin also gets an escaped BOM table; raw `_varyform_*` keys are hidden from the generic meta table/edit form); historical orders do not depend on the mutable current project. The view link opens the current public project, while order details show the purchased snapshot.

The browser-to-WordPress REST route requires the exact configured `Origin`, a `varyform_cart` nonce and a custom non-simple marker header. The nonce is bound to the WordPress cookie user (guest or logged-in customer); because core REST drops cookie users without `X-WP-Nonce`, the bridge restores the user from the auth cookie itself instead of exposing a general `wp_rest` nonce cross-origin. WordPress CORS exposes only the configured configurator origin; Fastify CORS is unchanged because Fastify is contacted server-to-server.

There is intentionally no WooCommerce-specific Fastify endpoint or API secret: the existing public `GET /api/projects/:id` is the supported share-project contract and contains only data already visible to a public project viewer. No edit token is requested or returned to WordPress.

## Cart identity

Project ID participates in WooCommerce's cart-item data key. Two project IDs stay as separate lines. Re-adding the same project refreshes its API snapshot and price but does not create another line or increase quantity beyond one.

## Tests and limitations

Run the dependency-free bridge tests (39) with `npm run test:wordpress` (PHP CLI required). They cover IDs (including legacy `MDL-` compatibility), API response validation/failures, authoritative price despite client fields, CSRF origin/nonce checks including logged-in customer nonces, cart metadata/identity, single-message checkout outage handling, local-only loopback API hosts, order snapshot, admin/customer rendering and URL mapping.

The bridge targets classic WooCommerce checkout validation and does not include PHPUnit/WooCommerce integration infrastructure, account authentication, API secret rotation, project editing, or PDF/DXF generation inside WordPress. The project link returns to the VARYFORM viewer where those existing exports live. WooCommerce Checkout Blocks need a dedicated Store API validation adapter before being used for production checkout. For production, also review the TLS/network trust boundary, store currency/tax semantics, privacy/retention policy, and order/export permissions.
