<?php
/**
 * Pure validation and display helpers for verified project responses.
 *
 * @package VaryformWooCommerce
 */

defined( 'ABSPATH' ) || exit;

final class Varyform_Validation {
	/**
	 * Validate public project identifiers.
	 *
	 * New projects use the VRF- prefix; legacy MDL- IDs (pre-rename local data)
	 * and the original 64-bit length remain readable.
	 *
	 * @param mixed $project_id Candidate identifier.
	 * @return bool
	 */
	public static function is_project_id( $project_id ) {
		return is_string( $project_id ) && 1 === preg_match( '/\A(?:VRF|MDL)-(?:[A-F0-9]{16}|[A-F0-9]{32})\z/', $project_id );
	}

	/**
	 * Validate the public project response without calculating domain values.
	 *
	 * @param mixed  $project API response.
	 * @param string $expected_id Requested project identifier.
	 * @return bool
	 */
	public static function is_verified_project( $project, $expected_id ) {
		if ( ! is_array( $project ) || ! self::is_project_id( $expected_id ) ) {
			return false;
		}

		if ( ! isset( $project['id'], $project['configuration'], $project['price'], $project['dimensions'], $project['bom'] ) ) {
			return false;
		}

		if ( $expected_id !== $project['id'] || ! is_array( $project['configuration'] ) || ! is_array( $project['dimensions'] ) || ! is_array( $project['bom'] ) ) {
			return false;
		}

		if ( ! is_numeric( $project['price'] ) || ! is_finite( (float) $project['price'] ) || (float) $project['price'] < 0 ) {
			return false;
		}

		$configuration = $project['configuration'];
		$dimensions    = $project['dimensions'];
		$required      = array( 'width', 'height', 'depth', 'sections', 'shelves', 'materialThickness', 'material', 'backPanel', 'legs' );
		foreach ( $required as $field ) {
			if ( ! array_key_exists( $field, $configuration ) ) {
				return false;
			}
		}

		foreach ( array( 'width' => array( 600, 2400 ), 'height' => array( 800, 2400 ), 'depth' => array( 250, 600 ) ) as $field => $range ) {
			if ( ! isset( $configuration[ $field ] ) || ! is_numeric( $configuration[ $field ] ) || (float) $configuration[ $field ] < $range[0] || (float) $configuration[ $field ] > $range[1] ) {
				return false;
			}
			if ( ! isset( $dimensions[ $field ] ) || ! is_numeric( $dimensions[ $field ] ) || (float) $dimensions[ $field ] !== (float) $configuration[ $field ] ) {
				return false;
			}
		}

		if ( ! is_int( $configuration['sections'] ) || $configuration['sections'] < 1 || $configuration['sections'] > 5
			|| ! is_int( $configuration['shelves'] ) || $configuration['shelves'] < 2 || $configuration['shelves'] > 8
			|| ! in_array( $configuration['materialThickness'], array( 18, 25 ), true )
			|| ! in_array( $configuration['material'], array( 'natural-oak', 'walnut', 'matte-white', 'graphite' ), true )
			|| ! is_bool( $configuration['backPanel'] )
			|| ! in_array( $configuration['legs'], array( 'none', 'metal', 'wood' ), true ) ) {
			return false;
		}

		if ( isset( $project['projectName'] ) && ( ! is_string( $project['projectName'] ) || strlen( $project['projectName'] ) > 100 ) ) {
			return false;
		}

		foreach ( $project['bom'] as $row ) {
			if ( ! is_array( $row ) || ! isset( $row['type'], $row['label'], $row['material'], $row['dimensions'], $row['quantity'] )
				|| ! is_string( $row['type'] ) || ! is_string( $row['label'] ) || ! is_string( $row['material'] )
				|| ! is_array( $row['dimensions'] ) || ! is_numeric( $row['quantity'] ) || (int) $row['quantity'] < 1 ) {
				return false;
			}
			foreach ( array( 'width', 'height', 'depth' ) as $dimension ) {
				if ( ! isset( $row['dimensions'][ $dimension ] ) || ! is_numeric( $row['dimensions'][ $dimension ] ) || ! is_finite( (float) $row['dimensions'][ $dimension ] ) || (float) $row['dimensions'][ $dimension ] < 0 ) {
					return false;
				}
			}
		}

		foreach ( array( 'width', 'height', 'depth' ) as $dimension ) {
			if ( ! isset( $dimensions[ $dimension ] ) || ! is_numeric( $dimensions[ $dimension ] ) || (float) $dimensions[ $dimension ] <= 0 ) {
				return false;
			}
		}

		return true;
	}

	/**
	 * Return a finite numeric value only from an API-verified response.
	 *
	 * @param array $project Verified project response.
	 * @return float
	 */
	public static function authoritative_price( $project ) {
		return round( (float) $project['price'], wc_get_price_decimals() );
	}

	/**
	 * Make a project name suitable for a cart/order line.
	 *
	 * @param array $project Verified project response.
	 * @return string
	 */
	public static function project_name( $project ) {
		$name = isset( $project['projectName'] ) && is_string( $project['projectName'] ) ? sanitize_text_field( $project['projectName'] ) : '';
		return '' !== $name ? $name : __( 'Custom shelving', 'varyform-woocommerce' );
	}
}
