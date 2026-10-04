<?php
/**
 * Persist and render immutable order-item project snapshots.
 *
 * @package VaryformWooCommerce
 */

defined( 'ABSPATH' ) || exit;

final class Varyform_Order {
	/**
	 * Private order-item meta key => verified cart row key.
	 */
	const SNAPSHOT_META = array(
		'_varyform_project_id'       => 'varyform_project_id',
		'_varyform_project_name'     => 'varyform_project_name',
		'_varyform_configuration'    => 'varyform_configuration',
		'_varyform_dimensions'       => 'varyform_dimensions',
		'_varyform_material'         => 'varyform_material',
		'_varyform_bom'              => 'varyform_bom',
		'_varyform_calculated_price' => 'varyform_price',
		'_varyform_project_url'      => 'varyform_project_url',
		'_varyform_schema_version'   => 'varyform_schema_version',
	);

	/**
	 * Settings provider.
	 *
	 * @var Varyform_Settings
	 */
	private $settings;

	/**
	 * Constructor.
	 *
	 * @param Varyform_Settings $settings Settings provider.
	 */
	public function __construct( $settings ) {
		$this->settings = $settings;
	}

	/**
	 * Register WooCommerce order hooks.
	 *
	 * @return void
	 */
	public function register() {
		add_action( 'woocommerce_checkout_create_order_line_item', array( $this, 'save_order_snapshot' ), 10, 4 );
		add_action( 'woocommerce_after_order_itemmeta', array( $this, 'display_admin_snapshot' ), 10, 3 );
		add_action( 'woocommerce_order_item_meta_end', array( $this, 'display_customer_snapshot' ), 10, 4 );
		add_filter( 'woocommerce_hidden_order_itemmeta', array( $this, 'hide_snapshot_meta_keys' ) );
	}

	/**
	 * Keep raw snapshot keys out of the generic admin meta table and edit form.
	 *
	 * The snapshot is rendered by display_admin_snapshot() instead.
	 *
	 * @param array $hidden Hidden meta keys.
	 * @return array
	 */
	public function hide_snapshot_meta_keys( $hidden ) {
		return array_merge( (array) $hidden, array_keys( self::SNAPSHOT_META ) );
	}

	/**
	 * Map a verified cart row to private order-item metadata.
	 *
	 * @param array $cart_item Verified cart row.
	 * @return array
	 */
	public static function snapshot_meta( $cart_item ) {
		$meta = array();
		foreach ( self::SNAPSHOT_META as $meta_key => $cart_key ) {
			$meta[ $meta_key ] = $cart_item[ $cart_key ];
		}
		return $meta;
	}

	/**
	 * Persist the cart snapshot; order history never depends on a later API read.
	 *
	 * @param WC_Order_Item_Product $item Order line.
	 * @param string                $cart_item_key Cart key.
	 * @param array                 $values Cart row.
	 * @param WC_Order              $order Order.
	 * @return void
	 */
	public function save_order_snapshot( $item, $cart_item_key, $values, $order ) {
		if ( empty( $values['varyform_project_id'] ) || $values['varyform_project_id'] !== $values['varyform_verified_project_id'] ) {
			return;
		}
		foreach ( self::snapshot_meta( $values ) as $key => $value ) {
			$item->add_meta_data( $key, $value, true );
		}
	}

	/**
	 * Render useful project fields for store administrators.
	 *
	 * @param int           $item_id Item ID.
	 * @param WC_Order_Item $item Order item.
	 * @param WC_Product    $product Product.
	 * @return void
	 */
	public function display_admin_snapshot( $item_id, $item, $product ) {
		$project_id = $item->get_meta( '_varyform_project_id', true );
		if ( ! Varyform_Validation::is_project_id( $project_id ) ) {
			return;
		}
		$configuration = $item->get_meta( '_varyform_configuration', true );
		$dimensions    = $item->get_meta( '_varyform_dimensions', true );
		$project_url   = $item->get_meta( '_varyform_project_url', true );
		if ( ! is_array( $configuration ) || ! is_array( $dimensions ) ) {
			return;
		}
		echo '<div class="varyform-order-snapshot"><strong>' . esc_html__( 'VARYFORM Project', 'varyform-woocommerce' ) . '</strong><br>';
		echo esc_html( $project_id ) . '<br>';
		echo esc_html( (string) $item->get_meta( '_varyform_project_name', true ) ) . '<br>';
		echo esc_html( sprintf( '%s × %s × %s mm', $dimensions['width'], $dimensions['height'], $dimensions['depth'] ) ) . '<br>';
		echo esc_html( sprintf( '%s · %s sections · %s shelves · %s mm', $configuration['material'], $configuration['sections'], $configuration['shelves'], $configuration['materialThickness'] ) ) . '<br>';
		echo esc_html( sprintf( 'Back panel: %s · Legs: %s', ! empty( $configuration['backPanel'] ) ? 'yes' : 'no', $configuration['legs'] ?? '-' ) ) . '<br>';
		echo wp_kses_post( wc_price( (float) $item->get_meta( '_varyform_calculated_price', true ) ) ) . '<br>';
		$this->render_admin_bom( $item->get_meta( '_varyform_bom', true ) );
		if ( $project_url ) {
			echo '<a href="' . esc_url( $project_url ) . '" target="_blank" rel="noopener noreferrer">' . esc_html__( 'View project', 'varyform-woocommerce' ) . '</a>';
		}
		echo '</div>';
	}

	/**
	 * Render the purchased BOM snapshot as an escaped table instead of raw JSON.
	 *
	 * @param mixed $bom Stored BOM rows.
	 * @return void
	 */
	private function render_admin_bom( $bom ) {
		if ( ! is_array( $bom ) || empty( $bom ) ) {
			return;
		}
		echo '<table class="varyform-order-bom" style="margin:6px 0;border-collapse:collapse"><thead><tr>';
		foreach ( array( 'Part', 'Material', 'W × H × D mm', 'Qty' ) as $heading ) {
			echo '<th style="text-align:left;padding:2px 8px 2px 0">' . esc_html( $heading ) . '</th>';
		}
		echo '</tr></thead><tbody>';
		foreach ( $bom as $row ) {
			if ( ! is_array( $row ) || ! isset( $row['dimensions'] ) || ! is_array( $row['dimensions'] ) ) {
				continue;
			}
			$size = implode( ' × ', array_map( array( $this, 'format_mm' ), array( $row['dimensions']['width'] ?? null, $row['dimensions']['height'] ?? null, $row['dimensions']['depth'] ?? null ) ) );
			echo '<tr><td style="padding:2px 8px 2px 0">' . esc_html( (string) ( $row['label'] ?? '' ) ) . '</td>';
			echo '<td style="padding:2px 8px 2px 0">' . esc_html( (string) ( $row['material'] ?? '' ) ) . '</td>';
			echo '<td style="padding:2px 8px 2px 0">' . esc_html( $size ) . '</td>';
			echo '<td>' . esc_html( (string) ( $row['quantity'] ?? '' ) ) . '</td></tr>';
		}
		echo '</tbody></table>';
	}

	/**
	 * Format a millimetre value to at most one decimal place.
	 *
	 * @param mixed $value Raw dimension.
	 * @return string
	 */
	private function format_mm( $value ) {
		if ( ! is_numeric( $value ) ) {
			return '-';
		}
		return rtrim( rtrim( number_format( (float) $value, 1, '.', '' ), '0' ), '.' );
	}

	/**
	 * Show only project ID, dimensions and material to customers.
	 *
	 * @param int           $item_id Item ID.
	 * @param WC_Order_Item $item Order item.
	 * @param WC_Order      $order Order.
	 * @param bool          $plain_text Plain output.
	 * @return void
	 */
	public function display_customer_snapshot( $item_id, $item, $order, $plain_text ) {
		$project_id = $item->get_meta( '_varyform_project_id', true );
		if ( ! Varyform_Validation::is_project_id( $project_id ) ) {
			return;
		}
		$dimensions  = $item->get_meta( '_varyform_dimensions', true );
		$project_url = $item->get_meta( '_varyform_project_url', true );
		if ( ! is_array( $dimensions ) ) {
			return;
		}
		$dimension_label = sprintf( '%s × %s × %s mm', $dimensions['width'], $dimensions['height'], $dimensions['depth'] );
		$material        = (string) $item->get_meta( '_varyform_material', true );
		if ( $plain_text ) {
			echo esc_html( sprintf( "Configuration ID: %s\nDimensions: %s\nMaterial: %s\n", $project_id, $dimension_label, $material ) );
			if ( $project_url ) {
				echo esc_url( $project_url ) . "\n";
			}
			return;
		}
		echo '<div class="varyform-order-details">';
		echo '<p><strong>' . esc_html__( 'Configuration ID', 'varyform-woocommerce' ) . ':</strong> ' . esc_html( $project_id ) . '<br>';
		echo '<strong>' . esc_html__( 'Dimensions', 'varyform-woocommerce' ) . ':</strong> ' . esc_html( $dimension_label ) . '<br>';
		echo '<strong>' . esc_html__( 'Material', 'varyform-woocommerce' ) . ':</strong> ' . esc_html( $material ) . '</p>';
		if ( $project_url ) {
			echo '<a href="' . esc_url( $project_url ) . '" target="_blank" rel="noopener noreferrer">' . esc_html__( 'View configuration', 'varyform-woocommerce' ) . '</a>';
		}
		echo '</div>';
	}
}
