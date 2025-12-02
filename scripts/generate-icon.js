const pngToIco = require('png-to-ico');
const fs = require('fs');
const path = require('path');

const inputPath = path.join(__dirname, '../src/assets/images/logo.png');
const outputPath = path.join(__dirname, '../build/icon.ico');

// Ensure build directory exists
const buildDir = path.join(__dirname, '../build');
if (!fs.existsSync(buildDir)) {
    fs.mkdirSync(buildDir, { recursive: true });
}

pngToIco(inputPath)
    .then(buf => {
        fs.writeFileSync(outputPath, buf);
        console.log('Icon generated successfully at:', outputPath);
    })
    .catch(err => {
        console.error('Error generating icon:', err);
        process.exit(1);
    });
