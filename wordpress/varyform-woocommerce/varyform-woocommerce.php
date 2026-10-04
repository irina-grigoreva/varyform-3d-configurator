<?php
/**
 * Plugin Name: VARYFORM WooCommerce Bridge
 * Description: Adds saved VARYFORM configurations to WooCommerce using server-verified projects.
 * Version: 0.1.0
 * Requires at least: 6.4
 * Requires PHP: 8.0
 * WC requires at least: 8.0
 * Text Domain: varyform-woocommerce
 *
 * @package VaryformWooCommerce
 */

defined( 'ABSPATH' ) || exit;

define( 'VARYFORM_WOO_VERSION', '0.1.0' );
define( 'VARYFORM_WOO_PLUGIN_FILE', __FILE__ );
define( 'VARYFORM_WOO_PLUGIN_DIR', plugin_dir_path( __FILE__ ) );

require_once VARYFORM_WOO_PLUGIN_DIR . 'includes/class-varyform-validation.php';
require_once VARYFORM_WOO_PLUGIN_DIR . 'includes/class-varyform-settings.php';
require_once VARYFORM_WOO_PLUGIN_DIR . 'includes/class-varyform-api.php';
require_once VARYFORM_WOO_PLUGIN_DIR . 'includes/class-varyform-cart.php';
require_once VARYFORM_WOO_PLUGIN_DIR . 'includes/class-varyform-order.php';
require_once VARYFORM_WOO_PLUGIN_DIR . 'includes/class-varyform-rest.php';

/**
 * Initialize the integration after WordPress and WooCommerce are loaded.
 *
 * @return void
 */
function varyform_woocommerce_init() {
	if ( ! class_exists( 'WooCommerce' ) ) {
		add_action(
			'admin_notices',
			static function () {
				echo '<div class="notice notice-error"><p>';
				echo esc_html__( 'VARYFORM WooCommerce Bridge requires WooCommerce to be installed and active.', 'varyform-woocommerce' );
				echo '</p></div>';
			}
		);
		return;
	}

	$settings = new Varyform_Settings();
	$api      = new Varyform_API( $settings );
	$cart     = new Varyform_Cart( $settings, $api );
	$order    = new Varyform_Order( $settings );
	$rest     = new Varyform_REST( $settings, $api, $cart );

	$settings->register();
	$cart->register();
	$order->register();
	$rest->register();
}
add_action( 'init', 'varyform_woocommerce_init', 20 );
