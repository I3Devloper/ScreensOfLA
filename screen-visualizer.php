<?php
/**
 * Plugin Name: Screen Visualizer
 * Plugin URI:  https://screensofla.com
 * Description: An AI-powered WordPress plugin that lets homeowners capture or upload patio photos and generate realistic screen mockups. Use shortcode [screen_visualizer] to display.
 * Version:     1.0.0
 * Author:      Screens of LA
 * Author URI:  https://screensofla.com
 * License:     GPL-2.0+
 * License URI: http://www.gnu.org/licenses/gpl-2.0.txt
 * Text Domain: screen-visualizer
 * Domain Path: /languages
 */

// Exit if accessed directly.
if (! defined('ABSPATH')) {
    exit;
}

if (! defined('SCREEN_VISUALIZER_OPENROUTER_API_KEY')) {
    define('SCREEN_VISUALIZER_OPENROUTER_API_KEY', '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');
}

/**
 * Get plugin version.
 */
function screen_visualizer_get_version() {
    return '1.0.0';
}

/**
 * Get plugin asset version for cache busting.
 */
function screen_visualizer_get_asset_version() {
    $version = screen_visualizer_get_version();

    if (defined('WP_DEBUG') && WP_DEBUG) {
        $version = time();
    }

    return $version;
}

/**
 * Enqueue plugin assets.
 */
function screen_visualizer_enqueue_assets() {
    // Only enqueue on pages that contain our shortcode
    global $post;
    if (is_a($post, 'WP_Post') && has_shortcode($post->post_content, 'screen_visualizer')) {
        $asset_file = plugin_dir_path(__FILE__) . 'assets/build/index.asset.php';

        if (!file_exists($asset_file)) {
            wp_die('Screen Visualizer build assets not found. Please run npm run build.');
        }

        $asset = require $asset_file;

        // Enqueue the compiled React app
        wp_enqueue_script(
            'screen-visualizer',
            plugin_dir_url(__FILE__) . 'assets/build/index.js',
            $asset['dependencies'],
            $asset['version'],
            true
        );

        $screen_visualizer_config = array(
            'openrouterProxyUrl' => esc_url_raw(rest_url('screen-visualizer/v1/openrouter')),
        );

        wp_add_inline_script(
            'screen-visualizer',
            'window.screenVisualizerConfig = window.screenVisualizerConfig || ' . wp_json_encode($screen_visualizer_config) . ';',
            'before'
        );

        wp_localize_script(
            'screen-visualizer',
            'screenVisualizerConfig',
            $screen_visualizer_config
        );

        // Enqueue styles
        wp_enqueue_style(
            'screen-visualizer',
            plugin_dir_url(__FILE__) . 'assets/build/index.css',
            array(),
            screen_visualizer_get_asset_version()
        );
    }
}
add_action('wp_enqueue_scripts', 'screen_visualizer_enqueue_assets');

/**
 * Forward a request to OpenRouter from the WordPress server.
 */
function screen_visualizer_forward_openrouter_request($payload) {
    $response = wp_remote_post(
        'https://openrouter.ai/api/v1/chat/completions',
        array(
            'timeout' => 120,
            'headers' => array(
                'Authorization' => 'Bearer ' . SCREEN_VISUALIZER_OPENROUTER_API_KEY,
                'Content-Type' => 'application/json',
                'HTTP-Referer' => home_url('/'),
                'X-Title' => 'Screen Visualizer',
            ),
            'body' => wp_json_encode($payload),
        )
    );

    if (is_wp_error($response)) {
        return new WP_REST_Response(
            array(
                'error' => $response->get_error_message(),
            ),
            502
        );
    }

    $status_code = wp_remote_retrieve_response_code($response);
    $body = wp_remote_retrieve_body($response);
    $decoded = json_decode($body, true);

    if (json_last_error() !== JSON_ERROR_NONE || ! is_array($decoded)) {
        return new WP_REST_Response(
            array(
                'error' => 'Unexpected OpenRouter response.',
                'raw' => $body,
            ),
            502
        );
    }

    return new WP_REST_Response($decoded, $status_code > 0 ? $status_code : 200);
}

/**
 * Proxy OpenRouter requests through WordPress.
 */
function screen_visualizer_handle_openrouter_proxy($request) {
    $params = $request->get_json_params();

    if (! is_array($params)) {
        return new WP_REST_Response(
            array(
                'error' => 'Invalid request body.',
            ),
            400
        );
    }

    $model = isset($params['model']) ? sanitize_text_field((string) $params['model']) : '';
    $allowed_models = array(
        'google/gemini-3.1-flash-image-preview',
        'z-ai/glm-4.6v',
        'xiaomi/mimo-v2.5',
        'inclusionai/ling-2.6-1t:free',
        'google/gemma-4-31b-it:free',
        'sourceful/riverflow-v2-fast',
    );

    if (! in_array($model, $allowed_models, true)) {
        return new WP_REST_Response(
            array(
                'error' => 'Unsupported model.',
            ),
            400
        );
    }

    if (empty($params['messages']) || ! is_array($params['messages'])) {
        return new WP_REST_Response(
            array(
                'error' => 'Missing messages.',
            ),
            400
        );
    }

    $payload = array(
        'model' => $model,
        'messages' => $params['messages'],
    );

    if (isset($params['response_format'])) {
        $payload['response_format'] = $params['response_format'];
    }

    if (isset($params['modalities'])) {
        $payload['modalities'] = $params['modalities'];
    }

    return screen_visualizer_forward_openrouter_request($payload);
}

/**
 * Register REST routes for AI proxy requests.
 */
function screen_visualizer_register_rest_routes() {
    register_rest_route(
        'screen-visualizer/v1',
        '/openrouter',
        array(
            'methods' => WP_REST_Server::CREATABLE,
            'callback' => 'screen_visualizer_handle_openrouter_proxy',
            'permission_callback' => '__return_true',
        )
    );
}
add_action('rest_api_init', 'screen_visualizer_register_rest_routes');

/**
 * Register the [screen_visualizer] shortcode.
 */
function screen_visualizer_shortcode($atts) {
    $atts = shortcode_atts(array(
        'width' => '100%',
        'height' => '600px',
    ), $atts, 'screen_visualizer');

    ob_start();
    ?>
    <div id="screen-visualizer-root" data-width="<?php echo esc_attr($atts['width']); ?>" data-height="<?php echo esc_attr($atts['height']); ?>"></div>
    <?php
    return ob_get_clean();
}
add_shortcode('screen_visualizer', 'screen_visualizer_shortcode');

/**
 * Add plugin action links.
 */
function screen_visualizer_plugin_action_links($links) {
    $plugin_links = array(
        '<a href="https://screensofla.com" target="_blank">Documentation</a>',
    );
    return array_merge($plugin_links, $links);
}
add_filter('plugin_action_links_' . plugin_basename(__FILE__), 'screen_visualizer_plugin_action_links');

/**
 * Activation hook.
 */
function screen_visualizer_activate() {
    // Flush rewrite rules
    flush_rewrite_rules();
}
register_activation_hook(__FILE__, 'screen_visualizer_activate');

/**
 * Deactivation hook.
 */
function screen_visualizer_deactivate() {
    // Flush rewrite rules
    flush_rewrite_rules();
}
register_deactivation_hook(__FILE__, 'screen_visualizer_deactivate');
