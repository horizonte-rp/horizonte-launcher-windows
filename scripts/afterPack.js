const rcedit = require('rcedit');
const path = require('path');
const fs = require('fs');

// Encontrar todos os arquivos .exe recursivamente
function findExeFiles(dir, files = []) {
    const items = fs.readdirSync(dir);
    for (const item of items) {
        const fullPath = path.join(dir, item);
        const stat = fs.statSync(fullPath);
        if (stat.isDirectory()) {
            findExeFiles(fullPath, files);
        } else if (item.endsWith('.exe')) {
            files.push(fullPath);
        }
    }
    return files;
}

exports.default = async function(context) {
    const appOutDir = context.appOutDir;
    const iconPath = path.join(__dirname, '../build/icon.ico');
    const productName = 'Horizonte Launcher';
    const companyName = 'Horizonte Games';
    const fileDescription = 'Horizonte Launcher';
    const productVersion = context.packager.appInfo.version;

    console.log('Finding all executables in:', appOutDir);

    // Encontrar todos os .exe
    const exeFiles = findExeFiles(appOutDir);
    console.log(`Found ${exeFiles.length} executable(s)`);

    for (const exePath of exeFiles) {
        const fileName = path.basename(exePath);
        console.log(`Processing: ${fileName}`);

        try {
            // Configurar rcedit para modificar metadados do executável
            const options = {
                'file-version': productVersion,
                'product-version': productVersion,
                'version-string': {
                    'ProductName': productName,
                    'FileDescription': fileDescription,
                    'CompanyName': companyName,
                    'LegalCopyright': `Copyright © ${new Date().getFullYear()} ${companyName}`,
                    'OriginalFilename': fileName,
                    'InternalName': productName
                }
            };

            // Aplicar ícone ao executável principal e elevate.exe
            if (fileName.toLowerCase() === 'horizonte launcher.exe' || fileName.toLowerCase() === 'elevate.exe') {
                options.icon = iconPath;
            }

            // Não modificar drivers externos (podem quebrar a assinatura)
            if (fileName.startsWith('vcredist') || fileName.startsWith('vc_redist') || fileName === 'dxwebsetup.exe') {
                console.log(`  - Skipping driver: ${fileName}`);
                continue;
            }

            await rcedit(exePath, options);
            console.log(`  ✓ ${fileName} updated`);
        } catch (error) {
            console.error(`  ✗ Failed to update ${fileName}:`, error.message);
        }
    }

    console.log('All executables processed!');
};
