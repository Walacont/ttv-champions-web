#!/usr/bin/env node

/**
 * Production Build Script
 *
 * This script:
 * 1. Copies all files from /public to /dist
 * 2. Processes all .js files with esbuild:
 *    - Removes console.log, console.warn, console.debug
 *    - Keeps console.error (important for debugging)
 *    - Minifies the code
 * 3. Outputs optimized files to /dist
 */

import * as esbuild from 'esbuild';
import { glob } from 'glob';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PUBLIC_DIR = path.join(__dirname, 'public');
const DIST_DIR = path.join(__dirname, 'dist');

// Plugin to remove console.log but keep console.error
const dropConsolePlugin = {
  name: 'drop-console',
  setup(build) {
    // This is handled by esbuild's built-in drop option
  },
};

async function cleanDist() {
  console.log('🧹 Cleaning dist directory...');
  try {
    await fs.rm(DIST_DIR, { recursive: true, force: true });
    await fs.mkdir(DIST_DIR, { recursive: true });
    console.log('✅ Dist directory cleaned');
  } catch (error) {
    console.error('❌ Error cleaning dist:', error);
    throw error;
  }
}

async function copyPublicFiles() {
  console.log('📁 Copying public files to dist...');

  try {
    // Copy everything from public to dist using a simple recursive function
    await copyRecursive(PUBLIC_DIR, DIST_DIR);
    console.log('✅ Public files copied');
  } catch (error) {
    console.error('❌ Error copying files:', error);
    throw error;
  }
}

async function copyRecursive(src, dest) {
  const entries = await fs.readdir(src, { withFileTypes: true });

  await fs.mkdir(dest, { recursive: true });

  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (entry.isDirectory()) {
      await copyRecursive(srcPath, destPath);
    } else {
      await fs.copyFile(srcPath, destPath);
    }
  }
}

async function processJavaScriptFiles() {
  console.log('⚙️  Processing JavaScript files...');

  try {
    // Find all .js files in dist/js directory
    const jsFiles = await glob('dist/js/**/*.js', {
      ignore: ['dist/js/**/*.min.js'], // Skip already minified files
      cwd: __dirname,
      absolute: true,
    });

    console.log(`Found ${jsFiles.length} JavaScript files to process`);

    // Process each file with esbuild
    for (const file of jsFiles) {
      const relativePath = path.relative(DIST_DIR, file);

      try {
        await esbuild.build({
          entryPoints: [file],
          outfile: file,
          allowOverwrite: true,
          minify: true,
          target: 'es2020',
          format: 'esm',
          drop: ['debugger'], // Remove debugger statements
          pure: ['console.log', 'console.warn', 'console.debug', 'console.info'], // Mark as pure (safe to remove)
          // Note: console.error is preserved for production error tracking
          logLevel: 'warning',
        });

        console.log(`  ✅ Processed: ${relativePath}`);
      } catch (error) {
        console.error(`  ❌ Error processing ${relativePath}:`, error.message);
        // Continue processing other files even if one fails
      }
    }

    console.log('✅ JavaScript files processed');
  } catch (error) {
    console.error('❌ Error processing JavaScript:', error);
    throw error;
  }
}

async function createProductionBuild() {
  console.log('🏗️  Starting production build...\n');

  const startTime = Date.now();

  try {
    await cleanDist();
    await copyPublicFiles();
    await processJavaScriptFiles();

    const duration = ((Date.now() - startTime) / 1000).toFixed(2);

    console.log(`\n✅ Production build completed in ${duration}s`);
    console.log(`📦 Output: ${DIST_DIR}`);
    console.log('\nℹ️  Console logs removed from production build');
    console.log('ℹ️  console.error statements are preserved for debugging');
  } catch (error) {
    console.error('\n❌ Build failed:', error);
    process.exit(1);
  }
}

// Run the build
createProductionBuild();
