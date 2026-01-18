// Video-Analyse-Modul - Supabase-Version
// Ermöglicht Coaches, Spieler-Videos zu analysieren und zeitbasierte Kommentare zu hinterlassen

import { escapeHtml } from './utils/security.js';

let videoAnalysisContext = {
    db: null,
    userId: null,
    userRole: null,
    clubId: null,
    clubPlayers: [],
    exercises: [],
};

let currentVideoId = null;
let videoPlayer = null;
let unsubscribeComments = null;

// Verfügbare Tags für Videos
const AVAILABLE_TAGS = [
    'Aufschlag',
    'Vorhand',
    'Rückhand',
    'Beinarbeit',
    'Technik',
    'Taktik',
    'Wettkampf',
    'Training',
];

/**
 * Rendert einen Avatar (Bild oder Initialen-Fallback)
 */
function renderAvatar(avatarUrl, name, sizeClass = 'w-8 h-8') {
    const initial = (name || '?').charAt(0).toUpperCase();

    if (avatarUrl) {
        return `<img src="${escapeHtml(avatarUrl)}"
                     class="${sizeClass} rounded-full object-cover"
                     onerror="this.outerHTML='<div class=\\'${sizeClass} rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600 text-sm font-bold\\'>${initial}</div>'">`;
    }

    return `<div class="${sizeClass} rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600 text-sm font-bold">${initial}</div>`;
}

/**
 * Rendert ein Video-Thumbnail (mit Fallback-Placeholder)
 */
function renderVideoThumbnail(thumbnailUrl, cssClass = 'w-full h-full object-cover') {
    const fallbackSvg = `<svg xmlns="http://www.w3.org/2000/svg" class="${cssClass}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="2" y="4" width="20" height="16" rx="2" class="stroke-gray-300"/><polygon points="10,8 16,12 10,16" class="fill-gray-300 stroke-gray-300"/></svg>`;

    if (thumbnailUrl) {
        return `<img src="${escapeHtml(thumbnailUrl)}"
                     class="${cssClass}"
                     onerror="this.outerHTML=\`${fallbackSvg}\`">`;
    }

    return fallbackSvg;
}

/**
 * Setzt den Kontext für Video-Analyse
 */
export function setVideoAnalysisContext(db, userId, userRole, clubId) {
    videoAnalysisContext.db = db;
    videoAnalysisContext.userId = userId;
    videoAnalysisContext.userRole = userRole;
    videoAnalysisContext.clubId = clubId;
}

/**
 * Initialisiert das Video-Analyse-Modul
 */
export async function initVideoAnalysis(db, userData, clubPlayers) {
    setVideoAnalysisContext(db, userData.id, userData.role, userData.clubId);
    videoAnalysisContext.clubPlayers = clubPlayers;

    // Übungen für Dropdown laden
    await loadExercisesForVideoAnalysis();

    // Event Listener für Haupt-Tab
    const videoTabButton = document.querySelector('.tab-button[data-tab="video-analysis"]');
    if (videoTabButton) {
        videoTabButton.addEventListener('click', () => {
            loadPendingVideos();
        });
    }

    // Sub-Tab Navigation
    setupVideoSubTabs();

    // Upload-Modal Event Listener
    setupUploadModal();

    // Video-Detail Modal Event Listener
    setupVideoDetailModal();

    // Split-Screen Modal
    setupSplitScreenModal();

    // File-Input Preview
    setupFileInputPreview();
}

/**
 * Setup für Sub-Tab Navigation innerhalb der Video-Analyse
 */
function setupVideoSubTabs() {
    const subTabs = document.querySelectorAll('.video-sub-tab');

    subTabs.forEach(tab => {
        tab.addEventListener('click', () => {
            const targetTab = tab.dataset.videoTab;

            // Aktiven Tab visuell aktualisieren
            subTabs.forEach(t => {
                t.classList.remove('border-indigo-600', 'text-indigo-600');
                t.classList.add('border-transparent', 'text-gray-500');
            });
            tab.classList.remove('border-transparent', 'text-gray-500');
            tab.classList.add('border-indigo-600', 'text-indigo-600');

            // Tab-Content anzeigen/verstecken
            document.querySelectorAll('.video-tab-content').forEach(content => {
                content.classList.add('hidden');
            });
            const targetContent = document.getElementById(`video-tab-${targetTab}`);
            if (targetContent) {
                targetContent.classList.remove('hidden');
            }

            // Daten laden je nach Tab
            switch (targetTab) {
                case 'inbox':
                    loadPendingVideos();
                    break;
                case 'all':
                    loadAllVideos();
                    break;
                case 'references':
                    loadReferenceVideos();
                    break;
            }
        });
    });
}

/**
 * Setup für File-Input Preview
 */
function setupFileInputPreview() {
    const fileInput = document.getElementById('video-file-input');
    const fileNameDisplay = document.getElementById('selected-file-name');

    if (fileInput && fileNameDisplay) {
        fileInput.addEventListener('change', () => {
            const file = fileInput.files[0];
            if (file) {
                const sizeMB = (file.size / (1024 * 1024)).toFixed(1);
                fileNameDisplay.textContent = `${file.name} (${sizeMB} MB)`;
                fileNameDisplay.classList.remove('hidden');
            } else {
                fileNameDisplay.classList.add('hidden');
            }
        });
    }
}

/**
 * Lädt Übungen für das Video-Upload Dropdown
 */
async function loadExercisesForVideoAnalysis() {
    const { db, clubId } = videoAnalysisContext;

    const { data: exercises, error } = await db
        .from('exercises')
        .select('id, name')
        .or(`visibility.eq.global,and(visibility.eq.club,club_id.eq.${clubId})`)
        .order('name');

    if (!error && exercises) {
        videoAnalysisContext.exercises = exercises;
    }
}

/**
 * Lädt ungesehene Videos (Inbox für Coach)
 */
export async function loadPendingVideos() {
    const { db, userId } = videoAnalysisContext;
    const container = document.getElementById('video-analysis-inbox');
    if (!container) return;

    container.innerHTML = `
        <div class="flex items-center justify-center py-12">
            <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
        </div>
    `;

    const { data: videos, error } = await db.rpc('get_pending_videos_for_coach', {
        p_coach_id: userId,
    });

    if (error) {
        console.error('Fehler beim Laden der Videos:', error);
        container.innerHTML = `
            <div class="text-center py-12 text-red-500">
                <i class="fas fa-exclamation-circle text-3xl mb-2"></i>
                <p>Fehler beim Laden der Videos</p>
            </div>
        `;
        return;
    }

    if (!videos || videos.length === 0) {
        container.innerHTML = `
            <div class="text-center py-12 text-gray-500">
                <i class="fas fa-inbox text-5xl mb-4 text-gray-300"></i>
                <p class="text-lg font-medium">Keine neuen Videos</p>
                <p class="text-sm mt-1">Alle Videos wurden bereits analysiert</p>
            </div>
        `;
        return;
    }

    container.innerHTML = `
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            ${videos.map(video => createVideoCard(video)).join('')}
        </div>
    `;

    // Event Listener für Video-Karten
    container.querySelectorAll('[data-video-id]').forEach(card => {
        card.addEventListener('click', () => {
            const videoId = card.dataset.videoId;
            openVideoDetailModal(videoId);
        });
    });
}

/**
 * Erstellt eine Video-Karte für die Inbox
 */
function createVideoCard(video) {
    const tags = video.tags || [];

    return `
        <div class="bg-white rounded-xl shadow-md overflow-hidden cursor-pointer hover:shadow-lg transition-shadow"
             data-video-id="${video.id}">
            <div class="relative aspect-video bg-gray-100 flex items-center justify-center">
                ${renderVideoThumbnail(video.thumbnail_url, 'w-full h-full object-cover')}
                <div class="absolute top-2 right-2">
                    <span class="bg-yellow-500 text-white text-xs font-bold px-2 py-1 rounded-full">
                        ${video.pending_count} offen
                    </span>
                </div>
            </div>
            <div class="p-4">
                <div class="flex items-center gap-2 mb-2">
                    ${renderAvatar(video.uploader_avatar, video.uploader_name, 'w-8 h-8')}
                    <div>
                        <p class="font-medium text-sm">${escapeHtml(video.uploader_name || 'Unbekannt')}</p>
                        <p class="text-xs text-gray-500">${formatDate(video.created_at)}</p>
                    </div>
                </div>
                ${video.title ? `<p class="text-sm font-medium mb-2">${escapeHtml(video.title)}</p>` : ''}
                ${video.exercise_name ? `
                    <p class="text-xs text-indigo-600 mb-2">
                        <i class="fas fa-dumbbell mr-1"></i>${escapeHtml(video.exercise_name)}
                    </p>
                ` : ''}
                ${tags.length > 0 ? `
                    <div class="flex flex-wrap gap-1">
                        ${tags.slice(0, 3).map(tag => `
                            <span class="bg-gray-100 text-gray-600 text-xs px-2 py-0.5 rounded">
                                ${escapeHtml(tag)}
                            </span>
                        `).join('')}
                    </div>
                ` : ''}
            </div>
        </div>
    `;
}

/**
 * Alle Videos laden (nicht nur pending)
 */
export async function loadAllVideos(filter = 'all') {
    const { db, clubId } = videoAnalysisContext;
    const container = document.getElementById('video-analysis-all');
    if (!container) return;

    let query = db
        .from('video_analyses')
        .select(`
            *,
            uploader:profiles!uploaded_by(id, first_name, last_name, display_name, avatar_url),
            exercise:exercises(id, name)
        `)
        .eq('club_id', clubId)
        .eq('is_reference', false)
        .order('created_at', { ascending: false });

    const { data: videos, error } = await query;

    if (error) {
        console.error('Fehler beim Laden:', error);
        return;
    }

    if (!videos || videos.length === 0) {
        container.innerHTML = `
            <div class="text-center py-8 text-gray-500">
                Keine Videos vorhanden
            </div>
        `;
        return;
    }

    container.innerHTML = `
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            ${videos.map(video => createVideoCardFull(video)).join('')}
        </div>
    `;

    container.querySelectorAll('[data-video-id]').forEach(card => {
        card.addEventListener('click', () => {
            openVideoDetailModal(card.dataset.videoId);
        });
    });
}

function createVideoCardFull(video) {
    const uploader = video.uploader;
    const uploaderName = uploader?.display_name || `${uploader?.first_name || ''} ${uploader?.last_name?.charAt(0) || ''}.`.trim();

    return `
        <div class="bg-white rounded-xl shadow-md overflow-hidden cursor-pointer hover:shadow-lg transition-shadow"
             data-video-id="${video.id}">
            <div class="relative aspect-video bg-gray-100 flex items-center justify-center">
                ${renderVideoThumbnail(video.thumbnail_url, 'w-full h-full object-cover')}
            </div>
            <div class="p-4">
                <p class="font-medium text-sm mb-1">${escapeHtml(video.title || 'Ohne Titel')}</p>
                <p class="text-xs text-gray-500">${escapeHtml(uploaderName)} • ${formatDate(video.created_at)}</p>
            </div>
        </div>
    `;
}

/**
 * Öffnet das Video-Detail-Modal
 */
async function openVideoDetailModal(videoId) {
    const { db } = videoAnalysisContext;
    currentVideoId = videoId;

    const modal = document.getElementById('video-detail-modal');
    if (!modal) return;

    modal.classList.remove('hidden');

    // Video-Daten laden
    const { data: video, error } = await db
        .from('video_analyses')
        .select(`
            *,
            uploader:profiles!uploaded_by(id, first_name, last_name, display_name, avatar_url, role),
            exercise:exercises(id, name)
        `)
        .eq('id', videoId)
        .single();

    if (error || !video) {
        console.error('Video nicht gefunden:', error);
        closeVideoDetailModal();
        return;
    }

    // Video Player einrichten
    const videoContainer = document.getElementById('video-player-container');
    const uploaderName = video.uploader?.display_name ||
        `${video.uploader?.first_name || ''} ${video.uploader?.last_name?.charAt(0) || ''}.`.trim();

    videoContainer.innerHTML = `
        <video id="analysis-video-player"
               class="w-full rounded-lg bg-black"
               controls
               preload="metadata">
            <source src="${escapeHtml(video.video_url)}" type="video/mp4">
            Dein Browser unterstützt keine Videowiedergabe.
        </video>
        <div class="mt-4">
            <h3 class="text-lg font-bold">${escapeHtml(video.title || 'Video-Analyse')}</h3>
            <div class="flex items-center gap-2 mt-2 text-sm text-gray-600">
                ${renderAvatar(video.uploader?.avatar_url, uploaderName, 'w-6 h-6')}
                <span>${escapeHtml(uploaderName)}</span>
                <span>•</span>
                <span>${formatDate(video.created_at)}</span>
            </div>
            ${video.exercise ? `
                <p class="mt-2 text-sm text-indigo-600">
                    <i class="fas fa-dumbbell mr-1"></i>${escapeHtml(video.exercise.name)}
                </p>
            ` : ''}
            ${video.tags && video.tags.length > 0 ? `
                <div class="flex flex-wrap gap-1 mt-2">
                    ${video.tags.map(tag => `
                        <span class="bg-gray-100 text-gray-600 text-xs px-2 py-0.5 rounded">
                            ${escapeHtml(tag)}
                        </span>
                    `).join('')}
                </div>
            ` : ''}
        </div>
    `;

    videoPlayer = document.getElementById('analysis-video-player');

    // Referenz-Videos für Vergleich prüfen
    if (video.exercise_id) {
        await checkForReferenceVideos(video.exercise_id);
    }

    // Kommentare laden
    await loadVideoComments(videoId);

    // Realtime-Subscription für Kommentare
    subscribeToComments(videoId);
}

/**
 * Prüft ob Referenz-Videos für die Übung existieren
 */
async function checkForReferenceVideos(exerciseId) {
    const { db, clubId } = videoAnalysisContext;
    const compareBtn = document.getElementById('compare-video-btn');
    if (!compareBtn) return;

    const { data: refs, error } = await db.rpc('get_reference_videos', {
        p_exercise_id: exerciseId,
        p_club_id: clubId,
    });

    if (!error && refs && refs.length > 0) {
        compareBtn.classList.remove('hidden');
        compareBtn.dataset.exerciseId = exerciseId;
    } else {
        compareBtn.classList.add('hidden');
    }
}

/**
 * Lädt Kommentare für ein Video
 */
async function loadVideoComments(videoId) {
    const { db } = videoAnalysisContext;
    const container = document.getElementById('video-comments-list');
    if (!container) return;

    const { data: comments, error } = await db.rpc('get_video_comments', {
        p_video_id: videoId,
    });

    if (error) {
        console.error('Fehler beim Laden der Kommentare:', error);
        return;
    }

    renderComments(comments || []);
}

/**
 * Rendert die Kommentar-Liste
 */
function renderComments(comments) {
    const container = document.getElementById('video-comments-list');
    if (!container) return;

    if (comments.length === 0) {
        container.innerHTML = `
            <div class="text-center py-6 text-gray-400">
                <i class="fas fa-comments text-3xl mb-2"></i>
                <p>Noch keine Kommentare</p>
                <p class="text-sm">Pausiere das Video und hinterlasse Feedback</p>
            </div>
        `;
        return;
    }

    // Gruppiere nach Parent (Top-Level vs Antworten)
    const topLevel = comments.filter(c => !c.parent_id);
    const replies = comments.filter(c => c.parent_id);

    container.innerHTML = topLevel.map(comment => {
        const commentReplies = replies.filter(r => r.parent_id === comment.id);
        return createCommentElement(comment, commentReplies);
    }).join('');

    // Event Listener für Zeitstempel-Klicks
    container.querySelectorAll('[data-timestamp]').forEach(el => {
        el.addEventListener('click', () => {
            const timestamp = parseFloat(el.dataset.timestamp);
            if (videoPlayer && !isNaN(timestamp)) {
                videoPlayer.currentTime = timestamp;
                videoPlayer.play();
            }
        });
    });
}

/**
 * Erstellt ein Kommentar-Element
 */
function createCommentElement(comment, replies = []) {
    const isCoach = comment.user_role === 'coach' || comment.user_role === 'head_coach' || comment.user_role === 'admin';
    const timestampBadge = comment.timestamp_seconds !== null ? `
        <button class="text-indigo-600 hover:text-indigo-800 text-xs font-mono bg-indigo-50 px-2 py-0.5 rounded"
                data-timestamp="${comment.timestamp_seconds}">
            ${formatTimestamp(comment.timestamp_seconds)}
        </button>
    ` : '';

    return `
        <div class="border-b border-gray-100 pb-3 mb-3 last:border-0">
            <div class="flex items-start gap-3">
                <div class="flex-shrink-0">${renderAvatar(comment.user_avatar, comment.user_name, 'w-8 h-8')}</div>
                <div class="flex-1 min-w-0">
                    <div class="flex items-center gap-2 flex-wrap">
                        <span class="font-medium text-sm ${isCoach ? 'text-indigo-600' : 'text-gray-900'}">
                            ${escapeHtml(comment.user_name)}
                        </span>
                        ${isCoach ? '<span class="bg-indigo-100 text-indigo-700 text-xs px-1.5 py-0.5 rounded">Coach</span>' : ''}
                        ${timestampBadge}
                        <span class="text-xs text-gray-400">${formatDate(comment.created_at)}</span>
                    </div>
                    <p class="text-sm text-gray-700 mt-1">${escapeHtml(comment.content)}</p>
                </div>
            </div>
            ${replies.length > 0 ? `
                <div class="ml-11 mt-3 space-y-3 border-l-2 border-gray-100 pl-3">
                    ${replies.map(reply => createReplyElement(reply)).join('')}
                </div>
            ` : ''}
        </div>
    `;
}

function createReplyElement(reply) {
    return `
        <div class="flex items-start gap-2">
            ${renderAvatar(reply.user_avatar, reply.user_name, 'w-6 h-6')}
            <div>
                <span class="font-medium text-xs">${escapeHtml(reply.user_name)}</span>
                <p class="text-sm text-gray-600">${escapeHtml(reply.content)}</p>
            </div>
        </div>
    `;
}

/**
 * Abonniert Echtzeit-Updates für Kommentare
 */
function subscribeToComments(videoId) {
    const { db } = videoAnalysisContext;

    if (unsubscribeComments) {
        unsubscribeComments();
    }

    const channel = db
        .channel(`video-comments-${videoId}`)
        .on('postgres_changes', {
            event: '*',
            schema: 'public',
            table: 'video_comments',
            filter: `video_id=eq.${videoId}`,
        }, () => {
            loadVideoComments(videoId);
        })
        .subscribe();

    unsubscribeComments = () => channel.unsubscribe();
}

/**
 * Fügt einen Kommentar hinzu
 */
export async function addVideoComment(content, includeTimestamp = true) {
    const { db, userId } = videoAnalysisContext;
    if (!currentVideoId || !content.trim()) return;

    let timestampSeconds = null;
    if (includeTimestamp && videoPlayer) {
        timestampSeconds = videoPlayer.currentTime;
    }

    const { error } = await db.from('video_comments').insert({
        video_id: currentVideoId,
        user_id: userId,
        content: content.trim(),
        timestamp_seconds: timestampSeconds,
    });

    if (error) {
        console.error('Fehler beim Speichern:', error);
        showToast('Fehler beim Speichern des Kommentars', 'error');
        return false;
    }

    return true;
}

/**
 * Markiert alle Zuweisungen eines Videos als reviewed
 */
export async function markVideoAsReviewed(videoId) {
    const { db } = videoAnalysisContext;

    const { error } = await db
        .from('video_assignments')
        .update({ status: 'reviewed', reviewed_at: new Date().toISOString() })
        .eq('video_id', videoId);

    if (error) {
        console.error('Fehler beim Markieren:', error);
        return false;
    }

    return true;
}

/**
 * Setup für das Upload-Modal
 */
function setupUploadModal() {
    const openBtn = document.getElementById('open-video-upload-btn');
    const modal = document.getElementById('video-upload-modal');
    const closeBtn = document.getElementById('close-video-upload-modal');
    const form = document.getElementById('video-upload-form');

    if (!modal) return;

    if (openBtn) {
        openBtn.addEventListener('click', () => {
            populateUploadForm();
            modal.classList.remove('hidden');
        });
    }

    if (closeBtn) {
        closeBtn.addEventListener('click', () => {
            modal.classList.add('hidden');
            form?.reset();
        });
    }

    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            modal.classList.add('hidden');
            form?.reset();
        }
    });

    if (form) {
        form.addEventListener('submit', handleVideoUpload);
    }

    // Tag-Buttons
    setupTagSelection();
}

/**
 * Füllt das Upload-Formular mit Daten
 */
function populateUploadForm() {
    const { exercises, clubPlayers } = videoAnalysisContext;

    // Übungs-Dropdown
    const exerciseSelect = document.getElementById('video-exercise-select');
    if (exerciseSelect) {
        exerciseSelect.innerHTML = `
            <option value="">Keine Übung</option>
            ${exercises.map(e => `<option value="${e.id}">${escapeHtml(e.name)}</option>`).join('')}
        `;
    }

    // Spieler-Liste für Zuweisung (nur echte Spieler, keine Coaches)
    const playerList = document.getElementById('video-player-assignment-list');
    if (playerList) {
        const playersOnly = clubPlayers.filter(p => p.role === 'player');

        playerList.innerHTML = `
            <label class="flex items-center gap-2 p-2 hover:bg-gray-50 rounded cursor-pointer">
                <input type="checkbox" id="select-all-players" class="rounded text-indigo-600">
                <span class="font-medium">Alle Spieler auswählen</span>
            </label>
            <hr class="my-2">
            ${playersOnly.map(player => {
                const playerName = player.firstName && player.lastName
                    ? `${player.firstName} ${player.lastName}`
                    : player.display_name || player.first_name || 'Spieler';
                return `
                <label class="flex items-center gap-2 p-2 hover:bg-gray-50 rounded cursor-pointer">
                    <input type="checkbox" name="assigned_players" value="${player.id}" class="player-checkbox rounded text-indigo-600">
                    <div class="w-6 h-6 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600 text-xs font-bold">
                        ${escapeHtml((player.firstName || player.first_name || '?').charAt(0).toUpperCase())}
                    </div>
                    <span>${escapeHtml(playerName)}</span>
                </label>
            `}).join('')}
        `;

        // Select All Logik
        const selectAll = document.getElementById('select-all-players');
        if (selectAll) {
            selectAll.addEventListener('change', () => {
                playerList.querySelectorAll('.player-checkbox').forEach(cb => {
                    cb.checked = selectAll.checked;
                });
            });
        }
    }
}

/**
 * Setup für Tag-Auswahl
 */
function setupTagSelection() {
    const container = document.getElementById('video-tags-container');
    if (!container) return;

    container.innerHTML = AVAILABLE_TAGS.map(tag => `
        <button type="button"
                class="tag-btn px-3 py-1 rounded-full text-sm border border-gray-300 hover:border-indigo-500 transition-colors"
                data-tag="${escapeHtml(tag)}">
            ${escapeHtml(tag)}
        </button>
    `).join('');

    container.querySelectorAll('.tag-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            btn.classList.toggle('bg-indigo-600');
            btn.classList.toggle('text-white');
            btn.classList.toggle('border-indigo-600');
        });
    });
}

/**
 * Handhabt den Video-Upload
 */
async function handleVideoUpload(e) {
    e.preventDefault();

    const { db, userId, clubId } = videoAnalysisContext;
    const form = e.target;
    const submitBtn = form.querySelector('button[type="submit"]');

    const fileInput = document.getElementById('video-file-input');
    const file = fileInput?.files[0];

    if (!file) {
        showToast('Bitte wähle eine Video-Datei aus', 'error');
        return;
    }

    // Validierung
    const maxSize = 100 * 1024 * 1024; // 100 MB
    if (file.size > maxSize) {
        showToast('Video ist zu groß (max. 100 MB)', 'error');
        return;
    }

    const allowedTypes = ['video/mp4', 'video/quicktime', 'video/webm'];
    if (!allowedTypes.includes(file.type)) {
        showToast('Ungültiges Videoformat (MP4, MOV, WebM erlaubt)', 'error');
        return;
    }

    submitBtn.disabled = true;
    submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>Wird hochgeladen...';

    try {
        // 1. Video in Storage hochladen
        const fileExt = file.name.split('.').pop();
        const fileName = `${userId}/${Date.now()}.${fileExt}`;

        const { data: uploadData, error: uploadError } = await db.storage
            .from('training-videos')
            .upload(fileName, file, {
                contentType: file.type,
                upsert: false,
            });

        if (uploadError) throw uploadError;

        // 2. Public URL generieren
        const { data: urlData } = db.storage
            .from('training-videos')
            .getPublicUrl(fileName);

        const videoUrl = urlData.publicUrl;

        // 3. Metadaten sammeln
        const title = document.getElementById('video-title-input')?.value || '';
        const exerciseId = document.getElementById('video-exercise-select')?.value || null;
        const isReference = document.getElementById('video-is-reference')?.checked || false;

        // Tags sammeln
        const selectedTags = [];
        document.querySelectorAll('.tag-btn.bg-indigo-600').forEach(btn => {
            selectedTags.push(btn.dataset.tag);
        });

        // Zugewiesene Spieler
        const assignedPlayers = [];
        document.querySelectorAll('input[name="assigned_players"]:checked').forEach(cb => {
            assignedPlayers.push(cb.value);
        });

        // 4. Datenbank-Eintrag erstellen
        const { data: videoAnalysis, error: insertError } = await db
            .from('video_analyses')
            .insert({
                uploaded_by: userId,
                club_id: clubId,
                exercise_id: exerciseId || null,
                video_url: videoUrl,
                title: title || null,
                tags: selectedTags,
                is_reference: isReference,
            })
            .select()
            .single();

        if (insertError) throw insertError;

        // 5. Spieler-Zuweisungen erstellen
        if (assignedPlayers.length > 0) {
            const assignments = assignedPlayers.map(playerId => ({
                video_id: videoAnalysis.id,
                player_id: playerId,
                status: 'pending',
            }));

            const { error: assignError } = await db
                .from('video_assignments')
                .insert(assignments);

            if (assignError) {
                console.error('Fehler bei Zuweisungen:', assignError);
            }
        }

        showToast('Video erfolgreich hochgeladen!', 'success');

        // Modal schließen und Liste aktualisieren
        document.getElementById('video-upload-modal')?.classList.add('hidden');
        form.reset();
        loadPendingVideos();
        loadAllVideos();

    } catch (error) {
        console.error('Upload-Fehler:', error);
        showToast('Fehler beim Hochladen: ' + error.message, 'error');
    } finally {
        submitBtn.disabled = false;
        submitBtn.innerHTML = '<i class="fas fa-upload mr-2"></i>Hochladen';
    }
}

/**
 * Setup für Video-Detail-Modal
 */
function setupVideoDetailModal() {
    const modal = document.getElementById('video-detail-modal');
    const closeBtn = document.getElementById('close-video-detail-modal');
    const commentForm = document.getElementById('video-comment-form');
    const compareBtn = document.getElementById('compare-video-btn');
    const markReviewedBtn = document.getElementById('mark-reviewed-btn');

    if (!modal) return;

    if (closeBtn) {
        closeBtn.addEventListener('click', closeVideoDetailModal);
    }

    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            closeVideoDetailModal();
        }
    });

    if (commentForm) {
        commentForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const input = document.getElementById('video-comment-input');
            const includeTimestamp = document.getElementById('include-timestamp-checkbox')?.checked ?? true;

            if (input?.value.trim()) {
                const success = await addVideoComment(input.value, includeTimestamp);
                if (success) {
                    input.value = '';
                }
            }
        });
    }

    if (compareBtn) {
        compareBtn.addEventListener('click', () => {
            openSplitScreenModal();
        });
    }

    if (markReviewedBtn) {
        markReviewedBtn.addEventListener('click', async () => {
            if (currentVideoId) {
                const success = await markVideoAsReviewed(currentVideoId);
                if (success) {
                    showToast('Video als analysiert markiert', 'success');
                    closeVideoDetailModal();
                    loadPendingVideos();
                }
            }
        });
    }
}

function closeVideoDetailModal() {
    const modal = document.getElementById('video-detail-modal');
    if (modal) {
        modal.classList.add('hidden');
    }
    if (videoPlayer) {
        videoPlayer.pause();
    }
    if (unsubscribeComments) {
        unsubscribeComments();
    }
    currentVideoId = null;
}

/**
 * Setup für Split-Screen-Modal
 */
function setupSplitScreenModal() {
    const modal = document.getElementById('split-screen-modal');
    const closeBtn = document.getElementById('close-split-screen-modal');
    const playBothBtn = document.getElementById('play-both-btn');

    if (!modal) return;

    if (closeBtn) {
        closeBtn.addEventListener('click', () => {
            modal.classList.add('hidden');
            // Videos pausieren
            document.getElementById('split-video-left')?.pause();
            document.getElementById('split-video-right')?.pause();
        });
    }

    if (playBothBtn) {
        playBothBtn.addEventListener('click', () => {
            const leftVideo = document.getElementById('split-video-left');
            const rightVideo = document.getElementById('split-video-right');

            if (leftVideo && rightVideo) {
                leftVideo.currentTime = 0;
                rightVideo.currentTime = 0;
                leftVideo.play();
                rightVideo.play();
            }
        });
    }
}

/**
 * Öffnet den Split-Screen-Vergleich
 */
async function openSplitScreenModal() {
    const { db, clubId } = videoAnalysisContext;
    const modal = document.getElementById('split-screen-modal');
    if (!modal || !currentVideoId) return;

    // Aktuelles Video-URL holen
    const { data: currentVideo } = await db
        .from('video_analyses')
        .select('video_url, exercise_id')
        .eq('id', currentVideoId)
        .single();

    if (!currentVideo) return;

    // Linkes Video (aktuell)
    const leftVideo = document.getElementById('split-video-left');
    if (leftVideo) {
        leftVideo.src = currentVideo.video_url;
    }

    // Referenz-Videos laden für Dropdown
    if (currentVideo.exercise_id) {
        const { data: refs } = await db.rpc('get_reference_videos', {
            p_exercise_id: currentVideo.exercise_id,
            p_club_id: clubId,
        });

        const select = document.getElementById('reference-video-select');
        if (select && refs) {
            select.innerHTML = `
                <option value="">Referenz-Video auswählen...</option>
                ${refs.map(ref => `
                    <option value="${escapeHtml(ref.video_url)}">
                        ${escapeHtml(ref.title || 'Referenz')} (${escapeHtml(ref.uploader_name)})
                    </option>
                `).join('')}
            `;

            select.onchange = () => {
                const rightVideo = document.getElementById('split-video-right');
                if (rightVideo && select.value) {
                    rightVideo.src = select.value;
                }
            };
        }
    }

    modal.classList.remove('hidden');
}

/**
 * Referenz-Videos laden für Coach
 */
export async function loadReferenceVideos() {
    const { db, clubId } = videoAnalysisContext;
    const container = document.getElementById('video-analysis-references');
    if (!container) return;

    const { data: videos, error } = await db
        .from('video_analyses')
        .select(`
            *,
            uploader:profiles!uploaded_by(display_name, first_name, last_name, avatar_url),
            exercise:exercises(name)
        `)
        .eq('club_id', clubId)
        .eq('is_reference', true)
        .order('created_at', { ascending: false });

    if (error || !videos || videos.length === 0) {
        container.innerHTML = `
            <div class="text-center py-8 text-gray-500">
                <i class="fas fa-video text-4xl mb-3 text-gray-300"></i>
                <p>Keine Referenz-Videos vorhanden</p>
                <p class="text-sm mt-1">Lade Videos hoch und markiere sie als "Referenz"</p>
            </div>
        `;
        return;
    }

    container.innerHTML = `
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            ${videos.map(video => {
                const uploaderName = video.uploader?.display_name ||
                    `${video.uploader?.first_name || ''} ${video.uploader?.last_name?.charAt(0) || ''}.`.trim();
                return `
                    <div class="bg-white rounded-xl shadow-md overflow-hidden">
                        <div class="aspect-video bg-gray-100 relative">
                            <video class="w-full h-full object-cover" preload="metadata">
                                <source src="${escapeHtml(video.video_url)}" type="video/mp4">
                            </video>
                            <div class="absolute top-2 left-2">
                                <span class="bg-green-500 text-white text-xs font-bold px-2 py-1 rounded">
                                    Referenz
                                </span>
                            </div>
                        </div>
                        <div class="p-4">
                            <p class="font-medium">${escapeHtml(video.title || 'Referenz-Video')}</p>
                            ${video.exercise ? `
                                <p class="text-sm text-indigo-600 mt-1">
                                    <i class="fas fa-dumbbell mr-1"></i>${escapeHtml(video.exercise.name)}
                                </p>
                            ` : ''}
                            <p class="text-xs text-gray-500 mt-2">${escapeHtml(uploaderName)}</p>
                        </div>
                    </div>
                `;
            }).join('')}
        </div>
    `;
}

// Hilfsfunktionen
function formatDate(dateStr) {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Gerade eben';
    if (diffMins < 60) return `vor ${diffMins} Min.`;
    if (diffHours < 24) return `vor ${diffHours} Std.`;
    if (diffDays < 7) return `vor ${diffDays} Tagen`;

    return date.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: '2-digit' });
}

function formatTimestamp(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function showToast(message, type = 'info') {
    // Falls globale showToast existiert
    if (typeof window.showToastMessage === 'function') {
        window.showToastMessage(message, type);
        return;
    }

    // Fallback
    const toast = document.createElement('div');
    const bgColor = type === 'error' ? 'bg-red-500' : type === 'success' ? 'bg-green-500' : 'bg-indigo-500';
    toast.className = `fixed bottom-4 right-4 ${bgColor} text-white px-6 py-3 rounded-xl z-[100010] shadow-lg`;
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
}

// Export für globalen Zugriff
window.videoAnalysis = {
    loadPendingVideos,
    loadAllVideos,
    loadReferenceVideos,
    addVideoComment,
    markVideoAsReviewed,
};
