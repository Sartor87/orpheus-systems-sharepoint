/* eslint-disable */
// Renders the 96x96 App Catalog icon (amber Orpheus mark on a dark rounded square) and prints the SVG data URI
// used as the web part toolbox icon. Usage (after `npm run build:shared`): node packages/shared-ui/scripts/render-icon.js
const fs = require('fs');
const path = require('path');
const { Resvg } = require('@resvg/resvg-js');
const { orpheusMarkSvg } = require('../lib/brand/brand');
const { orpheusTokens } = require('../lib/theme/tokens');

const SIZE = 96;
const MARK = 64;
const inner = orpheusMarkSvg(MARK, orpheusTokens.amber).replace(/^<svg /, `<svg x="${(SIZE - MARK) / 2}" y="${(SIZE - MARK) / 2}" `);
const svg =
  `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}">` +
  `<rect width="${SIZE}" height="${SIZE}" rx="20" fill="${orpheusTokens.bg}"/>${inner}</svg>`;

const png = new Resvg(svg, { fitTo: { mode: 'width', value: SIZE } }).render().asPng();
const out = path.resolve(__dirname, '../../wp-contract-calendar/sharepoint/images/orpheus-icon-96.png');
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, png);
console.log(`Wrote ${out} (${png.length} bytes)`);
console.log('data:image/svg+xml,' + encodeURIComponent(svg));
