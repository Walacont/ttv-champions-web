// Exercise Detail Page - Supabase Version
// Zeigt die vollständigen Details einer Übung an

import { getSupabase } from './supabase-init.js';
import { renderTableForDisplay } from './tableEditor.js';
import { escapeHtml } from './utils/security.js';

let supabase = null;
let currentUser = null;
let currentUserData = null;
let exerciseId = null;

// Animation state
let animationSteps = [];
let currentStepIndex = 0; // 0+ is individual step, -1 means "show all steps"
let animationPlayer = null;
let isAnimating = false;
let stepAnimationFrame = null;
let showAllMode = false; // Start by showing first step
let availableHandedness = ['R-R']; // Available handedness modes
let currentHandedness = 'R-R'; // Current viewing mode

// Multiple animations support
let allAnimations = []; // Array of { handedness, steps, description }
let currentExercise = null; // Current exercise data for description switching

// Stroke types for display
const STROKE_TYPES = {
    A: 'Aufschlag',
    T: 'Topspin',
    K: 'Konter',
    B: 'Block',
    F: 'Flip',
    S: 'Smash',
    SCH: 'Schupf',
    U: 'Unterschnitt-Abwehr',
    OS: 'Oberschnitt',
    US: 'Unterschnitt',
    SS: 'Seitenschnitt'
};

const POSITIONS = {
    VH: 'Vorhand',
    RH: 'Rückhand',
    M: 'Mitte',
    FREI: 'Frei'
};

// Thumbnail-Generierung aus Video (erste Sekunde)
async function generateVideoThumbnail(videoFile, seekTime = 1) {
    return new Promise((resolve, reject) => {
        const video = document.createElement('video');
        video.preload = 'auto';
        video.muted = true;
        video.playsInline = true;

        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        let hasResolved = false;

        const captureThumbnail = () => {
            if (hasResolved) return;
            hasResolved = true;

            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            ctx.drawImage(video, 0, 0);

            canvas.toBlob((blob) => {
                URL.revokeObjectURL(video.src);
                if (blob) {
                    resolve(blob);
                } else {
                    reject(new Error('Thumbnail konnte nicht erstellt werden'));
                }
            }, 'image/jpeg', 0.8);
        };

        video.onloadedmetadata = () => {
            video.currentTime = Math.min(seekTime, video.duration * 0.1);
        };

        video.onseeked = captureThumbnail;

        video.onerror = () => {
            if (!hasResolved) {
                hasResolved = true;
                URL.revokeObjectURL(video.src);
                reject(new Error('Video konnte nicht geladen werden'));
            }
        };

        // Timeout nach 10 Sekunden
        setTimeout(() => {
            if (!hasResolved) {
                hasResolved = true;
                URL.revokeObjectURL(video.src);
                reject(new Error('Thumbnail Timeout'));
            }
        }, 10000);

        video.src = URL.createObjectURL(videoFile);
    });
}

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

        // Load user data for club_id and role (table is 'profiles', not 'users')
        const { data: userData, error: userError } = await supabase
            .from('profiles')
            .select('club_id, role')
            .eq('id', user.id)
            .single();

        if (userError) {
            console.error('Error loading user profile:', userError);
        }
        currentUserData = userData;
        console.log('User data loaded:', { club_id: userData?.club_id, role: userData?.role });

        // If user is a coach without club_id, try to find their club
        if (userData && !userData.club_id && (userData.role === 'coach' || userData.role === 'head_coach')) {
            console.log('Coach without club_id, searching for club...');

            // Try 1: Check clubs table for coach_id
            const { data: clubData1 } = await supabase
                .from('clubs')
                .select('id')
                .eq('coach_id', user.id)
                .maybeSingle();

            if (clubData1) {
                console.log('Found club via coach_id:', clubData1.id);
                currentUserData.club_id = clubData1.id;
            } else {
                // Try 2: Check if coach has uploaded any example videos and get club from there
                const { data: videoData } = await supabase
                    .from('exercise_example_videos')
                    .select('club_id')
                    .eq('uploaded_by', user.id)
                    .limit(1)
                    .maybeSingle();

                if (videoData?.club_id) {
                    console.log('Found club via uploaded videos:', videoData.club_id);
                    currentUserData.club_id = videoData.club_id;
                } else {
                    // For now, just log that no club was found
                    console.log('Could not find club for coach');
                }
            }
        }

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
    // Back button - always go back in history, fallback to exercises section
    document.getElementById('back-button').addEventListener('click', () => {
        // Check if we have history to go back to
        if (window.history.length > 1) {
            history.back();
        } else {
            // Fallback: go to exercises section based on user role
            const isCoach = currentUserData?.role === 'coach' || currentUserData?.role === 'head_coach';
            window.location.href = isCoach ? '/coach.html#exercises' : '/dashboard.html#exercises';
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

        // Coach-Feedback Option basierend auf Club-Mitgliedschaft anzeigen
        const coachFeedbackOption = document.getElementById('coach-feedback-option');
        const uploadInfoCoach = document.getElementById('upload-info-coach');
        const uploadInfoPrivate = document.getElementById('upload-info-private');
        const requestCoachCheckbox = document.getElementById('request-coach-feedback');

        if (currentUserData?.club_id) {
            // Spieler ist im Club - Coach-Option anzeigen
            coachFeedbackOption?.classList.remove('hidden');
            requestCoachCheckbox.checked = true;
            uploadInfoCoach?.classList.remove('hidden');
            uploadInfoPrivate?.classList.add('hidden');
        } else {
            // Spieler ohne Club - nur private Mediathek
            coachFeedbackOption?.classList.add('hidden');
            uploadInfoCoach?.classList.add('hidden');
            uploadInfoPrivate?.classList.remove('hidden');
        }

        document.getElementById('video-upload-modal').classList.remove('hidden');
    });

    // Close video upload modal
    document.getElementById('close-video-upload').addEventListener('click', () => {
        document.getElementById('video-upload-modal').classList.add('hidden');
    });

    // Coach Feedback Checkbox Toggle
    document.getElementById('request-coach-feedback')?.addEventListener('change', (e) => {
        const uploadInfoCoach = document.getElementById('upload-info-coach');
        const uploadInfoPrivate = document.getElementById('upload-info-private');

        if (e.target.checked) {
            uploadInfoCoach?.classList.remove('hidden');
            uploadInfoPrivate?.classList.add('hidden');
        } else {
            uploadInfoCoach?.classList.add('hidden');
            uploadInfoPrivate?.classList.remove('hidden');
        }
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

    // Animation controls - use both click and touchend for better mobile support
    const playPauseBtn = document.getElementById('animation-play-pause');
    const prevBtn = document.getElementById('animation-prev-btn');
    const nextBtn = document.getElementById('animation-next-btn');

    // Helper to handle both click and touch
    function addClickHandler(element, handler) {
        if (!element) return;
        element.addEventListener('click', (e) => {
            e.preventDefault();
            handler();
        });
    }

    addClickHandler(playPauseBtn, toggleStepAnimation);
    addClickHandler(prevBtn, () => goToStep(currentStepIndex - 1));
    addClickHandler(nextBtn, () => goToStep(currentStepIndex + 1));
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

        // Load player's own videos for this exercise
        await loadMyVideos();

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

    // Store exercise for later use (handedness switching)
    currentExercise = exercise;

    // Animation - support both new format (animations in animation_steps) and old format
    if (exercise.animation_steps) {
        const animData = typeof exercise.animation_steps === 'string'
            ? JSON.parse(exercise.animation_steps)
            : exercise.animation_steps;

        if (animData.animations && Array.isArray(animData.animations) && animData.animations.length > 0) {
            // New format: multiple animations with handedness stored in animation_steps.animations
            setupMultipleAnimations(animData.animations);
        } else {
            // Old format: single animation with steps array
            setupAnimation(exercise.animation_steps);
        }
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
        const tieredPts = exercise.tiered_points || exercise.tieredPoints;
        const recordUnit = exercise.unit || tieredPts?.unit || 'Wiederholungen';
        recordInfo.textContent = `${exercise.record_holder_name}${exercise.record_holder_club ? ` (${exercise.record_holder_club})` : ''} - ${exercise.record_count} ${recordUnit}`;
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
    const unit = exercise.unit || tieredPoints.unit || 'Wiederholungen';

    // Kumulative Punkte berechnen
    let cumulativePoints = 0;
    milestonesContainer.innerHTML = tieredPoints.milestones
        .map((milestone, index) => {
            const count = milestone.count || milestone.completions || 0;
            const points = milestone.points || 0;
            cumulativePoints += points; // Kumulativ addieren
            return `
                <div class="milestone-item flex items-center justify-between p-3 rounded-lg milestone-pending" data-milestone-index="${index}" data-count="${count}" data-cumulative-points="${cumulativePoints}">
                    <div class="flex items-center gap-3">
                        <i class="fas fa-circle text-xs"></i>
                        <span class="font-medium">${count} ${unit}</span>
                    </div>
                    <span class="text-sm font-semibold">${cumulativePoints} XP</span>
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
            .maybeSingle();

        if (error && error.code !== 'PGRST116') {
            console.error('Error loading milestone progress:', error);
            return;
        }

        const currentCount = progress?.current_count || 0;
        const achievedMilestones = progress?.achieved_milestones || [];
        const unit = exercise.unit || tieredPoints.unit || 'Wiederholungen';

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

        // Load detailed records from exercise_records table
        let detailedRecords = null;
        try {
            const { data: records } = await supabase.rpc('get_user_exercise_records', {
                p_user_id: currentUser.id,
                p_exercise_id: exerciseId
            });
            detailedRecords = records;
        } catch (rpcErr) {
            console.warn('[ExerciseDetail] RPC get_user_exercise_records not available');
        }

        // Show personal record if any
        if (currentCount > 0 || (detailedRecords && detailedRecords.length > 0)) {
            renderPersonalRecord(exercise, progress, detailedRecords);
        }

    } catch (error) {
        console.error('Error loading milestone progress:', error);
    }
}

/**
 * Rendert den persönlichen Rekord des Benutzers
 */
function renderPersonalRecord(exercise, progress, detailedRecords = null) {
    const recordSection = document.getElementById('exercise-personal-record-section');
    const recordContent = document.getElementById('exercise-personal-record-content');

    if (!recordSection || !recordContent) return;

    const tieredPoints = exercise.tiered_points || exercise.tieredPoints;
    const unit = exercise.unit || tieredPoints?.unit || 'Wiederholungen';
    const timeDirection = exercise.time_direction || tieredPoints?.time_direction;
    const currentCount = progress?.current_count || 0;
    const updatedAt = progress?.updated_at ? new Date(progress.updated_at) : new Date();

    // Format date
    const dateStr = updatedAt.toLocaleDateString('de-DE', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
    });

    let recordHtml = '';

    // Format based on unit type
    if (unit === 'Zeit') {
        const hours = Math.floor(currentCount / 3600);
        const minutes = Math.floor((currentCount % 3600) / 60);
        const seconds = currentCount % 60;
        const timeStr = hours > 0
            ? `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
            : `${minutes}:${seconds.toString().padStart(2, '0')}`;
        const directionText = timeDirection === 'faster' ? '(schneller ist besser)' : '(länger ist besser)';

        recordHtml = `
            <div class="flex items-center gap-2 text-indigo-700">
                <i class="fas fa-stopwatch"></i>
                <span><strong>${timeStr}</strong> ${directionText}</span>
                <span class="text-indigo-500 text-xs">am ${dateStr}</span>
            </div>
        `;
    } else {
        recordHtml = `
            <div class="flex items-center gap-2 text-indigo-700">
                <i class="fas fa-star"></i>
                <span><strong>${currentCount}</strong> ${unit}</span>
                <span class="text-indigo-500 text-xs">am ${dateStr}</span>
            </div>
        `;
    }

    // Check if we have detailed records from exercise_records table
    if (detailedRecords && detailedRecords.length > 0) {
        // Extended record display with partner info
        recordHtml = '';

        // Separate pair and solo records
        const pairRecords = detailedRecords.filter(r => r.play_mode === 'pair' && r.partner_name);
        const soloRecords = detailedRecords.filter(r => r.play_mode === 'solo' || !r.partner_name);

        // Show pair records
        pairRecords.forEach(pr => {
            const prDate = new Date(pr.achieved_at).toLocaleDateString('de-DE', {
                day: '2-digit',
                month: '2-digit',
                year: 'numeric'
            });
            recordHtml += `
                <div class="flex items-center gap-2 text-indigo-700">
                    <i class="fas fa-user-friends text-indigo-500"></i>
                    <span>mit <strong>${pr.partner_name}</strong>: ${formatRecordValue(pr.record_value, unit, timeDirection)}</span>
                    <span class="text-indigo-500 text-xs">am ${prDate}</span>
                </div>
            `;
        });

        // Show best solo record
        if (soloRecords.length > 0) {
            const bestSolo = soloRecords[0]; // Already sorted by record_value DESC
            const soloDate = new Date(bestSolo.achieved_at).toLocaleDateString('de-DE', {
                day: '2-digit',
                month: '2-digit',
                year: 'numeric'
            });
            recordHtml += `
                <div class="flex items-center gap-2 text-indigo-700">
                    <i class="fas fa-robot text-indigo-500"></i>
                    <span>Balleimer: <strong>${formatRecordValue(bestSolo.record_value, unit, timeDirection)}</strong></span>
                    <span class="text-indigo-500 text-xs">am ${soloDate}</span>
                </div>
            `;
        }
    }

    recordContent.innerHTML = recordHtml;
    recordSection.classList.remove('hidden');
}

/**
 * Formatiert einen Rekordwert basierend auf der Einheit
 */
function formatRecordValue(count, unit, timeDirection) {
    if (unit === 'Zeit') {
        const hours = Math.floor(count / 3600);
        const minutes = Math.floor((count % 3600) / 60);
        const seconds = count % 60;
        return hours > 0
            ? `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
            : `${minutes}:${seconds.toString().padStart(2, '0')}`;
    }
    return `${count} ${unit}`;
}

/**
 * Rendert eine YouTube-Musterbeispiel-Karte mit DSGVO-konformem Two-Click-Embedding.
 * Zeigt erst ein Vorschaubild + Play-Button. Erst bei Klick wird der YouTube-iFrame geladen.
 */
function renderYouTubeExampleCard(video) {
    const ytId = escapeHtml(video.youtube_id);
    const title = escapeHtml(video.title || 'YouTube Musterbeispiel');
    // Thumbnail von YouTube (mqdefault = 320x180, gute Qualität)
    const thumbUrl = `https://img.youtube.com/vi/${ytId}/mqdefault.jpg`;

    return `
        <div class="rounded-lg overflow-hidden border border-gray-200 bg-white">
            <div class="youtube-embed-container" style="position:relative; aspect-ratio:16/9;">
                <div class="youtube-two-click cursor-pointer w-full h-full relative group"
                     data-youtube-id="${ytId}">
                    <img src="${thumbUrl}" alt="${title}"
                         class="w-full h-full object-cover" loading="lazy">
                    <!-- Play-Button Overlay -->
                    <div class="absolute inset-0 flex items-center justify-center bg-black/20 group-hover:bg-black/30 transition-colors">
                        <div class="w-14 h-10 bg-red-600 rounded-xl flex items-center justify-center shadow-lg group-hover:bg-red-700 transition-colors">
                            <svg class="w-5 h-5 text-white ml-0.5" fill="currentColor" viewBox="0 0 24 24">
                                <path d="M8 5v14l11-7z"/>
                            </svg>
                        </div>
                    </div>
                    <!-- DSGVO-Hinweis -->
                    <div class="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent p-2 pt-6">
                        <p class="text-white text-[10px] leading-tight opacity-80">
                            Klicke zum Laden. Es werden Daten an YouTube (Google) übermittelt.
                        </p>
                    </div>
                </div>
            </div>
            <div class="px-3 py-2 flex items-center gap-2">
                <i class="fab fa-youtube text-red-600 text-sm"></i>
                <span class="text-gray-700 text-sm font-medium truncate">${title}</span>
            </div>
        </div>`;
}

async function loadExampleVideos() {
    try {
        const clubId = currentUserData?.club_id;
        console.log('Loading example videos for exercise:', exerciseId, 'club:', clubId);

        // Mustervideos nur fuer Benutzer in einem Club anzeigen
        if (!clubId) {
            console.log('No club_id, skipping example videos');
            return;
        }

        let videos = [];

        // Load club-linked example videos via RPC
        const { data: rpcVideos, error: rpcError } = await supabase.rpc('get_exercise_example_videos', {
            p_exercise_id: exerciseId,
            p_club_id: clubId
        });

        console.log('RPC result:', { rpcVideos, rpcError });

        if (!rpcError && rpcVideos && rpcVideos.length > 0) {
            videos = rpcVideos;
        } else if (rpcError) {
            console.warn('RPC error, trying direct query:', rpcError);

            // Fallback: direct query to exercise_example_videos table
            const { data: directVideos, error: directError } = await supabase
                .from('exercise_example_videos')
                .select('*')
                .eq('exercise_id', exerciseId)
                .eq('club_id', clubId);

            if (!directError && directVideos && directVideos.length > 0) {
                videos = directVideos;
            }
            console.log('Direct query result:', { directVideos, directError });
        }

        console.log('Final videos:', videos);

        if (videos.length === 0) {
            console.log('No example videos found');
            return;
        }

        const section = document.getElementById('example-videos-section');
        const list = document.getElementById('example-videos-list');

        list.innerHTML = videos
            .map(video => {
                if (video.source_type === 'youtube' && video.youtube_id) {
                    // YouTube: DSGVO-konformes Two-Click-Embedding
                    return renderYouTubeExampleCard(video);
                }
                // Upload: Bestehende Logik (Link zum Video)
                return `
                <a href="${escapeHtml(video.video_url)}" target="_blank" class="flex items-center gap-3 p-3 rounded-lg hover:bg-gray-50 transition-colors">
                    <div class="w-16 h-12 bg-gray-200 rounded overflow-hidden flex-shrink-0">
                        ${video.thumbnail_url
                            ? `<img src="${escapeHtml(video.thumbnail_url)}" alt="" class="w-full h-full object-cover">`
                            : `<div class="w-full h-full flex items-center justify-center text-gray-400"><i class="fas fa-play"></i></div>`}
                    </div>
                    <span class="text-gray-700 font-medium truncate">${escapeHtml(video.title || 'Musterbeispiel')}</span>
                    <i class="fas fa-external-link-alt text-gray-400 ml-auto"></i>
                </a>`;
            })
            .join('');

        // YouTube Two-Click Handler initialisieren
        list.querySelectorAll('.youtube-two-click').forEach(el => {
            el.addEventListener('click', () => {
                const ytId = el.dataset.youtubeId;
                const container = el.closest('.youtube-embed-container');
                if (container && ytId) {
                    container.innerHTML = `
                        <iframe
                            width="100%"
                            height="100%"
                            src="https://www.youtube-nocookie.com/embed/${ytId}?autoplay=1"
                            title="YouTube Video"
                            frameborder="0"
                            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                            allowfullscreen
                            class="rounded-lg">
                        </iframe>`;
                }
            });
        });

        section.classList.remove('hidden');

    } catch (error) {
        console.error('Error loading example videos:', error);
    }
}

/**
 * Lädt Videos des aktuellen Spielers zu dieser Übung
 * (eigene uploads + vom Coach zugewiesene Videos)
 */
async function loadMyVideos() {
    if (!currentUser || !exerciseId) return;

    try {
        // 1. Eigene Videos für diese Übung laden
        const { data: ownVideos, error: ownError } = await supabase
            .from('video_analyses')
            .select('id, title, video_url, thumbnail_url, created_at, status:video_assignments(status)')
            .eq('uploaded_by', currentUser.id)
            .eq('exercise_id', exerciseId)
            .order('created_at', { ascending: false });

        if (ownError) {
            console.error('Fehler beim Laden eigener Videos:', ownError);
        }

        // 2. Vom Coach zugewiesene Videos laden (die nicht von mir sind)
        let assignedVideos = [];
        if (currentUserData?.club_id) {
            const { data: assignments, error: assignError } = await supabase
                .from('video_assignments')
                .select(`
                    id,
                    status,
                    video:video_analyses(id, title, video_url, thumbnail_url, created_at, exercise_id, uploaded_by)
                `)
                .eq('player_id', currentUser.id)
                .eq('club_id', currentUserData.club_id);

            if (assignError) {
                console.error('Fehler beim Laden zugewiesener Videos:', assignError);
            } else if (assignments) {
                // Nur Videos für diese Übung filtern (die nicht von mir sind)
                assignedVideos = assignments
                    .filter(a => a.video && a.video.exercise_id === exerciseId && a.video.uploaded_by !== currentUser.id)
                    .map(a => ({
                        ...a.video,
                        assignment_status: a.status,
                        is_assigned: true
                    }));
            }
        }

        // Alle Videos kombinieren
        const allVideos = [
            ...(ownVideos || []).map(v => ({ ...v, is_own: true })),
            ...assignedVideos
        ];

        // Duplikate entfernen (nach video id)
        const uniqueVideos = allVideos.filter((v, i, self) =>
            i === self.findIndex(t => t.id === v.id)
        );

        const section = document.getElementById('my-videos-section');
        const list = document.getElementById('my-videos-list');

        if (!uniqueVideos || uniqueVideos.length === 0) {
            section?.classList.add('hidden');
            return;
        }

        section?.classList.remove('hidden');
        list.innerHTML = uniqueVideos.map(video => {
            const statusBadge = video.is_assigned
                ? `<span class="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">Vom Coach</span>`
                : video.is_own
                    ? `<span class="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full">Mein Video</span>`
                    : '';

            const feedbackBadge = video.assignment_status === 'completed'
                ? `<span class="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full"><i class="fas fa-check mr-1"></i>Feedback erhalten</span>`
                : video.assignment_status === 'pending'
                    ? `<span class="text-xs bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded-full"><i class="fas fa-clock mr-1"></i>Wartet auf Feedback</span>`
                    : '';

            return `
                <a href="${escapeHtml(video.video_url)}" target="_blank" class="flex items-center gap-3 p-3 rounded-lg hover:bg-gray-50 transition-colors border border-gray-100">
                    <div class="w-20 h-14 bg-gray-200 rounded overflow-hidden flex-shrink-0">
                        ${video.thumbnail_url
                            ? `<img src="${escapeHtml(video.thumbnail_url)}" alt="" class="w-full h-full object-cover">`
                            : `<div class="w-full h-full flex items-center justify-center text-gray-400"><i class="fas fa-play"></i></div>`}
                    </div>
                    <div class="flex-1 min-w-0">
                        <span class="text-gray-700 font-medium truncate block">${escapeHtml(video.title || 'Video')}</span>
                        <div class="flex flex-wrap gap-1 mt-1">
                            ${statusBadge}
                            ${feedbackBadge}
                        </div>
                    </div>
                    <i class="fas fa-external-link-alt text-gray-400 flex-shrink-0"></i>
                </a>
            `;
        }).join('');

    } catch (error) {
        console.error('Error loading my videos:', error);
    }
}

function setupAnimation(rawSteps) {
    // Parse animation steps if needed
    let data = rawSteps;
    if (typeof data === 'string') {
        try {
            data = JSON.parse(data);
        } catch (e) {
            console.error('Error parsing animation steps:', e);
            return;
        }
    }

    // Handle both formats: { steps: [...] } and direct array [...]
    let steps = Array.isArray(data) ? data : (data?.steps || []);

    if (!steps || steps.length === 0) return;

    // Store steps and handedness info
    animationSteps = steps;
    availableHandedness = data?.handedness || ['R-R'];
    currentHandedness = availableHandedness[0] || 'R-R';
    currentStepIndex = -1; // Start in "show all" mode
    showAllMode = true;

    const container = document.getElementById('exercise-animation-container');
    const canvas = document.getElementById('exercise-animation-canvas');
    const handednessSelector = document.getElementById('animation-handedness-selector');
    const handednessSelect = document.getElementById('animation-handedness-select');

    // Setup handedness dropdown if multiple options available
    setupHandednessDropdown(handednessSelector, handednessSelect);

    // Initialize animation player
    const initPlayer = (PlayerClass) => {
        try {
            // Show container FIRST so canvas has dimensions
            container.classList.remove('hidden');

            // Small delay to ensure DOM has updated dimensions
            requestAnimationFrame(() => {
                // Create player with canvas element
                animationPlayer = new PlayerClass(canvas.id);
                animationPlayer.loopAnimation = false;

                // Set handedness for correct VH/RH positions
                if (typeof animationPlayer.setHandedness === 'function') {
                    animationPlayer.setHandedness(currentHandedness);
                }

                // Pass the steps to the player
                animationPlayer.setSteps(animationSteps);

                // Update display and render all steps initially
                updateStepDisplay();
                renderAllSteps();
            });
        } catch (e) {
            console.error('Error initializing animation:', e);
        }
    };

    if (typeof window.TableTennisExerciseBuilder !== 'undefined') {
        initPlayer(window.TableTennisExerciseBuilder);
    } else {
        // Try to load the animation module dynamically
        const script = document.createElement('script');
        script.src = '/js/table-tennis-exercise-builder.js';
        script.onload = () => {
            if (window.TableTennisExerciseBuilder) {
                initPlayer(window.TableTennisExerciseBuilder);
            }
        };
        document.head.appendChild(script);
    }
}

// Setup multiple animations (new format with handedness-specific animations)
function setupMultipleAnimations(animations) {
    if (!animations || animations.length === 0) return;

    // Store all animations
    allAnimations = animations;

    // Get available handedness options from animations
    availableHandedness = animations.map(a => a.handedness);
    currentHandedness = availableHandedness[0] || 'R-R';

    // Get the first animation
    const firstAnimation = animations[0];
    animationSteps = firstAnimation.steps || [];
    currentStepIndex = -1; // Start in "show all" mode
    showAllMode = true;

    const container = document.getElementById('exercise-animation-container');
    const canvas = document.getElementById('exercise-animation-canvas');
    const handednessSelector = document.getElementById('animation-handedness-selector');
    const handednessSelect = document.getElementById('animation-handedness-select');

    // Setup handedness dropdown
    setupHandednessDropdown(handednessSelector, handednessSelect);

    // Render initial description from first animation if available
    if (firstAnimation.description) {
        // Delay slightly to ensure DOM is ready
        setTimeout(() => renderDescriptionFromData(firstAnimation.description), 0);
    }

    // Initialize animation player
    const initPlayer = (PlayerClass) => {
        try {
            container.classList.remove('hidden');

            requestAnimationFrame(() => {
                animationPlayer = new PlayerClass(canvas.id);
                animationPlayer.loopAnimation = false;
                // Set handedness so VH/RH positions are correct for left/right-handers
                if (typeof animationPlayer.setHandedness === 'function') {
                    animationPlayer.setHandedness(currentHandedness);
                }
                animationPlayer.setSteps(animationSteps);
                updateStepDisplay();
                renderAllSteps();
            });
        } catch (e) {
            console.error('Error initializing animation:', e);
        }
    };

    if (typeof window.TableTennisExerciseBuilder !== 'undefined') {
        initPlayer(window.TableTennisExerciseBuilder);
    } else {
        const script = document.createElement('script');
        script.src = '/js/table-tennis-exercise-builder.js';
        script.onload = () => {
            if (window.TableTennisExerciseBuilder) {
                initPlayer(window.TableTennisExerciseBuilder);
            }
        };
        document.head.appendChild(script);
    }
}

function setupHandednessDropdown(selectorContainer, selectElement) {
    if (!selectorContainer || !selectElement) return;

    // Only show dropdown if there are multiple handedness options available
    if (availableHandedness.length <= 1) {
        selectorContainer.classList.add('hidden');
        return;
    }

    // Clear existing options
    selectElement.innerHTML = '';

    // Build available options
    const handednessLabels = {
        'R-R': 'Rechts vs Rechts (R-R)',
        'L-L': 'Links vs Links (L-L)',
        'R-L': 'Rechts vs Links (R-L)',
        'L-R': 'Links vs Rechts (L-R)'
    };

    // Add options that are explicitly available
    availableHandedness.forEach(h => {
        const option = document.createElement('option');
        option.value = h;
        option.textContent = handednessLabels[h] || h;
        selectElement.appendChild(option);
    });

    // Set default value
    selectElement.value = currentHandedness;

    // Show selector
    selectorContainer.classList.remove('hidden');

    // Add change listener
    selectElement.addEventListener('change', (e) => {
        changeHandedness(e.target.value);
    });
}

function changeHandedness(newHandedness) {
    currentHandedness = newHandedness;

    // Find animation for this handedness (new format with multiple animations)
    const animation = allAnimations.find(a => a.handedness === newHandedness);

    if (animation) {
        // New format: different steps and description for each handedness
        animationSteps = animation.steps || [];
        currentStepIndex = 0; // Start at first step
        showAllMode = false;

        // Update animation player with new steps
        if (animationPlayer) {
            if (typeof animationPlayer.setHandedness === 'function') {
                animationPlayer.setHandedness(newHandedness);
            }
            if (typeof animationPlayer.setSteps === 'function') {
                animationPlayer.setSteps(animationSteps);
                updateStepDisplay();
                renderCurrentStep();
            }
        }

        // Update description from animation
        if (animation.description) {
            renderDescriptionFromData(animation.description);
        } else if (currentExercise) {
            renderDescription(currentExercise);
        }
    } else {
        // Old format: same steps for all handedness, just change display
        // Only update the handedness setting on the player (affects VH/RH positions)
        if (animationPlayer) {
            if (typeof animationPlayer.setHandedness === 'function') {
                animationPlayer.setHandedness(newHandedness);
            }
            // Redraw with new handedness positions
            updateStepDisplay();
            renderAllSteps();
        }
    }
}

// Render description from provided data object
function renderDescriptionFromData(descriptionData) {
    const descriptionEl = document.getElementById('exercise-description');

    if (descriptionData && descriptionData.type === 'table') {
        const tableHtml = renderTableForDisplay(descriptionData.tableData);
        const additionalText = descriptionData.additionalText || '';
        descriptionEl.innerHTML = tableHtml + (additionalText ? `<p class="mt-4">${escapeHtml(additionalText)}</p>` : '');
    } else if (descriptionData && descriptionData.type === 'text') {
        descriptionEl.textContent = descriptionData.text || '';
    } else if (typeof descriptionData === 'string') {
        descriptionEl.textContent = descriptionData;
    }
}

function updateStepDisplay() {
    const stepInfoEl = document.getElementById('animation-step-info');

    if (showAllMode) {
        // Show "all steps" mode
        document.getElementById('animation-step-counter').textContent =
            `Alle ${animationSteps.length} Schritte`;

        // Hide step info when showing all
        stepInfoEl.classList.add('hidden');

        // Update button states
        document.getElementById('animation-prev-btn').disabled = true;
        document.getElementById('animation-next-btn').disabled = animationSteps.length === 0;
    } else {
        const step = animationSteps[currentStepIndex];
        if (!step) return;

        // Update counter
        document.getElementById('animation-step-counter').textContent =
            `Schritt ${currentStepIndex + 1} / ${animationSteps.length}`;

        // Show step info
        stepInfoEl.classList.remove('hidden');

        // Update step info
        const playerLabel = step.player === 'A' ? 'Spieler' : 'Gegner';
        const strokeName = STROKE_TYPES[step.strokeType] || step.strokeType || 'Schlag';
        const positionName = POSITIONS[step.toPosition] || step.toPosition || 'Position';

        document.getElementById('animation-step-player').textContent = playerLabel;
        document.getElementById('animation-step-stroke').textContent = strokeName;
        document.getElementById('animation-step-position').textContent = positionName;

        // Update button states: prev goes back to "all" mode when at step 0
        document.getElementById('animation-prev-btn').disabled = false;
        document.getElementById('animation-next-btn').disabled = currentStepIndex === animationSteps.length - 1;
    }
}

function renderAllSteps() {
    if (!animationPlayer || animationSteps.length === 0) return;

    // Stop any ongoing animation
    if (stepAnimationFrame) {
        cancelAnimationFrame(stepAnimationFrame);
        stepAnimationFrame = null;
    }
    isAnimating = false;

    // Use the player's showAllSteps method to display all steps at once
    animationPlayer.showAllSteps();

    // Update play button state
    updatePlayButton(false);
}

function renderCurrentStep() {
    console.log('renderCurrentStep called, showAllMode:', showAllMode, 'currentStepIndex:', currentStepIndex);

    if (!animationPlayer || animationSteps.length === 0) {
        console.log('renderCurrentStep: No player or no steps');
        return;
    }

    // Stop any ongoing animation
    if (stepAnimationFrame) {
        cancelAnimationFrame(stepAnimationFrame);
        stepAnimationFrame = null;
    }
    isAnimating = false;

    if (showAllMode) {
        console.log('renderCurrentStep: Showing all steps');
        renderAllSteps();
        return;
    }

    // Get current step and previous step for context
    const currentStep = animationSteps[currentStepIndex];
    const previousStep = currentStepIndex > 0 ? animationSteps[currentStepIndex - 1] : null;

    console.log('renderCurrentStep: Showing single step', currentStepIndex, currentStep);

    // Use showStepStatic for cleaner single step display
    animationPlayer.showStepStatic(currentStepIndex);

    // Update play button state
    updatePlayButton(false);
}

function animateCurrentStep() {
    if (!animationPlayer || animationSteps.length === 0 || isAnimating) return;

    if (showAllMode) {
        // In "show all" mode, play the full animation sequence
        isAnimating = true;
        animationPlayer.loopAnimation = true;
        animationPlayer.play();
        updatePlayButton(true);
        return;
    }

    isAnimating = true;
    const currentStep = animationSteps[currentStepIndex];
    const previousStep = currentStepIndex > 0 ? animationSteps[currentStepIndex - 1] : null;

    let progress = 0;
    const duration = 800; // Animation duration in ms
    const startTime = performance.now();

    const animate = (timestamp) => {
        progress = Math.min((timestamp - startTime) / duration, 1);

        // Redraw
        animationPlayer.drawTable();
        animationPlayer.drawStep(currentStep, progress, previousStep);

        if (progress < 1) {
            stepAnimationFrame = requestAnimationFrame(animate);
        } else {
            isAnimating = false;
            stepAnimationFrame = null;
            updatePlayButton(false);
        }
    };

    updatePlayButton(true);
    stepAnimationFrame = requestAnimationFrame(animate);
}

function updatePlayButton(playing) {
    const icon = document.getElementById('animation-play-icon');
    const text = document.getElementById('animation-play-text');

    if (playing) {
        icon.classList.remove('fa-play');
        icon.classList.add('fa-redo');
        text.textContent = 'Animation';
    } else {
        icon.classList.remove('fa-redo');
        icon.classList.add('fa-play');
        text.textContent = 'Abspielen';
    }
}

function toggleStepAnimation() {
    if (isAnimating) {
        // Stop animation
        if (stepAnimationFrame) {
            cancelAnimationFrame(stepAnimationFrame);
            stepAnimationFrame = null;
        }
        if (animationPlayer) {
            animationPlayer.pause();
        }
        isAnimating = false;
        renderCurrentStep();
    } else {
        // Start animation for current step
        animateCurrentStep();
    }
}

function goToStep(index) {
    console.log('goToStep called with index:', index, 'current showAllMode:', showAllMode, 'current step:', currentStepIndex);

    // Stop any ongoing animation
    if (stepAnimationFrame) {
        cancelAnimationFrame(stepAnimationFrame);
        stepAnimationFrame = null;
    }
    isAnimating = false;

    if (showAllMode) {
        // We're in "show all" mode, pressing next goes to step 0
        console.log('goToStep: Was in showAllMode, switching to step 0');
        showAllMode = false;
        currentStepIndex = 0;
    } else if (index < 0) {
        // Going before step 0 returns to "show all" mode
        console.log('goToStep: Going back to showAllMode');
        showAllMode = true;
        currentStepIndex = -1;
    } else if (index >= animationSteps.length) {
        // Can't go past last step
        console.log('goToStep: Cannot go past last step');
        return;
    } else {
        console.log('goToStep: Setting currentStepIndex to', index);
        currentStepIndex = index;
    }

    console.log('goToStep: After update - showAllMode:', showAllMode, 'currentStepIndex:', currentStepIndex);
    updateStepDisplay();
    renderCurrentStep();
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
        const timestamp = Date.now();
        const fileExt = file.name.split('.').pop();
        const filePath = `${currentUser.id}/${exerciseId}/${timestamp}.${fileExt}`;

        // 1. Thumbnail generieren (0-10%)
        progressText.textContent = 'Thumbnail wird erstellt...';
        progressBar.style.width = '5%';
        let thumbnailUrl = null;

        try {
            const thumbnailBlob = await generateVideoThumbnail(file);
            const thumbFileName = `${currentUser.id}/${exerciseId}/${timestamp}_thumb.jpg`;

            progressText.textContent = 'Thumbnail wird hochgeladen...';
            progressBar.style.width = '10%';

            const { error: thumbError } = await supabase.storage
                .from('training-videos')
                .upload(thumbFileName, thumbnailBlob, {
                    contentType: 'image/jpeg',
                    upsert: false,
                });

            if (!thumbError) {
                const { data: thumbUrlData } = supabase.storage
                    .from('training-videos')
                    .getPublicUrl(thumbFileName);
                thumbnailUrl = thumbUrlData.publicUrl;
            }
        } catch (thumbErr) {
            console.warn('Thumbnail-Generierung fehlgeschlagen:', thumbErr);
        }

        // 2. Video hochladen (10-70%)
        progressText.textContent = 'Video wird hochgeladen...';
        progressBar.style.width = '15%';

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

        // 3. Datenbank-Eintrag erstellen (70-90%)
        const title = document.getElementById('video-title').value.trim() || file.name;
        const notes = document.getElementById('video-notes').value.trim();

        const requestCoachFeedback = document.getElementById('request-coach-feedback')?.checked ?? false;
        const allowAiTraining = document.getElementById('allow-ai-training')?.checked ?? false;
        const isInClub = !!currentUserData?.club_id;

        progressBar.style.width = '80%';
        progressText.textContent = 'Speichere in Datenbank...';

        const { data: insertedVideo, error: dbError } = await supabase
            .from('video_analyses')
            .insert({
                uploaded_by: currentUser.id,
                exercise_id: exerciseId,
                title: title,
                video_url: publicUrl,
                thumbnail_url: thumbnailUrl,
                allow_ai_training: allowAiTraining,
                club_id: isInClub ? currentUserData.club_id : null
            })
            .select()
            .single();

        if (dbError) throw dbError;

        // Wenn Coach-Feedback angefragt, Video-Assignment erstellen
        if (isInClub && requestCoachFeedback && insertedVideo?.id) {
            const { error: assignError } = await supabase
                .from('video_assignments')
                .insert({
                    video_id: insertedVideo.id,
                    player_id: currentUser.id,
                    club_id: currentUserData.club_id,
                    status: 'pending'
                });

            if (assignError) {
                console.error('Fehler bei Coach-Zuweisung:', assignError);
            }
        }

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

            // Nachricht basierend auf Optionen erstellen
            const coachRequested = isInClub && requestCoachFeedback;

            if (coachRequested && allowAiTraining) {
                alert('Video wurde hochgeladen und an deinen Coach gesendet! Zusätzlich wird es für die KI-Verbesserung genutzt.');
            } else if (coachRequested) {
                alert('Video wurde erfolgreich hochgeladen! Dein Coach wird es bald ansehen.');
            } else if (allowAiTraining) {
                alert('Video wurde hochgeladen und wird für die KI-Verbesserung genutzt.');
            } else {
                alert('Video wurde in deiner persönlichen Mediathek gespeichert.');
            }
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
