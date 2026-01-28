/**
 * Cloudflare Worker für SC Champions Storage (R2)
 *
 * Endpoints:
 * - POST /upload/:folder - Datei hochladen
 * - DELETE /delete/:folder/:filename - Datei löschen
 * - GET /file/:folder/:filename - Datei abrufen (optional, R2 kann auch public sein)
 */

const ALLOWED_FOLDERS = [
    'profile-pictures',
    'post-images',
    'training-videos',
    'exercises',
    'exercise-images',
    'match-media'
];

const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100 MB

export default {
    async fetch(request, env, ctx) {
        // CORS Headers
        const corsHeaders = {
            'Access-Control-Allow-Origin': getAllowedOrigin(request, env),
            'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization',
            'Access-Control-Max-Age': '86400',
        };

        // Handle preflight
        if (request.method === 'OPTIONS') {
            return new Response(null, { headers: corsHeaders });
        }

        try {
            const url = new URL(request.url);
            const path = url.pathname;

            // Route: POST /upload/:folder
            if (request.method === 'POST' && path.startsWith('/upload/')) {
                return await handleUpload(request, env, corsHeaders);
            }

            // Route: DELETE /delete/:folder/:filename
            if (request.method === 'DELETE' && path.startsWith('/delete/')) {
                return await handleDelete(request, env, corsHeaders);
            }

            // Route: GET /file/:folder/:filename (für private Dateien)
            if (request.method === 'GET' && path.startsWith('/file/')) {
                return await handleGet(request, env, corsHeaders);
            }

            // Health check
            if (path === '/health') {
                return jsonResponse({ status: 'ok', timestamp: new Date().toISOString() }, 200, corsHeaders);
            }

            return jsonResponse({ error: 'Not Found' }, 404, corsHeaders);

        } catch (error) {
            console.error('Worker error:', error);
            return jsonResponse({ error: error.message || 'Internal Server Error' }, 500, corsHeaders);
        }
    }
};

/**
 * Validiert den Supabase Auth Token
 */
async function validateAuth(request, env) {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        throw new Error('Missing or invalid Authorization header');
    }

    const token = authHeader.substring(7);

    // Prüfen ob SUPABASE_ANON_KEY gesetzt ist
    if (!env.SUPABASE_ANON_KEY) {
        throw new Error('Server configuration error: SUPABASE_ANON_KEY not set');
    }

    // Supabase JWT validieren
    const response = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, {
        headers: {
            'Authorization': `Bearer ${token}`,
            'apikey': env.SUPABASE_ANON_KEY
        }
    });

    if (!response.ok) {
        const errorText = await response.text().catch(() => 'Unknown error');
        console.error('Supabase auth error:', response.status, errorText);
        throw new Error(`Invalid authentication token (${response.status})`);
    }

    const user = await response.json();
    return user;
}

/**
 * Datei hochladen
 */
async function handleUpload(request, env, corsHeaders) {
    // Auth validieren
    const user = await validateAuth(request, env);

    const url = new URL(request.url);
    const pathParts = url.pathname.split('/').filter(Boolean);
    const folder = pathParts[1]; // z.B. 'profile-pictures'

    if (!ALLOWED_FOLDERS.includes(folder)) {
        return jsonResponse({ error: 'Invalid folder' }, 400, corsHeaders);
    }

    // FormData parsen
    const formData = await request.formData();
    const file = formData.get('file');
    const customFilename = formData.get('filename');
    const subfolder = formData.get('subfolder') || user.id; // Standard: User-ID als Unterordner

    if (!file || !(file instanceof File)) {
        return jsonResponse({ error: 'No file provided' }, 400, corsHeaders);
    }

    // Dateigröße prüfen
    if (file.size > MAX_FILE_SIZE) {
        return jsonResponse({ error: `File too large. Maximum size is ${MAX_FILE_SIZE / 1024 / 1024} MB` }, 400, corsHeaders);
    }

    // Content-Type validieren
    const contentType = file.type;
    if (!isAllowedContentType(contentType, folder)) {
        return jsonResponse({ error: 'File type not allowed' }, 400, corsHeaders);
    }

    // Dateiname generieren
    const extension = getExtension(file.name);
    const filename = customFilename || `${Date.now()}-${generateId()}.${extension}`;
    const key = `${folder}/${subfolder}/${filename}`;

    // In R2 speichern
    await env.STORAGE.put(key, file.stream(), {
        httpMetadata: {
            contentType: contentType,
        },
        customMetadata: {
            uploadedBy: user.id,
            uploadedAt: new Date().toISOString(),
            originalName: file.name
        }
    });

    // Public URL generieren
    const publicUrl = `${env.PUBLIC_URL || url.origin}/file/${key}`;

    // Alternative: Direkte R2 Public URL (wenn Public Access aktiviert ist)
    const r2PublicUrl = env.R2_PUBLIC_URL ? `${env.R2_PUBLIC_URL}/${key}` : publicUrl;

    return jsonResponse({
        success: true,
        key: key,
        url: r2PublicUrl,
        filename: filename,
        size: file.size,
        contentType: contentType
    }, 200, corsHeaders);
}

/**
 * Datei löschen
 */
async function handleDelete(request, env, corsHeaders) {
    // Auth validieren
    const user = await validateAuth(request, env);

    const url = new URL(request.url);
    const path = url.pathname.replace('/delete/', '');

    // Prüfen ob der User die Datei löschen darf
    const object = await env.STORAGE.head(path);
    if (!object) {
        return jsonResponse({ error: 'File not found' }, 404, corsHeaders);
    }

    // Nur eigene Dateien oder Admins dürfen löschen
    const uploadedBy = object.customMetadata?.uploadedBy;
    if (uploadedBy && uploadedBy !== user.id) {
        // Hier könnte man Admin-Check hinzufügen
        return jsonResponse({ error: 'Not authorized to delete this file' }, 403, corsHeaders);
    }

    await env.STORAGE.delete(path);

    return jsonResponse({ success: true, deleted: path }, 200, corsHeaders);
}

/**
 * Datei abrufen (für private Dateien)
 */
async function handleGet(request, env, corsHeaders) {
    const url = new URL(request.url);
    const path = url.pathname.replace('/file/', '');

    const object = await env.STORAGE.get(path);
    if (!object) {
        return new Response('Not Found', { status: 404, headers: corsHeaders });
    }

    const headers = new Headers(corsHeaders);
    headers.set('Content-Type', object.httpMetadata?.contentType || 'application/octet-stream');
    headers.set('Cache-Control', 'public, max-age=31536000'); // 1 Jahr Cache
    headers.set('ETag', object.httpEtag);

    return new Response(object.body, { headers });
}

/**
 * Hilfsfunktionen
 */
function getAllowedOrigin(request, env) {
    const origin = request.headers.get('Origin') || '';
    const allowedOrigins = (env.ALLOWED_ORIGINS || '').split(',').map(o => o.trim());

    // Capacitor App erlauben
    if (origin.startsWith('capacitor://') || origin.startsWith('http://localhost')) {
        return origin;
    }

    // Firebase Preview URLs erlauben (ttv-champions-prod--*.web.app)
    if (origin.match(/^https:\/\/ttv-champions-prod--[a-z0-9-]+\.web\.app$/)) {
        return origin;
    }

    if (allowedOrigins.includes(origin) || allowedOrigins.includes('*')) {
        return origin;
    }

    return allowedOrigins[0] || '';
}

function isAllowedContentType(contentType, folder) {
    const imageTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    const videoTypes = ['video/mp4', 'video/webm', 'video/quicktime'];

    if (folder === 'training-videos') {
        return [...imageTypes, ...videoTypes].includes(contentType);
    }

    return imageTypes.includes(contentType);
}

function getExtension(filename) {
    const parts = filename.split('.');
    return parts.length > 1 ? parts.pop().toLowerCase() : 'bin';
}

function generateId() {
    return Math.random().toString(36).substring(2, 10);
}

function jsonResponse(data, status, headers) {
    return new Response(JSON.stringify(data), {
        status,
        headers: {
            ...headers,
            'Content-Type': 'application/json'
        }
    });
}
