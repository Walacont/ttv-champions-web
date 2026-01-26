/**
 * Match Media Module
 * Handles photo and video uploads for matches
 */

import { getSupabase } from './supabase-init.js';
import { t } from './i18n.js';

const supabase = getSupabase();

let currentUser = null;
let currentMatchId = null;
let currentMatchType = null;
let matchMediaAvailable = null; // null = not checked, true/false = result
let availabilityCheckPromise = null;

// File constraints
const MAX_PHOTOS = 5;
const MAX_VIDEOS = 5;
const MAX_PHOTO_SIZE = 10 * 1024 * 1024; // 10MB
const MAX_VIDEO_SIZE = 50 * 1024 * 1024; // 50MB
const ACCEPTED_PHOTO_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
const ACCEPTED_VIDEO_TYPES = ['video/mp4', 'video/webm', 'video/quicktime'];

/**
 * Initialize match media module
 */
export function initMatchMedia(user) {
    currentUser = user;
    setupUploadModal();
    setupGalleryModal();
}

/**
 * Setup upload modal HTML
 */
function setupUploadModal() {
    if (document.getElementById('media-upload-modal')) return;

    const modalHTML = `
        <div id="media-upload-modal" class="fixed inset-0 bg-black bg-opacity-50 z-50 hidden flex items-center justify-center p-4">
            <div class="bg-white rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] flex flex-col">
                <!-- Modal Header -->
                <div class="flex items-center justify-between p-4 border-b border-gray-200">
                    <h3 class="text-lg font-semibold text-gray-900">
                        <i class="fas fa-upload mr-2"></i>
                        <span data-i18n="dashboard.matchMedia.uploadTitle">Fotos/Videos hochladen</span>
                    </h3>
                    <button onclick="window.closeMediaUpload()" class="text-gray-400 hover:text-gray-600 transition">
                        <i class="fas fa-times text-xl"></i>
                    </button>
                </div>

                <!-- Upload Area -->
                <div class="flex-1 overflow-y-auto p-6">
                    <!-- Info Box -->
                    <div class="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
                        <div class="flex gap-3">
                            <i class="fas fa-info-circle text-blue-500 mt-1"></i>
                            <div class="text-sm text-blue-800">
                                <p class="font-semibold mb-1" data-i18n="dashboard.matchMedia.infoTitle">Hinweis</p>
                                <p data-i18n="dashboard.matchMedia.infoText">Bitte nur kurze Highlights hochladen (max. 30-60 Sekunden), nicht das gesamte Match!</p>
                                <p class="mt-2">
                                    <span data-i18n="dashboard.matchMedia.limits">Maximal 5 Dateien | Fotos: max. 10MB | Videos: max. 50MB</span>
                                </p>
                            </div>
                        </div>
                    </div>

                    <!-- File Input -->
                    <div class="mb-6">
                        <label class="block text-sm font-medium text-gray-700 mb-2">
                            <span data-i18n="dashboard.matchMedia.selectFiles">Dateien auswählen</span>
                        </label>
                        <input
                            type="file"
                            id="media-file-input"
                            accept="image/jpeg,image/jpg,image/png,image/webp,video/mp4,video/webm,video/quicktime"
                            multiple
                            class="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100"
                        >
                    </div>

                    <!-- Upload Preview -->
                    <div id="upload-preview" class="space-y-3"></div>
                </div>

                <!-- Modal Footer -->
                <div class="p-4 border-t border-gray-200 flex justify-end gap-3">
                    <button
                        onclick="window.closeMediaUpload()"
                        class="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition"
                    >
                        <span data-i18n="common.cancel">Abbrechen</span>
                    </button>
                    <button
                        onclick="window.uploadMedia()"
                        id="upload-media-btn"
                        class="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
                        disabled
                    >
                        <i class="fas fa-upload mr-2"></i>
                        <span data-i18n="dashboard.matchMedia.upload">Hochladen</span>
                    </button>
                </div>
            </div>
        </div>
    `;

    document.body.insertAdjacentHTML('beforeend', modalHTML);

    // Datei-Input-Listener einrichten
    const fileInput = document.getElementById('media-file-input');
    fileInput.addEventListener('change', handleFileSelection);
}

/**
 * Setup gallery modal HTML - Facebook/Instagram style fullscreen view
 */
function setupGalleryModal() {
    if (document.getElementById('media-gallery-modal')) return;

    const modalHTML = `
        <div id="media-gallery-modal" class="fixed inset-0 bg-black z-50 hidden flex flex-col">
            <!-- Close button (always visible) -->
            <button onclick="window.closeMediaGallery()" class="absolute top-4 right-4 z-50 text-white hover:text-gray-300 transition p-2">
                <i class="fas fa-times text-2xl"></i>
            </button>

            <!-- Image counter (always visible when multiple images) -->
            <div id="gallery-counter" class="absolute top-4 left-4 z-50 text-white font-semibold bg-black/50 px-3 py-1 rounded-full text-sm hidden"></div>

            <!-- Main content area - swipeable -->
            <div id="gallery-swipe-area" class="flex-1 flex items-center justify-center overflow-hidden relative">
                <!-- Navigation arrows (desktop) -->
                <button onclick="window.previousMedia()" id="prev-media-btn" class="absolute left-2 z-40 text-white/70 hover:text-white transition p-3 hidden md:block">
                    <i class="fas fa-chevron-left text-3xl"></i>
                </button>

                <div id="gallery-content" class="w-full h-full flex items-center justify-center"></div>

                <button onclick="window.nextMedia()" id="next-media-btn" class="absolute right-2 z-40 text-white/70 hover:text-white transition p-3 hidden md:block">
                    <i class="fas fa-chevron-right text-3xl"></i>
                </button>
            </div>

            <!-- Bottom overlay with activity info -->
            <div id="gallery-overlay" class="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/90 via-black/60 to-transparent transition-opacity duration-300">
                <div class="p-4 pb-6 max-w-2xl mx-auto">
                    <!-- Activity description -->
                    <div id="gallery-description" class="text-white mb-3 text-sm leading-relaxed"></div>

                    <!-- Like and Comment buttons -->
                    <div class="flex items-center gap-4">
                        <button id="gallery-like-btn" class="flex items-center gap-2 text-white hover:text-blue-400 transition">
                            <i class="far fa-thumbs-up text-xl"></i>
                            <span id="gallery-like-count" class="text-sm"></span>
                        </button>
                        <button id="gallery-comment-btn" class="flex items-center gap-2 text-white hover:text-blue-400 transition">
                            <i class="far fa-comment text-xl"></i>
                            <span id="gallery-comment-count" class="text-sm"></span>
                        </button>
                    </div>
                </div>
            </div>
        </div>
    `;

    document.body.insertAdjacentHTML('beforeend', modalHTML);

    const modal = document.getElementById('media-gallery-modal');
    const swipeArea = document.getElementById('gallery-swipe-area');
    const galleryContent = document.getElementById('gallery-content');

    // Touch swipe support
    let touchStartX = 0;
    let touchStartY = 0;
    let touchEndX = 0;
    let touchEndY = 0;

    swipeArea.addEventListener('touchstart', (e) => {
        touchStartX = e.changedTouches[0].screenX;
        touchStartY = e.changedTouches[0].screenY;
    }, { passive: true });

    swipeArea.addEventListener('touchend', (e) => {
        touchEndX = e.changedTouches[0].screenX;
        touchEndY = e.changedTouches[0].screenY;
        handleSwipe();
    }, { passive: true });

    function handleSwipe() {
        const diffX = touchStartX - touchEndX;
        const diffY = touchStartY - touchEndY;
        const minSwipeDistance = 50;

        // Only handle horizontal swipes (ignore vertical scrolling)
        if (Math.abs(diffX) > Math.abs(diffY) && Math.abs(diffX) > minSwipeDistance) {
            if (diffX > 0) {
                // Swipe left - next image
                window.nextMedia();
            } else {
                // Swipe right - previous image
                window.previousMedia();
            }
        }
    }

    // Tap on image to toggle overlay
    galleryContent.addEventListener('click', (e) => {
        // Don't toggle if clicking on video controls
        if (e.target.tagName === 'VIDEO' || e.target.closest('video')) {
            return;
        }
        window.toggleGalleryOverlay();
    });

    // Like button click
    document.getElementById('gallery-like-btn').addEventListener('click', (e) => {
        e.stopPropagation();
        if (currentMatchId && currentMatchType) {
            const activityType = currentMatchType === 'singles' ? 'singles_match' : 'doubles_match';
            if (window.toggleLike) {
                window.toggleLike(currentMatchId, activityType);
                // Update gallery like button state after a short delay
                setTimeout(updateGalleryLikeState, 300);
            }
        }
    });

    // Comment button click
    document.getElementById('gallery-comment-btn').addEventListener('click', (e) => {
        e.stopPropagation();
        if (currentMatchId && currentMatchType) {
            if (window.openComments) {
                window.openComments(currentMatchId, currentMatchType);
            }
        }
    });

    // Keyboard navigation
    modal.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowLeft') {
            window.previousMedia();
        } else if (e.key === 'ArrowRight') {
            window.nextMedia();
        } else if (e.key === 'Escape') {
            window.closeMediaGallery();
        }
    });
}

/**
 * Handle file selection
 */
function handleFileSelection(e) {
    const files = Array.from(e.target.files);
    const preview = document.getElementById('upload-preview');
    const uploadBtn = document.getElementById('upload-media-btn');

    preview.innerHTML = '';

    if (files.length === 0) {
        uploadBtn.disabled = true;
        return;
    }

    let hasValidFiles = false;

    files.forEach((file, index) => {
        const isPhoto = ACCEPTED_PHOTO_TYPES.includes(file.type);
        const isVideo = ACCEPTED_VIDEO_TYPES.includes(file.type);

        let errorMsg = '';

        if (!isPhoto && !isVideo) {
            errorMsg = t('dashboard.matchMedia.errors.invalidType');
        } else if (isPhoto && file.size > MAX_PHOTO_SIZE) {
            errorMsg = t('dashboard.matchMedia.errors.photoTooLarge');
        } else if (isVideo && file.size > MAX_VIDEO_SIZE) {
            errorMsg = t('dashboard.matchMedia.errors.videoTooLarge');
        } else {
            hasValidFiles = true;
        }

        const fileSize = (file.size / (1024 * 1024)).toFixed(2);
        const fileTypeIcon = isPhoto ? 'fa-image' : 'fa-video';

        preview.innerHTML += `
            <div class="flex items-center gap-3 p-3 bg-gray-50 rounded-lg ${errorMsg ? 'border-2 border-red-300' : ''}">
                <i class="fas ${fileTypeIcon} text-2xl ${errorMsg ? 'text-red-500' : 'text-gray-400'}"></i>
                <div class="flex-1 min-w-0">
                    <p class="text-sm font-medium text-gray-900 truncate">${file.name}</p>
                    <p class="text-xs text-gray-500">${fileSize} MB</p>
                    ${errorMsg ? `<p class="text-xs text-red-600 mt-1">${errorMsg}</p>` : ''}
                </div>
                ${!errorMsg ? '<i class="fas fa-check-circle text-green-500"></i>' : '<i class="fas fa-exclamation-circle text-red-500"></i>'}
            </div>
        `;
    });

    uploadBtn.disabled = !hasValidFiles;
}

/**
 * Open media upload modal
 */
export async function openMediaUpload(matchId, matchType) {
    // Prüfen ob Feature verfügbar ist
    const isAvailable = await checkMatchMediaAvailable();
    if (!isAvailable) {
        alert('Match-Media Funktion ist noch nicht eingerichtet.');
        return;
    }

    currentMatchId = matchId;
    currentMatchType = matchType;

    try {
        // Prüfen ob Benutzer hochladen kann
        const { data: canUpload, error: canUploadError } = await supabase.rpc('can_upload_match_media', {
            p_match_id: String(matchId),
            p_match_type: matchType
        });

        if (canUploadError) {
            matchMediaAvailable = false;
            alert('Match-Media Funktion ist noch nicht vollständig eingerichtet.');
            return;
        }

        if (!canUpload) {
            alert(t('dashboard.matchMedia.errors.notParticipant'));
            return;
        }

        // Aktuelle Medien-Anzahl prüfen
        const { data: existingMedia } = await supabase.rpc('get_match_media', {
            p_match_id: String(matchId),
            p_match_type: matchType
        });

        if (existingMedia && existingMedia.length >= MAX_PHOTOS) {
            alert(t('dashboard.matchMedia.errors.maxReached'));
            return;
        }
    } catch {
        matchMediaAvailable = false;
        return;
    }

    const modal = document.getElementById('media-upload-modal');
    modal.classList.remove('hidden');
    document.body.style.overflow = 'hidden';

    // Formular zurücksetzen
    document.getElementById('media-file-input').value = '';
    document.getElementById('upload-preview').innerHTML = '';
    document.getElementById('upload-media-btn').disabled = true;
}

/**
 * Close media upload modal
 */
export function closeMediaUpload() {
    const modal = document.getElementById('media-upload-modal');
    modal.classList.add('hidden');
    document.body.style.overflow = '';
}

/**
 * Upload selected media files
 */
export async function uploadMedia() {
    const fileInput = document.getElementById('media-file-input');
    const uploadBtn = document.getElementById('upload-media-btn');
    const files = Array.from(fileInput.files);

    if (files.length === 0) return;

    uploadBtn.disabled = true;
    uploadBtn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>' + t('dashboard.matchMedia.uploading');

    try {
        // Aktuelle Anzahl prüfen
        const { data: existingMedia } = await supabase.rpc('get_match_media', {
            p_match_id: currentMatchId,
            p_match_type: currentMatchType
        });

        const remainingSlots = MAX_PHOTOS - (existingMedia?.length || 0);
        const filesToUpload = files.slice(0, remainingSlots);

        for (const file of filesToUpload) {
            const isPhoto = ACCEPTED_PHOTO_TYPES.includes(file.type);
            const isVideo = ACCEPTED_VIDEO_TYPES.includes(file.type);

            if (!isPhoto && !isVideo) continue;
            if (isPhoto && file.size > MAX_PHOTO_SIZE) continue;
            if (isVideo && file.size > MAX_VIDEO_SIZE) continue;

            // Eindeutigen Dateinamen generieren
            const timestamp = Date.now();
            const randomStr = Math.random().toString(36).substring(7);
            const ext = file.name.split('.').pop();
            const fileName = `${timestamp}-${randomStr}.${ext}`;
            const filePath = `${currentUser.id}/${currentMatchType}/${currentMatchId}/${fileName}`;

            // In Storage hochladen
            const { error: uploadError } = await supabase.storage
                .from('match-media')
                .upload(filePath, file, {
                    contentType: file.type,
                    upsert: false
                });

            if (uploadError) {
                console.error('Upload error:', uploadError);
                throw uploadError;
            }

            // Metadaten in Datenbank speichern
            const { error: dbError } = await supabase
                .from('match_media')
                .insert({
                    match_id: currentMatchId,
                    match_type: currentMatchType,
                    uploaded_by: currentUser.id,
                    file_type: isPhoto ? 'photo' : 'video',
                    file_path: filePath,
                    file_size: file.size,
                    mime_type: file.type
                });

            if (dbError) {
                console.error('Database error:', dbError);
                // Hochgeladene Datei löschen versuchen
                await supabase.storage.from('match-media').remove([filePath]);
                throw dbError;
            }
        }

        // Modal schließen und Activity-Feed neu laden
        closeMediaUpload();

        // Verfügbarkeits-Cache zurücksetzen damit Medien geladen werden
        matchMediaAvailable = true;

        // Auch den Cache im Activity-Feed zurücksetzen falls vorhanden
        if (window.resetMatchMediaCache) {
            window.resetMatchMediaCache();
        }

        // Aktivitäts-Feed aktualisieren um neue Medien zu zeigen
        if (window.loadActivityFeed) {
            await window.loadActivityFeed();
        }

    } catch (error) {
        console.error('Error uploading media:', error);
        alert(t('common.error'));
    } finally {
        uploadBtn.disabled = false;
        uploadBtn.innerHTML = '<i class="fas fa-upload mr-2"></i>' + t('dashboard.matchMedia.upload');
    }
}

/**
 * Check if match media feature is available (table + functions exist)
 */
async function checkMatchMediaAvailable() {
    if (matchMediaAvailable !== null) {
        return matchMediaAvailable;
    }

    // Einzelnes Promise verwenden um mehrere gleichzeitige Prüfungen zu vermeiden
    if (availabilityCheckPromise) {
        return availabilityCheckPromise;
    }

    availabilityCheckPromise = (async () => {
        try {
            // Prüfen ob Tabelle existiert
            const { error: tableError } = await supabase
                .from('match_media')
                .select('id')
                .limit(1);

            if (tableError) {
                matchMediaAvailable = false;
                return false;
            }

            matchMediaAvailable = true;
            return true;
        } catch {
            matchMediaAvailable = false;
            return false;
        }
    })();

    return availabilityCheckPromise;
}

/**
 * Load and display media for a match
 */
export async function loadMatchMedia(matchId, matchType) {
    // Verfügbarkeit zuerst prüfen (nur 1 Anfrage)
    const isAvailable = await checkMatchMediaAvailable();
    if (!isAvailable) {
        return [];
    }

    try {
        // Tabelle direkt abfragen statt RPC zu verwenden
        const { data, error } = await supabase
            .from('match_media')
            .select('id, match_id, match_type, uploaded_by, file_type, file_path, file_size, mime_type, created_at')
            .eq('match_id', String(matchId))
            .eq('match_type', matchType)
            .order('created_at', { ascending: false });

        if (error) {
            console.error('Error loading match media:', error);
            return [];
        }

        return data || [];

    } catch (err) {
        console.error('Error loading match media:', err);
        return [];
    }
}

/**
 * Open media gallery
 */
let currentGalleryIndex = 0;
let currentGalleryMedia = [];
let currentActivityContext = null;
let overlayVisible = true;

export async function openMediaGallery(matchId, matchType, startIndex = 0, activityContext = null) {
    currentMatchId = matchId;
    currentMatchType = matchType;
    currentGalleryIndex = startIndex;
    currentActivityContext = activityContext;
    overlayVisible = true;

    const media = await loadMatchMedia(matchId, matchType);

    if (!media || media.length === 0) return;

    currentGalleryMedia = media;

    const modal = document.getElementById('media-gallery-modal');
    modal.classList.remove('hidden');
    document.body.style.overflow = 'hidden';

    // Show/hide counter based on media count
    const counter = document.getElementById('gallery-counter');
    if (currentGalleryMedia.length > 1) {
        counter.classList.remove('hidden');
    } else {
        counter.classList.add('hidden');
    }

    // Reset overlay visibility
    const overlay = document.getElementById('gallery-overlay');
    if (overlay) {
        overlay.style.opacity = '1';
    }

    displayCurrentMedia();
    updateGalleryOverlay();

    // Focus modal for keyboard navigation
    modal.setAttribute('tabindex', '-1');
    modal.focus();
}

/**
 * Display current media in gallery
 */
function displayCurrentMedia() {
    const content = document.getElementById('gallery-content');
    const counter = document.getElementById('gallery-counter');
    const prevBtn = document.getElementById('prev-media-btn');
    const nextBtn = document.getElementById('next-media-btn');

    if (currentGalleryMedia.length === 0) return;

    const media = currentGalleryMedia[currentGalleryIndex];
    const { data: { publicUrl } } = supabase.storage
        .from('match-media')
        .getPublicUrl(media.file_path);

    if (media.file_type === 'photo') {
        content.innerHTML = `
            <img src="${publicUrl}" alt="Match photo" class="max-w-full max-h-full object-contain select-none" draggable="false">
        `;
    } else {
        content.innerHTML = `
            <video controls playsinline class="max-w-full max-h-full">
                <source src="${publicUrl}" type="${media.mime_type}">
            </video>
        `;
    }

    // Update counter
    if (currentGalleryMedia.length > 1) {
        counter.textContent = `${currentGalleryIndex + 1} / ${currentGalleryMedia.length}`;
    }

    // Update navigation button visibility
    prevBtn.style.visibility = currentGalleryIndex === 0 ? 'hidden' : 'visible';
    nextBtn.style.visibility = currentGalleryIndex === currentGalleryMedia.length - 1 ? 'hidden' : 'visible';
}

/**
 * Update the gallery overlay with activity context
 */
function updateGalleryOverlay() {
    const descriptionEl = document.getElementById('gallery-description');
    const likeCountEl = document.getElementById('gallery-like-count');
    const commentCountEl = document.getElementById('gallery-comment-count');
    const likeBtnIcon = document.querySelector('#gallery-like-btn i');

    if (!descriptionEl) return;

    // Set description from activity context
    if (currentActivityContext) {
        const description = currentActivityContext.description || currentActivityContext.title || '';
        descriptionEl.textContent = description;
        descriptionEl.style.display = description ? 'block' : 'none';
    } else {
        descriptionEl.style.display = 'none';
    }

    // Update like/comment counts from activity context or cache
    updateGalleryLikeState();

    if (currentActivityContext?.commentCount !== undefined) {
        commentCountEl.textContent = currentActivityContext.commentCount > 0 ? currentActivityContext.commentCount : '';
    } else {
        commentCountEl.textContent = '';
    }
}

/**
 * Update gallery like button state
 */
function updateGalleryLikeState() {
    const likeCountEl = document.getElementById('gallery-like-count');
    const likeBtnIcon = document.querySelector('#gallery-like-btn i');

    if (!likeCountEl || !likeBtnIcon) return;

    // Try to get like state from cache or context
    const activityType = currentMatchType === 'singles' ? 'singles_match' : 'doubles_match';
    const key = `${activityType}-${currentMatchId}`;

    // Check if toggleLike updated the DOM, sync from there
    const feedLikeBtn = document.querySelector(`[data-like-btn="${key}"]`);
    const feedLikeCount = document.querySelector(`[data-like-count="${key}"]`);

    if (feedLikeBtn) {
        const isLiked = feedLikeBtn.classList.contains('text-blue-500');
        likeBtnIcon.classList.toggle('fas', isLiked);
        likeBtnIcon.classList.toggle('far', !isLiked);
    } else if (currentActivityContext?.isLiked !== undefined) {
        likeBtnIcon.classList.toggle('fas', currentActivityContext.isLiked);
        likeBtnIcon.classList.toggle('far', !currentActivityContext.isLiked);
    }

    if (feedLikeCount) {
        likeCountEl.textContent = feedLikeCount.textContent;
    } else if (currentActivityContext?.likeCount !== undefined) {
        likeCountEl.textContent = currentActivityContext.likeCount > 0 ? currentActivityContext.likeCount : '';
    }
}

/**
 * Toggle overlay visibility
 */
export function toggleGalleryOverlay() {
    const overlay = document.getElementById('gallery-overlay');
    const counter = document.getElementById('gallery-counter');

    if (!overlay) return;

    overlayVisible = !overlayVisible;

    overlay.style.opacity = overlayVisible ? '1' : '0';
    overlay.style.pointerEvents = overlayVisible ? 'auto' : 'none';

    // Also toggle counter visibility if multiple images
    if (counter && currentGalleryMedia.length > 1) {
        counter.style.opacity = overlayVisible ? '1' : '0';
    }
}

/**
 * Navigate to previous media
 */
export function previousMedia() {
    if (currentGalleryIndex > 0) {
        currentGalleryIndex--;
        displayCurrentMedia();
    }
}

/**
 * Navigate to next media
 */
export function nextMedia() {
    if (currentGalleryIndex < currentGalleryMedia.length - 1) {
        currentGalleryIndex++;
        displayCurrentMedia();
    }
}

/**
 * Close media gallery
 */
export function closeMediaGallery() {
    const modal = document.getElementById('media-gallery-modal');
    modal.classList.add('hidden');
    document.body.style.overflow = '';

    currentGalleryMedia = [];
    currentGalleryIndex = 0;
    currentActivityContext = null;
    overlayVisible = true;
}

/**
 * Delete a media file
 */
export async function deleteMedia(mediaId, filePath) {
    if (!confirm(t('dashboard.matchMedia.deleteConfirm'))) return;

    try {
        // Aus Datenbank löschen
        const { error: dbError } = await supabase
            .from('match_media')
            .delete()
            .eq('id', mediaId);

        if (dbError) throw dbError;

        // Aus Storage löschen
        const { error: storageError } = await supabase.storage
            .from('match-media')
            .remove([filePath]);

        if (storageError) {
            console.error('Storage deletion error:', storageError);
        }

        // Activity-Feed aktualisieren
        if (window.loadActivityFeed) {
            await window.loadActivityFeed();
        }

    } catch (error) {
        console.error('Error deleting media:', error);
        alert(t('common.error'));
    }
}

// Funktionen global verfügbar machen
window.openMediaUpload = openMediaUpload;
window.closeMediaUpload = closeMediaUpload;
window.uploadMedia = uploadMedia;
window.openMediaGallery = openMediaGallery;
window.closeMediaGallery = closeMediaGallery;
window.previousMedia = previousMedia;
window.nextMedia = nextMedia;
window.deleteMedia = deleteMedia;
window.toggleGalleryOverlay = toggleGalleryOverlay;
