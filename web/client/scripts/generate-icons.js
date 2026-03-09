import { readFile, writeFile } from 'fs/promises';
import { parseICO } from 'icojs';
import sharp from 'sharp';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const publicDir = join(__dirname, '..', 'public');

async function generateIcons() {
  const icoBuffer = await readFile(join(publicDir, 'favicon.ico'));
  const images = await parseICO(icoBuffer.buffer);

  // Pick the largest image from the ICO
  const largest = images.sort((a, b) => b.width - a.width)[0];
  console.log(`Extracted ${largest.width}x${largest.height} image from favicon.ico`);

  const sourceBuffer = Buffer.from(largest.buffer);

  // Generate PWA icons
  const sizes = [
    { size: 192, name: 'pwa-192x192.png' },
    { size: 512, name: 'pwa-512x512.png' },
    { size: 180, name: 'apple-touch-icon.png' },
  ];

  for (const { size, name } of sizes) {
    const output = join(publicDir, name);
    await sharp(sourceBuffer)
      .resize(size, size, { fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 0 } })
      .png()
      .toFile(output);
    console.log(`Generated ${name} (${size}x${size})`);
  }

  console.log('Done!');
}

generateIcons().catch(console.error);
