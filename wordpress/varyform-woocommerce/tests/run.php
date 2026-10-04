<?php
/**
 * Dependency-free tests for bridge validation and cart/order mapping.
 *
 * @package VaryformWooCommerce
 */

define( 'ABSPATH', __DIR__ . DIRECTORY_SEPARATOR );

class WP_Error {
	public $code;
	public $message;
	public $data;

	public function __construct( $code = '', $message = '', $data = array() ) {
		$this->code    = $code;
		$this->message = $message;
		$this->data    = $data;
	}
}

class WP_REST_Response {
	public $data;
	public $status;

	public $headers = array();

	public function __construct( $data = null, $status = 200 ) {
		$this->data   = $data;
		$this->status = $status;
	}

	public function header( $key, $value ) {
		$this->headers[ $key ] = $value;
	}
}

class WP_REST_Server {
	const READABLE  = 'GET';
	const CREATABLE = 'POST';
}

class Test_Product {
	public function is_type( $type ) {
		return 'simple' === $type;
	}

	public function get_status() {
		return 'publish';
	}
}

class Test_Cart {
	public $cart_contents = array();
	public $add_calls     = 0;
	private $next_key     = 1;

	public function get_cart() {
		return $this->cart_contents;
	}

	public function get_cart_item( $key ) {
		return $this->cart_contents[ $key ] ?? null;
	}

	public function add_to_cart( $product_id, $quantity, $variation_id, $variation, $data ) {
		++$this->add_calls;
		$key = 'cart-' . $this->next_key++;
		$this->cart_contents[ $key ] = array_merge( $data, array( 'quantity' => $quantity ) );
		return $key;
	}

	public function set_session() {}
}

class Test_Errors {
	public $messages = array();
	public function add( $code, $message ) {
		$this->messages[] = $message;
	}
}

function __( $message ) {
	return $message;
}

function esc_html__( $message ) {
	return $message;
}

function sanitize_text_field( $value ) {
	return trim( strip_tags( (string) $value ) );
}

function esc_url_raw( $value ) {
	return filter_var( (string) $value, FILTER_SANITIZE_URL );
}

function esc_url( $value ) {
	return esc_url_raw( $value );
}

function esc_html( $value ) {
	return htmlspecialchars( (string) $value, ENT_QUOTES, 'UTF-8' );
}

function absint( $value ) {
	return abs( (int) $value );
}

function untrailingslashit( $value ) {
	return rtrim( (string) $value, '/' );
}

function wp_parse_url( $url ) {
	return parse_url( $url );
}

function get_option( $name, $default = false ) {
	return $GLOBALS['test_options'][ $name ] ?? $default;
}

function wc_get_price_decimals() {
	return 0;
}

function wc_get_product( $product_id ) {
	return 42 === (int) $product_id ? new Test_Product() : false;
}

function get_woocommerce_currency() {
	return 'EUR';
}

function WC() {
	return $GLOBALS['test_woo'];
}

function wc_load_cart() {
	++$GLOBALS['wc_load_cart_calls'];
}

function wp_get_environment_type() { return $GLOBALS['test_environment'] ?? 'local'; }

function wp_http_validate_url( $url ) {
	$parts = parse_url( $url );
	return is_array( $parts ) && in_array( $parts['scheme'] ?? '', array( 'http', 'https' ), true ) && ! empty( $parts['host'] );
}

function wp_remote_get( $url, $args = array() ) {
	$GLOBALS['test_last_http_request'] = array( $url, $args );
	$GLOBALS['test_http_calls']        = ( $GLOBALS['test_http_calls'] ?? 0 ) + 1;
	return $GLOBALS['test_http_response'] ?? new WP_Error( 'offline', 'Offline' );
}

function is_wp_error( $value ) {
	return $value instanceof WP_Error;
}

function wp_remote_retrieve_response_code( $response ) {
	return $response['status'] ?? 500;
}

function wp_remote_retrieve_body( $response ) {
	return $response['body'] ?? '';
}

function add_filter() {}
function add_action() {}
function wp_doing_ajax() { return false; }
function register_rest_route() {}
function wp_unslash( $value ) { return stripslashes( (string) $value ); }
function is_user_logged_in() { return 0 !== $GLOBALS['test_current_user']; }
function wp_validate_auth_cookie( $cookie = '', $scheme = '' ) { return 'logged_in' === $scheme ? $GLOBALS['test_cookie_user'] : false; }
function wp_set_current_user( $user_id ) { $GLOBALS['test_current_user'] = $user_id; }
function wp_verify_nonce( $nonce, $action ) { return 'varyform_cart' === $action && 'nonce-user-' . $GLOBALS['test_current_user'] === $nonce; }
function wp_create_nonce( $action ) { return 'varyform_cart' === $action ? 'nonce-user-' . $GLOBALS['test_current_user'] : 'wrong-action'; }
function get_http_origin() { return $GLOBALS['test_origin'] ?? ''; }
function wc_get_cart_url() { return 'https://shop.example.test/cart/'; }
function wc_price( $value ) { return '€' . (string) $value; }
function wp_kses_post( $value ) { return strip_tags( (string) $value, '<span><b><strong>' ); }
function wc_add_notice( $message, $type ) { $GLOBALS['test_notices'][] = array( $message, $type ); }
function wc_has_notice( $message, $type ) { return in_array( array( $message, $type ), $GLOBALS['test_notices'] ?? array(), true ); }
function wp_json_encode( $value ) { return json_encode( $value ); }

require_once dirname( __DIR__ ) . '/includes/class-varyform-validation.php';
require_once dirname( __DIR__ ) . '/includes/class-varyform-settings.php';
require_once dirname( __DIR__ ) . '/includes/class-varyform-api.php';
require_once dirname( __DIR__ ) . '/includes/class-varyform-cart.php';
require_once dirname( __DIR__ ) . '/includes/class-varyform-order.php';
require_once dirname( __DIR__ ) . '/includes/class-varyform-rest.php';

function test_assert( $condition, $message ) {
	if ( ! $condition ) {
		throw new RuntimeException( $message );
	}
	echo "PASS {$message}\n";
}

$GLOBALS['test_options'] = array(
	'varyform_api_base_url'    => 'http://localhost:3001',
	'varyform_configurator_url' => 'https://varyform.example.test',
	'varyform_product_id'      => '42',
	'varyform_api_timeout'      => '5',
);
$GLOBALS['test_woo'] = (object) array( 'cart' => new Test_Cart() );
$GLOBALS['wc_load_cart_calls'] = 0;
$settings            = new Varyform_Settings();
$api                 = new Varyform_API( $settings );
$cart                = new Varyform_Cart( $settings, $api );
$rest                = new Varyform_REST( $settings, $api, $cart );

$project_id = 'VRF-8391FD95882E4AC8A7AAFCD6C5F58647';
$configuration = array(
	'width'            => 1400,
	'height'           => 1900,
	'depth'            => 400,
	'sections'         => 4,
	'shelves'          => 5,
	'materialThickness' => 25,
	'material'         => 'walnut',
	'backPanel'        => false,
	'legs'             => 'wood',
);
$project = array(
	'id'            => $project_id,
	'projectName'   => 'Living Room Shelving',
	'configuration' => $configuration,
	'price'         => 2901,
	'dimensions'    => array( 'width' => 1400, 'height' => 1900, 'depth' => 400 ),
	'bom'           => array(
		array( 'type' => 'shelf', 'label' => 'Shelf board', 'material' => 'walnut', 'dimensions' => array( 'width' => 318.75, 'height' => 25, 'depth' => 400 ), 'quantity' => 28 ),
	),
	'schemaVersion' => 1,
);
$GLOBALS['test_http_response'] = array( 'status' => 200, 'body' => json_encode( $project ) );

test_assert( Varyform_Validation::is_project_id( 'MDL-A8F42C77C8F01012' ), 'accepts legacy 64-bit MDL project ID' );
test_assert( Varyform_Validation::is_project_id( $project_id ), 'accepts current 128-bit VRF project ID' );
test_assert( Varyform_Validation::is_project_id( 'MDL-04D9CEDEEF0740AD82D89B06A65DF571' ), 'still accepts legacy 128-bit MDL project IDs' );
test_assert( ! Varyform_Validation::is_project_id( 'ABC-04D9CEDEEF0740AD82D89B06A65DF571' ), 'rejects unknown project ID prefixes' );
test_assert( ! Varyform_Validation::is_project_id( 'MDL-../../wp-admin' ), 'rejects invalid project IDs' );
test_assert( ! Varyform_Validation::is_verified_project( array_merge( $project, array( 'price' => -1 ) ), $project_id ), 'rejects invalid API price data' );

$verified = $api->get_project( $project_id );
test_assert( is_array( $verified ) && 2901.0 === Varyform_Validation::authoritative_price( $verified ), 'uses authoritative Fastify project price' );
test_assert( false !== strpos( $GLOBALS['test_last_http_request'][0], '/api/projects/' . $project_id ), 'fetches saved projects through the existing public API route' );

test_assert( false === $GLOBALS['test_last_http_request'][1]['reject_unsafe_urls'], 'allows a loopback API host on local WordPress environments' );
$GLOBALS['test_environment'] = 'production';
$api->get_project( $project_id );
test_assert( true === $GLOBALS['test_last_http_request'][1]['reject_unsafe_urls'], 'keeps unsafe-URL protection for loopback hosts on production WordPress' );
unset( $GLOBALS['test_environment'] );

$GLOBALS['test_http_response'] = array( 'status' => 404, 'body' => '{"error":{"code":"PROJECT_NOT_FOUND"}}' );
$missing = $api->get_project( $project_id );
test_assert( is_wp_error( $missing ) && 'varyform_project_unavailable' === $missing->code, 'converts Fastify 404 responses to a safe WordPress error' );
$GLOBALS['test_http_response'] = new WP_Error( 'offline', 'Internal network detail' );
$offline = $api->get_project( $project_id );
test_assert( is_wp_error( $offline ) && 'varyform_api_unavailable' === $offline->code && false === strpos( $offline->message, 'Internal network detail' ), 'fails closed with sanitized API connection errors' );
$GLOBALS['test_http_response'] = array( 'status' => 200, 'body' => json_encode( $project ) );

$GLOBALS['test_origin'] = 'https://varyform.example.test';
test_assert( true === $rest->authorize_configurator_origin(), 'allows only the configured configurator origin' );
$GLOBALS['test_current_user'] = 0;
$GLOBALS['test_cookie_user']  = false;
$guest_nonce = $rest->get_nonce();
test_assert( 'nonce-user-0' === $guest_nonce->data['nonce'] && 'no-store' === $guest_nonce->headers['Cache-Control'], 'issues an uncached narrow bridge nonce for guests' );
$_SERVER['HTTP_X_VARYFORM_REQUEST'] = '1';
$_SERVER['HTTP_X_VARYFORM_NONCE']   = $guest_nonce->data['nonce'];
test_assert( true === $rest->authorize_configurator_request(), 'requires the bridge nonce and CSRF marker header' );
$_SERVER['HTTP_X_VARYFORM_REQUEST'] = '';
test_assert( is_wp_error( $rest->authorize_configurator_request() ), 'rejects cart requests without the CSRF marker header' );
$_SERVER['HTTP_X_VARYFORM_REQUEST'] = '1';

// Core REST resets the user to 0 without X-WP-Nonce; the bridge restores the cookie customer.
$GLOBALS['test_cookie_user'] = 7;
$customer_nonce = $rest->get_nonce();
test_assert( 'nonce-user-7' === $customer_nonce->data['nonce'], 'binds the bridge nonce to the logged-in cookie customer' );
$GLOBALS['test_current_user']     = 0;
$_SERVER['HTTP_X_VARYFORM_NONCE'] = $customer_nonce->data['nonce'];
test_assert( true === $rest->authorize_configurator_request() && 7 === $GLOBALS['test_current_user'], 'accepts logged-in customer cart requests in the customer session' );
$GLOBALS['test_current_user']     = 0;
$_SERVER['HTTP_X_VARYFORM_NONCE'] = $guest_nonce->data['nonce'];
test_assert( is_wp_error( $rest->authorize_configurator_request() ), 'rejects a guest nonce replayed with a customer cookie' );
$GLOBALS['test_current_user'] = 0;
$GLOBALS['test_cookie_user']  = false;
$_SERVER['HTTP_X_VARYFORM_NONCE'] = $guest_nonce->data['nonce'];
$GLOBALS['test_origin'] = 'https://attacker.example.test';
test_assert( is_wp_error( $rest->authorize_configurator_origin() ), 'rejects cross-origin cart mutation requests' );
$GLOBALS['test_origin'] = 'https://varyform.example.test';

$request = new class( array( 'projectId' => $project_id, 'price' => 1, 'bom' => array(), 'dimensions' => array() ) ) {
	private $params;
	public function __construct( $params ) { $this->params = $params; }
	public function get_param( $key ) { return $this->params[ $key ] ?? null; }
};
$rest_response = $rest->add_project_to_cart( $request );
test_assert( $rest_response instanceof WP_REST_Response && true === $rest_response->data['success'], 'accepts cart requests using project ID only and ignores browser price fields' );
test_assert( 1 === $GLOBALS['wc_load_cart_calls'], 'initializes the WooCommerce cart in the REST request lifecycle' );
$first_item = reset( $GLOBALS['test_woo']->cart->cart_contents );
test_assert( 2901.0 === $first_item['varyform_price'], 'stores the verified API price rather than the client-supplied price' );
test_assert( $first_item['varyform_dimensions'] === $project['dimensions'] && 'walnut' === $first_item['varyform_material'], 'stores API-verified configuration metadata in the cart' );
$restored = $cart->restore_cart_item( array( 'data' => 'product-object' ), $first_item );
test_assert( 2901.0 === $restored['varyform_price'] && 'product-object' === $restored['data'], 'restores verified price and data from the WooCommerce session' );

$cart->add_project( $verified );
test_assert( 1 === count( $GLOBALS['test_woo']->cart->cart_contents ) && 1 === $GLOBALS['test_woo']->cart->add_calls, 'does not duplicate or increment quantity for the same project ID' );

$second_project = $project;
$second_project['id'] = 'VRF-11111111111111111111111111111111';
$GLOBALS['test_http_response'] = array( 'status' => 200, 'body' => json_encode( $second_project ) );
$second_request = new class( array( 'projectId' => $second_project['id'] ) ) {
	private $params;
	public function __construct( $params ) { $this->params = $params; }
	public function get_param( $key ) { return $this->params[ $key ] ?? null; }
};
$second_result = $rest->add_project_to_cart( $second_request );
test_assert( $second_result instanceof WP_REST_Response && 2 === count( $GLOBALS['test_woo']->cart->cart_contents ), 'keeps different project IDs as separate cart lines' );

$GLOBALS['test_woo']->cart->cart_contents = array_slice( $GLOBALS['test_woo']->cart->cart_contents, 0, 1, true );
$changed_project = $project;
$changed_project['configuration']['width'] = 1500;
$changed_project['dimensions']['width'] = 1500;
$changed_project['price'] = 3100;
$GLOBALS['test_http_response'] = array( 'status' => 200, 'body' => json_encode( $changed_project ) );
$checkout_errors = new Test_Errors();
$cart->revalidate_before_checkout( array(), $checkout_errors );
test_assert( count( $checkout_errors->messages ) === 1 && 1500 === $GLOBALS['test_woo']->cart->cart_contents['cart-1']['varyform_dimensions']['width'], 'refreshes changed project snapshot and blocks checkout for cart review' );

$GLOBALS['test_http_response'] = new WP_Error( 'offline', 'Internal network detail' );
$cart->reset_verification(); // New request.
$checkout_errors = new Test_Errors();
$cart->revalidate_before_checkout( array(), $checkout_errors );
test_assert( count( $checkout_errors->messages ) === 1, 'fails closed before order creation when Fastify is unavailable' );

// Classic checkout runs woocommerce_check_cart_items, then woocommerce_after_checkout_validation.
$cart->reset_verification();
$GLOBALS['test_notices']    = array();
$GLOBALS['test_http_calls'] = 0;
$checkout_errors            = new Test_Errors();
$cart->validate_cart_items();
$cart->revalidate_before_checkout( array(), $checkout_errors );
test_assert( 1 === count( $GLOBALS['test_notices'] ) && 'error' === $GLOBALS['test_notices'][0][1] && 0 === count( $checkout_errors->messages ), 'shows one outage message per configuration during classic checkout' );
test_assert( 1 === $GLOBALS['test_http_calls'], 'verifies each configuration with Fastify once per checkout request' );
$GLOBALS['test_http_response'] = array( 'status' => 200, 'body' => json_encode( $project ) );

$cart_snapshot = Varyform_Cart::build_cart_item_data( $project, 'https://varyform.example.test/project/' . $project_id );
$snapshot       = Varyform_Order::snapshot_meta( $cart_snapshot );
test_assert( $snapshot['_varyform_configuration'] === $configuration && $snapshot['_varyform_bom'] === $project['bom'] && 2901.0 === $snapshot['_varyform_calculated_price'], 'captures immutable configuration, BOM and price order snapshot data' );
test_assert( 'https://varyform.example.test/project/' . $project_id === $api->project_url( $project_id ), 'builds the public project URL from the configured Nuxt origin' );

$order_item = new class( $snapshot ) {
	private $meta;
	public function __construct( $meta ) { $this->meta = $meta; }
	public function get_meta( $key, $single = true ) { return $this->meta[ $key ] ?? ''; }
};
$order_view = new Varyform_Order( $settings );
ob_start();
$order_view->display_customer_snapshot( 1, $order_item, null, false );
$customer_html = ob_get_clean();
test_assert( false !== strpos( $customer_html, $project_id ) && false !== strpos( $customer_html, '1400 × 1900 × 400 mm' ) && false !== strpos( $customer_html, 'walnut' ) && false !== strpos( $customer_html, 'View configuration' ), 'shows customers configuration ID, dimensions, material and view link' );
test_assert( false === strpos( $customer_html, '{' ) && false === strpos( $customer_html, 'Shelf board' ) && false === strpos( $customer_html, '2901' ) && false === stripos( $customer_html, 'token' ), 'hides raw configuration/BOM JSON, price and internal fields from customers' );
ob_start();
$order_view->display_admin_snapshot( 1, $order_item, null );
$admin_html = ob_get_clean();
test_assert( false !== strpos( $admin_html, 'Living Room Shelving' ) && false !== strpos( $admin_html, '4 sections · 5 shelves' ) && false !== strpos( $admin_html, '€2901' ) && false !== strpos( $admin_html, '<td style="padding:2px 8px 2px 0">Shelf board</td>' ) && false !== strpos( $admin_html, 'View project' ), 'shows admins project, layout, price and a BOM table' );
test_assert( false === strpos( $admin_html, '{' ) && false === strpos( $admin_html, '"type"' ), 'renders the admin snapshot without raw JSON' );
test_assert( false !== strpos( $admin_html, '318.8 × 25 × 400' ), 'rounds admin BOM dimensions to 0.1 mm' );
$hidden_meta = $order_view->hide_snapshot_meta_keys( array( '_qty' ) );
test_assert( in_array( '_qty', $hidden_meta, true ) && array() === array_diff( array_keys( $snapshot ), $hidden_meta ), 'hides every raw snapshot meta key from the generic admin meta table' );

echo "All VARYFORM WooCommerce bridge tests passed.\n";
