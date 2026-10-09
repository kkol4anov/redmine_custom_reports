/* Compatibility entry point. Tests now run in a real browser rather than jsdom.
 * Dev-only dependencies: playwright, jquery@3.6.1.
 * See nvd3_browser_test.js for optional browser and screenshot settings.
 */
require('./nvd3_browser_test');
