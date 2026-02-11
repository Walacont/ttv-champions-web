/**
 * Image Compressor - Client-seitige Bildkomprimierung via Canvas API
 * Reduziert Bildgröße vor dem Upload um Egress-Kosten zu minimieren.
 */

const DEFAULT_OPTIONS = {
    maxWidth: 1920,
    maxHeight: 1920,
    quality: 0.82,
    mimeType: 'image/jpeg'
};

/**
 * Komprimiert ein Bild vor dem Upload.
 * Skaliert auf maxWidth/maxHeight und konvertiert zu JPEG mit einstellbarer Qualität.
 *
 * @param {File} file - Die Bilddatei
 * @param {Object} options
 * @param {number} options.maxWidth - Maximale Breite (default: 1920)
 * @param {number} options.maxHeight - Maximale Höhe (default: 1920)
 * @param {number} options.quality - JPEG-Qualität 0-1 (default: 0.82)
 * @returns {Promise<File>} - Die komprimierte Bilddatei
 */
export async function compressImage(file, options = {}) {
    const opts = { ...DEFAULT_OPTIONS, ...options };

    // GIFs nicht komprimieren (Animation bleibt erhalten)
    if (file.type === 'image/gif') {
        return file;
    }

    // Kleine Bilder (< 200KB) nicht komprimieren
    if (file.size < 200 * 1024) {
        return file;
    }

    return new Promise((resolve, reject) => {
        const img = new Image();
        const url = URL.createObjectURL(file);

        img.onload = () => {
            URL.revokeObjectURL(url);

            let { width, height } = img;

            // Skalierung berechnen
            if (width > opts.maxWidth || height > opts.maxHeight) {
                const ratio = Math.min(opts.maxWidth / width, opts.maxHeight / height);
                width = Math.round(width * ratio);
                height = Math.round(height * ratio);
            }

            // Wenn keine Skalierung nötig und Bild schon klein genug, Original zurückgeben
            if (width === img.width && height === img.height && file.size < 500 * 1024) {
                resolve(file);
                return;
            }

            const canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;

            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, width, height);

            canvas.toBlob(
                (blob) => {
                    if (!blob) {
                        resolve(file); // Fallback zum Original
                        return;
                    }

                    // Nur komprimierte Datei verwenden wenn sie kleiner ist
                    if (blob.size >= file.size) {
                        resolve(file);
                        return;
                    }

                    const compressedFile = new File(
                        [blob],
                        file.name.replace(/\.[^/.]+$/, '.jpg'),
                        { type: 'image/jpeg', lastModified: Date.now() }
                    );

                    console.log(`[ImageCompressor] ${(file.size / 1024).toFixed(0)}KB -> ${(compressedFile.size / 1024).toFixed(0)}KB (${Math.round((1 - compressedFile.size / file.size) * 100)}% reduction)`);
                    resolve(compressedFile);
                },
                'image/jpeg',
                opts.quality
            );
        };

        img.onerror = () => {
            URL.revokeObjectURL(url);
            reject(new Error('Failed to load image for compression'));
        };

        img.src = url;
    });
}

// Export für globalen Zugriff
window.imageCompressor = { compressImage };
