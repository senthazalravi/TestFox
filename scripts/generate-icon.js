/**
 * Script to generate PNG icon from SVG
 * 
 * Before running, install sharp:
 * npm install sharp --save-dev
 * 
 * Then run:
 * node scripts/generate-icon.js
 */

const fs = require('fs');
const path = require('path');

async function generateIcon() {
    try {
        // Try to use sharp if available
        const sharp = require('sharp');
        
        // Use the full color SVG for marketplace PNG icon
        const svgPath = path.join(__dirname, '..', 'media', 'testfox-full.svg');
        const pngPath = path.join(__dirname, '..', 'media', 'testfox-icon.png');

        // Check if full color SVG exists
        let svgContent;
        if (fs.existsSync(svgPath)) {
            svgContent = fs.readFileSync(svgPath);
        } else {
            // Fallback to monochrome SVG if needed
            const fallbackPath = path.join(__dirname, '..', 'media', 'testfox-icon.svg');
            svgContent = fs.readFileSync(fallbackPath);
        }
        
        await sharp(svgContent)
            .resize(128, 128)
            .png()
            .toFile(pngPath);
        
        console.log('✅ Icon generated successfully: media/testfox-icon.png');
    } catch (error) {
        if (error.code === 'MODULE_NOT_FOUND') {
            console.log('Sharp not installed. To generate the icon:');
            console.log('');
            console.log('  Option 1: Install sharp and run this script');
            console.log('    npm install sharp --save-dev');
            console.log('    node scripts/generate-icon.js');
            console.log('');
            console.log('  Option 2: Use an online converter');
            console.log('    - Go to https://cloudconvert.com/svg-to-png');
            console.log('    - Upload media/testfox-full.svg');
            console.log('    - Set size to 128x128');
            console.log('    - Download and save as media/testfox-icon.png');
            console.log('');
            console.log('  Option 3: Use Inkscape (if installed)');
            console.log('    inkscape media/testfox-full.svg --export-type=png \\');
            console.log('      --export-filename=media/testfox-icon.png \\');
            console.log('      --export-width=128 --export-height=128');
        } else {
            console.error('Error generating icon:', error.message);
        }
    }
}

generateIcon();
