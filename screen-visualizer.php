<?php
/**
 * Plugin Name: Screen Visualizer
 * Plugin URI:  https://screensofla.com
 * Description: A WordPress plugin that lets homeowners capture or upload patio photos and preview custom motorized screen mockups. Use shortcode [screen_visualizer] to display.
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
