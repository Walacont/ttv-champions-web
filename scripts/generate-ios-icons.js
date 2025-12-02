#!/usr/bin/env node
// iOS Icon Generator for SC Champions
// Uses the 512x512 icon from public/icons as source
// Run with: node scripts/generate-ios-icons.js

import sharp from 'sharp';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const sourceIcon = path.join(__dirname, '..', 'public', 'icons', 'icon-512x512-2.png');
const iosIconDir = path.join(__dirname, '..', 'ios', 'App', 'App', 'Assets.xcassets', 'AppIcon.appiconset');

// iOS requires a 1024x1024 icon
const iosIconSize = 1024;

async function generateIosIcons() {
    console.log('Generating iOS icons from public/icons...\n');

    // Check if source exists
    if (!fs.existsSync(sourceIcon)) {
        console.error(`Source icon not found: ${sourceIcon}`);
        process.exit(1);
    }

    // Ensure iOS icon directory exists
    if (!fs.existsSync(iosIconDir)) {
        fs.mkdirSync(iosIconDir, { recursive: true });
    }

    try {
        // Generate 1024x1024 iOS App Icon
        const outputPath = path.join(iosIconDir, 'AppIcon-512@2x.png');

        await sharp(sourceIcon)
            .resize(iosIconSize, iosIconSize, {
                fit: 'cover',
                kernel: sharp.kernel.lanczos3
            })
            .png()
            .toFile(outputPath);

        console.log(`✓ Generated AppIcon-512@2x.png (${iosIconSize}x${iosIconSize})`);

        // Update Contents.json for iOS
        const contentsJson = {
            "images": [
                {
                    "filename": "AppIcon-512@2x.png",
                    "idiom": "universal",
                    "platform": "ios",
                    "size": "1024x1024"
                }
            ],
            "info": {
                "author": "xcode",
                "version": 1
            }
        };

        fs.writeFileSync(
            path.join(iosIconDir, 'Contents.json'),
            JSON.stringify(contentsJson, null, 2)
        );
        console.log('✓ Updated Contents.json');

        console.log('\n✅ iOS icons generated successfully!');
        console.log(`\nIcon location: ${iosIconDir}`);

    } catch (error) {
        console.error('Error generating icons:', error);
        process.exit(1);
    }
}

generateIosIcons();
