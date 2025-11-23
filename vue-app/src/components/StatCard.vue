<script setup>
defineProps({
  title: String,
  value: [Number, String],
  icon: String,
  color: {
    type: String,
    default: 'indigo'
  }
})

const colorClasses = {
  indigo: 'text-indigo-600 bg-indigo-100',
  green: 'text-green-600 bg-green-100',
  yellow: 'text-yellow-600 bg-yellow-100',
  purple: 'text-purple-600 bg-purple-100',
  red: 'text-red-600 bg-red-100',
  blue: 'text-blue-600 bg-blue-100'
}
</script>

<template>
  <div class="bg-white p-6 rounded-xl shadow-md">
    <div class="flex items-center justify-between">
      <div>
        <p class="text-sm text-gray-500">{{ title }}</p>
        <p class="text-2xl font-bold text-gray-900 mt-1">{{ value }}</p>
      </div>
      <div
        class="w-12 h-12 rounded-full flex items-center justify-center text-2xl"
        :class="colorClasses[color]"
      >
        {{ icon }}
      </div>
    </div>
  </div>
</template>
