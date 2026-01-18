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
        video.preload = 'auto';
        video.muted = true;
        video.playsInline = true;
        video.crossOrigin = 'anonymous';

        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        let hasResolved = false;

        const captureFrame = () => {
            if (hasResolved) return;
            hasResolved = true;

            try {
                const maxWidth = 320;
                const scale = Math.min(1, maxWidth / video.videoWidth);
                canvas.width = video.videoWidth * scale;
                canvas.height = video.videoHeight * scale;

                ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
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
                URL.revokeObjectURL(video.src);
                video.pause();
                reject(err);
            }
        };

        video.onloadeddata = () => {
            // Zum 25% Zeitpunkt springen (vermeidet schwarze Frames am Anfang)
            const targetTime = Math.max(seekTime, video.duration * 0.25);
            video.currentTime = Math.min(targetTime, video.duration - 0.5);
        };

        video.onseeked = () => {
            // Kurz warten damit der Frame gerendert wird
            setTimeout(captureFrame, 100);
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
                captureFrame();
            } else if (!hasResolved) {
                hasResolved = true;
                URL.revokeObjectURL(video.src);
                reject(new Error('Thumbnail-Timeout'));
            }
        }, 10000);

        video.src = URL.createObjectURL(videoFile);
        video.load();
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

    // Coach Feedback Checkbox Setup (nur für Club-Spieler)
    setupCoachFeedbackOption();

    // Sub-Tab Navigation für Übungen
    setupExercisesSubTabs();

    // Upload-Button in Mediathek
    setupMediathekUploadButton();

    // Video-Vergleichs-Funktion
    initVideoComparison();
}

/**
 * Setup für Coach-Feedback Checkbox
 */
function setupCoachFeedbackOption() {
    const { clubId } = playerVideoContext;
    const coachOption = document.getElementById('coach-feedback-option');
    const checkbox = document.getElementById('request-coach-feedback');
    const infoCoach = document.getElementById('upload-info-coach');
    const infoPrivate = document.getElementById('upload-info-private');

    if (!coachOption) return;

    // Nur anzeigen wenn Spieler einen Club hat
    if (clubId) {
        coachOption.classList.remove('hidden');

        // Toggle Info-Text basierend auf Checkbox
        checkbox?.addEventListener('change', () => {
            if (checkbox.checked) {
                infoCoach?.classList.remove('hidden');
                infoPrivate?.classList.add('hidden');
            } else {
                infoCoach?.classList.add('hidden');
                infoPrivate?.classList.remove('hidden');
            }
        });
    } else {
        // Spieler ohne Club: Nur private Videos möglich
        coachOption.classList.add('hidden');
        infoCoach?.classList.add('hidden');
        infoPrivate?.classList.remove('hidden');
    }
}

/**
 * Setup für Sub-Tab Navigation im Übungen-Tab
 */
function setupExercisesSubTabs() {
    const subTabs = document.querySelectorAll('.exercises-sub-tab');
    const catalogContent = document.getElementById('exercises-subtab-catalog');
    const videosContent = document.getElementById('exercises-subtab-my-videos');

    subTabs.forEach(tab => {
        tab.addEventListener('click', () => {
            const targetTab = tab.dataset.subtab;

            // Tab-Styling aktualisieren
            subTabs.forEach(t => {
                t.classList.remove('border-indigo-600', 'text-indigo-600');
                t.classList.add('border-transparent', 'text-gray-500');
            });
            tab.classList.remove('border-transparent', 'text-gray-500');
            tab.classList.add('border-indigo-600', 'text-indigo-600');

            // Content anzeigen
            if (targetTab === 'catalog') {
                catalogContent?.classList.remove('hidden');
                videosContent?.classList.add('hidden');
            } else if (targetTab === 'my-videos') {
                catalogContent?.classList.add('hidden');
                videosContent?.classList.remove('hidden');
                // Filter und Videos laden wenn Tab geöffnet wird
                populateExerciseFilter();
                loadMyVideos();
            }
        });
    });

    // Filter Event Listeners
    setupMyVideosFilters();
}

/**
 * Setup für die Filter in Meine Videos
 */
function setupMyVideosFilters() {
    const statusFilter = document.getElementById('my-videos-filter-status');
    const exerciseFilter = document.getElementById('my-videos-filter-exercise');

    statusFilter?.addEventListener('change', () => loadMyVideos());
    exerciseFilter?.addEventListener('change', () => loadMyVideos());
}

/**
 * Füllt das Übungs-Dropdown mit verfügbaren Übungen
 */
async function populateExerciseFilter() {
    const { db, userId } = playerVideoContext;
    const exerciseSelect = document.getElementById('my-videos-filter-exercise');

    if (!exerciseSelect || !db) return;

    try {
        // Hole alle Übungen, die in den Videos des Spielers vorkommen
        const { data: videos } = await db
            .from('video_analyses')
            .select('exercise_id, exercise:exercises(id, name)')
            .eq('uploaded_by', userId)
            .not('exercise_id', 'is', null);

        // Unique Übungen sammeln
        const exercises = new Map();
        videos?.forEach(v => {
            if (v.exercise) {
                exercises.set(v.exercise.id, v.exercise.name);
            }
        });

        // Dropdown füllen (vorhandene Options behalten für "Alle")
        const existingValue = exerciseSelect.value;
        exerciseSelect.innerHTML = '<option value="all">Alle Übungen</option>';

        exercises.forEach((name, id) => {
            const option = document.createElement('option');
            option.value = id;
            option.textContent = name;
            exerciseSelect.appendChild(option);
        });

        // Vorherige Auswahl wiederherstellen falls möglich
        if (existingValue && exercises.has(existingValue)) {
            exerciseSelect.value = existingValue;
        }
    } catch (error) {
        console.error('Fehler beim Laden der Übungen für Filter:', error);
    }
}

/**
 * Setup für Upload-Button in Mediathek
 */
function setupMediathekUploadButton() {
    const btn = document.getElementById('open-video-upload-from-mediathek');
    if (!btn) return;

    btn.addEventListener('click', () => {
        openPlayerVideoUploadModal(null);
    });
}

/**
 * Lädt und zeigt die Videos des Spielers in der Mediathek
 */
export async function loadMyVideos() {
    const { db, userId } = playerVideoContext;
    const container = document.getElementById('my-videos-list');
    const countBadge = document.getElementById('my-videos-count');

    if (!container || !userId) return;

    // Filter-Werte auslesen
    const statusFilter = document.getElementById('my-videos-filter-status')?.value || 'all';
    const exerciseFilter = document.getElementById('my-videos-filter-exercise')?.value || 'all';

    container.innerHTML = `
        <div class="col-span-full flex justify-center py-8">
            <i class="fas fa-spinner fa-spin text-2xl text-gray-400"></i>
        </div>
    `;

    try {
        // Alle Videos des Spielers laden
        const { data: allVideos, error } = await db
            .from('video_analyses')
            .select(`
                *,
                exercise:exercises(id, name),
                assignments:video_assignments(status, reviewed_at)
            `)
            .eq('uploaded_by', userId)
            .order('created_at', { ascending: false });

        if (error) throw error;

        // Badge mit Gesamtzahl aktualisieren
        if (countBadge && allVideos?.length > 0) {
            countBadge.textContent = allVideos.length;
            countBadge.classList.remove('hidden');
        } else if (countBadge) {
            countBadge.classList.add('hidden');
        }

        // Filter anwenden
        let videos = allVideos || [];

        // Status-Filter
        if (statusFilter !== 'all') {
            videos = videos.filter(video => {
                const assignment = video.assignments?.[0];
                const isPrivate = !video.club_id;
                const status = isPrivate ? 'private' : (assignment?.status || 'pending');
                return status === statusFilter;
            });
        }

        // Übungs-Filter
        if (exerciseFilter !== 'all') {
            videos = videos.filter(video => video.exercise_id === exerciseFilter);
        }

        if (!allVideos || allVideos.length === 0) {
            container.innerHTML = `
                <div class="col-span-full text-center py-12">
                    <i class="fas fa-video text-5xl text-gray-300 mb-4 block"></i>
                    <p class="text-gray-500 mb-4">Du hast noch keine Videos hochgeladen</p>
                    <button onclick="document.getElementById('open-video-upload-from-mediathek').click()"
                            class="bg-purple-600 hover:bg-purple-700 text-white font-medium py-2 px-4 rounded-lg transition-colors">
                        <i class="fas fa-upload mr-2"></i>Erstes Video hochladen
                    </button>
                </div>
            `;
            return;
        }

        if (videos.length === 0) {
            container.innerHTML = `
                <div class="col-span-full text-center py-12">
                    <i class="fas fa-filter text-5xl text-gray-300 mb-4 block"></i>
                    <p class="text-gray-500">Keine Videos mit diesen Filtern gefunden</p>
                </div>
            `;
            return;
        }

        container.innerHTML = videos.map(video => createMyVideoCard(video)).join('');

        // Click Handler für Video-Karten
        container.querySelectorAll('[data-video-id]').forEach(card => {
            card.addEventListener('click', () => {
                openPlayerVideoDetail(card.dataset.videoId);
            });
        });

    } catch (error) {
        console.error('Fehler beim Laden der Videos:', error);
        container.innerHTML = `
            <div class="col-span-full text-center py-8 text-red-500">
                <i class="fas fa-exclamation-circle mr-2"></i>
                Fehler beim Laden der Videos
            </div>
        `;
    }
}

/**
 * Erstellt eine Video-Karte für die Mediathek
 */
function createMyVideoCard(video) {
    const assignment = video.assignments?.[0];
    const isPrivate = !video.club_id;
    const status = isPrivate ? 'private' : (assignment?.status || 'pending');

    const statusConfig = {
        private: { icon: 'fa-lock', text: 'Nur für mich', color: 'gray' },
        pending: { icon: 'fa-clock', text: 'Warte auf Feedback', color: 'yellow' },
        reviewed: { icon: 'fa-check-circle', text: 'Feedback erhalten', color: 'green' }
    };

    const { icon, text, color } = statusConfig[status] || statusConfig.pending;

    const thumbnailHtml = video.thumbnail_url
        ? `<img src="${escapeHtml(video.thumbnail_url)}" class="w-full h-full object-cover" onerror="this.parentElement.innerHTML='<div class=\\'w-full h-full bg-gray-200 flex items-center justify-center\\'><i class=\\'fas fa-video text-gray-400 text-2xl\\'></i></div>'">`
        : `<div class="w-full h-full bg-gray-200 flex items-center justify-center"><i class="fas fa-video text-gray-400 text-2xl"></i></div>`;

    return `
        <div class="bg-white rounded-xl shadow-md overflow-hidden cursor-pointer hover:shadow-lg transition-shadow border border-gray-100"
             data-video-id="${video.id}">
            <div class="relative aspect-video bg-gray-100">
                ${thumbnailHtml}
                <div class="absolute top-2 right-2">
                    <span class="bg-${color}-100 text-${color}-700 text-xs font-medium px-2 py-1 rounded-full flex items-center gap-1">
                        <i class="fas ${icon} text-xs"></i>
                        ${text}
                    </span>
                </div>
            </div>
            <div class="p-4">
                <p class="font-medium text-sm mb-1 truncate">${escapeHtml(video.title || 'Ohne Titel')}</p>
                ${video.exercise?.name ? `
                    <p class="text-xs text-indigo-600 mb-2">
                        <i class="fas fa-dumbbell mr-1"></i>${escapeHtml(video.exercise.name)}
                    </p>
                ` : ''}
                <p class="text-xs text-gray-500">${formatRelativeTime(video.created_at)}</p>
            </div>
        </div>
    `;
}

/**
 * Formatiert Zeit relativ (vor X Minuten/Stunden/Tagen)
 */
function formatRelativeTime(dateStr) {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Gerade eben';
    if (diffMins < 60) return `vor ${diffMins} Min.`;
    if (diffHours < 24) return `vor ${diffHours} Std.`;
    if (diffDays < 7) return `vor ${diffDays} Tag${diffDays > 1 ? 'en' : ''}`;
    return date.toLocaleDateString('de-DE');
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

    // Custom Tag hinzufügen
    setupPlayerCustomTagInput();
}

/**
 * Setup für Custom Tag Input (Player)
 */
function setupPlayerCustomTagInput() {
    const input = document.getElementById('player-custom-tag-input');
    const addBtn = document.getElementById('player-add-custom-tag-btn');
    const container = document.getElementById('player-video-tags');

    if (!input || !addBtn || !container) return;

    const addCustomTag = () => {
        const tagText = input.value.trim();
        if (!tagText) return;

        // Prüfen ob Tag schon existiert
        const existingTag = container.querySelector(`[data-tag="${CSS.escape(tagText)}"]`);
        if (existingTag) {
            // Tag auswählen statt doppelt hinzufügen
            if (!existingTag.classList.contains('bg-purple-600')) {
                existingTag.click();
            }
            input.value = '';
            return;
        }

        // Neuen Tag erstellen
        const tagBtn = document.createElement('button');
        tagBtn.type = 'button';
        tagBtn.className = 'player-tag-btn px-3 py-1 rounded-full text-sm border border-purple-600 bg-purple-600 text-white transition-colors flex items-center gap-1';
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
                tagBtn.classList.toggle('bg-purple-600');
                tagBtn.classList.toggle('text-white');
                tagBtn.classList.toggle('border-purple-600');
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

function resetTagSelection() {
    // Standard-Tags zurücksetzen
    document.querySelectorAll('.player-tag-btn:not([data-custom])').forEach(btn => {
        btn.classList.remove('bg-purple-600', 'text-white', 'border-purple-600');
    });
    // Custom Tags entfernen
    document.querySelectorAll('.player-tag-btn[data-custom]').forEach(btn => {
        btn.remove();
    });
    // Input leeren
    const input = document.getElementById('player-custom-tag-input');
    if (input) input.value = '';
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

    // Progress UI elements
    const progressContainer = document.getElementById('player-upload-progress');
    const progressBar = document.getElementById('player-upload-bar');
    const statusText = document.getElementById('player-upload-status');
    const percentText = document.getElementById('player-upload-percent');
    const sizeText = document.getElementById('player-upload-size');

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
            const thumbFileName = `${userId}/${timestamp}_thumb.jpg`;

            updateProgress(5, 'Thumbnail wird hochgeladen...');
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
            updateProgress(10, 'Thumbnail fertig');
        } catch (thumbErr) {
            console.warn('Thumbnail-Generierung fehlgeschlagen:', thumbErr);
            updateProgress(10, 'Thumbnail übersprungen');
        }

        // 2. Video in Storage hochladen (10-90%)
        updateProgress(12, 'Video wird hochgeladen...');
        const fileExt = file.name.split('.').pop();
        const fileName = `${userId}/${timestamp}.${fileExt}`;

        // Simuliere Progress während Upload
        let uploadProgress = 12;
        const progressInterval = setInterval(() => {
            if (uploadProgress < 85) {
                uploadProgress += Math.random() * 3;
                updateProgress(uploadProgress, 'Video wird hochgeladen...');
            }
        }, 500);

        const { data: uploadData, error: uploadError } = await db.storage
            .from('training-videos')
            .upload(fileName, file, {
                contentType: file.type,
                upsert: false,
            });

        clearInterval(progressInterval);
        if (uploadError) throw uploadError;

        updateProgress(90, 'Video hochgeladen!');

        // 3. Public URL generieren
        const { data: urlData } = db.storage
            .from('training-videos')
            .getPublicUrl(fileName);

        const videoUrl = urlData.publicUrl;

        // 4. Metadaten sammeln
        const title = document.getElementById('player-video-title')?.value || '';
        const exerciseId = document.getElementById('player-video-exercise-id')?.value || null;

        // Tags sammeln
        const selectedTags = [];
        document.querySelectorAll('.player-tag-btn.bg-purple-600').forEach(btn => {
            selectedTags.push(btn.dataset.tag);
        });

        // Check: Soll Coach Feedback erhalten?
        const requestCoachFeedback = document.getElementById('request-coach-feedback')?.checked ?? false;
        const shouldShareWithCoach = clubId && requestCoachFeedback;

        // 5. Datenbank-Eintrag erstellen (90-95%)
        updateProgress(92, 'Video wird gespeichert...');
        const { data: videoAnalysis, error: insertError } = await db
            .from('video_analyses')
            .insert({
                uploaded_by: userId,
                // club_id nur setzen wenn Coach-Feedback gewünscht
                club_id: shouldShareWithCoach ? clubId : null,
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

        // 6. Zuweisung nur erstellen wenn Coach-Feedback gewünscht
        if (shouldShareWithCoach) {
            updateProgress(95, 'Coach wird benachrichtigt...');
            const { error: assignError } = await db
                .from('video_assignments')
                .insert({
                    video_id: videoAnalysis.id,
                    player_id: userId,
                    club_id: clubId,
                    status: 'pending',
                });

            if (assignError) {
                console.error('Fehler bei Coach-Zuweisung:', assignError);
            }
        }

        updateProgress(100, 'Fertig!');
        const successMessage = shouldShareWithCoach
            ? 'Video hochgeladen! Dein Coach wird es analysieren.'
            : 'Video in deiner Mediathek gespeichert!';
        showToast(successMessage, 'success');

        // Modal schließen nach kurzer Verzögerung
        setTimeout(() => {
            document.getElementById('player-video-upload-modal')?.classList.add('hidden');
            form.reset();
            resetTagSelection();
            // Reset progress UI
            if (progressContainer) progressContainer.classList.add('hidden');
            if (progressBar) progressBar.style.width = '0%';
            submitBtn.classList.remove('hidden');
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

// Video Comparison State
const comparisonState = {
    videos: [],
    leftPlayer: null,
    rightPlayer: null,
    isSynced: true,
    isPlaying: false,
};

/**
 * Initialisiert die Video-Vergleichs-Funktion
 */
export function initVideoComparison() {
    setupComparisonModal();
    setupComparisonButton();
}

/**
 * Setup für den Vergleichs-Button
 */
function setupComparisonButton() {
    const btn = document.getElementById('open-video-comparison');
    if (!btn) return;

    btn.addEventListener('click', openVideoComparison);
}

/**
 * Öffnet das Video-Vergleichs-Modal
 */
async function openVideoComparison() {
    const { db, userId } = playerVideoContext;
    const modal = document.getElementById('video-comparison-modal');

    if (!modal || !db || !userId) return;

    // Videos laden
    const { data: videos, error } = await db
        .from('video_analyses')
        .select('id, title, video_url, thumbnail_url, created_at, exercise:exercises(name)')
        .eq('uploaded_by', userId)
        .order('created_at', { ascending: false });

    if (error || !videos || videos.length < 2) {
        showToast('Du brauchst mindestens 2 Videos für einen Vergleich', 'info');
        return;
    }

    comparisonState.videos = videos;

    // Dropdowns füllen
    const leftSelect = document.getElementById('comparison-video-left');
    const rightSelect = document.getElementById('comparison-video-right');

    const optionsHtml = videos.map(v => {
        const date = new Date(v.created_at).toLocaleDateString('de-DE');
        const title = v.title || v.exercise?.name || 'Video';
        return `<option value="${v.id}">${escapeHtml(title)} (${date})</option>`;
    }).join('');

    leftSelect.innerHTML = '<option value="">Video 1 auswählen...</option>' + optionsHtml;
    rightSelect.innerHTML = '<option value="">Video 2 auswählen...</option>' + optionsHtml;

    // Wenn genug Videos, automatisch die ersten zwei auswählen
    if (videos.length >= 2) {
        leftSelect.value = videos[0].id;
        rightSelect.value = videos[1].id;
        loadComparisonVideo('left', videos[0]);
        loadComparisonVideo('right', videos[1]);
    }

    modal.classList.remove('hidden');
}

/**
 * Setup für das Comparison Modal
 */
function setupComparisonModal() {
    const modal = document.getElementById('video-comparison-modal');
    if (!modal) return;

    const closeBtn = document.getElementById('close-video-comparison');
    const leftSelect = document.getElementById('comparison-video-left');
    const rightSelect = document.getElementById('comparison-video-right');
    const syncCheckbox = document.getElementById('sync-playback');
    const playPauseBtn = document.getElementById('comparison-play-pause');
    const restartBtn = document.getElementById('comparison-restart');

    comparisonState.leftPlayer = document.getElementById('comparison-player-left');
    comparisonState.rightPlayer = document.getElementById('comparison-player-right');

    // Close button
    closeBtn?.addEventListener('click', () => {
        closeComparisonModal();
    });

    // Video selection
    leftSelect?.addEventListener('change', () => {
        const video = comparisonState.videos.find(v => v.id === leftSelect.value);
        if (video) loadComparisonVideo('left', video);
    });

    rightSelect?.addEventListener('change', () => {
        const video = comparisonState.videos.find(v => v.id === rightSelect.value);
        if (video) loadComparisonVideo('right', video);
    });

    // Sync toggle
    syncCheckbox?.addEventListener('change', () => {
        comparisonState.isSynced = syncCheckbox.checked;
    });

    // Play/Pause button
    playPauseBtn?.addEventListener('click', toggleComparisonPlayback);

    // Restart button
    restartBtn?.addEventListener('click', restartComparison);

    // Sync playback
    if (comparisonState.leftPlayer) {
        comparisonState.leftPlayer.addEventListener('play', () => syncPlayback('left', 'play'));
        comparisonState.leftPlayer.addEventListener('pause', () => syncPlayback('left', 'pause'));
        comparisonState.leftPlayer.addEventListener('seeked', () => syncPlayback('left', 'seek'));
        comparisonState.leftPlayer.addEventListener('timeupdate', updateComparisonTime);
    }

    if (comparisonState.rightPlayer) {
        comparisonState.rightPlayer.addEventListener('play', () => syncPlayback('right', 'play'));
        comparisonState.rightPlayer.addEventListener('pause', () => syncPlayback('right', 'pause'));
        comparisonState.rightPlayer.addEventListener('seeked', () => syncPlayback('right', 'seek'));
    }
}

/**
 * Lädt ein Video in den Vergleichs-Player
 */
function loadComparisonVideo(side, video) {
    const player = side === 'left' ? comparisonState.leftPlayer : comparisonState.rightPlayer;
    const infoDiv = document.getElementById(`comparison-info-${side}`);
    const titleEl = document.getElementById(`comparison-title-${side}`);
    const dateEl = document.getElementById(`comparison-date-${side}`);

    if (player && video.video_url) {
        player.src = video.video_url;
        player.load();
    }

    if (infoDiv && titleEl && dateEl) {
        titleEl.textContent = video.title || video.exercise?.name || 'Video';
        dateEl.textContent = new Date(video.created_at).toLocaleDateString('de-DE', {
            day: '2-digit',
            month: 'long',
            year: 'numeric'
        });
        infoDiv.classList.remove('hidden');
    }
}

/**
 * Synchronisiert die Wiedergabe zwischen beiden Videos
 */
function syncPlayback(source, action) {
    if (!comparisonState.isSynced) return;

    const sourcePlayer = source === 'left' ? comparisonState.leftPlayer : comparisonState.rightPlayer;
    const targetPlayer = source === 'left' ? comparisonState.rightPlayer : comparisonState.leftPlayer;

    if (!sourcePlayer || !targetPlayer) return;

    switch (action) {
        case 'play':
            if (targetPlayer.paused) {
                targetPlayer.play().catch(() => {});
            }
            updatePlayPauseButton(false);
            break;
        case 'pause':
            if (!targetPlayer.paused) {
                targetPlayer.pause();
            }
            updatePlayPauseButton(true);
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
function updateComparisonTime() {
    const timeEl = document.getElementById('comparison-time');
    if (timeEl && comparisonState.leftPlayer) {
        timeEl.textContent = formatTimestamp(comparisonState.leftPlayer.currentTime);
    }
}

/**
 * Play/Pause Toggle
 */
function toggleComparisonPlayback() {
    const leftPlayer = comparisonState.leftPlayer;
    const rightPlayer = comparisonState.rightPlayer;

    if (!leftPlayer && !rightPlayer) return;

    const isPaused = leftPlayer?.paused ?? true;

    if (isPaused) {
        leftPlayer?.play().catch(() => {});
        rightPlayer?.play().catch(() => {});
    } else {
        leftPlayer?.pause();
        rightPlayer?.pause();
    }

    updatePlayPauseButton(!isPaused);
}

/**
 * Aktualisiert den Play/Pause Button
 */
function updatePlayPauseButton(isPaused) {
    const btn = document.getElementById('comparison-play-pause');
    if (!btn) return;

    btn.innerHTML = isPaused
        ? '<i class="fas fa-play"></i><span>Abspielen</span>'
        : '<i class="fas fa-pause"></i><span>Pause</span>';
}

/**
 * Startet beide Videos von vorne
 */
function restartComparison() {
    if (comparisonState.leftPlayer) {
        comparisonState.leftPlayer.currentTime = 0;
    }
    if (comparisonState.rightPlayer) {
        comparisonState.rightPlayer.currentTime = 0;
    }
}

/**
 * Schließt das Comparison Modal
 */
function closeComparisonModal() {
    const modal = document.getElementById('video-comparison-modal');
    modal?.classList.add('hidden');

    // Videos pausieren
    comparisonState.leftPlayer?.pause();
    comparisonState.rightPlayer?.pause();
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
