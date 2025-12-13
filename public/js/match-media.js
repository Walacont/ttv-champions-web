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

    // Setup file input listener
    const fileInput = document.getElementById('media-file-input');
    fileInput.addEventListener('change', handleFileSelection);
}

/**
 * Setup gallery modal HTML
 */
function setupGalleryModal() {
    if (document.getElementById('media-gallery-modal')) return;

    const modalHTML = `
        <div id="media-gallery-modal" class="fixed inset-0 bg-black bg-opacity-90 z-50 hidden flex items-center justify-center p-4">
            <div class="max-w-6xl w-full h-full flex flex-col">
                <!-- Header -->
                <div class="flex items-center justify-between p-4 text-white">
                    <h3 class="text-lg font-semibold">
                        <i class="fas fa-images mr-2"></i>
                        <span data-i18n="dashboard.matchMedia.gallery">Match Medien</span>
                    </h3>
                    <button onclick="window.closeMediaGallery()" class="text-white hover:text-gray-300 transition">
                        <i class="fas fa-times text-2xl"></i>
                    </button>
                </div>

                <!-- Gallery Content -->
                <div class="flex-1 flex items-center justify-center overflow-hidden">
                    <div id="gallery-content" class="w-full h-full"></div>
                </div>

                <!-- Navigation -->
                <div class="flex items-center justify-between p-4">
                    <button onclick="window.previousMedia()" id="prev-media-btn" class="text-white hover:text-gray-300 transition p-3">
                        <i class="fas fa-chevron-left text-2xl"></i>
                    </button>
                    <div id="gallery-counter" class="text-white font-semibold"></div>
                    <button onclick="window.nextMedia()" id="next-media-btn" class="text-white hover:text-gray-300 transition p-3">
                        <i class="fas fa-chevron-right text-2xl"></i>
                    </button>
                </div>
            </div>
        </div>
    `;

    document.body.insertAdjacentHTML('beforeend', modalHTML);

    // Close on background click
    document.getElementById('media-gallery-modal').addEventListener('click', (e) => {
        if (e.target.id === 'media-gallery-modal') {
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
    // Check if feature is available
    const isAvailable = await checkMatchMediaAvailable();
    if (!isAvailable) {
        alert('Match-Media Funktion ist noch nicht eingerichtet.');
        return;
    }

    currentMatchId = matchId;
    currentMatchType = matchType;

    try {
        // Check if user can upload
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

        // Check current media count
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

    // Reset form
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
        // Check current count
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

            // Generate unique filename
            const timestamp = Date.now();
            const randomStr = Math.random().toString(36).substring(7);
            const ext = file.name.split('.').pop();
            const fileName = `${timestamp}-${randomStr}.${ext}`;
            const filePath = `${currentUser.id}/${currentMatchType}/${currentMatchId}/${fileName}`;

            // Upload to storage
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

            // Save metadata to database
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
                // Try to delete uploaded file
                await supabase.storage.from('match-media').remove([filePath]);
                throw dbError;
            }
        }

        // Close modal and reload activity feed
        closeMediaUpload();

        // Reset availability cache so media will be loaded
        matchMediaAvailable = true;

        // Also reset the cache in activity-feed if it exists
        if (window.resetMatchMediaCache) {
            window.resetMatchMediaCache();
        }

        // Refresh the activity feed to show new media
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

    // Use a single promise to avoid multiple concurrent checks
    if (availabilityCheckPromise) {
        return availabilityCheckPromise;
    }

    availabilityCheckPromise = (async () => {
        try {
            // Check if table exists
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
    // Check availability first (only makes 1 request ever)
    const isAvailable = await checkMatchMediaAvailable();
    if (!isAvailable) {
        return [];
    }

    try {
        // Query table directly instead of using RPC
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

export async function openMediaGallery(matchId, matchType, startIndex = 0) {
    currentMatchId = matchId;
    currentMatchType = matchType;
    currentGalleryIndex = startIndex;

    const media = await loadMatchMedia(matchId, matchType);

    if (!media || media.length === 0) return;

    currentGalleryMedia = media;

    const modal = document.getElementById('media-gallery-modal');
    modal.classList.remove('hidden');
    document.body.style.overflow = 'hidden';

    displayCurrentMedia();
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
            <img src="${publicUrl}" alt="Match photo" class="max-w-full max-h-full object-contain mx-auto">
        `;
    } else {
        content.innerHTML = `
            <video controls class="max-w-full max-h-full mx-auto">
                <source src="${publicUrl}" type="${media.mime_type}">
            </video>
        `;
    }

    counter.textContent = `${currentGalleryIndex + 1} / ${currentGalleryMedia.length}`;
    prevBtn.disabled = currentGalleryIndex === 0;
    nextBtn.disabled = currentGalleryIndex === currentGalleryMedia.length - 1;
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
}

/**
 * Delete a media file
 */
export async function deleteMedia(mediaId, filePath) {
    if (!confirm(t('dashboard.matchMedia.deleteConfirm'))) return;

    try {
        // Delete from database
        const { error: dbError } = await supabase
            .from('match_media')
            .delete()
            .eq('id', mediaId);

        if (dbError) throw dbError;

        // Delete from storage
        const { error: storageError } = await supabase.storage
            .from('match-media')
            .remove([filePath]);

        if (storageError) {
            console.error('Storage deletion error:', storageError);
        }

        // Refresh the activity feed
        if (window.loadActivityFeed) {
            await window.loadActivityFeed();
        }

    } catch (error) {
        console.error('Error deleting media:', error);
        alert(t('common.error'));
    }
}

// Make functions available globally
window.openMediaUpload = openMediaUpload;
window.closeMediaUpload = closeMediaUpload;
window.uploadMedia = uploadMedia;
window.openMediaGallery = openMediaGallery;
window.closeMediaGallery = closeMediaGallery;
window.previousMedia = previousMedia;
window.nextMedia = nextMedia;
window.deleteMedia = deleteMedia;
