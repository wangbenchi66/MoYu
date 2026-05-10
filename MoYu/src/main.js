import ElementPlus from 'element-plus'
import 'element-plus/dist/index.css'
import { createApp } from 'vue'
import App from './App.vue'
import BaseButton from './components/BaseButton.vue'
import router from './router'
import './style.css'

const app = createApp(App)
app.use(ElementPlus)
app.use(router)
app.component('BaseButton', BaseButton)
app.mount('#app')
