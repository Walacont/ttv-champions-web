<script setup>
import { ref } from 'vue'

const props = defineProps({
  title: {
    type: String,
    required: true
  },
  label: {
    type: String,
    default: ''
  },
  value: {
    type: [Number, String],
    required: true
  },
  subtitle: {
    type: String,
    default: ''
  },
  icon: {
    type: String,
    default: ''
  },
  color: {
    type: String,
    default: 'indigo'
  },
  tooltip: {
    type: String,
    default: ''
  }
})

const showTooltip = ref(false)

const colorClasses = {
  purple: {
    bg: 'bg-purple-50',
    border: 'border-purple-200',
    text: 'text-purple-600',
    value: 'text-purple-700'
  },
  blue: {
    bg: 'bg-blue-50',
    border: 'border-blue-200',
    text: 'text-blue-600',
    value: 'text-blue-700'
  },
  yellow: {
    bg: 'bg-yellow-50',
    border: 'border-yellow-200',
    text: 'text-yellow-600',
    value: 'text-yellow-700'
  },
  green: {
    bg: 'bg-green-50',
    border: 'border-green-200',
    text: 'text-green-600',
    value: 'text-green-700'
  },
  indigo: {
    bg: 'bg-indigo-50',
    border: 'border-indigo-200',
    text: 'text-indigo-600',
    value: 'text-indigo-700'
  }
}

const displayTitle = props.title || props.label
</script>

<template>
  <div
    class="rounded-xl p-4 border-2 relative"
    :class="[colorClasses[color].bg, colorClasses[color].border]"
  >
    <div class="text-center">
      <div class="flex items-center justify-center gap-2 mb-2">
        <span v-if="icon" class="text-2xl">{{ icon }}</span>
        <p class="text-sm font-medium" :class="colorClasses[color].text">
          {{ displayTitle }}
        </p>
        <button
          v-if="tooltip"
          @click="showTooltip = !showTooltip"
          class="text-gray-400 hover:text-gray-600"
        >
          <i class="fas fa-info-circle"></i>
        </button>
      </div>
      <p class="text-3xl font-bold" :class="colorClasses[color].value">
        {{ typeof value === 'number' ? value.toLocaleString('de-DE') : value }}
      </p>
      <p v-if="subtitle" class="text-xs text-gray-500 mt-1">{{ subtitle }}</p>
    </div>

    <!-- Tooltip -->
    <div
      v-if="showTooltip && tooltip"
      class="absolute z-10 top-full left-0 right-0 mt-2 p-3 bg-gray-800 text-white text-xs rounded-lg shadow-lg"
    >
      {{ tooltip }}
      <button @click="showTooltip = false" class="absolute top-1 right-2 text-gray-300 hover:text-white">
        ×
      </button>
    </div>
  </div>
</template>
