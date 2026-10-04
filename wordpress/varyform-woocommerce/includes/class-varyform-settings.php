<?php
/**
 * WooCommerce settings tab.
 *
 * @package VaryformWooCommerce
 */

defined( 'ABSPATH' ) || exit;

final class Varyform_Settings {
	/**
	 * WooCommerce settings tab id.
	 *
	 * @var string
	 */
	private $id = 'varyform';

	/**
	 * Human-readable tab label.
	 *
	 * @var string
	 */
	private $label;

	/**
	 * Initialize settings page.
	 */
	public function __construct() {
	}

	/**
	 * Register the WooCommerce settings tab after translations are available.
	 *
	 * @return void
	 */
	public function register() {
		$this->label = __( 'VARYFORM', 'varyform-woocommerce' );
		add_filter( 'woocommerce_settings_tabs_array', array( $this, 'add_settings_tab' ), 50 );
		add_action( 'woocommerce_settings_tabs_varyform', array( $this, 'output' ) );
		add_action( 'woocommerce_update_options_varyform', array( $this, 'save' ) );
	}

	/**
	 * Register this tab on the WooCommerce settings page.
	 *
	 * @param array $tabs Existing WooCommerce tabs.
	 * @return array
	 */
	public function add_settings_tab( $tabs ) {
		$tabs[ $this->id ] = $this->label;
		return $tabs;
	}

	/**
	 * Define values stored through WooCommerce's WordPress Settings API.
	 *
	 * @return array
	 */
	public function get_settings() {
		return array(
			array(
				'title' => __( 'VARYFORM project bridge', 'varyform-woocommerce' ),
				'type'  => 'title',
				'desc'  => __( 'WooCommerce verifies saved projects with the VARYFORM API. The browser never supplies a price.', 'varyform-woocommerce' ),
				'id'    => 'varyform_settings',
			),
			array(
				'title'    => __( 'API Base URL', 'varyform-woocommerce' ),
				'desc'     => __( 'Fastify API base URL, for example https://api.varyform.example.com', 'varyform-woocommerce' ),
				'id'       => 'varyform_api_base_url',
				'type'     => 'url',
				'css'      => 'min-width: 400px;',
				'default'  => '',
				'autoload' => false,
			),
			array(
				'title'    => __( 'Configurator URL', 'varyform-woocommerce' ),
				'desc'     => __( 'Standalone Nuxt configurator origin/base URL.', 'varyform-woocommerce' ),
				'id'       => 'varyform_configurator_url',
				'type'     => 'url',
				'css'      => 'min-width: 400px;',
				'default'  => '',
				'autoload' => false,
			),
			array(
				'title'             => __( 'WooCommerce product ID', 'varyform-woocommerce' ),
				'desc'              => __( 'Published VARYFORM Configured Product simple product used as the cart container.', 'varyform-woocommerce' ),
				'id'                => 'varyform_product_id',
				'type'              => 'number',
				'css'               => 'width: 100px;',
				'default'           => '',
				'custom_attributes' => array( 'min' => '1', 'step' => '1' ),
				'autoload'          => false,
			),
			array(
				'title'             => __( 'API timeout', 'varyform-woocommerce' ),
				'desc'              => __( 'Server-to-server timeout in seconds (1–20).', 'varyform-woocommerce' ),
				'id'                => 'varyform_api_timeout',
				'type'              => 'number',
				'css'               => 'width: 100px;',
				'default'           => '5',
				'custom_attributes' => array( 'min' => '1', 'max' => '20', 'step' => '1' ),
				'autoload'          => false,
			),
			array(
				'type' => 'sectionend',
				'id'   => 'varyform_settings',
			),
		);
	}

	/**
	 * Render settings using the WooCommerce Settings API.
	 *
	 * @return void
	 */
	public function output() {
		woocommerce_admin_fields( $this->get_settings() );
	}

	/**
	 * Save settings using the WooCommerce Settings API.
	 *
	 * @return void
	 */
	public function save() {
		woocommerce_update_options( $this->get_settings() );
	}

	/**
	 * Read a plugin setting safely.
	 *
	 * @param string $key Option key suffix.
	 * @return mixed
	 */
	public function get( $key ) {
		return get_option( 'varyform_' . $key, '' );
	}

	/**
	 * Get a normalized URL origin for the configured Nuxt frontend.
	 *
	 * @return string
	 */
	public function configurator_origin() {
		$url = esc_url_raw( (string) $this->get( 'configurator_url' ) );
		$parts = wp_parse_url( $url );
		if ( ! is_array( $parts ) || empty( $parts['scheme'] ) || empty( $parts['host'] )
			|| ! in_array( $parts['scheme'], array( 'http', 'https' ), true )
			|| ! empty( $parts['user'] ) || ! empty( $parts['pass'] )
			|| ! empty( $parts['query'] ) || ! empty( $parts['fragment'] ) ) {
			return '';
		}

		$origin = strtolower( $parts['scheme'] ) . '://' . strtolower( $parts['host'] );
		if ( isset( $parts['port'] ) ) {
			$origin .= ':' . absint( $parts['port'] );
		}
		return $origin;
	}
}
