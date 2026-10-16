// main.js — 渲染进程入口：创建 Vue 应用、注册 Element Plus 和路由
import ElementPlus from 'element-plus'
import 'element-plus/dist/index.css'
// Element Plus 暗色主题：与 :root[data-theme='dark'] 配合，
// 使 el-* 组件的颜色跟随主题（EP 用 html.dark 作为选择器，见 App.vue 的同步逻辑）
import 'element-plus/theme-chalk/dark/css-vars.css'
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
