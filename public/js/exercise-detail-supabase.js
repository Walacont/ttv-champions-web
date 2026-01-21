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
let currentStepIndex = -1; // -1 means "show all steps", 0+ is individual step
let animationPlayer = null;
let isAnimating = false;
let stepAnimationFrame = null;
let showAllMode = true; // Start by showing all steps
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

    // Animation controls
    document.getElementById('animation-play-pause').addEventListener('click', toggleStepAnimation);
    document.getElementById('animation-prev-btn').addEventListener('click', () => goToStep(currentStepIndex - 1));
    document.getElementById('animation-next-btn').addEventListener('click', () => goToStep(currentStepIndex + 1));
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
            .maybeSingle();

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
    currentStepIndex = -1;
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
        currentStepIndex = -1;
        showAllMode = true;

        // Update animation player with new steps
        if (animationPlayer) {
            if (typeof animationPlayer.setHandedness === 'function') {
                animationPlayer.setHandedness(newHandedness);
            }
            if (typeof animationPlayer.setSteps === 'function') {
                animationPlayer.setSteps(animationSteps);
                updateStepDisplay();
                renderAllSteps();
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
