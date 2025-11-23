import { createApp } from 'vue'
import { createPinia } from 'pinia'
import { VueFire, VueFireAuth } from 'vuefire'
import App from './App.vue'
import router from './router'
import { firebaseApp } from './config/firebase'
import './style.css'

const app = createApp(App)

// Pinia for state management
app.use(createPinia())

// VueFire for Firebase integration
app.use(VueFire, {
  firebaseApp,
  modules: [VueFireAuth()]
})

// Vue Router
app.use(router)

app.mount('#app')
