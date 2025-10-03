// Environment variable loader placeholder
// Load .env into process.env in development
require('dotenv').config();

// Basic validation for required environment variables. This helps catch
// misconfiguration early but won't throw in CI where different env var
// strategies may be used. Update the list as your app needs grow.
const required = [
	'DB_HOST',
	'DB_USER',
	'DB_NAME'
];

const missing = required.filter((k) => !process.env[k]);
if (missing.length) {
	// Some environments (like CI or deploy) may intentionally not set these;
	// we log a visible warning so developers notice locally.
	// This file is safe to keep public since it does not contain secret values.
	console.warn(`Warning: missing required env vars: ${missing.join(', ')}`);
}