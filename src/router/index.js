import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

// Views (lazy loaded)
const LoginView = () => import('@/views/LoginView.vue')
const RegisterView = () => import('@/views/RegisterView.vue')
const OnboardingView = () => import('@/views/OnboardingView.vue')
const DashboardView = () => import('@/views/DashboardView.vue')
const CoachView = () => import('@/views/CoachView.vue')
const AdminView = () => import('@/views/AdminView.vue')
const ProfileView = () => import('@/views/ProfileView.vue')
const SettingsView = () => import('@/views/SettingsView.vue')
const FAQView = () => import('@/views/FAQView.vue')

const routes = [
  {
    path: '/',
    redirect: '/login'
  },
  {
    path: '/login',
    name: 'Login',
    component: LoginView,
    meta: { requiresGuest: true }
  },
  {
    path: '/register',
    name: 'Register',
    component: RegisterView,
    meta: { requiresGuest: true }
  },
  {
    path: '/onboarding',
    name: 'Onboarding',
    component: OnboardingView,
    meta: { requiresAuth: true }
  },
  {
    path: '/dashboard',
    name: 'Dashboard',
    component: DashboardView,
    meta: { requiresAuth: true, requiresOnboarding: true }
  },
  {
    path: '/coach',
    name: 'Coach',
    component: CoachView,
    meta: { requiresAuth: true, requiresOnboarding: true, requiresRole: ['coach', 'admin'] }
  },
  {
    path: '/admin',
    name: 'Admin',
    component: AdminView,
    meta: { requiresAuth: true, requiresOnboarding: true, requiresRole: ['admin'] }
  },
  {
    path: '/profile',
    name: 'Profile',
    component: ProfileView,
    meta: { requiresAuth: true, requiresOnboarding: true }
  },
  {
    path: '/settings',
    name: 'Settings',
    component: SettingsView,
    meta: { requiresAuth: true, requiresOnboarding: true }
  },
  {
    path: '/faq',
    name: 'FAQ',
    component: FAQView,
    meta: { requiresAuth: true }
  },
  {
    path: '/:pathMatch(.*)*',
    redirect: '/login'
  }
]

const router = createRouter({
  history: createWebHistory(),
  routes
})

// Navigation guards
router.beforeEach(async (to, from, next) => {
  const authStore = useAuthStore()

  // Wait for auth to initialize
  if (!authStore.initialized) {
    await authStore.initialize()
  }

  const isAuthenticated = authStore.isAuthenticated
  const user = authStore.user
  const profile = authStore.profile

  // Guest only routes (login, register)
  if (to.meta.requiresGuest && isAuthenticated) {
    // Redirect to appropriate page based on role
    if (profile?.role === 'admin') {
      return next('/admin')
    } else if (profile?.role === 'coach') {
      return next('/coach')
    } else {
      return next('/dashboard')
    }
  }

  // Auth required routes
  if (to.meta.requiresAuth && !isAuthenticated) {
    return next('/login')
  }

  // Onboarding required
  if (to.meta.requiresOnboarding && isAuthenticated && profile && !profile.onboarding_complete) {
    return next('/onboarding')
  }

  // Role required
  if (to.meta.requiresRole && isAuthenticated && profile) {
    const allowedRoles = to.meta.requiresRole
    if (!allowedRoles.includes(profile.role)) {
      return next('/dashboard')
    }
  }

  next()
})

export default router
