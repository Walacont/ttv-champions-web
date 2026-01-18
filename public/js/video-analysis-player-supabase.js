// Video-Analyse-Modul für Spieler - Supabase-Version
// Ermöglicht Spielern, Videos zur Analyse hochzuladen und Feedback zu sehen

import { escapeHtml } from './utils/security.js';

let playerVideoContext = {
    db: null,
    userId: null,
    clubId: null,
    currentExerciseId: null,
};

/**
 * Generiert ein Thumbnail aus einer Video-Datei
 */
async function generateVideoThumbnail(videoFile, seekTime = 2) {
    return new Promise((resolve, reject) => {
        const video = document.createElement('video');
        video.preload = 'metadata';
        video.muted = true;
        video.playsInline = true;

        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');

        video.onloadedmetadata = () => {
            const maxWidth = 320;
            const scale = Math.min(1, maxWidth / video.videoWidth);
            canvas.width = video.videoWidth * scale;
            canvas.height = video.videoHeight * scale;
            // Zum 25% Zeitpunkt springen (vermeidet schwarze Frames am Anfang)
            const targetTime = Math.max(seekTime, video.duration * 0.25);
            video.currentTime = Math.min(targetTime, video.duration - 0.5);
        };

        video.onseeked = () => {
            try {
                ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
                canvas.toBlob(
                    (blob) => {
                        URL.revokeObjectURL(video.src);
                        blob ? resolve(blob) : reject(new Error('Thumbnail-Generierung fehlgeschlagen'));
                    },
                    'image/jpeg',
                    0.8
                );
            } catch (err) {
                URL.revokeObjectURL(video.src);
                reject(err);
            }
        };

        video.onerror = () => {
            URL.revokeObjectURL(video.src);
            reject(new Error('Video konnte nicht geladen werden'));
        };

        video.src = URL.createObjectURL(videoFile);
    });
}

/**
 * Initialisiert das Video-Upload-System für Spieler
 */
export function initPlayerVideoUpload(db, userData) {
    playerVideoContext.db = db;
    playerVideoContext.userId = userData.id;
    // Support both camelCase and snake_case, also check nested club object
    playerVideoContext.clubId = userData.clubId || userData.club_id || userData.club?.id;

    console.log('[PlayerVideo] Init with userData:', {
        userId: userData.id,
        clubId: playerVideoContext.clubId,
        club_id: userData.club_id,
        club: userData.club
    });

    // Button im Exercise-Modal
    setupExerciseVideoButton();

    // Upload-Modal
    setupPlayerUploadModal();

    // File Input Preview
    setupPlayerFileInputPreview();
}

/**
 * Setup für den Video-Button im Exercise-Modal
 */
function setupExerciseVideoButton() {
    const btn = document.getElementById('start-video-analysis-btn');
    if (!btn) return;

    btn.addEventListener('click', () => {
        // Exercise-ID aus dem aktuell geöffneten Modal holen
        const exerciseModal = document.getElementById('exercise-modal');
        if (exerciseModal) {
            // Die Exercise-ID wird im openExerciseModal gesetzt
            const exerciseId = exerciseModal.dataset.currentExerciseId;
            openPlayerVideoUploadModal(exerciseId);
        }
    });
}

/**
 * Öffnet das Upload-Modal für Spieler
 */
function openPlayerVideoUploadModal(exerciseId) {
    const modal = document.getElementById('player-video-upload-modal');
    if (!modal) return;

    // Exercise-ID setzen
    const exerciseIdInput = document.getElementById('player-video-exercise-id');
    if (exerciseIdInput) {
        exerciseIdInput.value = exerciseId || '';
    }

    // Referenz-Video laden falls vorhanden
    if (exerciseId) {
        loadReferenceVideoForExercise(exerciseId);
    }

    modal.classList.remove('hidden');

    // Exercise-Modal schließen
    document.getElementById('exercise-modal')?.classList.add('hidden');
}

/**
 * Lädt Referenz-Videos für eine Übung und zeigt sie im Modal an
 */
async function loadReferenceVideoForExercise(exerciseId) {
    const { db, clubId } = playerVideoContext;
    const container = document.getElementById('exercise-reference-video');
    const videoPlayer = document.getElementById('reference-video-player');

    if (!container || !videoPlayer) return;

    const { data: refs, error } = await db.rpc('get_reference_videos', {
        p_exercise_id: exerciseId,
        p_club_id: clubId,
    });

    if (!error && refs && refs.length > 0) {
        const ref = refs[0]; // Erstes Referenz-Video
        videoPlayer.querySelector('source').src = ref.video_url;
        videoPlayer.load();
        container.classList.remove('hidden');
    } else {
        container.classList.add('hidden');
    }
}

/**
 * Setup für das Player-Upload-Modal
 */
function setupPlayerUploadModal() {
    const modal = document.getElementById('player-video-upload-modal');
    const closeBtn = document.getElementById('close-player-video-upload');
    const form = document.getElementById('player-video-upload-form');

    if (!modal) return;

    if (closeBtn) {
        closeBtn.addEventListener('click', () => {
            modal.classList.add('hidden');
            form?.reset();
            resetTagSelection();
        });
    }

    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            modal.classList.add('hidden');
            form?.reset();
            resetTagSelection();
        }
    });

    if (form) {
        form.addEventListener('submit', handlePlayerVideoUpload);
    }

    // Tag-Buttons
    document.querySelectorAll('.player-tag-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            btn.classList.toggle('bg-purple-600');
            btn.classList.toggle('text-white');
            btn.classList.toggle('border-purple-600');
        });
    });
}

function resetTagSelection() {
    document.querySelectorAll('.player-tag-btn').forEach(btn => {
        btn.classList.remove('bg-purple-600', 'text-white', 'border-purple-600');
    });
}

/**
 * Setup für File Input Preview
 */
function setupPlayerFileInputPreview() {
    const fileInput = document.getElementById('player-video-file-input');
    const fileNameDisplay = document.getElementById('player-selected-file-name');

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
 * Handhabt den Video-Upload vom Spieler
 */
async function handlePlayerVideoUpload(e) {
    e.preventDefault();

    const { db, userId, clubId } = playerVideoContext;
    const form = e.target;
    const submitBtn = document.getElementById('player-video-submit-btn');

    const fileInput = document.getElementById('player-video-file-input');
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
        const timestamp = Date.now();

        // 1. Thumbnail generieren
        let thumbnailUrl = null;
        try {
            submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>Thumbnail wird erstellt...';
            const thumbnailBlob = await generateVideoThumbnail(file);
            const thumbFileName = `${userId}/${timestamp}_thumb.jpg`;

            const { error: thumbError } = await db.storage
                .from('training-videos')
                .upload(thumbFileName, thumbnailBlob, {
                    contentType: 'image/jpeg',
                    upsert: false,
                });

            if (!thumbError) {
                const { data: thumbUrlData } = db.storage
                    .from('training-videos')
                    .getPublicUrl(thumbFileName);
                thumbnailUrl = thumbUrlData.publicUrl;
            }
        } catch (thumbErr) {
            console.warn('Thumbnail-Generierung fehlgeschlagen:', thumbErr);
        }

        // 2. Video in Storage hochladen
        submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>Video wird hochgeladen...';
        const fileExt = file.name.split('.').pop();
        const fileName = `${userId}/${timestamp}.${fileExt}`;

        const { data: uploadData, error: uploadError } = await db.storage
            .from('training-videos')
            .upload(fileName, file, {
                contentType: file.type,
                upsert: false,
            });

        if (uploadError) throw uploadError;

        // 3. Public URL generieren
        const { data: urlData } = db.storage
            .from('training-videos')
            .getPublicUrl(fileName);

        const videoUrl = urlData.publicUrl;

        // Validierung: Club-ID muss vorhanden sein
        if (!clubId) {
            throw new Error('Keine Club-Zuordnung gefunden. Bitte melde dich erneut an.');
        }

        // 4. Metadaten sammeln
        const title = document.getElementById('player-video-title')?.value || '';
        const exerciseId = document.getElementById('player-video-exercise-id')?.value || null;

        // Tags sammeln
        const selectedTags = [];
        document.querySelectorAll('.player-tag-btn.bg-purple-600').forEach(btn => {
            selectedTags.push(btn.dataset.tag);
        });

        // 5. Datenbank-Eintrag erstellen
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
                is_reference: false,
            })
            .select()
            .single();

        if (insertError) throw insertError;

        // 5. Sich selbst als Zuweisung hinzufügen (damit Coach es sieht)
        const { error: assignError } = await db
            .from('video_assignments')
            .insert({
                video_id: videoAnalysis.id,
                player_id: userId,
                club_id: clubId,
                status: 'pending',
            });

        if (assignError) {
            console.error('Fehler bei Selbst-Zuweisung:', assignError);
        }

        showToast('Video erfolgreich hochgeladen! Dein Coach wird es analysieren.', 'success');

        // Modal schließen
        document.getElementById('player-video-upload-modal')?.classList.add('hidden');
        form.reset();
        resetTagSelection();

    } catch (error) {
        console.error('Upload-Fehler:', error);
        showToast('Fehler beim Hochladen: ' + error.message, 'error');
    } finally {
        submitBtn.disabled = false;
        submitBtn.innerHTML = '<i class="fas fa-upload mr-2"></i>Hochladen';
    }
}

/**
 * Lädt die Videos des Spielers mit Feedback
 */
export async function loadPlayerVideos() {
    const { db, userId } = playerVideoContext;
    const container = document.getElementById('player-videos-list');
    if (!container) return [];

    const { data: videos, error } = await db.rpc('get_player_videos', {
        p_player_id: userId,
    });

    if (error) {
        console.error('Fehler beim Laden:', error);
        return [];
    }

    return videos || [];
}

/**
 * Rendert die Video-Liste für den Spieler
 */
export function renderPlayerVideosList(videos, container) {
    if (!container) return;

    if (!videos || videos.length === 0) {
        container.innerHTML = `
            <div class="text-center py-8 text-gray-500">
                <i class="fas fa-video text-4xl mb-3 text-gray-300"></i>
                <p>Noch keine Videos hochgeladen</p>
                <p class="text-sm mt-1">Lade Videos bei Übungen hoch, um Feedback zu erhalten</p>
            </div>
        `;
        return;
    }

    container.innerHTML = `
        <div class="space-y-4">
            ${videos.map(video => createPlayerVideoCard(video)).join('')}
        </div>
    `;

    // Event Listener für Video-Karten
    container.querySelectorAll('[data-video-id]').forEach(card => {
        card.addEventListener('click', () => {
            const videoId = card.dataset.videoId;
            openPlayerVideoDetail(videoId);
        });
    });
}

function createPlayerVideoCard(video) {
    const statusBadge = video.status === 'reviewed'
        ? '<span class="bg-green-500 text-white text-xs font-bold px-2 py-1 rounded-full">Feedback erhalten</span>'
        : '<span class="bg-yellow-500 text-white text-xs font-bold px-2 py-1 rounded-full">Ausstehend</span>';

    return `
        <div class="bg-white rounded-lg shadow p-4 cursor-pointer hover:shadow-md transition-shadow flex gap-4"
             data-video-id="${video.id}">
            <div class="w-24 h-24 bg-gray-100 rounded-lg flex-shrink-0 overflow-hidden">
                ${video.thumbnail_url
                    ? `<img src="${escapeHtml(video.thumbnail_url)}" class="w-full h-full object-cover">`
                    : `<div class="w-full h-full flex items-center justify-center text-gray-400"><i class="fas fa-video text-2xl"></i></div>`
                }
            </div>
            <div class="flex-1 min-w-0">
                <div class="flex items-start justify-between gap-2">
                    <p class="font-medium text-gray-900 truncate">${escapeHtml(video.title || 'Video')}</p>
                    ${statusBadge}
                </div>
                ${video.exercise_name ? `
                    <p class="text-sm text-indigo-600 mt-1">
                        <i class="fas fa-dumbbell mr-1"></i>${escapeHtml(video.exercise_name)}
                    </p>
                ` : ''}
                <div class="flex items-center gap-4 mt-2 text-sm text-gray-500">
                    <span><i class="fas fa-comments mr-1"></i>${video.comment_count || 0} Kommentare</span>
                    <span>${formatDate(video.created_at)}</span>
                </div>
            </div>
        </div>
    `;
}

/**
 * Öffnet die Detail-Ansicht eines Videos für den Spieler
 */
async function openPlayerVideoDetail(videoId) {
    const { db } = playerVideoContext;

    // Video-Daten laden
    const { data: video, error } = await db
        .from('video_analyses')
        .select(`
            *,
            exercise:exercises(name)
        `)
        .eq('id', videoId)
        .single();

    if (error || !video) {
        showToast('Video nicht gefunden', 'error');
        return;
    }

    // Kommentare laden
    const { data: comments } = await db.rpc('get_video_comments', {
        p_video_id: videoId,
    });

    // Modal erstellen und anzeigen
    showPlayerVideoDetailModal(video, comments || []);
}

function showPlayerVideoDetailModal(video, comments) {
    // Entferne eventuell existierendes Modal
    document.getElementById('player-video-detail-modal')?.remove();

    const modal = document.createElement('div');
    modal.id = 'player-video-detail-modal';
    modal.className = 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4';

    const commentsHtml = comments.length > 0
        ? comments.map(c => {
            const isCoach = c.user_role === 'coach' || c.user_role === 'head_coach';
            const timestampBtn = c.timestamp_seconds !== null
                ? `<button class="timestamp-btn text-indigo-600 hover:text-indigo-800 text-xs font-mono bg-indigo-50 px-2 py-0.5 rounded" data-time="${c.timestamp_seconds}">${formatTimestamp(c.timestamp_seconds)}</button>`
                : '';
            return `
                <div class="border-b border-gray-100 pb-3 mb-3 last:border-0">
                    <div class="flex items-center gap-2 mb-1">
                        <span class="font-medium text-sm ${isCoach ? 'text-indigo-600' : 'text-gray-900'}">${escapeHtml(c.user_name)}</span>
                        ${isCoach ? '<span class="bg-indigo-100 text-indigo-700 text-xs px-1.5 py-0.5 rounded">Coach</span>' : ''}
                        ${timestampBtn}
                    </div>
                    <p class="text-sm text-gray-700">${escapeHtml(c.content)}</p>
                </div>
            `;
        }).join('')
        : '<p class="text-gray-500 text-center py-4">Noch keine Kommentare vom Coach</p>';

    modal.innerHTML = `
        <div class="bg-white rounded-xl shadow-xl w-full max-w-4xl max-h-[95vh] overflow-hidden flex flex-col">
            <div class="border-b px-6 py-4 flex justify-between items-center">
                <h3 class="text-lg font-bold">${escapeHtml(video.title || 'Video-Feedback')}</h3>
                <button id="close-player-video-detail" class="text-gray-400 hover:text-gray-600">
                    <i class="fas fa-times text-xl"></i>
                </button>
            </div>
            <div class="flex-1 overflow-y-auto">
                <div class="grid grid-cols-1 lg:grid-cols-2 gap-6 p-6">
                    <div>
                        <video id="player-detail-video" class="w-full rounded-lg bg-black" controls>
                            <source src="${escapeHtml(video.video_url)}" type="video/mp4">
                        </video>
                        ${video.exercise ? `
                            <p class="mt-3 text-sm text-indigo-600">
                                <i class="fas fa-dumbbell mr-1"></i>${escapeHtml(video.exercise.name)}
                            </p>
                        ` : ''}
                    </div>
                    <div>
                        <h4 class="font-bold text-gray-800 mb-4">Coach-Feedback</h4>
                        <div class="space-y-2">${commentsHtml}</div>
                    </div>
                </div>
            </div>
        </div>
    `;

    document.body.appendChild(modal);

    // Event Listener
    const closeBtn = document.getElementById('close-player-video-detail');
    closeBtn?.addEventListener('click', () => modal.remove());

    modal.addEventListener('click', (e) => {
        if (e.target === modal) modal.remove();
    });

    // Timestamp-Klicks
    modal.querySelectorAll('.timestamp-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const time = parseFloat(btn.dataset.time);
            const videoEl = document.getElementById('player-detail-video');
            if (videoEl && !isNaN(time)) {
                videoEl.currentTime = time;
                videoEl.play();
            }
        });
    });
}

// Hilfsfunktionen
function formatDate(dateStr) {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now - date;
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffDays < 1) return 'Heute';
    if (diffDays === 1) return 'Gestern';
    if (diffDays < 7) return `vor ${diffDays} Tagen`;

    return date.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: '2-digit' });
}

function formatTimestamp(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function showToast(message, type = 'info') {
    if (typeof window.showToastMessage === 'function') {
        window.showToastMessage(message, type);
        return;
    }

    const toast = document.createElement('div');
    const bgColor = type === 'error' ? 'bg-red-500' : type === 'success' ? 'bg-green-500' : 'bg-purple-500';
    toast.className = `fixed bottom-4 right-4 ${bgColor} text-white px-6 py-3 rounded-xl z-[100010] shadow-lg`;
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
}

// Funktion um die aktuelle Exercise-ID im Modal zu tracken
export function setCurrentExerciseId(exerciseId) {
    const modal = document.getElementById('exercise-modal');
    if (modal) {
        modal.dataset.currentExerciseId = exerciseId;
    }
    playerVideoContext.currentExerciseId = exerciseId;

    // Referenz-Video laden
    if (exerciseId) {
        loadReferenceVideoForExercise(exerciseId);
    } else {
        document.getElementById('exercise-reference-video')?.classList.add('hidden');
    }
}
