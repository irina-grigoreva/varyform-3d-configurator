<?php
/**
 * WooCommerce cart integration and authoritative price handling.
 *
 * @package VaryformWooCommerce
 */

defined( 'ABSPATH' ) || exit;

final class Varyform_Cart {
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
	 * Per-request verification result; null until the cart has been verified.
	 *
	 * @var array|null
	 */
	private $verification_messages = null;

	/**
	 * Constructor.
	 *
	 * @param Varyform_Settings $settings Settings provider.
	 * @param Varyform_API      $api API client.
	 */
	public function __construct( $settings, $api ) {
		$this->settings = $settings;
		$this->api      = $api;
	}

	/**
	 * Register cart hooks.
	 *
	 * @return void
	 */
	public function register() {
		add_filter( 'woocommerce_get_item_data', array( $this, 'display_cart_item_data' ), 10, 2 );
		add_filter( 'woocommerce_get_cart_item_from_session', array( $this, 'restore_cart_item' ), 10, 2 );
		add_action( 'woocommerce_before_calculate_totals', array( $this, 'apply_verified_prices' ), 20 );
		add_action( 'woocommerce_check_cart_items', array( $this, 'validate_cart_items' ) );
		add_action( 'woocommerce_after_checkout_validation', array( $this, 'revalidate_before_checkout' ), 10, 2 );
	}

	/**
	 * Copy only API-verified values into a cart item's persistent data.
	 *
	 * @param array $project Verified API project.
	 * @param string $project_url Public project URL.
	 * @return array
	 */
	public static function build_cart_item_data( $project, $project_url ) {
		$configuration = $project['configuration'];
		return array(
			'varyform_project_id'          => $project['id'],
			'varyform_project_name'        => Varyform_Validation::project_name( $project ),
			'varyform_configuration'       => $configuration,
			'varyform_dimensions'           => $project['dimensions'],
			'varyform_material'             => sanitize_text_field( (string) $configuration['material'] ),
			'varyform_price'                => Varyform_Validation::authoritative_price( $project ),
			'varyform_bom'                  => $project['bom'],
			'varyform_project_url'          => esc_url_raw( $project_url ),
			'varyform_schema_version'       => isset( $project['schemaVersion'] ) ? absint( $project['schemaVersion'] ) : 1,
			'varyform_verified_project_id'  => $project['id'],
		);
	}

	/**
	 * Find an existing cart row for the same one-off custom project.
	 *
	 * @param array  $cart_contents WooCommerce cart contents.
	 * @param string $project_id Public project ID.
	 * @return string|null
	 */
	public static function existing_project_key( $cart_contents, $project_id ) {
		foreach ( $cart_contents as $key => $item ) {
			if ( isset( $item['varyform_project_id'] ) && $project_id === $item['varyform_project_id'] ) {
				return (string) $key;
			}
		}
		return null;
	}

	/**
	 * Add or refresh one verified project row in the customer cart.
	 *
	 * @param array $project Verified API project.
	 * @return array|WP_Error Cart key or error.
	 */
	public function add_project( $project ) {
		if ( 'EUR' !== get_woocommerce_currency() ) {
			return new WP_Error( 'varyform_currency_mismatch', __( 'The VARYFORM project price is in EUR. Set the WooCommerce store currency to EUR before adding it to the cart.', 'varyform-woocommerce' ), array( 'status' => 409 ) );
		}

		$product_id = absint( $this->settings->get( 'product_id' ) );
		$product    = $product_id ? wc_get_product( $product_id ) : false;
		if ( ! $product || ! $product->is_type( 'simple' ) || 'publish' !== $product->get_status() ) {
			return new WP_Error( 'varyform_product_not_configured', __( 'The VARYFORM base product is not configured as a published simple product.', 'varyform-woocommerce' ), array( 'status' => 503 ) );
		}
		if ( ! WC()->cart ) {
			return new WP_Error( 'varyform_cart_unavailable', __( 'The WooCommerce cart is unavailable. Please reload the shop and try again.', 'varyform-woocommerce' ), array( 'status' => 503 ) );
		}

		$this->reset_verification();
		$item_data = self::build_cart_item_data( $project, $this->api->project_url( $project['id'] ) );
		$existing  = self::existing_project_key( WC()->cart->get_cart(), $project['id'] );
		if ( null !== $existing ) {
			$cart_item = WC()->cart->get_cart_item( $existing );
			if ( is_array( $cart_item ) ) {
				foreach ( $item_data as $key => $value ) {
					WC()->cart->cart_contents[ $existing ][ $key ] = $value;
				}
				WC()->cart->cart_contents[ $existing ]['quantity'] = 1;
				WC()->cart->set_session();
				return array( 'cart_item_key' => $existing );
			}
		}

		$cart_item_key = WC()->cart->add_to_cart( $product_id, 1, 0, array(), $item_data );
		if ( ! $cart_item_key ) {
			return new WP_Error( 'varyform_cart_add_failed', __( 'WooCommerce could not add this configuration to the cart.', 'varyform-woocommerce' ), array( 'status' => 409 ) );
		}
		return array( 'cart_item_key' => $cart_item_key );
	}

	/**
	 * Show concise product data without exposing full JSON or BOM.
	 *
	 * @param array $item_data Display rows.
	 * @param array $cart_item Cart item.
	 * @return array
	 */
	public function display_cart_item_data( $item_data, $cart_item ) {
		if ( empty( $cart_item['varyform_project_id'] ) ) {
			return $item_data;
		}

		$configuration = $cart_item['varyform_configuration'];
		$dimensions    = $cart_item['varyform_dimensions'];
		$rows          = array(
			__( 'Project', 'varyform-woocommerce' )       => $cart_item['varyform_project_name'],
			__( 'Configuration ID', 'varyform-woocommerce' ) => $cart_item['varyform_project_id'],
			__( 'Dimensions', 'varyform-woocommerce' )   => sprintf( '%s × %s × %s mm', $dimensions['width'], $dimensions['height'], $dimensions['depth'] ),
			__( 'Material', 'varyform-woocommerce' )     => $cart_item['varyform_material'],
			__( 'Sections', 'varyform-woocommerce' )     => $configuration['sections'],
			__( 'Shelves', 'varyform-woocommerce' )      => $configuration['shelves'],
			__( 'Thickness', 'varyform-woocommerce' )    => sprintf( '%s mm', $configuration['materialThickness'] ),
			__( 'Back panel', 'varyform-woocommerce' )   => $configuration['backPanel'] ? __( 'Yes', 'varyform-woocommerce' ) : __( 'No', 'varyform-woocommerce' ),
			__( 'Legs', 'varyform-woocommerce' )         => ucfirst( sanitize_text_field( $configuration['legs'] ) ),
		);
		foreach ( $rows as $name => $value ) {
			$item_data[] = array(
				'key'   => esc_html( $name ),
				'value' => esc_html( (string) $value ),
			);
		}
		$item_data[] = array(
			'key'     => esc_html__( 'Project files', 'varyform-woocommerce' ),
			'value'   => esc_html__( 'View configuration', 'varyform-woocommerce' ),
			'display' => '<a href="' . esc_url( $cart_item['varyform_project_url'] ) . '" target="_blank" rel="noopener noreferrer">' . esc_html__( 'View configuration', 'varyform-woocommerce' ) . '</a>',
		);
		return $item_data;
	}

	/**
	 * Ensure session-restored product objects use the last server-verified price.
	 *
	 * @param array $cart_item Restored row.
	 * @param array $values Session values.
	 * @return array
	 */
	public function restore_cart_item( $cart_item, $values ) {
		foreach ( self::build_session_values( $values ) as $key => $value ) {
			$cart_item[ $key ] = $value;
		}
		return $cart_item;
	}

	/**
	 * Select the persisted VARYFORM values accepted back from a cart session.
	 *
	 * @param array $values Session row.
	 * @return array
	 */
	private static function build_session_values( $values ) {
		$keys = array(
			'varyform_project_id',
			'varyform_project_name',
			'varyform_configuration',
			'varyform_dimensions',
			'varyform_material',
			'varyform_price',
			'varyform_bom',
			'varyform_project_url',
			'varyform_schema_version',
			'varyform_verified_project_id',
		);
		$restored = array();
		foreach ( $keys as $key ) {
			if ( array_key_exists( $key, $values ) ) {
				$restored[ $key ] = $values[ $key ];
			}
		}
		return $restored;
	}

	/**
	 * Apply verified prices before WooCommerce calculates totals.
	 *
	 * @param WC_Cart $cart Cart.
	 * @return void
	 */
	public function apply_verified_prices( $cart ) {
		if ( is_admin() && ! wp_doing_ajax() ) {
			return;
		}
		foreach ( $cart->get_cart() as $cart_item ) {
			if ( empty( $cart_item['varyform_project_id'] ) || empty( $cart_item['data'] ) ) {
				continue;
			}
			if ( $cart_item['varyform_project_id'] !== $cart_item['varyform_verified_project_id'] || ! is_numeric( $cart_item['varyform_price'] ) ) {
				$cart_item['data']->set_price( 0 );
				continue;
			}
			$cart_item['data']->set_price( (float) $cart_item['varyform_price'] );
		}
	}

	/**
	 * Revalidate all configured projects before a classic checkout can create orders.
	 *
	 * @param array    $data Checkout form data.
	 * @param WP_Error $errors Validation errors.
	 * @return void
	 */
	public function revalidate_before_checkout( $data, $errors ) {
		foreach ( $this->verify_cart_items() as $message ) {
			// Classic checkout runs woocommerce_check_cart_items first; an identical
			// error notice already blocks order creation, so do not show it twice.
			if ( function_exists( 'wc_has_notice' ) && wc_has_notice( $message, 'error' ) ) {
				continue;
			}
			$errors->add( 'varyform_project_verification', $message );
		}
	}

	/**
	 * Prevent proceeding from a cart page when project verification fails.
	 *
	 * @return void
	 */
	public function validate_cart_items() {
		foreach ( $this->verify_cart_items() as $message ) {
			wc_add_notice( $message, 'error' );
		}
	}

	/**
	 * Refresh cart snapshots from Fastify and return checkout-blocking messages.
	 *
	 * @return array
	 */
	private function verify_cart_items() {
		// Both cart and checkout validation run in one checkout request; verify once.
		if ( null !== $this->verification_messages ) {
			return $this->verification_messages;
		}
		$messages = array();
		if ( ! WC()->cart ) {
			return $messages;
		}

		foreach ( WC()->cart->get_cart() as $cart_key => $cart_item ) {
			if ( empty( $cart_item['varyform_project_id'] ) ) {
				continue;
			}
			$project = $this->api->get_project( $cart_item['varyform_project_id'] );
			if ( is_wp_error( $project ) ) {
				$messages[] = sprintf(
					/* translators: %s is the public project ID. */
					__( 'Project %s could not be verified. The order was not placed; please retry when VARYFORM is available.', 'varyform-woocommerce' ),
					esc_html( $cart_item['varyform_project_id'] )
				);
				continue;
			}

			$fresh = self::build_cart_item_data( $project, $this->api->project_url( $project['id'] ) );
			$changed = ( $cart_item['varyform_project_id'] !== $cart_item['varyform_verified_project_id'] )
				|| ( $fresh['varyform_configuration'] !== $cart_item['varyform_configuration'] )
				|| ( $fresh['varyform_price'] !== (float) $cart_item['varyform_price'] )
				|| ( $fresh['varyform_bom'] !== $cart_item['varyform_bom'] );
			foreach ( $fresh as $key => $value ) {
				WC()->cart->cart_contents[ $cart_key ][ $key ] = $value;
			}
			WC()->cart->cart_contents[ $cart_key ]['quantity'] = 1;
			if ( $changed ) {
				$messages[] = sprintf(
					/* translators: %s is the public project ID. */
					__( 'Project %s changed since it was added. Review the updated cart and submit checkout again.', 'varyform-woocommerce' ),
					esc_html( $cart_item['varyform_project_id'] )
				);
			}
		}
		WC()->cart->set_session();
		$this->verification_messages = $messages;
		return $messages;
	}

	/**
	 * Forget the per-request verification result (used when the cart changes).
	 *
	 * @return void
	 */
	public function reset_verification() {
		$this->verification_messages = null;
	}
}
