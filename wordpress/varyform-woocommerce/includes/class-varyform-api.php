<?php
/**
 * Server-to-server Fastify project client.
 *
 * @package VaryformWooCommerce
 */

defined( 'ABSPATH' ) || exit;

final class Varyform_API {
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
	 * Fetch and validate the current public project from Fastify.
	 *
	 * @param string $project_id Public project identifier.
	 * @return array|WP_Error
	 */
	public function get_project( $project_id ) {
		if ( ! Varyform_Validation::is_project_id( $project_id ) ) {
			return new WP_Error( 'varyform_invalid_project_id', __( 'The VARYFORM project ID is invalid.', 'varyform-woocommerce' ), array( 'status' => 400 ) );
		}

		$base_url = untrailingslashit( esc_url_raw( (string) $this->settings->get( 'api_base_url' ) ) );
		$url_parts = wp_parse_url( $base_url );
		// Loopback/Docker API hosts are allowed only on local/development WordPress sites;
		// production keeps WordPress's unsafe-URL (SSRF) protection enabled.
		$is_local  = is_array( $url_parts )
			&& in_array( strtolower( $url_parts['host'] ?? '' ), array( 'localhost', 'host.docker.internal' ), true )
			&& in_array( wp_get_environment_type(), array( 'local', 'development' ), true );
		$valid_url = '' !== $base_url && ( $is_local || wp_http_validate_url( $base_url ) );
		if ( ! $valid_url || ! is_array( $url_parts ) || ! in_array( $url_parts['scheme'] ?? '', array( 'http', 'https' ), true )
			|| ! empty( $url_parts['user'] ) || ! empty( $url_parts['pass'] ) || ! empty( $url_parts['query'] )
			|| ! empty( $url_parts['fragment'] ) || ! in_array( $url_parts['path'] ?? '', array( '', '/' ), true ) ) {
			return new WP_Error( 'varyform_api_not_configured', __( 'The VARYFORM API is not configured.', 'varyform-woocommerce' ), array( 'status' => 503 ) );
		}

		$timeout = absint( $this->settings->get( 'api_timeout' ) );
		$timeout = min( 20, max( 1, $timeout ?: 5 ) );
		$url     = $base_url . '/api/projects/' . rawurlencode( $project_id );
		$response = wp_remote_get(
			$url,
			array(
				'timeout'             => $timeout,
				'redirection'         => 0,
				'reject_unsafe_urls'  => ! $is_local,
				'limit_response_size' => 131072,
				'headers'             => array( 'Accept' => 'application/json' ),
			)
		);

		if ( is_wp_error( $response ) ) {
			return new WP_Error( 'varyform_api_unavailable', __( 'VARYFORM could not verify this project. Please try again shortly.', 'varyform-woocommerce' ), array( 'status' => 503 ) );
		}

		$status = (int) wp_remote_retrieve_response_code( $response );
		if ( 200 !== $status ) {
			return new WP_Error(
				'varyform_project_unavailable',
				404 === $status
					? __( 'The VARYFORM project was not found.', 'varyform-woocommerce' )
					: __( 'VARYFORM could not verify this project. Please try again shortly.', 'varyform-woocommerce' ),
				array( 'status' => 404 === $status ? 404 : 503 )
			);
		}

		$body    = wp_remote_retrieve_body( $response );
		$project = json_decode( $body, true );
		if ( JSON_ERROR_NONE !== json_last_error() || ! Varyform_Validation::is_verified_project( $project, $project_id ) ) {
			return new WP_Error( 'varyform_invalid_api_response', __( 'VARYFORM returned invalid project data.', 'varyform-woocommerce' ), array( 'status' => 502 ) );
		}

		return $project;
	}

	/**
	 * Build a public project URL using the configured Nuxt base URL.
	 *
	 * @param string $project_id Project ID.
	 * @return string
	 */
	public function project_url( $project_id ) {
		$base_url = untrailingslashit( esc_url_raw( (string) $this->settings->get( 'configurator_url' ) ) );
		return $base_url . '/project/' . rawurlencode( $project_id );
	}
}
