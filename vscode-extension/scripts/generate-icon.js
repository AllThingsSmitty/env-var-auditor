import sharp from 'sharp';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const svgPath = resolve(__dirname, '..', 'icon.svg');
const outPath = resolve(__dirname, '..', 'icon.png');

const svg = readFileSync(svgPath);

await sharp(svg).resize(128, 128).png().toFile(outPath);

console.log(`icon.png written to ${outPath}`);
