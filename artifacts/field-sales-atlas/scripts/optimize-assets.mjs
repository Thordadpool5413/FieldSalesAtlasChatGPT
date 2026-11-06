import { chromium } from '@playwright/test';
import { copyFile, mkdir, readFile, writeFile, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

// Resample the supplied artwork without redrawing or changing its content.
// Keep full-resolution originals outside the public bundle for future exports.
const root = fileURLToPath(new URL('../', import.meta.url));
await mkdir(resolve(root, 'docs/export'), { recursive: true });
for (const [source, original] of [['app-icon.png', 'app-icon-original.png'], ['field-sales-atlas-logo.jpg', 'brand-original.jpg']]) {
  const target = resolve(root, 'docs/export', original);
  if (!existsSync(target)) await copyFile(resolve(root, 'public/resources', source), target);
}
const png = (await readFile(resolve(root, 'docs/export/app-icon-original.png'))).toString('base64');
const jpeg = (await readFile(resolve(root, 'docs/export/brand-original.jpg'))).toString('base64');
const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || (existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined) });
try {
  const page = await browser.newPage();
  for (const [name, size, type] of [
    ['app-icon.png', 512, 'image/png'], ['app-icon-192.png', 192, 'image/png'],
    ['apple-touch-icon.png', 180, 'image/png'], ['favicon.png', 32, 'image/png'],
    ['field-sales-atlas-logo.jpg', 512, 'image/jpeg'],
  ]) {
    const encoded = await page.evaluate(async ({ source, size, type }) => {
      const image = new Image();
      image.src = `data:${type};base64,${source}`;
      await image.decode();
      const canvas = document.createElement('canvas'); canvas.width = size; canvas.height = size;
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Canvas is unavailable.');
      context.imageSmoothingQuality = 'high';
      context.drawImage(image, 0, 0, size, size);
      return canvas.toDataURL(type, .86).split(',')[1];
    }, { source: type === 'image/jpeg' ? jpeg : png, size, type });
    const path = resolve(root, 'public/resources', name);
    await writeFile(path, Buffer.from(encoded, 'base64'));
    console.log(name, `${size}×${size}`, (await stat(path)).size, 'bytes');
  }
} finally { await browser.close(); }
