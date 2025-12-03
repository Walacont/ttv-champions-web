<script setup>
defineProps({
  label: {
    type: String,
    required: true
  },
  value: {
    type: [Number, String],
    required: true
  },
  icon: {
    type: String,
    default: '📊'
  },
  color: {
    type: String,
    default: 'indigo'
  }
})

const colorClasses = {
  purple: 'from-purple-500 to-purple-600',
  blue: 'from-blue-500 to-blue-600',
  yellow: 'from-yellow-500 to-yellow-600',
  green: 'from-green-500 to-green-600',
  indigo: 'from-indigo-500 to-indigo-600'
}
</script>

<template>
  <div
    class="bg-gradient-to-br text-white rounded-xl p-4 shadow-lg"
    :class="colorClasses[color]"
  >
    <div class="flex items-center justify-between">
      <div>
        <p class="text-white/80 text-xs uppercase tracking-wide">{{ label }}</p>
        <p class="text-2xl font-bold mt-1">{{ value }}</p>
      </div>
      <span class="text-3xl opacity-80">{{ icon }}</span>
    </div>
  </div>
</template>
