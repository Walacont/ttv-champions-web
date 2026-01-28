/**
 * Cloudflare R2 Storage Client für SC Champions
 *
 * Ersetzt Supabase Storage mit Cloudflare R2 über einen Worker-Proxy
 */

import { getSupabase } from './supabase-init.js';

// Konfiguration - Worker URL nach Deployment anpassen!
const R2_CONFIG = {
    // Worker URL - muss nach dem Deployment angepasst werden
    workerUrl: 'https://sc-champions-storage.YOUR_SUBDOMAIN.workers.dev',
    // Fallback auf Supabase Storage wenn Worker nicht erreichbar
    fallbackToSupabase: true
};

/**
 * Setzt die Worker-URL (für dynamische Konfiguration)
 */
export function setR2WorkerUrl(url) {
    R2_CONFIG.workerUrl = url;
}

/**
 * Holt den aktuellen Auth-Token
 */
async function getAuthToken() {
    const supabase = getSupabase();
    const { data: { session } } = await supabase.auth.getSession();
    return session?.access_token;
}

/**
 * Lädt eine Datei zu R2 hoch
 *
 * @param {string} folder - Zielordner (z.B. 'profile-pictures', 'training-videos')
 * @param {File} file - Die hochzuladende Datei
 * @param {Object} options - Optionen
 * @param {string} options.subfolder - Unterordner (Standard: User-ID)
 * @param {string} options.filename - Benutzerdefinierter Dateiname
 * @param {Function} options.onProgress - Progress-Callback (0-100)
 * @returns {Promise<{url: string, key: string}>}
 */
export async function uploadToR2(folder, file, options = {}) {
    const token = await getAuthToken();
    if (!token) {
        throw new Error('Nicht authentifiziert');
    }

    const formData = new FormData();
    formData.append('file', file);

    if (options.subfolder) {
        formData.append('subfolder', options.subfolder);
    }
    if (options.filename) {
        formData.append('filename', options.filename);
    }

    try {
        const response = await fetch(`${R2_CONFIG.workerUrl}/upload/${folder}`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`
            },
            body: formData
        });

        if (!response.ok) {
            const error = await response.json().catch(() => ({ error: 'Upload fehlgeschlagen' }));
            throw new Error(error.error || 'Upload fehlgeschlagen');
        }

        const result = await response.json();
        return {
            url: result.url,
            key: result.key,
            filename: result.filename,
            size: result.size,
            contentType: result.contentType
        };

    } catch (error) {
        console.error('[R2] Upload error:', error);

        // Fallback auf Supabase Storage
        if (R2_CONFIG.fallbackToSupabase) {
            console.log('[R2] Falling back to Supabase Storage');
            return await uploadToSupabaseFallback(folder, file, options);
        }

        throw error;
    }
}

/**
 * Löscht eine Datei aus R2
 *
 * @param {string} key - Der vollständige Pfad zur Datei
 * @returns {Promise<boolean>}
 */
export async function deleteFromR2(key) {
    const token = await getAuthToken();
    if (!token) {
        throw new Error('Nicht authentifiziert');
    }

    try {
        const response = await fetch(`${R2_CONFIG.workerUrl}/delete/${key}`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        if (!response.ok) {
            const error = await response.json().catch(() => ({ error: 'Löschen fehlgeschlagen' }));
            throw new Error(error.error || 'Löschen fehlgeschlagen');
        }

        return true;

    } catch (error) {
        console.error('[R2] Delete error:', error);

        // Fallback auf Supabase Storage
        if (R2_CONFIG.fallbackToSupabase) {
            console.log('[R2] Falling back to Supabase Storage for delete');
            return await deleteFromSupabaseFallback(key);
        }

        throw error;
    }
}

/**
 * Generiert eine öffentliche URL für eine Datei
 *
 * @param {string} key - Der vollständige Pfad zur Datei
 * @returns {string}
 */
export function getR2PublicUrl(key) {
    // Wenn R2 Public URL konfiguriert ist
    if (R2_CONFIG.publicUrl) {
        return `${R2_CONFIG.publicUrl}/${key}`;
    }
    // Sonst über Worker abrufen
    return `${R2_CONFIG.workerUrl}/file/${key}`;
}

/**
 * Fallback: Upload zu Supabase Storage
 */
async function uploadToSupabaseFallback(folder, file, options = {}) {
    const supabase = getSupabase();
    const { data: { user } } = await supabase.auth.getUser();

    const subfolder = options.subfolder || user?.id || 'anonymous';
    const extension = file.name.split('.').pop();
    const filename = options.filename || `${Date.now()}-${Math.random().toString(36).substring(2, 10)}.${extension}`;
    const filePath = `${subfolder}/${filename}`;

    const { data, error } = await supabase.storage
        .from(folder)
        .upload(filePath, file, { upsert: true });

    if (error) throw error;

    const { data: urlData } = supabase.storage
        .from(folder)
        .getPublicUrl(filePath);

    return {
        url: urlData.publicUrl,
        key: `${folder}/${filePath}`,
        filename: filename,
        size: file.size,
        contentType: file.type
    };
}

/**
 * Fallback: Löschen aus Supabase Storage
 */
async function deleteFromSupabaseFallback(key) {
    const supabase = getSupabase();
    const parts = key.split('/');
    const folder = parts[0];
    const filePath = parts.slice(1).join('/');

    const { error } = await supabase.storage
        .from(folder)
        .remove([filePath]);

    if (error) throw error;
    return true;
}

/**
 * Wrapper-Funktion die kompatibel mit bestehendem Code ist
 * Ersetzt: supabase.storage.from(bucket).upload(path, file)
 */
export async function storageUpload(bucket, path, file, options = {}) {
    const parts = path.split('/');
    const subfolder = parts.slice(0, -1).join('/') || undefined;
    const filename = parts[parts.length - 1];

    return await uploadToR2(bucket, file, {
        subfolder,
        filename,
        ...options
    });
}

/**
 * Wrapper-Funktion die kompatibel mit bestehendem Code ist
 * Ersetzt: supabase.storage.from(bucket).remove([path])
 */
export async function storageRemove(bucket, paths) {
    const results = await Promise.all(
        paths.map(path => deleteFromR2(`${bucket}/${path}`).catch(e => ({ error: e })))
    );
    return results;
}

/**
 * Wrapper-Funktion die kompatibel mit bestehendem Code ist
 * Ersetzt: supabase.storage.from(bucket).getPublicUrl(path)
 */
export function storageGetPublicUrl(bucket, path) {
    return {
        data: {
            publicUrl: getR2PublicUrl(`${bucket}/${path}`)
        }
    };
}

// Export default config
export { R2_CONFIG };
