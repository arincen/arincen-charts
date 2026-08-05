/**
 * Deliberately empty.
 *
 * PostCSS walks up the directory tree looking for a config, and without this it
 * finds the Laravel application's Tailwind setup two levels above and tries to
 * process the documentation site's CSS with it. The docs are a separate site
 * that happens to live in the same repository; they should not inherit the
 * app's build, and the app should not have to know they exist.
 */
export default { plugins: {} };
