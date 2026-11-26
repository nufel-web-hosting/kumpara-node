// dist/cjs is CommonJS inside a "type": "module" package: say so, so require() loads it as CommonJS
require('node:fs').writeFileSync('dist/cjs/package.json', '{ "type": "commonjs" }\n');
