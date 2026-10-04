<?php
/**
 * Narrow browser-to-WooCommerce REST bridge.
 *
 * @package VaryformWooCommerce
 */

defined( 'ABSPATH' ) || exit;

final class Varyform_REST {
	/**
	 * Narrow nonce action; a general wp_rest nonce is never exposed cross-origin.
	 */
	const NONCE_ACTION = 'varyform_cart';

	/**
	 * Settings provider.
	 *
	 * @var Varyform_Settings
	 */
	private $settings;

	/**
	 * API client.
	 *
	 * @var Varyform_API
	 */
	private $api;

	/**
	 * Cart service.
	 *
	 * @var Varyform_Cart
	 */
	private $cart;

	/**
	 * Constructor.
	 *
	 * @param Varyform_Settings $settings Settings provider.
	 * @param Varyform_API      $api API client.
	 * @param Varyform_Cart     $cart Cart service.
	 */
	public function __construct( $settings, $api, $cart ) {
		$this->settings = $settings;
		$this->api      = $api;
		$this->cart     = $cart;
		add_filter( 'rest_allowed_cors_origins', array( $this, 'allow_configurator_origin' ) );
		add_filter( 'rest_allowed_cors_headers', array( $this, 'allow_request_headers' ) );
	}

	/**
	 * Register the nonce bootstrap and cart endpoints.
	 *
	 * @return void
	 */
	public function register() {
		add_action( 'rest_api_init', array( $this, 'register_routes' ) );
	}

	/**
	 * Allow only the origin explicitly configured in the VARYFORM settings.
	 *
	 * @param array $origins Core allowed origins.
	 * @return array
	 */
	public function allow_configurator_origin( $origins ) {
		$origin = $this->settings->configurator_origin();
		if ( '' !== $origin ) {
			$origins[] = $origin;
		}
		return array_values( array_unique( $origins ) );
	}

	/**
	 * Add the required bridge marker header to WordPress's REST CORS allowlist.
	 *
	 * @param array $headers Allowed headers.
	 * @return array
	 */
	public function allow_request_headers( $headers ) {
		$headers[] = 'X-Varyform-Request';
		$headers[] = 'X-Varyform-Nonce';
		return array_values( array_unique( $headers ) );
	}

	/**
	 * Define public nonce bootstrap and guarded project cart routes.
	 *
	 * @return void
	 */
	public function register_routes() {
		register_rest_route(
			'varyform/v1',
			'/nonce',
			array(
				'methods'             => WP_REST_Server::READABLE,
				'callback'            => array( $this, 'get_nonce' ),
				'permission_callback' => array( $this, 'authorize_configurator_origin' ),
			)
		);
		register_rest_route(
			'varyform/v1',
			'/cart',
			array(
				'methods'             => WP_REST_Server::CREATABLE,
				'callback'            => array( $this, 'add_project_to_cart' ),
				'permission_callback' => array( $this, 'authorize_configurator_request' ),
				'args'                => array(
					'projectId' => array(
						'required'          => true,
						'type'              => 'string',
						'pattern'           => '^(?:VRF|MDL)-(?:[A-F0-9]{16}|[A-F0-9]{32})$',
						'sanitize_callback' => 'sanitize_text_field',
					),
				),
			)
		);
	}

	/**
	 * Require an exact configured Origin for cross-origin browser requests.
	 *
	 * @return bool|WP_Error
	 */
	public function authorize_configurator_origin() {
		$expected = $this->settings->configurator_origin();
		$origin   = get_http_origin();
		if ( '' === $expected || ! is_string( $origin ) || strtolower( untrailingslashit( $origin ) ) !== $expected ) {
			return new WP_Error( 'varyform_origin_denied', __( 'This configurator origin is not allowed.', 'varyform-woocommerce' ), array( 'status' => 403 ) );
		}
		return true;
	}

	/**
	 * Restore the logged-in customer from the WordPress auth cookie.
	 *
	 * Core REST cookie auth drops the user when X-WP-Nonce is absent. The bridge
	 * replaces that CSRF check with its own origin, marker header and narrow
	 * nonce, so the customer's own cart/session is used instead of a guest one.
	 *
	 * @return void
	 */
	private function authenticate_cookie_user() {
		if ( is_user_logged_in() ) {
			return;
		}
		$user_id = wp_validate_auth_cookie( '', 'logged_in' );
		if ( $user_id ) {
			wp_set_current_user( $user_id );
		}
	}

	/**
	 * Require the bridge nonce and a non-simple request header to protect cart mutations from CSRF.
	 *
	 * @return bool|WP_Error
	 */
	public function authorize_configurator_request() {
		$origin = $this->authorize_configurator_origin();
		if ( is_wp_error( $origin ) ) {
			return $origin;
		}
		$this->authenticate_cookie_user();
		$marker = isset( $_SERVER['HTTP_X_VARYFORM_REQUEST'] ) ? sanitize_text_field( wp_unslash( $_SERVER['HTTP_X_VARYFORM_REQUEST'] ) ) : '';
		$nonce  = isset( $_SERVER['HTTP_X_VARYFORM_NONCE'] ) ? sanitize_text_field( wp_unslash( $_SERVER['HTTP_X_VARYFORM_NONCE'] ) ) : '';
		if ( '1' !== $marker || ! wp_verify_nonce( $nonce, self::NONCE_ACTION ) ) {
			return new WP_Error( 'varyform_request_denied', __( 'The VARYFORM request could not be verified. Reload the configurator and try again.', 'varyform-woocommerce' ), array( 'status' => 403 ) );
		}
		return true;
	}

	/**
	 * Return a user-bound bridge nonce only to the allowlisted configurator origin.
	 *
	 * @return WP_REST_Response
	 */
	public function get_nonce() {
		$this->authenticate_cookie_user();
		$response = new WP_REST_Response( array( 'nonce' => wp_create_nonce( self::NONCE_ACTION ) ), 200 );
		$response->header( 'Cache-Control', 'no-store' );
		return $response;
	}

	/**
	 * Verify through Fastify and add the one-off project to the visitor cart.
	 *
	 * Only projectId is read from the browser body. Any claimed price, BOM or
	 * dimensions are intentionally ignored; the API response is authoritative.
	 *
	 * @param WP_REST_Request $request Request.
	 * @return WP_REST_Response|WP_Error
	 */
	public function add_project_to_cart( $request ) {
		$project_id = sanitize_text_field( wp_unslash( $request->get_param( 'projectId' ) ) );
		if ( ! Varyform_Validation::is_project_id( $project_id ) ) {
			return new WP_Error( 'varyform_invalid_project_id', __( 'The VARYFORM project ID is invalid.', 'varyform-woocommerce' ), array( 'status' => 400 ) );
		}

		$project = $this->api->get_project( $project_id );
		if ( is_wp_error( $project ) ) {
			return $project;
		}
		wc_load_cart();
		$added = $this->cart->add_project( $project );
		if ( is_wp_error( $added ) ) {
			return $added;
		}

		return new WP_REST_Response(
			array(
				'success'     => true,
				'cartUrl'     => esc_url_raw( wc_get_cart_url() ),
				'cartItemKey' => sanitize_text_field( $added['cart_item_key'] ),
			),
			200
		);
	}
}
