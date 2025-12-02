// SC Champions Icon Generator
// Run with: node scripts/generate-icons.js

const fs = require('fs');
const path = require('path');

// Wir erstellen ein einfaches SVG-Icon und konvertieren es
// Da wir kein Canvas haben, nutzen wir SVG als Basis

const size = 512;
const bgColor = "#1e40af";
const accentColor = "#60a5fa";
const textColor = "#ffffff";

function generateSVG(iconSize) {
    const scale = iconSize / 512;
    const fontSize = iconSize * 0.5;
    const strokeWidth = iconSize * 0.03;
    const radius = (iconSize / 2) * 0.9;
    const centerX = iconSize / 2;
    const centerY = iconSize / 2;

    return `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${iconSize}" height="${iconSize}" viewBox="0 0 ${iconSize} ${iconSize}" xmlns="http://www.w3.org/2000/svg">
  <!-- Background -->
  <rect width="${iconSize}" height="${iconSize}" fill="${bgColor}"/>

  <!-- Circle Ring -->
  <circle cx="${centerX}" cy="${centerY}" r="${radius}" fill="none" stroke="${accentColor}" stroke-width="${strokeWidth}"/>

  <!-- SC Text -->
  <text x="${centerX}" y="${centerY + fontSize * 0.1}"
        font-family="Arial, Helvetica, sans-serif"
        font-size="${fontSize}"
        font-weight="bold"
        fill="${textColor}"
        text-anchor="middle"
        dominant-baseline="middle">SC</text>

  <!-- Accent Bar -->
  <rect x="${centerX - iconSize * 0.15}" y="${centerY + fontSize * 0.35}"
        width="${iconSize * 0.3}" height="${iconSize * 0.03}"
        rx="${iconSize * 0.015}" fill="${accentColor}"/>
</svg>`;
}

// Icon sizes needed for PWA and Capacitor
const sizes = [72, 96, 128, 144, 152, 192, 384, 512];

// Create directories
const publicIconsDir = path.join(__dirname, '..', 'public', 'icons');
const androidResDir = path.join(__dirname, '..', 'android', 'app', 'src', 'main', 'res');

if (!fs.existsSync(publicIconsDir)) {
    fs.mkdirSync(publicIconsDir, { recursive: true });
}

console.log('Generating SC Champions icons...\n');

// Generate SVG icons for PWA (public/icons/)
sizes.forEach(size => {
    const svg = generateSVG(size);
    const filename = `icon-${size}x${size}.svg`;
    const filepath = path.join(publicIconsDir, filename);
    fs.writeFileSync(filepath, svg);
    console.log(`✓ Created ${filename}`);
});

// Create main icon
const mainSvg = generateSVG(512);
fs.writeFileSync(path.join(publicIconsDir, 'icon.svg'), mainSvg);
console.log('✓ Created icon.svg (main icon)');

// Create favicon
const faviconSvg = generateSVG(32);
fs.writeFileSync(path.join(__dirname, '..', 'public', 'favicon.svg'), faviconSvg);
console.log('✓ Created favicon.svg');

console.log('\n✅ SVG icons generated successfully!');
console.log('\n📋 Next steps:');
console.log('1. Convert SVGs to PNGs using an online tool or:');
console.log('   npm install sharp');
console.log('   node scripts/convert-icons.js');
console.log('\n2. Or use the HTML icon generator in browser and save manually');
console.log('\nIcon locations:');
console.log(`- PWA icons: ${publicIconsDir}`);
