import { createRouter, createWebHistory } from 'vue-router'
import { useUserStore } from '@/stores/user'
import { watch } from 'vue'

const routes = [
  {
    path: '/',
    redirect: '/dashboard'
  },
  {
    path: '/leaderboard',
    name: 'Leaderboard',
    component: () => import('@/views/LeaderboardView.vue'),
    meta: { requiresAuth: true }
  },
  {
    path: '/dashboard',
    name: 'Dashboard',
    component: () => import('@/views/DashboardView.vue'),
    meta: { requiresAuth: true }
  },
  {
    path: '/matches',
    name: 'Matches',
    component: () => import('@/views/MatchesView.vue'),
    meta: { requiresAuth: true }
  },
  {
    path: '/settings',
    name: 'Settings',
    component: () => import('@/views/SettingsView.vue'),
    meta: { requiresAuth: true }
  },
  {
    path: '/faq',
    name: 'FAQ',
    component: () => import('@/views/FAQView.vue')
  },
  {
    path: '/admin-debug',
    name: 'AdminDebug',
    component: () => import('@/views/AdminDebugView.vue'),
    meta: { requiresAuth: true }
  },
  {
    path: '/login',
    name: 'Login',
    component: () => import('@/views/LoginView.vue')
  }
]

const router = createRouter({
  history: createWebHistory(),
  routes
})

// Navigation guard - wait for auth state to be determined
router.beforeEach(async (to, from, next) => {
  const userStore = useUserStore()

  // If still loading, wait for auth state to be determined
  if (userStore.loading) {
    await new Promise((resolve) => {
      const unwatch = watch(
        () => userStore.loading,
        (loading) => {
          if (!loading) {
            unwatch()
            resolve()
          }
        },
        { immediate: true }
      )
    })
  }

  // Now check authentication
  if (to.meta.requiresAuth && !userStore.isAuthenticated) {
    next('/login')
  } else {
    next()
  }
})

export default router
