// Simple utility to list mounted routes for the Express app
// Run: node scripts/list_routes.js

const app = require('../src/app');

function listRoutes(stack, basePath = '') {
  const routes = [];

  stack.forEach(layer => {
    if (layer.route && layer.route.path) {
      const methods = Object.keys(layer.route.methods).join(',').toUpperCase();
      routes.push({ path: basePath + layer.route.path, methods });
    } else if (layer.name === 'router' && layer.handle && layer.handle.stack) {
      // nested router
      const mountPath = layer.regexp && layer.regexp.source
        ? (layer.regexp.source.replace('^\\', '').replace('\\/?(?=\\/|$)', '').replace('(?:\\/)?', ''))
        : '';
      // best effort: use layer.regexp to show mount path
      const nestedBase = basePath; // keeping basePath as-is since regexp parsing is messy
      routes.push(...listRoutes(layer.handle.stack, nestedBase));
    }
  });

  return routes;
}

const routes = listRoutes(app._router.stack || []);

console.log('Mounted routes:');
routes.forEach(r => console.log(`${r.methods}	${r.path}`));

if (routes.length === 0) {
  console.log('(No routes found — ensure app is exporting the Express instance correctly)');
}
