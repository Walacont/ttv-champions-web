/**
 * Supabase Storage → R2 Migration Tool
 *
 * Migriert alle bestehenden Dateien von Supabase Storage zu Cloudflare R2
 * und aktualisiert die Datenbank-URLs.
 *
 * Aufruf über Browser-Konsole (als Admin eingeloggt):
 *   import('/js/r2-migration.js').then(m => m.migrateAll())
 *
 * Oder einzelne Tabellen:
 *   import('/js/r2-migration.js').then(m => m.migrateProfilePictures())
 *   import('/js/r2-migration.js').then(m => m.migratePostImages())
 *   import('/js/r2-migration.js').then(m => m.migrateExerciseImages())
 *   import('/js/r2-migration.js').then(m => m.migrateClubLogos())
 *   import('/js/r2-migration.js').then(m => m.migrateVideoAnalyses())
 *
 * Dry-Run (nur anzeigen was migriert würde):
 *   import('/js/r2-migration.js').then(m => m.migrateAll({ dryRun: true }))
 */

import { getSupabase } from './supabase-init.js';
import { uploadToR2, getR2PublicUrl } from './r2-storage.js';
import { supabaseConfig } from './supabase-config.js';

const SUPABASE_STORAGE_PREFIX = `${supabaseConfig.url}/storage/v1/object/public/`;

// ============================================
// HELPERS
// ============================================

/**
 * Prüft ob eine URL eine Supabase Storage URL ist
 */
function isSupabaseStorageUrl(url) {
    return url && typeof url === 'string' && url.includes('supabase.co/storage/v1/object/public/');
}

/**
 * Extrahiert Bucket und Dateipfad aus einer Supabase Storage URL
 * z.B. https://xyz.supabase.co/storage/v1/object/public/profile-pictures/user-id/file.jpg
 *   → { bucket: 'profile-pictures', filePath: 'user-id/file.jpg' }
 */
function parseSupabaseUrl(url) {
    const prefix = url.indexOf('/storage/v1/object/public/');
    if (prefix === -1) return null;
    const rest = url.substring(prefix + '/storage/v1/object/public/'.length);
    const slashIndex = rest.indexOf('/');
    if (slashIndex === -1) return null;
    return {
        bucket: rest.substring(0, slashIndex),
        filePath: rest.substring(slashIndex + 1)
    };
}

/**
 * Lädt eine Datei von einer URL herunter und gibt sie als File zurück
 */
async function downloadFile(url) {
    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`Download fehlgeschlagen (${response.status}): ${url}`);
    }
    const blob = await response.blob();
    const fileName = url.split('/').pop().split('?')[0];
    return new File([blob], fileName, { type: blob.type });
}

/**
 * Migriert eine einzelne URL: Download von Supabase → Upload zu R2 → neue URL zurückgeben
 */
async function migrateSingleUrl(url) {
    const parsed = parseSupabaseUrl(url);
    if (!parsed) {
        throw new Error(`Konnte URL nicht parsen: ${url}`);
    }

    const file = await downloadFile(url);

    const parts = parsed.filePath.split('/');
    const subfolder = parts.slice(0, -1).join('/');
    const filename = parts[parts.length - 1];

    const result = await uploadToR2(parsed.bucket, file, {
        subfolder: subfolder || undefined,
        filename: filename
    });

    return result.url;
}

/**
 * Logging mit Zeitstempel
 */
function log(category, message, ...args) {
    const ts = new Date().toLocaleTimeString('de-DE');
    console.log(`[${ts}] [Migration:${category}] ${message}`, ...args);
}

// ============================================
// PROFILE PICTURES (profiles.avatar_url)
// ============================================

export async function migrateProfilePictures(options = {}) {
    const { dryRun = false } = options;
    const supabase = getSupabase();

    log('Profiles', 'Suche Supabase-URLs in profiles.avatar_url...');

    const { data: profiles, error } = await supabase
        .from('profiles')
        .select('id, avatar_url')
        .like('avatar_url', '%supabase.co/storage%');

    if (error) throw error;
    if (!profiles || profiles.length === 0) {
        log('Profiles', 'Keine Supabase-URLs gefunden. Alles bereits migriert!');
        return { migrated: 0, failed: 0, total: 0, errors: [] };
    }

    log('Profiles', `${profiles.length} Profile mit Supabase-URLs gefunden.`);

    if (dryRun) {
        profiles.forEach(p => log('Profiles', `[DRY-RUN] Würde migrieren: ${p.id} → ${p.avatar_url}`));
        return { migrated: 0, failed: 0, total: profiles.length, errors: [], dryRun: true };
    }

    let migrated = 0, failed = 0;
    const errors = [];

    for (let i = 0; i < profiles.length; i++) {
        const profile = profiles[i];
        try {
            const newUrl = await migrateSingleUrl(profile.avatar_url);

            const { error: updateError } = await supabase
                .from('profiles')
                .update({ avatar_url: newUrl })
                .eq('id', profile.id);

            if (updateError) throw updateError;

            migrated++;
            log('Profiles', `${i + 1}/${profiles.length} Migriert: ${profile.id}`);
        } catch (err) {
            failed++;
            errors.push({ id: profile.id, url: profile.avatar_url, error: err.message });
            log('Profiles', `${i + 1}/${profiles.length} FEHLER: ${profile.id}`, err.message);
        }
    }

    log('Profiles', `Fertig! ${migrated} migriert, ${failed} fehlgeschlagen.`);
    return { migrated, failed, total: profiles.length, errors };
}

// ============================================
// POST IMAGES (community_posts.image_url + image_urls)
// ============================================

export async function migratePostImages(options = {}) {
    const { dryRun = false } = options;
    const supabase = getSupabase();

    log('Posts', 'Suche Supabase-URLs in community_posts...');

    // Posts mit Supabase-URLs in image_url (legacy single image)
    const { data: postsLegacy, error: err1 } = await supabase
        .from('community_posts')
        .select('id, image_url, image_urls')
        .like('image_url', '%supabase.co/storage%');

    if (err1) throw err1;

    // Posts mit Supabase-URLs im image_urls Array
    // Supabase unterstützt kein LIKE auf Array-Elemente, also alle Posts mit image_urls laden und filtern
    const { data: postsMulti, error: err2 } = await supabase
        .from('community_posts')
        .select('id, image_url, image_urls')
        .not('image_urls', 'is', null);

    if (err2) throw err2;

    // Filtern: nur Posts wo mindestens eine image_urls-URL auf Supabase zeigt
    const postsWithSupabaseArrayUrls = (postsMulti || []).filter(post =>
        post.image_urls && post.image_urls.some(url => isSupabaseStorageUrl(url))
    );

    // Zusammenführen (Duplikate entfernen)
    const allPostIds = new Set();
    const postsToMigrate = [];

    for (const post of [...(postsLegacy || []), ...postsWithSupabaseArrayUrls]) {
        if (!allPostIds.has(post.id)) {
            allPostIds.add(post.id);
            postsToMigrate.push(post);
        }
    }

    if (postsToMigrate.length === 0) {
        log('Posts', 'Keine Supabase-URLs gefunden. Alles bereits migriert!');
        return { migrated: 0, failed: 0, total: 0, errors: [] };
    }

    log('Posts', `${postsToMigrate.length} Posts mit Supabase-URLs gefunden.`);

    if (dryRun) {
        postsToMigrate.forEach(p => {
            const urls = p.image_urls || (p.image_url ? [p.image_url] : []);
            const supaUrls = urls.filter(u => isSupabaseStorageUrl(u));
            log('Posts', `[DRY-RUN] Post ${p.id}: ${supaUrls.length} URLs zu migrieren`);
        });
        return { migrated: 0, failed: 0, total: postsToMigrate.length, errors: [], dryRun: true };
    }

    let migrated = 0, failed = 0;
    const errors = [];

    for (let i = 0; i < postsToMigrate.length; i++) {
        const post = postsToMigrate[i];
        try {
            const updateData = {};

            // Legacy single image
            if (isSupabaseStorageUrl(post.image_url)) {
                updateData.image_url = await migrateSingleUrl(post.image_url);
            }

            // Multi-image array
            if (post.image_urls && post.image_urls.length > 0) {
                const newUrls = [];
                for (const url of post.image_urls) {
                    if (isSupabaseStorageUrl(url)) {
                        newUrls.push(await migrateSingleUrl(url));
                    } else {
                        newUrls.push(url); // bereits R2 oder extern, unverändert lassen
                    }
                }
                updateData.image_urls = newUrls;
            }

            if (Object.keys(updateData).length > 0) {
                const { error: updateError } = await supabase
                    .from('community_posts')
                    .update(updateData)
                    .eq('id', post.id);

                if (updateError) throw updateError;
            }

            migrated++;
            log('Posts', `${i + 1}/${postsToMigrate.length} Migriert: ${post.id}`);
        } catch (err) {
            failed++;
            errors.push({ id: post.id, error: err.message });
            log('Posts', `${i + 1}/${postsToMigrate.length} FEHLER: ${post.id}`, err.message);
        }
    }

    log('Posts', `Fertig! ${migrated} migriert, ${failed} fehlgeschlagen.`);
    return { migrated, failed, total: postsToMigrate.length, errors };
}

// ============================================
// EXERCISE IMAGES (exercises.image_url)
// ============================================

export async function migrateExerciseImages(options = {}) {
    const { dryRun = false } = options;
    const supabase = getSupabase();

    log('Exercises', 'Suche Supabase-URLs in exercises.image_url...');

    const { data: exercises, error } = await supabase
        .from('exercises')
        .select('id, image_url')
        .like('image_url', '%supabase.co/storage%');

    if (error) throw error;
    if (!exercises || exercises.length === 0) {
        log('Exercises', 'Keine Supabase-URLs gefunden. Alles bereits migriert!');
        return { migrated: 0, failed: 0, total: 0, errors: [] };
    }

    log('Exercises', `${exercises.length} Übungen mit Supabase-URLs gefunden.`);

    if (dryRun) {
        exercises.forEach(e => log('Exercises', `[DRY-RUN] Würde migrieren: ${e.id} → ${e.image_url}`));
        return { migrated: 0, failed: 0, total: exercises.length, errors: [], dryRun: true };
    }

    let migrated = 0, failed = 0;
    const errors = [];

    for (let i = 0; i < exercises.length; i++) {
        const exercise = exercises[i];
        try {
            const newUrl = await migrateSingleUrl(exercise.image_url);

            const { error: updateError } = await supabase
                .from('exercises')
                .update({ image_url: newUrl })
                .eq('id', exercise.id);

            if (updateError) throw updateError;

            migrated++;
            log('Exercises', `${i + 1}/${exercises.length} Migriert: ${exercise.id}`);
        } catch (err) {
            failed++;
            errors.push({ id: exercise.id, url: exercise.image_url, error: err.message });
            log('Exercises', `${i + 1}/${exercises.length} FEHLER: ${exercise.id}`, err.message);
        }
    }

    log('Exercises', `Fertig! ${migrated} migriert, ${failed} fehlgeschlagen.`);
    return { migrated, failed, total: exercises.length, errors };
}

// ============================================
// CLUB LOGOS (clubs.logo_url)
// ============================================

export async function migrateClubLogos(options = {}) {
    const { dryRun = false } = options;
    const supabase = getSupabase();

    log('Clubs', 'Suche Supabase-URLs in clubs.logo_url...');

    const { data: clubs, error } = await supabase
        .from('clubs')
        .select('id, logo_url')
        .like('logo_url', '%supabase.co/storage%');

    if (error) throw error;
    if (!clubs || clubs.length === 0) {
        log('Clubs', 'Keine Supabase-URLs gefunden. Alles bereits migriert!');
        return { migrated: 0, failed: 0, total: 0, errors: [] };
    }

    log('Clubs', `${clubs.length} Vereine mit Supabase-URLs gefunden.`);

    if (dryRun) {
        clubs.forEach(c => log('Clubs', `[DRY-RUN] Würde migrieren: ${c.id} → ${c.logo_url}`));
        return { migrated: 0, failed: 0, total: clubs.length, errors: [], dryRun: true };
    }

    let migrated = 0, failed = 0;
    const errors = [];

    for (let i = 0; i < clubs.length; i++) {
        const club = clubs[i];
        try {
            const newUrl = await migrateSingleUrl(club.logo_url);

            const { error: updateError } = await supabase
                .from('clubs')
                .update({ logo_url: newUrl })
                .eq('id', club.id);

            if (updateError) throw updateError;

            migrated++;
            log('Clubs', `${i + 1}/${clubs.length} Migriert: ${club.id}`);
        } catch (err) {
            failed++;
            errors.push({ id: club.id, url: club.logo_url, error: err.message });
            log('Clubs', `${i + 1}/${clubs.length} FEHLER: ${club.id}`, err.message);
        }
    }

    log('Clubs', `Fertig! ${migrated} migriert, ${failed} fehlgeschlagen.`);
    return { migrated, failed, total: clubs.length, errors };
}

// ============================================
// VIDEO ANALYSES (video_analyses.video_url + thumbnail_url)
// ============================================

export async function migrateVideoAnalyses(options = {}) {
    const { dryRun = false } = options;
    const supabase = getSupabase();

    log('Videos', 'Suche Supabase-URLs in video_analyses...');

    // Videos mit Supabase video_url
    const { data: videosV, error: err1 } = await supabase
        .from('video_analyses')
        .select('id, video_url, thumbnail_url')
        .like('video_url', '%supabase.co/storage%');

    if (err1) throw err1;

    // Videos mit Supabase thumbnail_url
    const { data: videosT, error: err2 } = await supabase
        .from('video_analyses')
        .select('id, video_url, thumbnail_url')
        .like('thumbnail_url', '%supabase.co/storage%');

    if (err2) throw err2;

    // Zusammenführen
    const allVideoIds = new Set();
    const videosToMigrate = [];
    for (const v of [...(videosV || []), ...(videosT || [])]) {
        if (!allVideoIds.has(v.id)) {
            allVideoIds.add(v.id);
            videosToMigrate.push(v);
        }
    }

    if (videosToMigrate.length === 0) {
        log('Videos', 'Keine Supabase-URLs gefunden. Alles bereits migriert!');
        return { migrated: 0, failed: 0, total: 0, errors: [] };
    }

    log('Videos', `${videosToMigrate.length} Videos mit Supabase-URLs gefunden.`);

    if (dryRun) {
        videosToMigrate.forEach(v => {
            const urls = [];
            if (isSupabaseStorageUrl(v.video_url)) urls.push('video_url');
            if (isSupabaseStorageUrl(v.thumbnail_url)) urls.push('thumbnail_url');
            log('Videos', `[DRY-RUN] Video ${v.id}: ${urls.join(', ')} zu migrieren`);
        });
        return { migrated: 0, failed: 0, total: videosToMigrate.length, errors: [], dryRun: true };
    }

    let migrated = 0, failed = 0;
    const errors = [];

    for (let i = 0; i < videosToMigrate.length; i++) {
        const video = videosToMigrate[i];
        try {
            const updateData = {};

            if (isSupabaseStorageUrl(video.video_url)) {
                log('Videos', `${i + 1}/${videosToMigrate.length} Lade Video herunter: ${video.id}...`);
                updateData.video_url = await migrateSingleUrl(video.video_url);
            }

            if (isSupabaseStorageUrl(video.thumbnail_url)) {
                updateData.thumbnail_url = await migrateSingleUrl(video.thumbnail_url);
            }

            if (Object.keys(updateData).length > 0) {
                const { error: updateError } = await supabase
                    .from('video_analyses')
                    .update(updateData)
                    .eq('id', video.id);

                if (updateError) throw updateError;
            }

            migrated++;
            log('Videos', `${i + 1}/${videosToMigrate.length} Migriert: ${video.id}`);
        } catch (err) {
            failed++;
            errors.push({ id: video.id, error: err.message });
            log('Videos', `${i + 1}/${videosToMigrate.length} FEHLER: ${video.id}`, err.message);
        }
    }

    log('Videos', `Fertig! ${migrated} migriert, ${failed} fehlgeschlagen.`);
    return { migrated, failed, total: videosToMigrate.length, errors };
}

// ============================================
// MATCH MEDIA (match_media.file_path → relative paths)
// ============================================

export async function migrateMatchMedia(options = {}) {
    const { dryRun = false } = options;
    const supabase = getSupabase();

    log('MatchMedia', 'Suche Match-Media-Dateien...');

    const { data: allMedia, error } = await supabase
        .from('match_media')
        .select('id, file_path')
        .order('created_at', { ascending: true });

    if (error) throw error;
    if (!allMedia || allMedia.length === 0) {
        log('MatchMedia', 'Keine Match-Media-Dateien gefunden.');
        return { migrated: 0, failed: 0, total: 0, errors: [] };
    }

    log('MatchMedia', `${allMedia.length} Dateien gefunden. Prüfe welche noch auf R2 fehlen...`);

    if (dryRun) {
        log('MatchMedia', `[DRY-RUN] ${allMedia.length} Dateien würden geprüft/migriert.`);
        return { migrated: 0, failed: 0, total: allMedia.length, errors: [], dryRun: true };
    }

    let migrated = 0, failed = 0, skipped = 0;
    const errors = [];

    for (let i = 0; i < allMedia.length; i++) {
        const item = allMedia[i];
        try {
            // Prüfen ob schon auf R2
            const r2Url = getR2PublicUrl(`match-media/${item.file_path}`);
            const headCheck = await fetch(r2Url, { method: 'HEAD' });

            if (headCheck.ok) {
                skipped++;
                continue;
            }

            // Von Supabase herunterladen und zu R2 hochladen
            const supabaseUrl = `${supabaseConfig.url}/storage/v1/object/public/match-media/${item.file_path}`;
            const file = await downloadFile(supabaseUrl);
            const parts = item.file_path.split('/');
            const subfolder = parts.slice(0, -1).join('/');
            const filename = parts[parts.length - 1];

            await uploadToR2('match-media', file, { subfolder, filename });
            migrated++;
            log('MatchMedia', `${i + 1}/${allMedia.length} Migriert: ${item.file_path}`);

            // Note: thumbnail_path column does not exist in production DB (never created/populated)
        } catch (err) {
            failed++;
            errors.push({ id: item.id, file_path: item.file_path, error: err.message });
            log('MatchMedia', `${i + 1}/${allMedia.length} FEHLER: ${item.file_path}`, err.message);
        }
    }

    log('MatchMedia', `Fertig! ${migrated} migriert, ${skipped} übersprungen (bereits auf R2), ${failed} fehlgeschlagen.`);
    return { migrated, failed, skipped, total: allMedia.length, errors };
}

// ============================================
// MASTER MIGRATION
// ============================================

/**
 * Führt die komplette Migration aller Medien-Typen durch.
 *
 * @param {Object} options
 * @param {boolean} options.dryRun - Nur anzeigen was migriert würde
 * @returns {Promise<Object>} Ergebnisse aller Migrationen
 */
export async function migrateAll(options = {}) {
    const { dryRun = false } = options;

    console.log('╔══════════════════════════════════════════════════════╗');
    console.log('║   SC Champions - Supabase → R2 Storage Migration    ║');
    console.log(`║   Modus: ${dryRun ? 'DRY-RUN (keine Änderungen)' : 'LIVE (Dateien werden migriert!)'}       ║`);
    console.log('╚══════════════════════════════════════════════════════╝');
    console.log('');

    const results = {};

    const steps = [
        { name: 'profiles', label: '1/6 Profilbilder', fn: migrateProfilePictures },
        { name: 'posts', label: '2/6 Post-Bilder', fn: migratePostImages },
        { name: 'exercises', label: '3/6 Übungsbilder', fn: migrateExerciseImages },
        { name: 'clubs', label: '4/6 Vereinslogos', fn: migrateClubLogos },
        { name: 'videos', label: '5/6 Trainingsvideos', fn: migrateVideoAnalyses },
        { name: 'matchMedia', label: '6/6 Match-Media', fn: migrateMatchMedia },
    ];

    for (const step of steps) {
        console.log(`\n── ${step.label} ${'─'.repeat(40)}`);
        try {
            results[step.name] = await step.fn(options);
        } catch (err) {
            console.error(`FEHLER bei ${step.label}:`, err);
            results[step.name] = { error: err.message };
        }
    }

    // Zusammenfassung
    console.log('\n╔══════════════════════════════════════════════════════╗');
    console.log('║                  ZUSAMMENFASSUNG                     ║');
    console.log('╠══════════════════════════════════════════════════════╣');

    let totalMigrated = 0, totalFailed = 0, totalTotal = 0;

    for (const step of steps) {
        const r = results[step.name];
        if (r && !r.error) {
            totalMigrated += r.migrated || 0;
            totalFailed += r.failed || 0;
            totalTotal += r.total || 0;
            console.log(`║  ${step.label.padEnd(25)} ${String(r.migrated || 0).padStart(4)} OK  ${String(r.failed || 0).padStart(4)} Fehler  ${String(r.total || 0).padStart(4)} Total ║`);
        } else {
            console.log(`║  ${step.label.padEnd(25)} FEHLER: ${(r?.error || 'Unbekannt').substring(0, 20)} ║`);
        }
    }

    console.log('╠══════════════════════════════════════════════════════╣');
    console.log(`║  GESAMT:                    ${String(totalMigrated).padStart(4)} OK  ${String(totalFailed).padStart(4)} Fehler  ${String(totalTotal).padStart(4)} Total ║`);
    console.log('╚══════════════════════════════════════════════════════╝');

    if (dryRun) {
        console.log('\n💡 Das war ein DRY-RUN. Starte die echte Migration mit:');
        console.log("   import('/js/r2-migration.js').then(m => m.migrateAll())");
    }

    return results;
}

// ============================================
// SCAN (Nur zählen, ohne zu migrieren)
// ============================================

/**
 * Zählt alle Supabase-URLs in der Datenbank ohne etwas zu ändern.
 * Nützlich um den Umfang der Migration zu verstehen.
 */
export async function scanSupabaseUrls() {
    const supabase = getSupabase();

    console.log('Scanne Datenbank nach Supabase Storage URLs...\n');

    const scans = [
        {
            label: 'profiles.avatar_url',
            query: () => supabase.from('profiles').select('id', { count: 'exact', head: true }).like('avatar_url', '%supabase.co/storage%')
        },
        {
            label: 'community_posts.image_url',
            query: () => supabase.from('community_posts').select('id', { count: 'exact', head: true }).like('image_url', '%supabase.co/storage%')
        },
        {
            label: 'community_posts.image_urls (manuell)',
            query: async () => {
                const { data, error } = await supabase.from('community_posts').select('id, image_urls').not('image_urls', 'is', null);
                if (error) return { count: 0, error };
                const count = (data || []).filter(p => p.image_urls?.some(u => isSupabaseStorageUrl(u))).length;
                return { count, error: null };
            },
            manual: true
        },
        {
            label: 'exercises.image_url',
            query: () => supabase.from('exercises').select('id', { count: 'exact', head: true }).like('image_url', '%supabase.co/storage%')
        },
        {
            label: 'clubs.logo_url',
            query: () => supabase.from('clubs').select('id', { count: 'exact', head: true }).like('logo_url', '%supabase.co/storage%')
        },
        {
            label: 'video_analyses.video_url',
            query: () => supabase.from('video_analyses').select('id', { count: 'exact', head: true }).like('video_url', '%supabase.co/storage%')
        },
        {
            label: 'video_analyses.thumbnail_url',
            query: () => supabase.from('video_analyses').select('id', { count: 'exact', head: true }).like('thumbnail_url', '%supabase.co/storage%')
        },
        {
            label: 'match_media (Einträge gesamt)',
            query: () => supabase.from('match_media').select('id', { count: 'exact', head: true })
        }
    ];

    let totalSupabase = 0;
    const results = {};

    for (const scan of scans) {
        try {
            if (scan.manual) {
                const result = await scan.query();
                const count = result.count || 0;
                results[scan.label] = count;
                totalSupabase += count;
                console.log(`  ${scan.label}: ${count}`);
            } else {
                const { count, error } = await scan.query();
                if (error) {
                    console.log(`  ${scan.label}: FEHLER - ${error.message}`);
                    results[scan.label] = `Error: ${error.message}`;
                } else {
                    results[scan.label] = count || 0;
                    totalSupabase += count || 0;
                    console.log(`  ${scan.label}: ${count || 0}`);
                }
            }
        } catch (err) {
            console.log(`  ${scan.label}: FEHLER - ${err.message}`);
            results[scan.label] = `Error: ${err.message}`;
        }
    }

    console.log(`\n  GESAMT mit Supabase-URLs: ${totalSupabase}`);
    console.log('\nStarte Dry-Run mit:');
    console.log("  import('/js/r2-migration.js').then(m => m.migrateAll({ dryRun: true }))");

    return results;
}
