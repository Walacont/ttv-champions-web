// Exercise Detail Page - Supabase Version
// Zeigt die vollständigen Details einer Übung an

import { getSupabase } from './supabase-init.js';
import { renderTableForDisplay } from './tableEditor.js';
import { escapeHtml } from './utils/security.js';

let supabase = null;
let currentUser = null;
let exerciseId = null;
let animationPlayer = null;
let animationPlaying = true;

// Initialize the page
document.addEventListener('DOMContentLoaded', async () => {
    try {
        supabase = getSupabase();

        // Check authentication
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
            window.location.href = '/login.html';
            return;
        }
        currentUser = user;

        // Get exercise ID from URL
        const urlParams = new URLSearchParams(window.location.search);
        exerciseId = urlParams.get('id');

        if (!exerciseId) {
            showError();
            return;
        }

        // Setup event listeners
        setupEventListeners();

        // Load exercise data
        await loadExercise();

        // Show main content
        document.getElementById('page-loader').style.display = 'none';
        document.getElementById('main-content').style.display = 'block';

    } catch (error) {
        console.error('Error initializing exercise detail:', error);
        showError();
    }
});

function setupEventListeners() {
    // Back button
    document.getElementById('back-button').addEventListener('click', () => {
        if (document.referrer && document.referrer.includes(window.location.host)) {
            history.back();
        } else {
            window.location.href = '/dashboard.html#exercises';
        }
    });

    // Abbreviations toggle
    document.getElementById('toggle-abbreviations').addEventListener('click', () => {
        const content = document.getElementById('abbreviations-content');
        const icon = document.getElementById('abbreviations-icon');
        content.classList.toggle('hidden');
        icon.classList.toggle('rotate-90');
    });

    // Video upload button
    document.getElementById('upload-video-btn').addEventListener('click', () => {
        document.getElementById('video-exercise-id').value = exerciseId;
        document.getElementById('video-upload-modal').classList.remove('hidden');
    });

    // Close video upload modal
    document.getElementById('close-video-upload').addEventListener('click', () => {
        document.getElementById('video-upload-modal').classList.add('hidden');
    });

    // Video file input
    document.getElementById('video-file-input').addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
            const fileNameEl = document.getElementById('selected-file-name');
            fileNameEl.textContent = file.name;
            fileNameEl.classList.remove('hidden');
        }
    });

    // Video upload form
    document.getElementById('video-upload-form').addEventListener('submit', handleVideoUpload);

    // Animation play/pause
    document.getElementById('animation-play-pause').addEventListener('click', toggleAnimation);
}

async function loadExercise() {
    try {
        const { data: exercise, error } = await supabase
            .from('exercises')
            .select('*')
            .eq('id', exerciseId)
            .single();

        if (error || !exercise) {
            console.error('Error loading exercise:', error);
            showError();
            return;
        }

        // Render exercise content
        renderExercise(exercise);

        // Load user's milestone progress
        await loadMilestoneProgress(exercise);

        // Load example videos
        await loadExampleVideos();

        // Hide loading, show content
        document.getElementById('exercise-loading').classList.add('hidden');
        document.getElementById('exercise-content').classList.remove('hidden');

    } catch (error) {
        console.error('Error loading exercise:', error);
        showError();
    }
}

function renderExercise(exercise) {
    // Title
    const title = exercise.name || exercise.title || 'Übung';
    document.getElementById('page-title').textContent = title;
    document.getElementById('exercise-title').textContent = title;
    document.title = `${title} - SC Champions`;

    // Calculate and display max points
    const maxPoints = calculateMaxPoints(exercise);
    document.getElementById('exercise-points').textContent = `${maxPoints} XP`;

    // Tags
    const tagsContainer = document.getElementById('exercise-tags');
    const tags = exercise.tags || [];
    if (tags.length > 0) {
        tagsContainer.innerHTML = tags
            .map(tag => `<span class="inline-block bg-indigo-100 text-indigo-800 rounded-full px-3 py-1 text-sm font-medium">${escapeHtml(tag)}</span>`)
            .join('');
    }

    // Image
    if (exercise.image_url) {
        const imageContainer = document.getElementById('exercise-image-container');
        const imageEl = document.getElementById('exercise-image');
        imageEl.src = exercise.image_url;
        imageEl.alt = title;
        imageEl.onerror = () => { imageContainer.classList.add('hidden'); };
        imageContainer.classList.remove('hidden');
    }

    // Animation
    if (exercise.animation_steps) {
        setupAnimation(exercise.animation_steps);
    }

    // Description
    renderDescription(exercise);

    // Procedure
    renderProcedure(exercise);

    // Milestones
    renderMilestones(exercise);

    // Global Record
    if (exercise.record_holder_name && exercise.record_count) {
        const recordSection = document.getElementById('exercise-record-section');
        const recordInfo = document.getElementById('exercise-record-info');
        recordInfo.textContent = `${exercise.record_holder_name}${exercise.record_holder_club ? ` (${exercise.record_holder_club})` : ''} - ${exercise.record_count} ${exercise.unit || 'Wiederholungen'}`;
        recordSection.classList.remove('hidden');
    }
}

function calculateMaxPoints(exercise) {
    const tieredPoints = exercise.tiered_points || exercise.tieredPoints;
    if (tieredPoints && tieredPoints.enabled && tieredPoints.milestones) {
        return tieredPoints.milestones.reduce((sum, m) => sum + (m.points || 0), 0);
    }
    return exercise.xp_reward || exercise.points || 0;
}

function renderDescription(exercise) {
    const descriptionEl = document.getElementById('exercise-description');
    let descriptionContent = exercise.description_content || exercise.description;

    // Parse JSON if needed
    let descriptionData = null;
    try {
        if (typeof descriptionContent === 'string') {
            descriptionData = JSON.parse(descriptionContent);
        } else {
            descriptionData = descriptionContent;
        }
    } catch (e) {
        descriptionData = { type: 'text', text: descriptionContent || '' };
    }

    if (descriptionData && descriptionData.type === 'table') {
        const tableHtml = renderTableForDisplay(descriptionData.tableData);
        const additionalText = descriptionData.additionalText || '';
        descriptionEl.innerHTML = tableHtml + (additionalText ? `<p class="mt-4">${escapeHtml(additionalText)}</p>` : '');
    } else {
        descriptionEl.textContent = descriptionData?.text || exercise.description || '';
    }

    // Hide section if no content
    if (!descriptionEl.textContent.trim() && !descriptionEl.innerHTML.trim()) {
        document.getElementById('exercise-description-section').classList.add('hidden');
    }
}

function renderProcedure(exercise) {
    const procedure = exercise.procedure;
    if (!procedure || !Array.isArray(procedure) || procedure.length === 0) return;

    const procedureSection = document.getElementById('exercise-procedure-section');
    const procedureContainer = document.getElementById('exercise-procedure');

    procedureContainer.innerHTML = procedure
        .map((step, index) => `
            <div class="flex gap-3">
                <div class="flex-shrink-0 w-7 h-7 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center text-sm font-semibold">
                    ${index + 1}
                </div>
                <p class="text-gray-700 pt-0.5">${escapeHtml(step.text || step)}</p>
            </div>
        `)
        .join('');

    procedureSection.classList.remove('hidden');
}

function renderMilestones(exercise) {
    const tieredPoints = exercise.tiered_points || exercise.tieredPoints;
    if (!tieredPoints || !tieredPoints.enabled || !tieredPoints.milestones) return;

    const milestonesSection = document.getElementById('exercise-milestones-section');
    const milestonesContainer = document.getElementById('exercise-milestones');
    const unit = exercise.unit || 'Wiederholungen';

    milestonesContainer.innerHTML = tieredPoints.milestones
        .map((milestone, index) => {
            const count = milestone.count || milestone.completions || 0;
            const points = milestone.points || 0;
            return `
                <div class="milestone-item flex items-center justify-between p-3 rounded-lg milestone-pending" data-milestone-index="${index}" data-count="${count}">
                    <div class="flex items-center gap-3">
                        <i class="fas fa-circle text-xs"></i>
                        <span class="font-medium">${count} ${unit}</span>
                    </div>
                    <span class="text-sm font-semibold">${points} XP</span>
                </div>
            `;
        })
        .join('');

    milestonesSection.classList.remove('hidden');
}

async function loadMilestoneProgress(exercise) {
    const tieredPoints = exercise.tiered_points || exercise.tieredPoints;
    if (!tieredPoints || !tieredPoints.enabled || !currentUser) return;

    try {
        const { data: progress, error } = await supabase
            .from('exercise_milestones')
            .select('*')
            .eq('user_id', currentUser.id)
            .eq('exercise_id', exerciseId)
            .single();

        if (error && error.code !== 'PGRST116') {
            console.error('Error loading milestone progress:', error);
            return;
        }

        const currentCount = progress?.current_count || 0;
        const achievedMilestones = progress?.achieved_milestones || [];
        const unit = exercise.unit || 'Wiederholungen';

        // Update milestone display
        const milestoneItems = document.querySelectorAll('.milestone-item');
        let earnedPoints = 0;
        let nextMilestone = null;

        milestoneItems.forEach((item, index) => {
            const milestoneCount = parseInt(item.dataset.count);
            const milestone = tieredPoints.milestones[index];

            if (currentCount >= milestoneCount || achievedMilestones.includes(milestoneCount)) {
                item.classList.remove('milestone-pending', 'milestone-current');
                item.classList.add('milestone-achieved');
                item.querySelector('i').classList.replace('fa-circle', 'fa-check-circle');
                earnedPoints += milestone.points || 0;
            } else if (!nextMilestone) {
                item.classList.remove('milestone-pending', 'milestone-achieved');
                item.classList.add('milestone-current');
                item.querySelector('i').classList.replace('fa-circle', 'fa-bullseye');
                nextMilestone = milestone;
            }
        });

        // Show progress summary
        const summaryEl = document.getElementById('exercise-progress-summary');
        const totalPoints = calculateMaxPoints(exercise);
        summaryEl.innerHTML = `
            <div class="flex justify-between text-sm">
                <span class="text-gray-600">Dein Fortschritt: <strong class="text-gray-900">${currentCount} ${unit}</strong></span>
                <span class="text-indigo-600 font-semibold">${earnedPoints} / ${totalPoints} XP</span>
            </div>
        `;

    } catch (error) {
        console.error('Error loading milestone progress:', error);
    }
}

async function loadExampleVideos() {
    try {
        const { data: videos, error } = await supabase
            .from('training_videos')
            .select('id, title, video_url, thumbnail_url')
            .eq('exercise_id', exerciseId)
            .eq('is_example', true)
            .order('created_at', { ascending: false })
            .limit(5);

        if (error || !videos || videos.length === 0) return;

        const section = document.getElementById('example-videos-section');
        const list = document.getElementById('example-videos-list');

        list.innerHTML = videos
            .map(video => `
                <a href="${escapeHtml(video.video_url)}" target="_blank" class="flex items-center gap-3 p-3 rounded-lg hover:bg-gray-50 transition-colors">
                    <div class="w-16 h-12 bg-gray-200 rounded overflow-hidden flex-shrink-0">
                        ${video.thumbnail_url
                            ? `<img src="${escapeHtml(video.thumbnail_url)}" alt="" class="w-full h-full object-cover">`
                            : `<div class="w-full h-full flex items-center justify-center text-gray-400"><i class="fas fa-play"></i></div>`}
                    </div>
                    <span class="text-gray-700 font-medium truncate">${escapeHtml(video.title || 'Musterbeispiel')}</span>
                    <i class="fas fa-external-link-alt text-gray-400 ml-auto"></i>
                </a>
            `)
            .join('');

        section.classList.remove('hidden');

    } catch (error) {
        console.error('Error loading example videos:', error);
    }
}

function setupAnimation(animationSteps) {
    // Parse animation steps if needed
    let steps = animationSteps;
    if (typeof steps === 'string') {
        try {
            steps = JSON.parse(steps);
        } catch (e) {
            console.error('Error parsing animation steps:', e);
            return;
        }
    }

    if (!steps || !Array.isArray(steps) || steps.length === 0) return;

    const container = document.getElementById('exercise-animation-container');
    const canvas = document.getElementById('exercise-animation-canvas');

    // Initialize animation player if the module is available
    if (typeof window.TableTennisExerciseBuilder !== 'undefined') {
        try {
            animationPlayer = new window.TableTennisExerciseBuilder(canvas);
            animationPlayer.loadSteps(steps);
            animationPlayer.play();
            container.classList.remove('hidden');
        } catch (e) {
            console.error('Error initializing animation:', e);
        }
    } else {
        // Try to load the animation module dynamically
        import('./table-tennis-exercise-builder.js').then(module => {
            if (module.TableTennisExerciseBuilder) {
                animationPlayer = new module.TableTennisExerciseBuilder(canvas);
                animationPlayer.loadSteps(steps);
                animationPlayer.play();
                container.classList.remove('hidden');
            }
        }).catch(e => {
            console.warn('Animation module not available:', e);
        });
    }
}

function toggleAnimation() {
    if (!animationPlayer) return;

    const btn = document.getElementById('animation-play-pause');
    if (animationPlaying) {
        animationPlayer.pause();
        btn.innerHTML = '<i class="fas fa-play mr-2"></i>Abspielen';
    } else {
        animationPlayer.play();
        btn.innerHTML = '<i class="fas fa-pause mr-2"></i>Pause';
    }
    animationPlaying = !animationPlaying;
}

async function handleVideoUpload(e) {
    e.preventDefault();

    const fileInput = document.getElementById('video-file-input');
    const file = fileInput.files[0];
    if (!file) {
        alert('Bitte wähle eine Video-Datei aus.');
        return;
    }

    // Validate file size (100 MB max)
    if (file.size > 100 * 1024 * 1024) {
        alert('Die Datei ist zu groß. Maximale Größe: 100 MB');
        return;
    }

    const submitBtn = document.getElementById('submit-video-btn');
    const progressContainer = document.getElementById('upload-progress');
    const progressBar = document.getElementById('upload-progress-bar');
    const progressText = document.getElementById('upload-progress-text');

    submitBtn.disabled = true;
    progressContainer.classList.remove('hidden');

    try {
        // Generate unique filename
        const timestamp = Date.now();
        const fileExt = file.name.split('.').pop();
        const filePath = `${currentUser.id}/${exerciseId}/${timestamp}.${fileExt}`;

        // Upload to Supabase Storage
        progressText.textContent = 'Wird hochgeladen...';
        const { data: uploadData, error: uploadError } = await supabase.storage
            .from('training-videos')
            .upload(filePath, file, {
                cacheControl: '3600',
                upsert: false
            });

        if (uploadError) throw uploadError;

        progressBar.style.width = '70%';
        progressText.textContent = 'Video wird verarbeitet...';

        // Get public URL
        const { data: { publicUrl } } = supabase.storage
            .from('training-videos')
            .getPublicUrl(filePath);

        // Create database entry
        const title = document.getElementById('video-title').value.trim() || file.name;
        const notes = document.getElementById('video-notes').value.trim();

        const { error: dbError } = await supabase
            .from('training_videos')
            .insert({
                user_id: currentUser.id,
                exercise_id: exerciseId,
                title: title,
                notes: notes,
                video_url: publicUrl,
                status: 'pending'
            });

        if (dbError) throw dbError;

        progressBar.style.width = '100%';
        progressText.textContent = 'Erfolgreich hochgeladen!';

        // Reset form and close modal after delay
        setTimeout(() => {
            document.getElementById('video-upload-form').reset();
            document.getElementById('selected-file-name').classList.add('hidden');
            document.getElementById('video-upload-modal').classList.add('hidden');
            progressContainer.classList.add('hidden');
            progressBar.style.width = '0%';
            submitBtn.disabled = false;

            alert('Video wurde erfolgreich hochgeladen! Dein Coach wird es bald ansehen.');
        }, 1000);

    } catch (error) {
        console.error('Error uploading video:', error);
        progressText.textContent = 'Fehler beim Hochladen';
        progressBar.classList.add('bg-red-600');
        submitBtn.disabled = false;
        alert('Fehler beim Hochladen: ' + error.message);
    }
}

function showError() {
    document.getElementById('page-loader').style.display = 'none';
    document.getElementById('main-content').style.display = 'block';
    document.getElementById('exercise-loading').classList.add('hidden');
    document.getElementById('exercise-error').classList.remove('hidden');
}
