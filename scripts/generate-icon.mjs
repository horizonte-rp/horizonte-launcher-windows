import sharp from 'sharp';
import toIco from 'to-ico';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const inputPath = path.join(__dirname, '../src/assets/images/logo.png');
const outputPath = path.join(__dirname, '../build/icon.ico');

// Sizes required for Windows ICO
const sizes = [16, 24, 32, 48, 64, 128, 256];

// Ensure build directory exists
const buildDir = path.join(__dirname, '../build');
if (!fs.existsSync(buildDir)) {
    fs.mkdirSync(buildDir, { recursive: true });
}

async function generateIcon() {
    try {
        const pngBuffers = [];

        for (const size of sizes) {
            const buffer = await sharp(inputPath)
                .resize(size, size, {
                    fit: 'contain',
                    background: { r: 0, g: 0, b: 0, alpha: 0 }
                })
                .png()
                .toBuffer();
            pngBuffers.push(buffer);
        }

        const icoBuffer = await toIco(pngBuffers);
        fs.writeFileSync(outputPath, icoBuffer);
        console.log('Icon generated successfully at:', outputPath);
        console.log('Sizes included:', sizes.join(', '));
    } catch (err) {
        console.error('Error generating icon:', err);
        process.exit(1);
    }
}

generateIcon();
