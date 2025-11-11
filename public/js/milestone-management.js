/**
 * Milestone Management Module
 * Handles tiered points system for exercises and challenges
 */

// ========================================================================
// ===== MILESTONE UI MANAGEMENT =====
// ========================================================================

/**
 * Initialize milestone UI for exercises
 */
export function initializeExerciseMilestones() {
  const toggle = document.getElementById('exercise-tiered-points-toggle');
  const container = document.getElementById('exercise-milestones-container');
  const addBtn = document.getElementById('add-exercise-milestone-btn');

  if (!toggle || !container || !addBtn) return;

  // Toggle visibility
  toggle.addEventListener('change', () => {
    if (toggle.checked) {
      container.classList.remove('hidden');
      // Add initial milestone if none exist
      const list = document.getElementById('exercise-milestones-list');
      if (list && list.children.length === 0) {
        addExerciseMilestone(1, 3); // Default: 1× = 3 points
      }
    } else {
      container.classList.add('hidden');
      clearMilestones('exercise-milestones-list');
    }
  });

  // Add milestone button
  addBtn.addEventListener('click', () => {
    const list = document.getElementById('exercise-milestones-list');
    const count = list ? list.children.length + 1 : 1;
    addExerciseMilestone(count, 0);
  });
}

/**
 * Initialize milestone UI for challenges
 */
export function initializeChallengeMilestones() {
  const toggle = document.getElementById('challenge-tiered-points-toggle');
  const container = document.getElementById('challenge-milestones-container');
  const addBtn = document.getElementById('add-challenge-milestone-btn');

  if (!toggle || !container || !addBtn) return;

  // Toggle visibility
  toggle.addEventListener('change', () => {
    if (toggle.checked) {
      container.classList.remove('hidden');
      // Add initial milestone if none exist
      const list = document.getElementById('challenge-milestones-list');
      if (list && list.children.length === 0) {
        addChallengeMilestone(1, 3); // Default: 1× = 3 points
      }
    } else {
      container.classList.add('hidden');
      clearMilestones('challenge-milestones-list');
    }
  });

  // Add milestone button
  addBtn.addEventListener('click', () => {
    const list = document.getElementById('challenge-milestones-list');
    const count = list ? list.children.length + 1 : 1;
    addChallengeMilestone(count, 0);
  });
}

/**
 * Add a milestone input field for exercises
 * @param {number} completions - Number of completions required
 * @param {number} points - Points awarded
 */
function addExerciseMilestone(completions = 1, points = 0) {
  const list = document.getElementById('exercise-milestones-list');
  if (!list) return;

  const milestoneDiv = document.createElement('div');
  milestoneDiv.className = 'flex items-center gap-3 bg-white p-3 rounded border border-indigo-200';
  milestoneDiv.innerHTML = `
    <div class="flex items-center gap-2 flex-1">
      <span class="text-sm text-gray-700 font-medium whitespace-nowrap">Bei</span>
      <input type="number"
             class="milestone-completions w-16 px-2 py-1.5 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
             value="${completions}"
             min="1"
             required>
      <span class="text-sm text-gray-700">×</span>
    </div>
    <div class="flex items-center gap-2 flex-1">
      <span class="text-sm text-gray-700 font-medium">→</span>
      <input type="number"
             class="milestone-points w-16 px-2 py-1.5 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
             value="${points}"
             min="0"
             required>
      <span class="text-sm text-gray-700">P.</span>
    </div>
    <button type="button"
            class="remove-milestone text-red-600 hover:text-red-800 hover:bg-red-50 w-8 h-8 rounded flex items-center justify-center transition-colors">
      ✕
    </button>
  `;

  // Remove button
  const removeBtn = milestoneDiv.querySelector('.remove-milestone');
  removeBtn.addEventListener('click', () => {
    milestoneDiv.remove();
    updateExerciseMaxPoints();
  });

  // Update max points when values change
  const inputs = milestoneDiv.querySelectorAll('input');
  inputs.forEach(input => {
    input.addEventListener('input', updateExerciseMaxPoints);
  });

  list.appendChild(milestoneDiv);
  updateExerciseMaxPoints();
}

/**
 * Add a milestone input field for challenges
 * @param {number} completions - Number of completions required
 * @param {number} points - Points awarded
 */
function addChallengeMilestone(completions = 1, points = 0) {
  const list = document.getElementById('challenge-milestones-list');
  if (!list) return;

  const milestoneDiv = document.createElement('div');
  milestoneDiv.className = 'flex items-center gap-3 bg-white p-3 rounded border border-indigo-200';
  milestoneDiv.innerHTML = `
    <div class="flex items-center gap-2 flex-1">
      <span class="text-sm text-gray-700 font-medium whitespace-nowrap">Bei</span>
      <input type="number"
             class="milestone-completions w-16 px-2 py-1.5 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
             value="${completions}"
             min="1"
             required>
      <span class="text-sm text-gray-700">×</span>
    </div>
    <div class="flex items-center gap-2 flex-1">
      <span class="text-sm text-gray-700 font-medium">→</span>
      <input type="number"
             class="milestone-points w-16 px-2 py-1.5 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
             value="${points}"
             min="0"
             required>
      <span class="text-sm text-gray-700">P.</span>
    </div>
    <button type="button"
            class="remove-milestone text-red-600 hover:text-red-800 hover:bg-red-50 w-8 h-8 rounded flex items-center justify-center transition-colors">
      ✕
    </button>
  `;

  // Remove button
  const removeBtn = milestoneDiv.querySelector('.remove-milestone');
  removeBtn.addEventListener('click', () => {
    milestoneDiv.remove();
    updateChallengeMaxPoints();
  });

  // Update max points when values change
  const inputs = milestoneDiv.querySelectorAll('input');
  inputs.forEach(input => {
    input.addEventListener('input', updateChallengeMaxPoints);
  });

  list.appendChild(milestoneDiv);
  updateChallengeMaxPoints();
}

/**
 * Clear all milestones from a list
 * @param {string} listId - ID of the milestone list
 */
function clearMilestones(listId) {
  const list = document.getElementById(listId);
  if (list) {
    list.innerHTML = '';
  }
}

/**
 * Update the maximum points display for exercises
 */
function updateExerciseMaxPoints() {
  const milestones = getExerciseMilestones();
  const total = milestones.reduce((sum, m) => sum + m.points, 0);
  const display = document.getElementById('exercise-max-points-display');
  if (display) {
    display.textContent = total;
  }
}

/**
 * Update the maximum points display for challenges
 */
function updateChallengeMaxPoints() {
  const milestones = getChallengeMilestones();
  const total = milestones.reduce((sum, m) => sum + m.points, 0);
  const display = document.getElementById('challenge-max-points-display');
  if (display) {
    display.textContent = total;
  }
}

// ========================================================================
// ===== GET MILESTONE DATA =====
// ========================================================================

/**
 * Get exercise milestones from the form
 * @returns {Array} Array of {completions, points} objects, sorted by completions
 */
export function getExerciseMilestones() {
  const toggle = document.getElementById('exercise-tiered-points-toggle');
  if (!toggle || !toggle.checked) return [];

  const list = document.getElementById('exercise-milestones-list');
  if (!list) return [];

  const milestones = [];
  const rows = list.querySelectorAll('.flex');

  rows.forEach(row => {
    const completionsInput = row.querySelector('.milestone-completions');
    const pointsInput = row.querySelector('.milestone-points');

    if (completionsInput && pointsInput) {
      const completions = parseInt(completionsInput.value) || 0;
      const points = parseInt(pointsInput.value) || 0;

      if (completions > 0) {
        milestones.push({ completions, points });
      }
    }
  });

  // Sort by completions ascending
  return milestones.sort((a, b) => a.completions - b.completions);
}

/**
 * Get challenge milestones from the form
 * @returns {Array} Array of {completions, points} objects, sorted by completions
 */
export function getChallengeMilestones() {
  const toggle = document.getElementById('challenge-tiered-points-toggle');
  if (!toggle || !toggle.checked) return [];

  const list = document.getElementById('challenge-milestones-list');
  if (!list) return [];

  const milestones = [];
  const rows = list.querySelectorAll('.flex');

  rows.forEach(row => {
    const completionsInput = row.querySelector('.milestone-completions');
    const pointsInput = row.querySelector('.milestone-points');

    if (completionsInput && pointsInput) {
      const completions = parseInt(completionsInput.value) || 0;
      const points = parseInt(pointsInput.value) || 0;

      if (completions > 0) {
        milestones.push({ completions, points });
      }
    }
  });

  // Sort by completions ascending
  return milestones.sort((a, b) => a.completions - b.completions);
}

/**
 * Check if exercise has tiered points enabled
 * @returns {boolean}
 */
export function isExerciseTieredPointsEnabled() {
  const toggle = document.getElementById('exercise-tiered-points-toggle');
  return toggle ? toggle.checked : false;
}

/**
 * Check if challenge has tiered points enabled
 * @returns {boolean}
 */
export function isChallengeTieredPointsEnabled() {
  const toggle = document.getElementById('challenge-tiered-points-toggle');
  return toggle ? toggle.checked : false;
}

// ========================================================================
// ===== PARTNER SYSTEM MANAGEMENT =====
// ========================================================================

/**
 * Initialize partner system UI for exercises (Admin)
 */
export function initializeExercisePartnerSystem() {
  const toggle = document.getElementById('exercise-partner-system-toggle');
  const container = document.getElementById('exercise-partner-container');

  if (!toggle || !container) return;

  // Toggle visibility
  toggle.addEventListener('change', () => {
    if (toggle.checked) {
      container.classList.remove('hidden');
    } else {
      container.classList.add('hidden');
    }
  });
}

/**
 * Initialize partner system UI for exercises (Coach)
 */
export function initializeExercisePartnerSystemCoach() {
  const toggle = document.getElementById('exercise-partner-system-toggle-coach');
  const container = document.getElementById('exercise-partner-container-coach');

  if (!toggle || !container) return;

  // Toggle visibility
  toggle.addEventListener('change', () => {
    if (toggle.checked) {
      container.classList.remove('hidden');
    } else {
      container.classList.add('hidden');
    }
  });
}

/**
 * Get partner system settings for exercise
 * @returns {Object|null} Partner settings object or null if disabled
 */
export function getExercisePartnerSettings() {
  const toggle = document.getElementById('exercise-partner-system-toggle') ||
                 document.getElementById('exercise-partner-system-toggle-coach');

  if (!toggle || !toggle.checked) return null;

  const percentageInput = document.getElementById('exercise-partner-percentage') ||
                          document.getElementById('exercise-partner-percentage-coach');

  const percentage = percentageInput ? parseInt(percentageInput.value) : 50;

  return {
    enabled: true,
    partnerPercentage: Math.max(0, Math.min(100, percentage)) // Clamp between 0-100
  };
}

/**
 * Check if exercise has partner system enabled
 * @returns {boolean}
 */
export function isExercisePartnerSystemEnabled() {
  const toggle = document.getElementById('exercise-partner-system-toggle') ||
                 document.getElementById('exercise-partner-system-toggle-coach');
  return toggle ? toggle.checked : false;
}

// ========================================================================
// ===== CHALLENGE PARTNER SYSTEM =====
// ========================================================================

/**
 * Initialize partner system UI for challenges (Coach)
 */
export function initializeChallengePartnerSystemCoach() {
  const toggle = document.getElementById('challenge-partner-system-toggle-coach');
  const container = document.getElementById('challenge-partner-container-coach');

  if (!toggle || !container) return;

  // Toggle visibility
  toggle.addEventListener('change', () => {
    if (toggle.checked) {
      container.classList.remove('hidden');
    } else {
      container.classList.add('hidden');
    }
  });
}

/**
 * Get partner system settings for challenge
 * @returns {Object|null} Partner settings object or null if disabled
 */
export function getChallengePartnerSettings() {
  const toggle = document.getElementById('challenge-partner-system-toggle-coach');

  if (!toggle || !toggle.checked) return null;

  const percentageInput = document.getElementById('challenge-partner-percentage-coach');

  const percentage = percentageInput ? parseInt(percentageInput.value) : 50;

  return {
    enabled: true,
    partnerPercentage: Math.max(0, Math.min(100, percentage)) // Clamp between 0-100
  };
}

/**
 * Check if challenge has partner system enabled
 * @returns {boolean}
 */
export function isChallengePartnerSystemEnabled() {
  const toggle = document.getElementById('challenge-partner-system-toggle-coach');
  return toggle ? toggle.checked : false;
}
