// Video-Analyse-Modul - Supabase-Version
// Ermöglicht Coaches, Spieler-Videos zu analysieren und zeitbasierte Kommentare zu hinterlassen

import { escapeHtml } from './utils/security.js';
import { createNotification } from './notifications-supabase.js';
import {
    shouldCompressVideo,
    showCompressionDialog,
    showCompressionProgress,
    compressVideo,
    isCompressionSupported
} from './video-compressor.js';
import { VideoDrawingTool } from './video-drawing-tool.js';
import { uploadToR2 } from './r2-storage.js';

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
let drawingTool = null;

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
 * Generiert ein Thumbnail aus einer Video-Datei
 * Versucht mehrere Zeitpunkte um schwarze Frames zu vermeiden
 * @param {File} videoFile - Die Video-Datei
 * @param {number} seekTime - Zeit in Sekunden für den Screenshot (default: 1)
 * @returns {Promise<Blob>} - Das Thumbnail als JPEG Blob
 */
async function generateVideoThumbnail(videoFile, seekTime = 1) {
    return new Promise((resolve, reject) => {
        const video = document.createElement('video');
        video.preload = 'auto';
        video.muted = true;
        video.playsInline = true;
        video.crossOrigin = 'anonymous';

        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        let hasResolved = false;
        let seekAttempts = 0;
        const maxSeekAttempts = 3;

        // Prüft ob ein Frame überwiegend schwarz/dunkel ist
        const isFrameDark = () => {
            try {
                const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
                const pixels = imgData.data;
                let brightPixels = 0;
                const sampleSize = Math.min(1000, pixels.length / 4);

                for (let i = 0; i < sampleSize; i++) {
                    const idx = Math.floor(Math.random() * (pixels.length / 4)) * 4;
                    const brightness = (pixels[idx] + pixels[idx + 1] + pixels[idx + 2]) / 3;
                    if (brightness > 30) brightPixels++;
                }

                // Weniger als 20% helle Pixel = dunkler Frame
                return (brightPixels / sampleSize) < 0.2;
            } catch {
                return false;
            }
        };

        const captureFrame = () => {
            if (hasResolved) return;

            try {
                const maxWidth = 320;
                const scale = Math.min(1, maxWidth / video.videoWidth);
                canvas.width = video.videoWidth * scale;
                canvas.height = video.videoHeight * scale;

                ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

                // Prüfe ob der Frame dunkel ist und versuche anderen Zeitpunkt
                if (isFrameDark() && seekAttempts < maxSeekAttempts) {
                    seekAttempts++;
                    // Versuche andere Zeitpunkte: 2s, 5s, 10% der Dauer
                    const nextSeekTime = seekAttempts === 1 ? 2 :
                                         seekAttempts === 2 ? 5 :
                                         Math.min(video.duration * 0.1, 3);
                    video.currentTime = Math.min(nextSeekTime, video.duration - 0.5);
                    return; // onseeked wird wieder aufgerufen
                }

                hasResolved = true;
                canvas.toBlob(
                    (blob) => {
                        URL.revokeObjectURL(video.src);
                        video.pause();
                        blob ? resolve(blob) : reject(new Error('Thumbnail-Generierung fehlgeschlagen'));
                    },
                    'image/jpeg',
                    0.85
                );
            } catch (err) {
                hasResolved = true;
                URL.revokeObjectURL(video.src);
                video.pause();
                reject(err);
            }
        };

        video.onloadeddata = () => {
            // Starte mit 1 Sekunde (nicht zu früh für schwarze Intros)
            const targetTime = Math.min(seekTime, video.duration - 0.5);
            video.currentTime = Math.max(0.5, targetTime);
        };

        video.onseeked = () => {
            // Kurz warten damit der Frame gerendert wird
            setTimeout(captureFrame, 150);
        };

        video.onerror = () => {
            if (hasResolved) return;
            hasResolved = true;
            URL.revokeObjectURL(video.src);
            reject(new Error('Video konnte nicht geladen werden'));
        };

        // Timeout als Fallback
        setTimeout(() => {
            if (!hasResolved && video.readyState >= 2) {
                hasResolved = true;
                ctx.drawImage(video, 0, 0, canvas.width || 320, canvas.height || 180);
                canvas.toBlob(
                    (blob) => {
                        URL.revokeObjectURL(video.src);
                        video.pause();
                        blob ? resolve(blob) : reject(new Error('Thumbnail-Timeout'));
                    },
                    'image/jpeg',
                    0.85
                );
            } else if (!hasResolved) {
                hasResolved = true;
                URL.revokeObjectURL(video.src);
                reject(new Error('Thumbnail-Timeout'));
            }
        }, 15000);

        video.src = URL.createObjectURL(videoFile);
        video.load();
    });
}

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
    const fallbackHtml = `<div class="${cssClass} bg-gray-200 flex items-center justify-center"><i class="fas fa-video text-gray-400 text-3xl"></i></div>`;

    if (thumbnailUrl) {
        // Einfacher onerror: Verstecke Bild und zeige Parent-Fallback
        return `<img src="${escapeHtml(thumbnailUrl)}" alt="Video Thumbnail" class="${cssClass}" onerror="this.onerror=null;this.style.display='none';this.parentElement.classList.add('bg-gray-200');this.parentElement.innerHTML='<i class=\\'fas fa-video text-gray-400 text-3xl\\'></i>';">`;
    }

    return fallbackHtml;
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

    // Videos laden wenn der Video-Analysis Sub-Tab geöffnet wird
    window.addEventListener('coachSubtabChanged', (e) => {
        if (e.detail.subtab === 'videos') {
            loadPendingVideos();
        }
    });

    // Auch beim Wechsel des Haupt-Tabs laden, falls Videos der aktive Sub-Tab ist
    window.addEventListener('coachTabChanged', (e) => {
        if (e.detail.subtab === 'videos') {
            loadPendingVideos();
        }
    });

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
    const assignedPlayers = video.assigned_players || [];
    const assignedText = assignedPlayers.length > 0
        ? assignedPlayers.map(p => escapeHtml(p)).join(', ')
        : 'Nicht zugewiesen';

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
                <div class="mb-2">
                    <p class="text-xs text-gray-500 mb-0.5">Zugewiesen an:</p>
                    <p class="font-medium text-sm text-indigo-700">${assignedText}</p>
                </div>
                ${video.title ? `<p class="text-sm font-medium mb-2">${escapeHtml(video.title)}</p>` : ''}
                ${video.exercise_name ? `
                    <p class="text-xs text-indigo-600 mb-2">
                        <i class="fas fa-dumbbell mr-1"></i>${escapeHtml(video.exercise_name)}
                    </p>
                ` : ''}
                <p class="text-xs text-gray-400">${formatVideoDate(video.video_date, video.created_at)}</p>
                ${tags.length > 0 ? `
                    <div class="flex flex-wrap gap-1 mt-2">
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
            exercise:exercises(id, name),
            assignments:video_assignments(
                player:profiles!player_id(id, first_name, last_name, display_name)
            )
        `)
        .eq('club_id', clubId)
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

    // Click handler for video cards (only on video-card-click elements)
    container.querySelectorAll('.video-card-click').forEach(el => {
        el.addEventListener('click', (e) => {
            const card = e.target.closest('[data-video-id]');
            if (card) {
                openVideoDetailModal(card.dataset.videoId);
            }
        });
    });

    // Click handler for "Add as Musterbeispiel" buttons
    container.querySelectorAll('.add-example-from-card').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            openAddExampleForVideoModal(btn.dataset.videoId, btn.dataset.videoTitle);
        });
    });
}

function createVideoCardFull(video) {
    const uploader = video.uploader;
    const uploaderName = uploader?.display_name || `${uploader?.first_name || ''} ${uploader?.last_name?.charAt(0) || ''}.`.trim();
    const exerciseName = video.exercise?.name || '';

    // Get assigned players from assignments
    const assignedPlayers = (video.assignments || [])
        .filter(a => a.player)
        .map(a => {
            const p = a.player;
            return p.display_name || `${p.first_name || ''} ${p.last_name?.charAt(0) || ''}.`.trim();
        });
    const assignedText = assignedPlayers.length > 0
        ? assignedPlayers.map(p => escapeHtml(p)).join(', ')
        : null;

    return `
        <div class="bg-white rounded-xl shadow-md overflow-hidden hover:shadow-lg transition-shadow group relative"
             data-video-id="${video.id}">
            <div class="relative aspect-video bg-gray-100 flex items-center justify-center cursor-pointer video-card-click">
                ${renderVideoThumbnail(video.thumbnail_url, 'w-full h-full object-cover')}
                <!-- Musterbeispiel Button (always visible on mobile, hover on desktop) -->
                <button class="add-example-from-card absolute top-2 right-2 w-8 h-8 sm:w-9 sm:h-9 bg-yellow-500 hover:bg-yellow-600 active:bg-yellow-700 text-white rounded-full flex items-center justify-center opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity shadow-lg"
                        data-video-id="${video.id}"
                        data-video-title="${escapeHtml(video.title || 'Video')}"
                        title="Als Musterbeispiel hinzufügen">
                    <i class="fas fa-star text-sm"></i>
                </button>
            </div>
            <div class="p-3 sm:p-4 cursor-pointer video-card-click">
                <p class="font-medium text-sm mb-1 truncate">${escapeHtml(video.title || 'Ohne Titel')}</p>
                ${assignedText ? `
                    <p class="text-xs text-indigo-700 truncate mb-1">
                        <i class="fas fa-user mr-1"></i>${assignedText}
                    </p>
                ` : ''}
                <p class="text-xs text-gray-500 truncate">${escapeHtml(uploaderName)} • ${formatVideoDate(video.video_date, video.created_at)}</p>
                ${exerciseName ? `<p class="text-xs text-indigo-600 mt-1 truncate"><i class="fas fa-dumbbell mr-1"></i>${escapeHtml(exerciseName)}</p>` : ''}
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

    // Video-Daten laden inkl. Assignment-Status
    const { data: video, error } = await db
        .from('video_analyses')
        .select(`
            *,
            uploader:profiles!uploaded_by(id, first_name, last_name, display_name, avatar_url, role),
            exercise:exercises(id, name),
            assignments:video_assignments(status)
        `)
        .eq('id', videoId)
        .single();

    if (error || !video) {
        console.error('Video nicht gefunden:', error);
        closeVideoDetailModal();
        return;
    }

    // Mark-Reviewed Button Status aktualisieren
    const markReviewedBtn = document.getElementById('mark-reviewed-btn');
    if (markReviewedBtn) {
        const isReviewed = video.assignments?.some(a => a.status === 'reviewed');
        if (isReviewed) {
            markReviewedBtn.innerHTML = '<i class="fas fa-check-double mr-1"></i> Bereits analysiert';
            markReviewedBtn.classList.remove('bg-green-600', 'hover:bg-green-700');
            markReviewedBtn.classList.add('bg-gray-400', 'cursor-default');
            markReviewedBtn.disabled = true;
        } else {
            markReviewedBtn.innerHTML = '<i class="fas fa-check mr-1"></i> Als analysiert markieren';
            markReviewedBtn.classList.add('bg-green-600', 'hover:bg-green-700');
            markReviewedBtn.classList.remove('bg-gray-400', 'cursor-default');
            markReviewedBtn.disabled = false;
        }
    }

    // Video Player einrichten
    const videoContainer = document.getElementById('video-player-container');
    const uploaderName = video.uploader?.display_name ||
        `${video.uploader?.first_name || ''} ${video.uploader?.last_name?.charAt(0) || ''}.`.trim();

    videoContainer.innerHTML = `
        <video id="analysis-video-player"
               class="w-full rounded-lg bg-black"
               controls
               crossorigin="anonymous"
               playsinline
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

    // Store current video data for Musterbeispiel feature
    modal.dataset.currentVideoId = videoId;
    modal.dataset.currentVideoExerciseId = video.exercise_id || '';

    // Kommentare laden
    await loadVideoComments(videoId);

    // Realtime-Subscription für Kommentare
    subscribeToComments(videoId);
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

    // Check if comment has a drawing
    let contentHtml = '';
    const drawingUrl = comment.drawing_url || extractDrawingUrl(comment.content);

    if (drawingUrl) {
        contentHtml = `
            <div class="mt-2">
                <img src="${escapeHtml(drawingUrl)}"
                     alt="Zeichnung"
                     class="max-w-full rounded-lg border border-gray-200 cursor-pointer hover:opacity-90 transition-opacity"
                     style="max-height: 200px;"
                     onclick="window.open('${escapeHtml(drawingUrl)}', '_blank')">
                <p class="text-xs text-gray-500 mt-1"><i class="fas fa-pen text-orange-500 mr-1"></i>Zeichnung zum Video</p>
            </div>
        `;
    } else {
        contentHtml = `<p class="text-sm text-gray-700 mt-1">${escapeHtml(comment.content)}</p>`;
    }

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
                    ${contentHtml}
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

/**
 * Extrahiert eine Zeichnungs-URL aus dem Kommentar-Content (Markdown-Format)
 */
function extractDrawingUrl(content) {
    if (!content) return null;
    // Match [Zeichnung](url) format
    const match = content.match(/\[Zeichnung\]\((https?:\/\/[^\)]+)\)/);
    return match ? match[1] : null;
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
    const { db, userId, clubId, userRole } = videoAnalysisContext;
    if (!currentVideoId || !content.trim()) return;

    let timestampSeconds = null;
    if (includeTimestamp && videoPlayer) {
        timestampSeconds = videoPlayer.currentTime;
    }

    const { error } = await db.from('video_comments').insert({
        video_id: currentVideoId,
        user_id: userId,
        club_id: clubId,
        content: content.trim(),
        timestamp_seconds: timestampSeconds,
    });

    if (error) {
        console.error('Fehler beim Speichern:', error);
        showToast('Fehler beim Speichern des Kommentars', 'error');
        return false;
    }

    // Benachrichtigung an den Video-Eigentümer senden (wenn Coach kommentiert)
    const isCoach = userRole === 'coach' || userRole === 'head_coach' || userRole === 'admin';
    if (isCoach) {
        try {
            // Video-Eigentümer und Coach-Namen ermitteln
            const { data: video } = await db
                .from('video_analyses')
                .select('uploaded_by, title')
                .eq('id', currentVideoId)
                .single();

            // Nur benachrichtigen, wenn der Coach nicht der Video-Eigentümer ist
            if (video && video.uploaded_by && video.uploaded_by !== userId) {
                const { data: coachProfile } = await db
                    .from('profiles')
                    .select('first_name, last_name')
                    .eq('id', userId)
                    .single();

                const coachName = coachProfile
                    ? `${coachProfile.first_name || ''} ${coachProfile.last_name || ''}`.trim() || 'Dein Coach'
                    : 'Dein Coach';

                const videoTitle = video.title || 'dein Video';
                const timestampText = timestampSeconds !== null
                    ? ` bei ${formatTimestamp(timestampSeconds)}`
                    : '';

                await createNotification(
                    video.uploaded_by,
                    'video_feedback',
                    'Neues Feedback zu deinem Video',
                    `${coachName} hat${timestampText} kommentiert: "${content.trim().substring(0, 50)}${content.length > 50 ? '...' : ''}"`,
                    {
                        video_id: currentVideoId,
                        video_title: videoTitle,
                        coach_id: userId,
                        coach_name: coachName,
                        timestamp_seconds: timestampSeconds,
                    }
                );
            }
        } catch (notifError) {
            // Benachrichtigungsfehler sollte das Kommentar-Speichern nicht blockieren
            console.warn('Fehler beim Senden der Benachrichtigung:', notifError);
        }
    }

    return true;
}

/**
 * Markiert alle Zuweisungen eines Videos als reviewed
 */
export async function markVideoAsReviewed(videoId) {
    const { db, userId } = videoAnalysisContext;

    const { error } = await db
        .from('video_assignments')
        .update({ status: 'reviewed', reviewed_at: new Date().toISOString() })
        .eq('video_id', videoId);

    if (error) {
        console.error('Fehler beim Markieren:', error);
        return false;
    }

    // Benachrichtigung an den Video-Eigentümer senden
    try {
        const { data: video } = await db
            .from('video_analyses')
            .select('uploaded_by, title')
            .eq('id', videoId)
            .single();

        if (video && video.uploaded_by && video.uploaded_by !== userId) {
            const { data: coachProfile } = await db
                .from('profiles')
                .select('first_name, last_name')
                .eq('id', userId)
                .single();

            const coachName = coachProfile
                ? `${coachProfile.first_name || ''} ${coachProfile.last_name || ''}`.trim() || 'Dein Coach'
                : 'Dein Coach';

            const videoTitle = video.title || 'Dein Video';

            await createNotification(
                video.uploaded_by,
                'video_feedback',
                'Videoanalyse abgeschlossen!',
                `${coachName} hat die Analyse zu "${videoTitle}" abgeschlossen. Schau dir das Feedback an!`,
                {
                    video_id: videoId,
                    video_title: videoTitle,
                    coach_id: userId,
                    coach_name: coachName,
                    analysis_completed: true,
                }
            );
        }
    } catch (notifError) {
        console.warn('Fehler beim Senden der Benachrichtigung:', notifError);
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
            // Video-Datum auf heute setzen
            const dateInput = document.getElementById('video-date-input');
            if (dateInput) dateInput.value = new Date().toISOString().split('T')[0];
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
            <div class="mb-3">
                <input type="text"
                       id="player-search-input"
                       placeholder="Spieler suchen..."
                       class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500">
            </div>
            <label class="flex items-center gap-2 p-2 hover:bg-gray-50 rounded cursor-pointer">
                <input type="checkbox" id="select-all-players" class="rounded text-indigo-600">
                <span class="font-medium">Alle Spieler auswählen</span>
            </label>
            <hr class="my-2">
            <div id="player-list-items">
            ${playersOnly.map(player => {
                const playerName = player.firstName && player.lastName
                    ? `${player.firstName} ${player.lastName}`
                    : player.display_name || player.first_name || 'Spieler';
                return `
                <label class="player-item flex items-center gap-2 p-2 hover:bg-gray-50 rounded cursor-pointer" data-name="${escapeHtml(playerName.toLowerCase())}">
                    <input type="checkbox" name="assigned_players" value="${player.id}" class="player-checkbox rounded text-indigo-600">
                    <div class="w-6 h-6 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600 text-xs font-bold">
                        ${escapeHtml((player.firstName || player.first_name || '?').charAt(0).toUpperCase())}
                    </div>
                    <span>${escapeHtml(playerName)}</span>
                </label>
            `}).join('')}
            </div>
        `;

        // Spieler-Suche Logik
        const searchInput = document.getElementById('player-search-input');
        if (searchInput) {
            searchInput.addEventListener('input', (e) => {
                const searchTerm = e.target.value.toLowerCase().trim();
                const playerItems = playerList.querySelectorAll('.player-item');
                playerItems.forEach(item => {
                    const name = item.dataset.name || '';
                    if (searchTerm === '' || name.includes(searchTerm)) {
                        item.style.display = 'flex';
                    } else {
                        item.style.display = 'none';
                    }
                });
            });
        }

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

    // Custom Tag hinzufügen
    setupCustomTagInput();
}

/**
 * Setup für Custom Tag Input
 */
function setupCustomTagInput() {
    const input = document.getElementById('custom-tag-input');
    const addBtn = document.getElementById('add-custom-tag-btn');
    const container = document.getElementById('video-tags-container');

    if (!input || !addBtn || !container) return;

    const addCustomTag = () => {
        const tagText = input.value.trim();
        if (!tagText) return;

        // Prüfen ob Tag schon existiert
        const existingTag = container.querySelector(`[data-tag="${CSS.escape(tagText)}"]`);
        if (existingTag) {
            // Tag auswählen statt doppelt hinzufügen
            if (!existingTag.classList.contains('bg-indigo-600')) {
                existingTag.click();
            }
            input.value = '';
            return;
        }

        // Neuen Tag erstellen
        const tagBtn = document.createElement('button');
        tagBtn.type = 'button';
        tagBtn.className = 'tag-btn px-3 py-1 rounded-full text-sm border border-indigo-600 bg-indigo-600 text-white transition-colors flex items-center gap-1';
        tagBtn.dataset.tag = tagText;
        tagBtn.dataset.custom = 'true';
        tagBtn.innerHTML = `
            ${escapeHtml(tagText)}
            <span class="remove-tag text-xs opacity-70 hover:opacity-100">×</span>
        `;

        // Toggle Funktion
        tagBtn.addEventListener('click', (e) => {
            if (e.target.classList.contains('remove-tag')) {
                tagBtn.remove();
            } else {
                tagBtn.classList.toggle('bg-indigo-600');
                tagBtn.classList.toggle('text-white');
                tagBtn.classList.toggle('border-indigo-600');
                tagBtn.classList.toggle('border-gray-300');
            }
        });

        container.appendChild(tagBtn);
        input.value = '';
    };

    addBtn.addEventListener('click', addCustomTag);
    input.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            addCustomTag();
        }
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
    let file = fileInput?.files[0];

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

    // Video-Komprimierung anbieten wenn Datei groß genug
    if (isCompressionSupported() && shouldCompressVideo(file)) {
        try {
            const { compress } = await showCompressionDialog(file);

            if (compress) {
                const progress = showCompressionProgress(file);
                try {
                    file = await compressVideo(file, {
                        onProgress: progress.updateProgress,
                        onStatus: progress.updateStatus,
                        quality: 'medium'
                    });
                    progress.close();
                    showToast(`Video komprimiert: ${(file.size / 1024 / 1024).toFixed(1)} MB`, 'success');
                } catch (compressError) {
                    progress.close();
                    console.error('Compression failed:', compressError);
                    showToast('Komprimierung fehlgeschlagen, Original wird verwendet', 'warning');
                    file = fileInput.files[0]; // Zurück zum Original
                }
            }
        } catch (dialogError) {
            console.error('Compression dialog error:', dialogError);
        }
    }

    submitBtn.disabled = true;

    // Progress UI elements
    const progressContainer = document.getElementById('video-upload-progress');
    const progressBar = document.getElementById('upload-progress-bar');
    const statusText = document.getElementById('upload-status-text');
    const percentText = document.getElementById('upload-percent-text');
    const sizeText = document.getElementById('upload-size-text');

    const formatFileSize = (bytes) => {
        if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
        return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    };

    const updateProgress = (percent, status) => {
        if (progressBar) progressBar.style.width = percent + '%';
        if (percentText) percentText.textContent = Math.round(percent) + '%';
        if (statusText) statusText.textContent = status;
    };

    // Show progress, hide button
    if (progressContainer) progressContainer.classList.remove('hidden');
    submitBtn.classList.add('hidden');
    if (sizeText) sizeText.textContent = `Dateigröße: ${formatFileSize(file.size)}`;

    try {
        const timestamp = Date.now();

        // 1. Thumbnail generieren (0-10%)
        let thumbnailUrl = null;
        try {
            updateProgress(2, 'Thumbnail wird erstellt...');
            const thumbnailBlob = await generateVideoThumbnail(file);
            const thumbFileName = `${timestamp}_thumb.jpg`;

            updateProgress(5, 'Thumbnail wird hochgeladen...');
            // Upload zu R2 (mit Fallback zu Supabase)
            const thumbFile = new File([thumbnailBlob], thumbFileName, { type: 'image/jpeg' });
            const thumbResult = await uploadToR2('training-videos', thumbFile, {
                subfolder: userId,
                filename: thumbFileName
            });
            thumbnailUrl = thumbResult.url;
            updateProgress(10, 'Thumbnail fertig');
        } catch (thumbErr) {
            console.warn('Thumbnail-Generierung fehlgeschlagen:', thumbErr);
            updateProgress(10, 'Thumbnail übersprungen');
        }

        // 2. Video in Storage hochladen (10-90%)
        updateProgress(12, 'Video wird hochgeladen...');
        const fileExt = file.name.split('.').pop();
        const fileName = `${timestamp}.${fileExt}`;

        // Simuliere Progress während Upload (da R2/Supabase kein natives Progress-Tracking hat)
        let uploadProgress = 12;
        const progressInterval = setInterval(() => {
            if (uploadProgress < 85) {
                uploadProgress += Math.random() * 3;
                updateProgress(uploadProgress, 'Video wird hochgeladen...');
            }
        }, 500);

        // Upload zu R2 (mit Fallback zu Supabase)
        const uploadResult = await uploadToR2('training-videos', file, {
            subfolder: userId,
            filename: fileName
        });

        clearInterval(progressInterval);
        updateProgress(90, 'Video hochgeladen!');

        const videoUrl = uploadResult.url;

        // 4. Metadaten sammeln
        const title = document.getElementById('video-title-input')?.value || '';
        const exerciseId = document.getElementById('video-exercise-select')?.value || null;

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

        // KI-Training Consent
        const allowAiTraining = document.getElementById('coach-allow-ai-training')?.checked ?? false;

        // Video-Datum (default: heute)
        const videoDateInput = document.getElementById('video-date-input')?.value;
        const videoDate = videoDateInput || new Date().toISOString().split('T')[0];

        // 5. Datenbank-Eintrag erstellen (90-95%)
        updateProgress(92, 'Video wird gespeichert...');
        const { data: videoAnalysis, error: insertError } = await db
            .from('video_analyses')
            .insert({
                uploaded_by: userId,
                club_id: clubId,
                exercise_id: exerciseId || null,
                video_url: videoUrl,
                thumbnail_url: thumbnailUrl,
                title: title || null,
                tags: selectedTags,
                allow_ai_training: allowAiTraining,
                video_date: videoDate,
            })
            .select()
            .single();

        if (insertError) throw insertError;

        // 6. Spieler-Zuweisungen erstellen (95-100%)
        if (assignedPlayers.length > 0) {
            updateProgress(95, 'Spieler werden zugewiesen...');
            const assignments = assignedPlayers.map(playerId => ({
                video_id: videoAnalysis.id,
                player_id: playerId,
                club_id: clubId,
                status: 'pending',
            }));

            const { error: assignError } = await db
                .from('video_assignments')
                .insert(assignments);

            if (assignError) {
                console.error('Fehler bei Zuweisungen:', assignError);
            }
        }

        updateProgress(100, 'Fertig!');
        showToast('Video erfolgreich hochgeladen!', 'success');

        // Modal schließen und Liste aktualisieren
        setTimeout(() => {
            document.getElementById('video-upload-modal')?.classList.add('hidden');
            form.reset();
            // Reset progress UI
            if (progressContainer) progressContainer.classList.add('hidden');
            if (progressBar) progressBar.style.width = '0%';
            submitBtn.classList.remove('hidden');
            loadPendingVideos();
            loadAllVideos();
        }, 500);

    } catch (error) {
        console.error('Upload-Fehler:', error);
        showToast('Fehler beim Hochladen: ' + error.message, 'error');
        updateProgress(0, 'Fehler aufgetreten');
    } finally {
        submitBtn.disabled = false;
        submitBtn.classList.remove('hidden');
        if (progressContainer) progressContainer.classList.add('hidden');
        if (progressBar) progressBar.style.width = '0%';
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
    const drawBtn = document.getElementById('draw-on-video-btn');

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

    // Drawing tool button
    if (drawBtn) {
        drawBtn.addEventListener('click', () => {
            if (!videoPlayer) {
                showToast('Video muss erst geladen werden', 'info');
                return;
            }

            if (drawingTool) {
                // Toggle drawing mode
                drawingTool.toggle();
                // Update button style based on drawing state
                if (drawingTool.isActive) {
                    drawBtn.classList.remove('bg-orange-500', 'hover:bg-orange-600');
                    drawBtn.classList.add('bg-orange-700', 'ring-2', 'ring-orange-300');
                } else {
                    drawBtn.classList.add('bg-orange-500', 'hover:bg-orange-600');
                    drawBtn.classList.remove('bg-orange-700', 'ring-2', 'ring-orange-300');
                }
            } else {
                // Initialize drawing tool
                initializeDrawingTool();
                drawBtn.classList.remove('bg-orange-500', 'hover:bg-orange-600');
                drawBtn.classList.add('bg-orange-700', 'ring-2', 'ring-orange-300');
            }
        });
    }
}

/**
 * Initialisiert das Zeichen-Tool für das aktuelle Video
 */
function initializeDrawingTool() {
    if (!videoPlayer) return;

    // Pausiere das Video beim Start des Zeichnens
    videoPlayer.pause();

    const createAndActivate = () => {
        drawingTool = new VideoDrawingTool(videoPlayer, {
            strokeWidth: 3,
            color: '#FF0000',
            onSave: handleDrawingSave,
            onDeactivate: () => {
                const drawBtn = document.getElementById('draw-on-video-btn');
                if (drawBtn) {
                    drawBtn.classList.add('bg-orange-500', 'hover:bg-orange-600');
                    drawBtn.classList.remove('bg-orange-700', 'ring-2', 'ring-orange-300');
                }
            }
        });

        drawingTool.activate();
    };

    // Ensure video has dimensions before creating the canvas overlay
    if (videoPlayer.readyState >= 1 && videoPlayer.videoWidth > 0) {
        createAndActivate();
    } else {
        videoPlayer.addEventListener('loadedmetadata', () => createAndActivate(), { once: true });
        // Fallback: if metadata already loaded but videoWidth is 0 (e.g. audio-only), try after a short delay
        setTimeout(() => {
            if (!drawingTool) createAndActivate();
        }, 500);
    }
}

/**
 * Handler wenn eine Zeichnung gespeichert wird
 * @param {string} dataUrl - Die Zeichnung als Data-URL
 * @param {Object} metadata - Zusätzliche Infos (timestamp, includesVideoFrame, shapes)
 */
async function handleDrawingSave(dataUrl, metadata = {}) {
    const { db, userId, clubId } = videoAnalysisContext;

    try {
        // Konvertiere DataURL zu Blob
        const response = await fetch(dataUrl);
        const blob = await response.blob();

        // Dateiname generieren - Format: {userId}/drawings/{videoId}_{timestamp}.png
        const timestamp = Date.now();
        const fileName = `${currentVideoId}_${timestamp}.png`;

        // Upload zu R2 (mit Fallback zu Supabase)
        const drawingFile = new File([blob], fileName, { type: 'image/png' });
        const uploadResult = await uploadToR2('training-videos', drawingFile, {
            subfolder: `${userId}/drawings`,
            filename: fileName
        });

        const imageUrl = uploadResult.url;

        // Kommentar mit Zeichnung erstellen
        const timestampSeconds = videoPlayer ? videoPlayer.currentTime : null;
        const { error: commentError } = await db.from('video_comments').insert({
            video_id: currentVideoId,
            user_id: userId,
            club_id: clubId,
            content: '[Zeichnung]',
            timestamp_seconds: timestampSeconds,
            drawing_url: imageUrl,
        });

        if (commentError) {
            // Falls drawing_url Spalte nicht existiert, ohne sie speichern
            if (commentError.message.includes('drawing_url')) {
                await db.from('video_comments').insert({
                    video_id: currentVideoId,
                    user_id: userId,
                    club_id: clubId,
                    content: `[Zeichnung](${imageUrl})`,
                    timestamp_seconds: timestampSeconds,
                });
            } else {
                throw commentError;
            }
        }

        showToast('Zeichnung gespeichert!', 'success');

        // Zeichnen deaktivieren nach dem Speichern
        if (drawingTool) {
            drawingTool.deactivate();
        }

    } catch (error) {
        console.error('Fehler beim Speichern der Zeichnung:', error);
        showToast('Fehler beim Speichern der Zeichnung', 'error');
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
    // Cleanup drawing tool
    if (drawingTool) {
        drawingTool.destroy();
        drawingTool = null;
    }
    // Reset draw button style
    const drawBtn = document.getElementById('draw-on-video-btn');
    if (drawBtn) {
        drawBtn.classList.add('bg-orange-500', 'hover:bg-orange-600');
        drawBtn.classList.remove('bg-orange-700', 'ring-2', 'ring-orange-300');
    }
    currentVideoId = null;
}

// Split-Screen State
const splitScreenState = {
    videos: [],
    leftPlayer: null,
    rightPlayer: null,
    isSynced: true,
    isPlaying: false,
};

/**
 * Setup für Split-Screen-Modal
 */
function setupSplitScreenModal() {
    const modal = document.getElementById('split-screen-modal');
    if (!modal) return;

    const closeBtn = document.getElementById('close-split-screen-modal');
    const playBothBtn = document.getElementById('play-both-btn');
    const restartBtn = document.getElementById('restart-both-btn');
    const syncCheckbox = document.getElementById('coach-sync-playback');
    const leftSelect = document.getElementById('split-video-select-left');
    const rightSelect = document.getElementById('split-video-select-right');

    splitScreenState.leftPlayer = document.getElementById('split-video-left');
    splitScreenState.rightPlayer = document.getElementById('split-video-right');

    // Close button
    closeBtn?.addEventListener('click', closeSplitScreenModal);

    // Video selection
    leftSelect?.addEventListener('change', () => {
        const video = splitScreenState.videos.find(v => v.id === leftSelect.value);
        if (video) loadSplitVideo('left', video);
    });

    rightSelect?.addEventListener('change', () => {
        const video = splitScreenState.videos.find(v => v.id === rightSelect.value);
        if (video) loadSplitVideo('right', video);
    });

    // Sync toggle
    syncCheckbox?.addEventListener('change', () => {
        splitScreenState.isSynced = syncCheckbox.checked;
    });

    // Play/Pause button
    playBothBtn?.addEventListener('click', toggleSplitPlayback);

    // Restart button
    restartBtn?.addEventListener('click', restartSplitVideos);

    // Sync playback events
    if (splitScreenState.leftPlayer) {
        splitScreenState.leftPlayer.addEventListener('play', () => syncSplitPlayback('left', 'play'));
        splitScreenState.leftPlayer.addEventListener('pause', () => syncSplitPlayback('left', 'pause'));
        splitScreenState.leftPlayer.addEventListener('seeked', () => syncSplitPlayback('left', 'seek'));
        splitScreenState.leftPlayer.addEventListener('timeupdate', updateSplitTime);
    }

    if (splitScreenState.rightPlayer) {
        splitScreenState.rightPlayer.addEventListener('play', () => syncSplitPlayback('right', 'play'));
        splitScreenState.rightPlayer.addEventListener('pause', () => syncSplitPlayback('right', 'pause'));
        splitScreenState.rightPlayer.addEventListener('seeked', () => syncSplitPlayback('right', 'seek'));
    }
}

/**
 * Öffnet den Split-Screen-Vergleich
 */
async function openSplitScreenModal(preselectedVideoId = null) {
    const { db, clubId } = videoAnalysisContext;
    const modal = document.getElementById('split-screen-modal');
    if (!modal) return;

    // Alle Videos des Clubs laden
    const { data: videos, error } = await db
        .from('video_analyses')
        .select(`
            id, title, video_url, thumbnail_url, created_at,
            exercise:exercises(name),
            uploader:profiles!uploaded_by(first_name, last_name)
        `)
        .eq('club_id', clubId)
        .order('created_at', { ascending: false });

    if (error || !videos || videos.length < 2) {
        showToast('Nicht genügend Videos für einen Vergleich vorhanden', 'info');
        return;
    }

    splitScreenState.videos = videos;

    // Dropdowns füllen
    const leftSelect = document.getElementById('split-video-select-left');
    const rightSelect = document.getElementById('split-video-select-right');

    const optionsHtml = videos.map(v => {
        const date = new Date(v.created_at).toLocaleDateString('de-DE');
        const uploaderName = v.uploader ? `${v.uploader.first_name || ''} ${v.uploader.last_name || ''}`.trim() : '';
        const title = v.title || v.exercise?.name || 'Video';
        const label = uploaderName ? `${title} - ${uploaderName} (${date})` : `${title} (${date})`;
        return `<option value="${v.id}">${escapeHtml(label)}</option>`;
    }).join('');

    leftSelect.innerHTML = '<option value="">Video 1 auswählen...</option>' + optionsHtml;
    rightSelect.innerHTML = '<option value="">Video 2 auswählen...</option>' + optionsHtml;

    // Vorauswahl falls vorhanden
    if (preselectedVideoId || currentVideoId) {
        const videoId = preselectedVideoId || currentVideoId;
        leftSelect.value = videoId;
        const video = videos.find(v => v.id === videoId);
        if (video) loadSplitVideo('left', video);

        // Zweites Video: nächstes in der Liste
        const otherVideo = videos.find(v => v.id !== videoId);
        if (otherVideo) {
            rightSelect.value = otherVideo.id;
            loadSplitVideo('right', otherVideo);
        }
    }

    modal.classList.remove('hidden');
}

/**
 * Lädt ein Video in den Split-Screen Player
 */
function loadSplitVideo(side, video) {
    const player = side === 'left' ? splitScreenState.leftPlayer : splitScreenState.rightPlayer;
    const infoDiv = document.getElementById(`split-info-${side}`);
    const titleEl = document.getElementById(`split-title-${side}`);
    const dateEl = document.getElementById(`split-date-${side}`);

    if (player && video.video_url) {
        player.src = video.video_url;
        player.load();
    }

    if (infoDiv && titleEl && dateEl) {
        const uploaderName = video.uploader ? `${video.uploader.first_name || ''} ${video.uploader.last_name || ''}`.trim() : '';
        titleEl.textContent = video.title || video.exercise?.name || 'Video';
        dateEl.textContent = uploaderName
            ? `${uploaderName} · ${new Date(video.created_at).toLocaleDateString('de-DE')}`
            : new Date(video.created_at).toLocaleDateString('de-DE');
        infoDiv.classList.remove('hidden');
    }
}

/**
 * Synchronisiert die Wiedergabe zwischen beiden Videos
 */
function syncSplitPlayback(source, action) {
    if (!splitScreenState.isSynced) return;

    const sourcePlayer = source === 'left' ? splitScreenState.leftPlayer : splitScreenState.rightPlayer;
    const targetPlayer = source === 'left' ? splitScreenState.rightPlayer : splitScreenState.leftPlayer;

    if (!sourcePlayer || !targetPlayer) return;

    switch (action) {
        case 'play':
            if (targetPlayer.paused) {
                targetPlayer.play().catch(() => {});
            }
            updateSplitPlayPauseButton(false);
            break;
        case 'pause':
            if (!targetPlayer.paused) {
                targetPlayer.pause();
            }
            updateSplitPlayPauseButton(true);
            break;
        case 'seek':
            if (Math.abs(sourcePlayer.currentTime - targetPlayer.currentTime) > 0.5) {
                targetPlayer.currentTime = sourcePlayer.currentTime;
            }
            break;
    }
}

/**
 * Aktualisiert die Zeitanzeige
 */
function updateSplitTime() {
    const timeEl = document.getElementById('split-time');
    if (timeEl && splitScreenState.leftPlayer) {
        const secs = Math.floor(splitScreenState.leftPlayer.currentTime);
        const mins = Math.floor(secs / 60);
        const remainSecs = secs % 60;
        timeEl.textContent = `${mins}:${remainSecs.toString().padStart(2, '0')}`;
    }
}

/**
 * Play/Pause Toggle für Split-Screen
 */
function toggleSplitPlayback() {
    const { leftPlayer, rightPlayer } = splitScreenState;
    if (!leftPlayer && !rightPlayer) return;

    const isPaused = leftPlayer?.paused ?? true;

    if (isPaused) {
        leftPlayer?.play().catch(() => {});
        rightPlayer?.play().catch(() => {});
    } else {
        leftPlayer?.pause();
        rightPlayer?.pause();
    }

    updateSplitPlayPauseButton(!isPaused);
}

/**
 * Aktualisiert den Play/Pause Button
 */
function updateSplitPlayPauseButton(isPaused) {
    const btn = document.getElementById('play-both-btn');
    if (!btn) return;

    btn.innerHTML = isPaused
        ? '<i class="fas fa-play"></i><span>Abspielen</span>'
        : '<i class="fas fa-pause"></i><span>Pause</span>';
}

/**
 * Startet beide Videos von vorne
 */
function restartSplitVideos() {
    if (splitScreenState.leftPlayer) {
        splitScreenState.leftPlayer.currentTime = 0;
    }
    if (splitScreenState.rightPlayer) {
        splitScreenState.rightPlayer.currentTime = 0;
    }
}

/**
 * Schließt das Split-Screen Modal
 */
function closeSplitScreenModal() {
    const modal = document.getElementById('split-screen-modal');
    modal?.classList.add('hidden');

    splitScreenState.leftPlayer?.pause();
    splitScreenState.rightPlayer?.pause();
}

// Hilfsfunktionen
function formatVideoDate(videoDate, createdAt) {
    const dateStr = videoDate || createdAt;
    if (!dateStr) return '';
    const date = new Date(dateStr);
    return date.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

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

// ============================================
// EXERCISE EXAMPLE VIDEOS (Musterbeispiele)
// ============================================

let currentExampleExerciseId = null;
let selectedExampleVideos = new Set();

/**
 * Initialisiert die Example-Videos-Funktionen
 */
export function initExampleVideos() {
    setupExampleVideosUI();
}

/**
 * Setup für die Example-Videos-UI
 */
function setupExampleVideosUI() {
    const addBtn = document.getElementById('add-example-video-btn');
    const closeBtn = document.getElementById('close-select-example-video-modal');
    const cancelBtn = document.getElementById('cancel-select-example-video');
    const confirmBtn = document.getElementById('confirm-select-example-video');

    addBtn?.addEventListener('click', openExampleVideoSelection);
    closeBtn?.addEventListener('click', closeExampleVideoSelection);
    cancelBtn?.addEventListener('click', closeExampleVideoSelection);
    confirmBtn?.addEventListener('click', confirmExampleVideoSelection);
}

/**
 * Lädt die Musterlösungen für eine Übung
 */
export async function loadExerciseExampleVideos(exerciseId) {
    const { db, clubId } = videoAnalysisContext;
    const container = document.getElementById('exercise-example-videos-list');

    if (!container || !exerciseId || !clubId) return;

    currentExampleExerciseId = exerciseId;

    try {
        const { data: examples, error } = await db.rpc('get_exercise_example_videos', {
            p_exercise_id: exerciseId,
            p_club_id: clubId,
        });

        if (error) throw error;

        if (!examples || examples.length === 0) {
            container.innerHTML = `
                <p class="text-sm text-gray-500 text-center py-4">
                    Noch keine Musterbeispiele vorhanden
                </p>
            `;
            return;
        }

        container.innerHTML = examples.map(ex => `
            <div class="flex items-center gap-3 p-2 bg-gray-50 rounded-lg group" data-example-id="${ex.id}">
                <div class="w-16 h-12 bg-gray-200 rounded overflow-hidden flex-shrink-0">
                    ${ex.thumbnail_url
                        ? `<img src="${escapeHtml(ex.thumbnail_url)}" class="w-full h-full object-cover">`
                        : `<div class="w-full h-full flex items-center justify-center text-gray-400"><i class="fas fa-video"></i></div>`
                    }
                </div>
                <div class="flex-1 min-w-0">
                    <p class="text-sm font-medium text-gray-900 truncate">${escapeHtml(ex.title || 'Video')}</p>
                    <p class="text-xs text-gray-500">${escapeHtml(ex.uploader_name)}</p>
                </div>
                <button class="remove-example-btn opacity-0 group-hover:opacity-100 text-red-500 hover:text-red-700 transition-opacity p-1"
                        data-example-id="${ex.id}" title="Entfernen">
                    <i class="fas fa-times"></i>
                </button>
            </div>
        `).join('');

        // Delete Handler
        container.querySelectorAll('.remove-example-btn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.stopPropagation();
                await removeExampleVideo(btn.dataset.exampleId);
            });
        });

    } catch (error) {
        console.error('Fehler beim Laden der Musterbeispiele:', error);
        container.innerHTML = `
            <p class="text-sm text-red-500 text-center py-4">
                <i class="fas fa-exclamation-circle mr-1"></i>
                Fehler beim Laden
            </p>
        `;
    }
}

/**
 * Öffnet die Video-Auswahl für Musterlösungen
 */
async function openExampleVideoSelection() {
    const { db, clubId } = videoAnalysisContext;
    const modal = document.getElementById('select-example-video-modal');
    const grid = document.getElementById('example-video-selection-grid');

    if (!modal || !grid || !currentExampleExerciseId) return;

    selectedExampleVideos.clear();
    updateConfirmButton();

    modal.classList.remove('hidden');

    // Videos laden
    grid.innerHTML = `
        <p class="col-span-full text-center py-8 text-gray-500">
            <i class="fas fa-spinner fa-spin mr-2"></i>
            Lade Videos...
        </p>
    `;

    try {
        // Bereits verknüpfte Videos laden
        const { data: existingExamples } = await db
            .from('exercise_example_videos')
            .select('video_id')
            .eq('exercise_id', currentExampleExerciseId)
            .eq('club_id', clubId);

        const existingVideoIds = new Set(existingExamples?.map(e => e.video_id) || []);

        // Alle Club-Videos laden
        const { data: videos, error } = await db
            .from('video_analyses')
            .select('id, title, thumbnail_url, created_at, uploader:profiles!uploaded_by(first_name, last_name)')
            .eq('club_id', clubId)
            .order('created_at', { ascending: false });

        if (error) throw error;

        if (!videos || videos.length === 0) {
            grid.innerHTML = `
                <p class="col-span-full text-center py-8 text-gray-500">
                    <i class="fas fa-video-slash text-2xl mb-2 block"></i>
                    Keine Videos im Club vorhanden
                </p>
            `;
            return;
        }

        // Videos ohne bereits verknüpfte anzeigen
        const availableVideos = videos.filter(v => !existingVideoIds.has(v.id));

        if (availableVideos.length === 0) {
            grid.innerHTML = `
                <p class="col-span-full text-center py-8 text-gray-500">
                    <i class="fas fa-check-circle text-2xl mb-2 block text-green-500"></i>
                    Alle Videos sind bereits als Musterbeispiel verknüpft
                </p>
            `;
            return;
        }

        grid.innerHTML = availableVideos.map(video => {
            const uploaderName = video.uploader
                ? `${video.uploader.first_name || ''} ${video.uploader.last_name || ''}`.trim()
                : '';
            return `
                <div class="example-video-option cursor-pointer rounded-lg border-2 border-transparent hover:border-indigo-300 transition-colors overflow-hidden"
                     data-video-id="${video.id}">
                    <div class="aspect-video bg-gray-100 relative">
                        ${video.thumbnail_url
                            ? `<img src="${escapeHtml(video.thumbnail_url)}" class="w-full h-full object-cover">`
                            : `<div class="w-full h-full flex items-center justify-center text-gray-400"><i class="fas fa-video text-2xl"></i></div>`
                        }
                        <div class="example-check absolute top-2 right-2 w-6 h-6 bg-indigo-600 rounded-full items-center justify-center text-white hidden">
                            <i class="fas fa-check text-xs"></i>
                        </div>
                    </div>
                    <div class="p-2">
                        <p class="text-sm font-medium truncate">${escapeHtml(video.title || 'Video')}</p>
                        <p class="text-xs text-gray-500 truncate">${escapeHtml(uploaderName)}</p>
                    </div>
                </div>
            `;
        }).join('');

        // Click Handler
        grid.querySelectorAll('.example-video-option').forEach(opt => {
            opt.addEventListener('click', () => toggleVideoSelection(opt));
        });

    } catch (error) {
        console.error('Fehler beim Laden der Videos:', error);
        grid.innerHTML = `
            <p class="col-span-full text-center py-8 text-red-500">
                <i class="fas fa-exclamation-circle mr-2"></i>
                Fehler beim Laden
            </p>
        `;
    }
}

/**
 * Video-Auswahl umschalten
 */
function toggleVideoSelection(element) {
    const videoId = element.dataset.videoId;
    const checkIcon = element.querySelector('.example-check');

    if (selectedExampleVideos.has(videoId)) {
        selectedExampleVideos.delete(videoId);
        element.classList.remove('border-indigo-600', 'bg-indigo-50');
        element.classList.add('border-transparent');
        checkIcon?.classList.add('hidden');
        checkIcon?.classList.remove('flex');
    } else {
        selectedExampleVideos.add(videoId);
        element.classList.add('border-indigo-600', 'bg-indigo-50');
        element.classList.remove('border-transparent');
        checkIcon?.classList.remove('hidden');
        checkIcon?.classList.add('flex');
    }

    updateConfirmButton();
}

/**
 * Aktualisiert den Bestätigen-Button
 */
function updateConfirmButton() {
    const btn = document.getElementById('confirm-select-example-video');
    const countSpan = document.getElementById('confirm-example-count');
    const count = selectedExampleVideos.size;

    if (btn) {
        btn.disabled = count === 0;
    }
    if (countSpan) {
        countSpan.textContent = count > 0 ? `${count} Video${count > 1 ? 's' : ''} hinzufügen` : 'Auswählen';
    }
}

/**
 * Schließt die Video-Auswahl
 */
function closeExampleVideoSelection() {
    const modal = document.getElementById('select-example-video-modal');
    modal?.classList.add('hidden');
    selectedExampleVideos.clear();
}

/**
 * Bestätigt die Video-Auswahl und fügt sie als Musterlösungen hinzu
 */
async function confirmExampleVideoSelection() {
    const { db, clubId, userId } = videoAnalysisContext;

    if (selectedExampleVideos.size === 0 || !currentExampleExerciseId) return;

    const confirmBtn = document.getElementById('confirm-select-example-video');
    if (confirmBtn) {
        confirmBtn.disabled = true;
        confirmBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Speichern...';
    }

    try {
        const inserts = Array.from(selectedExampleVideos).map((videoId, index) => ({
            exercise_id: currentExampleExerciseId,
            video_id: videoId,
            added_by: userId,
            club_id: clubId,
            sort_order: index,
        }));

        const { error } = await db
            .from('exercise_example_videos')
            .insert(inserts);

        if (error) throw error;

        showToast(`${selectedExampleVideos.size} Musterbeispiel${selectedExampleVideos.size > 1 ? 'e' : ''} hinzugefügt`, 'success');
        closeExampleVideoSelection();
        await loadExerciseExampleVideos(currentExampleExerciseId);

    } catch (error) {
        console.error('Fehler beim Hinzufügen:', error);
        showToast('Fehler beim Hinzufügen des Musterbeispiels', 'error');
    } finally {
        if (confirmBtn) {
            confirmBtn.disabled = false;
            confirmBtn.innerHTML = '<i class="fas fa-check"></i><span id="confirm-example-count">Auswählen</span>';
        }
        updateConfirmButton();
    }
}

/**
 * Entfernt eine Musterlösung
 */
async function removeExampleVideo(exampleId) {
    const { db } = videoAnalysisContext;

    if (!confirm('Musterbeispiel entfernen?')) return;

    try {
        const { error } = await db
            .from('exercise_example_videos')
            .delete()
            .eq('id', exampleId);

        if (error) throw error;

        showToast('Musterbeispiel entfernt', 'success');
        await loadExerciseExampleVideos(currentExampleExerciseId);

    } catch (error) {
        console.error('Fehler beim Entfernen:', error);
        showToast('Fehler beim Entfernen', 'error');
    }
}

// ============================================
// ADD VIDEO AS MUSTERBEISPIEL FROM VIDEO TAB
// ============================================

let videoToAddAsExample = null;

/**
 * Öffnet Modal um Video als Musterbeispiel zu einer Übung hinzuzufügen
 */
async function openAddExampleForVideoModal(videoId, videoTitle) {
    const { db, clubId } = videoAnalysisContext;
    videoToAddAsExample = { id: videoId, title: videoTitle };

    // Erstelle Modal falls nicht vorhanden
    let modal = document.getElementById('add-video-as-example-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'add-video-as-example-modal';
        modal.className = 'fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4 hidden';
        modal.innerHTML = `
            <div class="bg-white rounded-xl shadow-xl w-full max-w-md">
                <div class="border-b px-6 py-4 flex justify-between items-center">
                    <h3 class="text-lg font-bold">Als Musterbeispiel hinzufügen</h3>
                    <button id="close-add-example-modal" class="text-gray-400 hover:text-gray-600">
                        <i class="fas fa-times text-xl"></i>
                    </button>
                </div>
                <div class="p-6">
                    <p class="text-sm text-gray-600 mb-4">
                        Wähle eine Übung, zu der dieses Video als Musterbeispiel hinzugefügt werden soll:
                    </p>
                    <p class="text-sm font-medium text-gray-900 mb-4" id="example-video-title"></p>
                    <select id="example-exercise-select" class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500">
                        <option value="">Übung auswählen...</option>
                    </select>
                </div>
                <div class="border-t px-6 py-4 flex justify-end gap-3">
                    <button id="cancel-add-example" class="px-4 py-2 text-gray-600 hover:text-gray-800">
                        Abbrechen
                    </button>
                    <button id="confirm-add-example" class="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg disabled:opacity-50" disabled>
                        <i class="fas fa-star mr-1"></i> Hinzufügen
                    </button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);

        // Event Listeners
        document.getElementById('close-add-example-modal')?.addEventListener('click', closeAddExampleModal);
        document.getElementById('cancel-add-example')?.addEventListener('click', closeAddExampleModal);
        document.getElementById('confirm-add-example')?.addEventListener('click', confirmAddVideoAsExample);
        document.getElementById('example-exercise-select')?.addEventListener('change', (e) => {
            document.getElementById('confirm-add-example').disabled = !e.target.value;
        });
        modal.addEventListener('click', (e) => {
            if (e.target === modal) closeAddExampleModal();
        });
    }

    // Video-Titel anzeigen
    document.getElementById('example-video-title').textContent = `"${videoTitle}"`;

    // Übungen laden
    const exerciseSelect = document.getElementById('example-exercise-select');
    exerciseSelect.innerHTML = '<option value="">Übung auswählen...</option>';
    document.getElementById('confirm-add-example').disabled = true;

    const { data: exercises, error } = await db
        .from('exercises')
        .select('id, name')
        .or(`visibility.eq.global,and(visibility.eq.club,club_id.eq.${clubId})`)
        .order('name');

    if (!error && exercises) {
        exercises.forEach(ex => {
            const opt = document.createElement('option');
            opt.value = ex.id;
            opt.textContent = ex.name;
            exerciseSelect.appendChild(opt);
        });
    }

    modal.classList.remove('hidden');
}

/**
 * Schließt das Hinzufügen-Modal
 */
function closeAddExampleModal() {
    const modal = document.getElementById('add-video-as-example-modal');
    modal?.classList.add('hidden');
    videoToAddAsExample = null;
}

/**
 * Bestätigt das Hinzufügen des Videos als Musterbeispiel
 */
async function confirmAddVideoAsExample() {
    const { db, clubId, userId } = videoAnalysisContext;
    const exerciseId = document.getElementById('example-exercise-select')?.value;

    if (!videoToAddAsExample || !exerciseId) return;

    const confirmBtn = document.getElementById('confirm-add-example');
    if (confirmBtn) {
        confirmBtn.disabled = true;
        confirmBtn.innerHTML = '<i class="fas fa-spinner fa-spin mr-1"></i> Speichern...';
    }

    try {
        const { error } = await db
            .from('exercise_example_videos')
            .insert({
                exercise_id: exerciseId,
                video_id: videoToAddAsExample.id,
                added_by: userId,
                club_id: clubId,
                sort_order: 0,
            });

        if (error) {
            if (error.code === '23505') { // Unique constraint violation
                showToast('Dieses Video ist bereits als Musterbeispiel für diese Übung verknüpft', 'info');
            } else {
                throw error;
            }
        } else {
            showToast('Video als Musterbeispiel hinzugefügt', 'success');
        }

        closeAddExampleModal();

    } catch (error) {
        console.error('Fehler:', error);
        showToast('Fehler beim Hinzufügen', 'error');
    } finally {
        if (confirmBtn) {
            confirmBtn.disabled = false;
            confirmBtn.innerHTML = '<i class="fas fa-star mr-1"></i> Hinzufügen';
        }
    }
}

/**
 * Öffnet das Musterbeispiel-Modal für eine bestimmte Übung (für Coach-Liste)
 */
export async function openExerciseExamplesModal(exerciseId) {
    if (!exerciseId) return;

    currentExampleExerciseId = exerciseId;

    // Vorhandene Musterbeispiele laden
    await loadExerciseExampleVideos(exerciseId);

    // Modal öffnen und Video-Auswahl starten
    const modal = document.getElementById('select-example-video-modal');
    if (modal) {
        // Direkt die Video-Auswahl öffnen
        const addBtn = document.getElementById('add-example-video-btn');
        if (addBtn) {
            addBtn.click();
        }
    }
}

// Export für globalen Zugriff
window.videoAnalysis = {
    loadPendingVideos,
    loadAllVideos,
    addVideoComment,
    markVideoAsReviewed,
    loadExerciseExampleVideos,
    initExampleVideos,
    openAddExampleForVideoModal,
    openExerciseExamplesModal,
};
