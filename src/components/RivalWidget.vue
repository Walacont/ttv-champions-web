<script setup>
import { ref, onMounted } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { useProfiles } from '@/composables/useProfiles'

const props = defineProps({
  type: {
    type: String,
    default: 'skill', // 'skill' or 'effort'
    validator: (value) => ['skill', 'effort'].includes(value)
  }
})

const authStore = useAuthStore()
const { getRivals, loading } = useProfiles()

const rival = ref(null)

onMounted(async () => {
  if (authStore.user && authStore.profile?.club_id) {
    const rivals = await getRivals(authStore.user.id, authStore.profile.club_id)
    rival.value = props.type === 'skill' ? rivals.skillRival : rivals.effortRival
  }
})

const title = props.type === 'skill' ? '⚡ Skill-Rivale (Elo)' : '💪 Fleiß-Rivale (XP)'
const statLabel = props.type === 'skill' ? 'Elo' : 'XP'
const statValue = (r) => props.type === 'skill' ? r?.elo_rating || 1000 : r?.total_xp || 0
const myStatValue = () => props.type === 'skill'
  ? authStore.profile?.elo_rating || 1000
  : authStore.profile?.total_xp || 0
const diff = () => {
  if (!rival.value) return 0
  return statValue(rival.value) - myStatValue()
}
</script>

<template>
  <div class="bg-white p-6 rounded-xl shadow-md">
    <h2 class="text-xl font-semibold mb-4">{{ title }}</h2>

    <div v-if="loading" class="text-center py-4">
      <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600 mx-auto"></div>
      <p class="text-sm text-gray-500 mt-2">Lade Rivalen...</p>
    </div>

    <div v-else-if="rival" class="space-y-3">
      <div class="flex items-center gap-3">
        <div class="w-12 h-12 bg-gradient-to-br from-indigo-500 to-purple-500 rounded-full flex items-center justify-center text-white font-bold text-lg">
          {{ rival.display_name?.charAt(0)?.toUpperCase() || '?' }}
        </div>
        <div class="flex-1">
          <p class="font-semibold">{{ rival.display_name || 'Unbekannt' }}</p>
          <p class="text-sm text-gray-500">{{ statValue(rival) }} {{ statLabel }}</p>
        </div>
      </div>

      <div class="bg-gray-50 rounded-lg p-3">
        <div class="flex justify-between items-center">
          <span class="text-sm text-gray-600">Unterschied:</span>
          <span
            class="font-bold"
            :class="diff() > 0 ? 'text-red-500' : 'text-green-500'"
          >
            {{ diff() > 0 ? '+' : '' }}{{ diff() }} {{ statLabel }}
          </span>
        </div>
        <p class="text-xs text-gray-500 mt-2">
          <template v-if="type === 'skill'">
            Euer Elo-Rating liegt am nächsten beieinander
          </template>
          <template v-else>
            Dein nächstes Ziel zum Überholen!
          </template>
        </p>
      </div>
    </div>

    <div v-else class="text-center py-4">
      <p class="text-gray-500">
        <template v-if="type === 'skill'">
          Kein Rivale mit ähnlichem Elo gefunden
        </template>
        <template v-else>
          Du bist bereits an der Spitze!
        </template>
      </p>
    </div>
  </div>
</template>
