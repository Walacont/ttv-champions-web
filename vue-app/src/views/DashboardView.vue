<script setup>
import { useUserStore } from '@/stores/user'

const userStore = useUserStore()
</script>

<template>
  <div class="space-y-6">
    <!-- Welcome Card -->
    <div class="bg-white p-6 rounded-xl shadow-md">
      <h1 class="text-2xl font-bold text-gray-900">
        Willkommen, {{ userStore.userData?.firstName }}!
      </h1>
      <p class="text-gray-600 mt-2">
        Hier ist dein persönliches Dashboard.
      </p>
    </div>

    <!-- Stats Grid -->
    <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
      <div class="bg-white p-6 rounded-xl shadow-md text-center">
        <div class="text-3xl font-bold text-indigo-600">
          {{ userStore.userData?.eloRating || 0 }}
        </div>
        <div class="text-gray-500 mt-1">Elo Rating</div>
      </div>

      <div class="bg-white p-6 rounded-xl shadow-md text-center">
        <div class="text-3xl font-bold text-green-600">
          {{ userStore.userData?.xp || 0 }}
        </div>
        <div class="text-gray-500 mt-1">XP</div>
      </div>

      <div class="bg-white p-6 rounded-xl shadow-md text-center">
        <div class="text-3xl font-bold text-yellow-600">
          {{ userStore.userData?.points || 0 }}
        </div>
        <div class="text-gray-500 mt-1">Season Punkte</div>
      </div>
    </div>

    <!-- Placeholder for more content -->
    <div class="bg-white p-6 rounded-xl shadow-md">
      <h2 class="text-lg font-semibold text-gray-900 mb-4">Weitere Features</h2>
      <p class="text-gray-500">
        Hier kommen weitere Dashboard-Widgets wie Matches, Challenges, etc.
      </p>
    </div>
  </div>
</template>
