// Render the canonical Remirror logo SVGs (resources/icons/source/*.svg)
// into multi-resolution .ico files for app + tray, plus a 256x256 PNG for
// the renderer favicon / UI.
//
// Run: npm run build:icons
// Outputs:
//   resources/icons/app.ico    (dark logo — for Windows installer / file explorer)
//   resources/icons/tray.ico   (white logo — for system tray)
//   resources/icons/logo-white-256.png
//   resources/icons/logo-dark-256.png

import { Resvg } from '@resvg/resvg-js';
import pngToIco from 'png-to-ico';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');
const srcDir = path.join(projectRoot, 'resources', 'icons', 'source');
const dstDir = path.join(projectRoot, 'resources', 'icons');

const ICO_SIZES = [16, 24, 32, 48, 64, 128, 256];

function svgToPngBuffer(svgPath, size) {
  const svg = fs.readFileSync(svgPath);
  const resvg = new Resvg(svg, {
    fitTo: { mode: 'width', value: size },
    background: 'rgba(0,0,0,0)',
  });
  return resvg.render().asPng();
}

async function buildIco(svgPath, outIcoPath) {
  const pngBuffers = ICO_SIZES.map(size => svgToPngBuffer(svgPath, size));
  const ico = await pngToIco(pngBuffers);
  fs.writeFileSync(outIcoPath, ico);
  console.log(`[build-icons] wrote ${path.relative(projectRoot, outIcoPath)} (${ico.length} bytes, ${ICO_SIZES.length} sizes)`);
}

function buildPng(svgPath, outPngPath, size) {
  const buf = svgToPngBuffer(svgPath, size);
  fs.writeFileSync(outPngPath, buf);
  console.log(`[build-icons] wrote ${path.relative(projectRoot, outPngPath)} (${buf.length} bytes, ${size}x${size})`);
}

const darkSvg = path.join(srcDir, 'remirror-dark.svg');
const whiteSvg = path.join(srcDir, 'remirror-white.svg');

if (!fs.existsSync(darkSvg) || !fs.existsSync(whiteSvg)) {
  console.error('[build-icons] missing source SVGs at resources/icons/source/');
  process.exit(1);
}

await buildIco(darkSvg, path.join(dstDir, 'app.ico'));
await buildIco(whiteSvg, path.join(dstDir, 'tray.ico'));
buildPng(whiteSvg, path.join(dstDir, 'logo-white-256.png'), 256);
buildPng(darkSvg, path.join(dstDir, 'logo-dark-256.png'), 256);
