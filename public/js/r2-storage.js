/**
 * Cloudflare R2 Storage Client für SC Champions
 *
 * Ersetzt Supabase Storage mit Cloudflare R2 über einen Worker-Proxy
 */

import { getSupabase } from './supabase-init.js';
import { supabaseConfig } from './supabase-config.js';

// Konfiguration - Worker URL nach Deployment anpassen!
const R2_CONFIG = {
    // Worker URL
    workerUrl: 'https://sc-champions-storage.sc-champions.workers.dev',
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

/**
 * Generiert die Supabase Storage Public URL für einen Bucket + Pfad
 * Wird als Fallback für ältere Dateien verwendet, die noch nicht zu R2 migriert wurden.
 */
export function getSupabaseStorageUrl(bucket, path) {
    return `${supabaseConfig.url}/storage/v1/object/public/${bucket}/${path}`;
}

/**
 * Generiert eine Media-URL mit Fallback-Logik für die Übergangsphase.
 * Gibt ein Objekt mit primaryUrl (R2) und fallbackUrl (Supabase) zurück.
 *
 * @param {string} bucket - Der Storage-Bucket (z.B. 'match-media')
 * @param {string} filePath - Der relative Dateipfad
 * @returns {{ primaryUrl: string, fallbackUrl: string }}
 */
export function getMediaUrlWithFallback(bucket, filePath) {
    return {
        primaryUrl: getR2PublicUrl(`${bucket}/${filePath}`),
        fallbackUrl: getSupabaseStorageUrl(bucket, filePath)
    };
}

/**
 * Migriert eine einzelne Datei von Supabase Storage zu R2.
 * Lädt die Datei von Supabase herunter und lädt sie zu R2 hoch.
 *
 * @param {string} bucket - Der Storage-Bucket (z.B. 'match-media')
 * @param {string} filePath - Der relative Dateipfad
 * @returns {Promise<{success: boolean, r2Url: string}>}
 */
export async function migrateFileToR2(bucket, filePath) {
    const supabaseUrl = getSupabaseStorageUrl(bucket, filePath);

    // Datei von Supabase herunterladen
    const response = await fetch(supabaseUrl);
    if (!response.ok) {
        throw new Error(`Failed to download from Supabase: ${response.status}`);
    }

    const blob = await response.blob();
    const fileName = filePath.split('/').pop();
    const file = new File([blob], fileName, { type: blob.type });

    // Subfolder aus filePath ableiten (alles vor dem Dateinamen)
    const parts = filePath.split('/');
    const subfolder = parts.slice(0, -1).join('/');

    // Zu R2 hochladen
    const result = await uploadToR2(bucket, file, {
        subfolder: subfolder,
        filename: fileName
    });

    return { success: true, r2Url: result.url };
}

/**
 * Migriert alle Match-Media-Dateien von Supabase zu R2.
 * Liest alle Einträge aus der match_media-Tabelle und migriert sie.
 *
 * Aufruf über Browser-Konsole:
 *   import('/js/r2-storage.js').then(m => m.migrateAllMatchMedia())
 *
 * @param {Function} onProgress - Callback(current, total, filePath)
 * @returns {Promise<{migrated: number, failed: number, errors: Array}>}
 */
export async function migrateAllMatchMedia(onProgress) {
    const supabase = getSupabase();
    const { data: allMedia, error } = await supabase
        .from('match_media')
        .select('id, file_path')
        .order('created_at', { ascending: true });

    if (error) throw error;
    if (!allMedia || allMedia.length === 0) {
        console.log('[Migration] Keine Match-Media-Dateien gefunden.');
        return { migrated: 0, failed: 0, errors: [] };
    }

    console.log(`[Migration] ${allMedia.length} Dateien zu migrieren...`);

    let migrated = 0;
    let failed = 0;
    const errors = [];

    for (let i = 0; i < allMedia.length; i++) {
        const item = allMedia[i];
        try {
            // Prüfen ob Datei bereits auf R2 existiert
            const r2Url = getR2PublicUrl(`match-media/${item.file_path}`);
            const headCheck = await fetch(r2Url, { method: 'HEAD' });

            if (headCheck.ok) {
                console.log(`[Migration] ${i + 1}/${allMedia.length} Bereits auf R2: ${item.file_path}`);
                migrated++;
            } else {
                await migrateFileToR2('match-media', item.file_path);
                migrated++;
                console.log(`[Migration] ${i + 1}/${allMedia.length} Migriert: ${item.file_path}`);
            }
        } catch (err) {
            failed++;
            errors.push({ id: item.id, file_path: item.file_path, error: err.message });
            console.error(`[Migration] ${i + 1}/${allMedia.length} Fehler: ${item.file_path}`, err);
        }

        if (onProgress) {
            onProgress(i + 1, allMedia.length, item.file_path);
        }
    }

    console.log(`[Migration] Fertig! ${migrated} migriert, ${failed} fehlgeschlagen.`);
    return { migrated, failed, errors };
}

// Export default config
export { R2_CONFIG };
