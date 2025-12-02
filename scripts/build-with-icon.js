const { execSync } = require('child_process');
const rcedit = require('rcedit');
const path = require('path');

const exePath = path.join(__dirname, '../dist/win-unpacked/Horizonte Launcher.exe');
const iconPath = path.join(__dirname, '../build/icon.ico');

async function build() {
    console.log('Building application...');

    try {
        // Build the app
        execSync('npm run build:win', {
            stdio: 'inherit',
            cwd: path.join(__dirname, '..')
        });
    } catch (error) {
        console.error('Build failed:', error.message);
        process.exit(1);
    }

    console.log('\nApplying custom icon to executable...');

    try {
        await rcedit(exePath, {
            icon: iconPath
        });
        console.log('Icon applied successfully!');
    } catch (error) {
        console.error('Failed to apply icon:', error.message);
    }

    console.log('\nBuild complete! Installer at: dist/Horizonte Launcher Setup 1.0.0.exe');
}

build();
