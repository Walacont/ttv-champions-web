// ============================================
// COMMUNITY POSTS & POLLS MANAGER
// Handles creating and managing community posts and polls
// ============================================

import { getSupabase } from './supabase-init.js';

const supabase = getSupabase();

// Modal elements
const createPostModal = document.getElementById('create-post-modal');
const createPostBtn = document.getElementById('create-post-btn');
const closeModalBtn = document.getElementById('close-create-post-modal');

// Post type toggles
const postTypeTextBtn = document.getElementById('post-type-text');
const postTypePollBtn = document.getElementById('post-type-poll');
const textPostForm = document.getElementById('text-post-form');
const pollForm = document.getElementById('poll-form');

// Text post elements
const postContentTextarea = document.getElementById('post-content');
const postImageInput = document.getElementById('post-image-input');
const postImagesPreview = document.getElementById('post-images-preview');
const postImagesPreviewGrid = document.getElementById('post-images-preview-grid');
const clearPostImagesBtn = document.getElementById('clear-post-images');
const postVisibilitySelect = document.getElementById('post-visibility');
const cancelPostBtn = document.getElementById('cancel-post-btn');
const postFormFeedback = document.getElementById('post-form-feedback');

// Poll elements
const pollQuestionInput = document.getElementById('poll-question');
const pollOptionsContainer = document.getElementById('poll-options-container');
const addPollOptionBtn = document.getElementById('add-poll-option');
const pollDurationSelect = document.getElementById('poll-duration');
const pollVisibilitySelect = document.getElementById('poll-visibility');
const cancelPollBtn = document.getElementById('cancel-poll-btn');
const pollFormFeedback = document.getElementById('poll-form-feedback');

let selectedImageFiles = [];

// ============================================
// INITIALIZATION
// ============================================

export function initPostsManager() {
    // Open modal
    createPostBtn?.addEventListener('click', openCreatePostModal);

    // Close modal
    closeModalBtn?.addEventListener('click', closeCreatePostModal);
    cancelPostBtn?.addEventListener('click', closeCreatePostModal);
    cancelPollBtn?.addEventListener('click', closeCreatePostModal);

    // Click outside to close
    createPostModal?.addEventListener('click', (e) => {
        if (e.target === createPostModal) {
            closeCreatePostModal();
        }
    });

    // Post type toggle
    postTypeTextBtn?.addEventListener('click', () => switchPostType('text'));
    postTypePollBtn?.addEventListener('click', () => switchPostType('poll'));

    // Image upload
    postImageInput?.addEventListener('change', handleImagesSelect);
    clearPostImagesBtn?.addEventListener('click', clearImages);

    // Poll option management
    addPollOptionBtn?.addEventListener('click', addPollOption);

    // Form submissions
    textPostForm?.addEventListener('submit', handleTextPostSubmit);
    pollForm?.addEventListener('submit', handlePollSubmit);

    console.log('[Posts Manager] Initialized');
}

// ============================================
// MODAL MANAGEMENT
// ============================================

function openCreatePostModal() {
    createPostModal?.classList.remove('hidden');
    resetForms();
}

function closeCreatePostModal() {
    createPostModal?.classList.add('hidden');
    resetForms();
}

function resetForms() {
    // Reset text post form
    postContentTextarea.value = '';
    postVisibilitySelect.value = 'public';
    clearImages();
    postFormFeedback.innerHTML = '';
    postFormFeedback.classList.add('hidden');

    // Reset poll form
    pollQuestionInput.value = '';
    pollDurationSelect.value = '7';
    pollVisibilitySelect.value = 'public';
    pollFormFeedback.innerHTML = '';
    pollFormFeedback.classList.add('hidden');

    // Reset poll options to 2
    pollOptionsContainer.innerHTML = `
        <div class="poll-option-item flex gap-2">
            <input
                type="text"
                class="poll-option-input flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                placeholder="Option 1"
            />
        </div>
        <div class="poll-option-item flex gap-2">
            <input
                type="text"
                class="poll-option-input flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                placeholder="Option 2"
            />
        </div>
    `;

    // Standardmäßig zu Text-Post-Typ wechseln
    switchPostType('text');
}

function switchPostType(type) {
    if (type === 'text') {
        // Show text post form
        textPostForm?.classList.remove('hidden');
        pollForm?.classList.add('hidden');

        // Update toggle buttons
        postTypeTextBtn?.classList.add('bg-indigo-600', 'text-white');
        postTypeTextBtn?.classList.remove('text-gray-600');
        postTypePollBtn?.classList.remove('bg-indigo-600', 'text-white');
        postTypePollBtn?.classList.add('text-gray-600');
    } else {
        // Show poll form
        textPostForm?.classList.add('hidden');
        pollForm?.classList.remove('hidden');

        // Update toggle buttons
        postTypePollBtn?.classList.add('bg-indigo-600', 'text-white');
        postTypePollBtn?.classList.remove('text-gray-600');
        postTypeTextBtn?.classList.remove('bg-indigo-600', 'text-white');
        postTypeTextBtn?.classList.add('text-gray-600');
    }
}

// ============================================
// IMAGE HANDLING
// ============================================

function handleImagesSelect(e) {
    const files = Array.from(e.target.files);
    if (files.length === 0) return;

    // Check total limit (max 10 images)
    if (selectedImageFiles.length + files.length > 10) {
        showFeedback(postFormFeedback, 'error', 'Maximal 10 Bilder erlaubt.');
        return;
    }

    // Jede Datei validieren
    for (const file of files) {
        // Validate file size (5MB max)
        if (file.size > 5 * 1024 * 1024) {
            showFeedback(postFormFeedback, 'error', `${file.name} ist zu groß. Max. 5MB erlaubt.`);
            continue;
        }

        // Validate file type
        if (!file.type.startsWith('image/')) {
            showFeedback(postFormFeedback, 'error', `${file.name} ist kein Bild.`);
            continue;
        }

        selectedImageFiles.push(file);
    }

    // Update preview
    updateImagePreviews();

    // Clear input to allow selecting same files again
    postImageInput.value = '';
}

function updateImagePreviews() {
    if (selectedImageFiles.length === 0) {
        postImagesPreview.classList.add('hidden');
        postImagesPreviewGrid.innerHTML = '';
        return;
    }

    postImagesPreview.classList.remove('hidden');
    postImagesPreviewGrid.innerHTML = '';

    selectedImageFiles.forEach((file, index) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            const div = document.createElement('div');
            div.className = 'relative group';
            div.innerHTML = `
                <img src="${e.target.result}" alt="Preview ${index + 1}"
                     class="w-full h-24 object-cover rounded-lg border-2 border-gray-200">
                <button type="button"
                        class="absolute top-1 right-1 bg-red-500 hover:bg-red-600 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition"
                        onclick="window.removeImageAtIndex(${index})">
                    <i class="fas fa-times text-xs"></i>
                </button>
                <div class="absolute bottom-1 left-1 bg-black bg-opacity-50 text-white text-xs px-2 py-0.5 rounded">
                    ${index + 1}/${selectedImageFiles.length}
                </div>
            `;
            postImagesPreviewGrid.appendChild(div);
        };
        reader.readAsDataURL(file);
    });
}

function removeImageAtIndex(index) {
    selectedImageFiles.splice(index, 1);
    updateImagePreviews();
}

function clearImages() {
    selectedImageFiles = [];
    postImageInput.value = '';
    postImagesPreview.classList.add('hidden');
    postImagesPreviewGrid.innerHTML = '';
}

// Make removeImageAtIndex available globally for onclick
window.removeImageAtIndex = removeImageAtIndex;

// ============================================
// POLL OPTIONS MANAGEMENT
// ============================================

function addPollOption() {
    const currentOptions = pollOptionsContainer.querySelectorAll('.poll-option-item');

    if (currentOptions.length >= 10) {
        showFeedback(pollFormFeedback, 'error', 'Max. 10 Optionen erlaubt.');
        return;
    }

    const optionNumber = currentOptions.length + 1;
    const newOption = document.createElement('div');
    newOption.className = 'poll-option-item flex gap-2';
    newOption.innerHTML = `
        <input
            type="text"
            class="poll-option-input flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
            placeholder="Option ${optionNumber}"
        />
        <button
            type="button"
            class="remove-poll-option text-red-600 hover:text-red-800 px-2"
        >
            <i class="fas fa-times"></i>
        </button>
    `;

    // Add remove button handler
    const removeBtn = newOption.querySelector('.remove-poll-option');
    removeBtn.addEventListener('click', () => {
        newOption.remove();
        updatePollOptionPlaceholders();
    });

    pollOptionsContainer.appendChild(newOption);
}

function updatePollOptionPlaceholders() {
    const options = pollOptionsContainer.querySelectorAll('.poll-option-input');
    options.forEach((input, index) => {
        input.placeholder = `Option ${index + 1}`;
    });
}

// ============================================
// TEXT POST SUBMISSION
// ============================================

async function handleTextPostSubmit(e) {
    e.preventDefault();

    const content = postContentTextarea.value.trim();
    const visibility = postVisibilitySelect.value;

    // Validation
    if (!content) {
        showFeedback(postFormFeedback, 'error', 'Bitte gib einen Text ein.');
        return;
    }

    if (content.length > 5000) {
        showFeedback(postFormFeedback, 'error', 'Text ist zu lang. Max. 5000 Zeichen erlaubt.');
        return;
    }

    try {
        showFeedback(postFormFeedback, 'loading', 'Beitrag wird erstellt...');

        // Get current user
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
            showFeedback(postFormFeedback, 'error', 'Du musst angemeldet sein.');
            return;
        }

        // Get user's club_id
        const { data: profile } = await supabase
            .from('profiles')
            .select('club_id')
            .eq('id', user.id)
            .single();

        let imageUrls = [];

        // Upload images if selected
        if (selectedImageFiles.length > 0) {
            showFeedback(postFormFeedback, 'loading', `Lade ${selectedImageFiles.length} Bild(er) hoch...`);

            for (let i = 0; i < selectedImageFiles.length; i++) {
                const file = selectedImageFiles[i];
                const fileExt = file.name.split('.').pop();
                const fileName = `${user.id}/${Date.now()}_${i}.${fileExt}`;

                const { data: uploadData, error: uploadError } = await supabase.storage
                    .from('post-images')
                    .upload(fileName, file);

                if (uploadError) {
                    console.error('Error uploading image:', uploadError);
                    showFeedback(postFormFeedback, 'error', `Fehler beim Hochladen von Bild ${i + 1}.`);
                    return;
                }

                // Get public URL
                const { data: { publicUrl } } = supabase.storage
                    .from('post-images')
                    .getPublicUrl(fileName);

                imageUrls.push(publicUrl);
            }

            showFeedback(postFormFeedback, 'loading', 'Erstelle Beitrag...');
        }

        // Create post
        const { data: post, error: postError } = await supabase
            .from('community_posts')
            .insert({
                user_id: user.id,
                club_id: profile?.club_id || null,
                content: content,
                image_urls: imageUrls,
                visibility: visibility
            })
            .select()
            .single();

        if (postError) {
            console.error('Error creating post:', postError);
            showFeedback(postFormFeedback, 'error', 'Fehler beim Erstellen des Beitrags.');
            return;
        }

        showFeedback(postFormFeedback, 'success', 'Beitrag erfolgreich erstellt!');

        // Close modal after a short delay
        setTimeout(() => {
            closeCreatePostModal();
            // Refresh activity feed
            if (window.loadActivities) {
                window.loadActivities(true);
            }
        }, 1500);

    } catch (error) {
        console.error('Error creating post:', error);
        showFeedback(postFormFeedback, 'error', 'Ein Fehler ist aufgetreten.');
    }
}

// ============================================
// POLL SUBMISSION
// ============================================

async function handlePollSubmit(e) {
    e.preventDefault();

    const question = pollQuestionInput.value.trim();
    const visibility = pollVisibilitySelect.value;
    const durationDays = parseInt(pollDurationSelect.value);
    const allowMultiple = document.getElementById('poll-multiple-choice')?.checked || false;
    const isAnonymous = document.getElementById('poll-anonymous')?.checked !== false; // Standard ist true

    // Get poll options
    const optionInputs = pollOptionsContainer.querySelectorAll('.poll-option-input');
    const options = [];

    optionInputs.forEach((input, index) => {
        const text = input.value.trim();
        if (text) {
            options.push({
                id: `option_${index}`,
                text: text,
                votes: 0
            });
        }
    });

    // Validation
    if (!question) {
        showFeedback(pollFormFeedback, 'error', 'Bitte gib eine Frage ein.');
        return;
    }

    if (options.length < 2) {
        showFeedback(pollFormFeedback, 'error', 'Mindestens 2 Optionen erforderlich.');
        return;
    }

    try {
        showFeedback(pollFormFeedback, 'loading', 'Umfrage wird erstellt...');

        // Get current user
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
            showFeedback(pollFormFeedback, 'error', 'Du musst angemeldet sein.');
            return;
        }

        // Get user's club_id
        const { data: profile } = await supabase
            .from('profiles')
            .select('club_id')
            .eq('id', user.id)
            .single();

        // Calculate end date
        const endsAt = new Date();
        endsAt.setDate(endsAt.getDate() + durationDays);

        // Create poll
        const { data: poll, error: pollError } = await supabase
            .from('community_polls')
            .insert({
                user_id: user.id,
                club_id: profile?.club_id || null,
                question: question,
                options: options,
                visibility: visibility,
                duration_days: durationDays,
                ends_at: endsAt.toISOString(),
                allow_multiple: allowMultiple,
                is_anonymous: isAnonymous
            })
            .select()
            .single();

        if (pollError) {
            console.error('Error creating poll:', pollError);
            showFeedback(pollFormFeedback, 'error', 'Fehler beim Erstellen der Umfrage.');
            return;
        }

        showFeedback(pollFormFeedback, 'success', 'Umfrage erfolgreich erstellt!');

        // Close modal after a short delay
        setTimeout(() => {
            closeCreatePostModal();
            // Refresh activity feed
            if (window.loadActivities) {
                window.loadActivities(true);
            }
        }, 1500);

    } catch (error) {
        console.error('Error creating poll:', error);
        showFeedback(pollFormFeedback, 'error', 'Ein Fehler ist aufgetreten.');
    }
}

// ============================================
// UTILITY FUNCTIONS
// ============================================

function showFeedback(element, type, message) {
    element.classList.remove('hidden');
    element.className = 'mt-4 p-3 rounded-lg text-sm font-medium';

    if (type === 'success') {
        element.classList.add('bg-green-100', 'text-green-800', 'border', 'border-green-300');
        element.innerHTML = `<i class="fas fa-check-circle mr-2"></i>${message}`;
    } else if (type === 'error') {
        element.classList.add('bg-red-100', 'text-red-800', 'border', 'border-red-300');
        element.innerHTML = `<i class="fas fa-exclamation-circle mr-2"></i>${message}`;
    } else if (type === 'loading') {
        element.classList.add('bg-blue-100', 'text-blue-800', 'border', 'border-blue-300');
        element.innerHTML = `<i class="fas fa-spinner fa-spin mr-2"></i>${message}`;
    }
}

// Bei DOM-Load initialisieren
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initPostsManager);
} else {
    initPostsManager();
}
