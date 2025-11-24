<script setup>
import { computed } from 'vue'
import { useUserStore } from '@/stores/user'
import { db } from '@/config/firebase'
import { collection, query, where, orderBy } from 'firebase/firestore'
import { useCollection } from 'vuefire'

const userStore = useUserStore()

// Load all subgroups for the user's club
const subgroupsQuery = computed(() => {
  if (!userStore.clubId) return null
  return query(
    collection(db, 'subgroups'),
    where('clubId', '==', userStore.clubId),
    orderBy('createdAt', 'asc')
  )
})
const allSubgroups = useCollection(subgroupsQuery)

// Filter to only user's non-default subgroups
const userSubgroups = computed(() => {
  if (!allSubgroups.value || !userStore.userData?.subgroupIDs) return []
  const subgroupIDs = userStore.userData.subgroupIDs || []
  return allSubgroups.value
    .filter(sg => subgroupIDs.includes(sg.id) && !sg.isDefault)
})

// Handle filter change
function handleFilterChange(event) {
  const value = event.target.value
  if (value === 'club' || value === 'global') {
    userStore.setSubgroupFilter(value)
  } else if (value.startsWith('subgroup:')) {
    userStore.setSubgroupFilter(value.replace('subgroup:', ''))
  }
}

// Compute the current dropdown value
const dropdownValue = computed(() => {
  const filter = userStore.currentSubgroupFilter
  if (filter === 'club' || filter === 'global') {
    return filter
  } else {
    // It's a subgroup ID
    return `subgroup:${filter}`
  }
})
</script>

<template>
  <div class="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-lg p-3 shadow-sm">
    <label for="subgroup-filter" class="text-sm font-medium text-gray-700 whitespace-nowrap">
      👥 Ansicht:
    </label>
    <select
      id="subgroup-filter"
      :value="dropdownValue"
      @change="handleFilterChange"
      class="flex-1 px-3 py-2 text-sm border-gray-300 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 rounded-md shadow-sm bg-white"
    >
      <!-- Subgroup options first (if any) -->
      <option
        v-for="subgroup in userSubgroups"
        :key="subgroup.id"
        :value="`subgroup:${subgroup.id}`"
      >
        👥 {{ subgroup.name }}
      </option>

      <!-- Club and Global options -->
      <option value="club">🏠 Mein Verein</option>
      <option value="global">🌍 Global</option>
    </select>
  </div>
</template>
