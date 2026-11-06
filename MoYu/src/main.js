// main.js — 渲染进程入口：创建 Vue 应用、按需注册 Element Plus 组件、挂载路由
//
// 以前这里是 `import ElementPlus from 'element-plus'` + `app.use(ElementPlus)`，
// 会把 Element Plus 全部组件都注册进包体（入口 chunk 1.65MB）。实际只用到
// Avatar / Button / Form / FormItem / Icon / Input / Popover 七个，以及
// ElMessage / ElMessageBox（各页面直接 import，本身可被 tree-shake）。
// 这里改成按需注册 + 按组件引样式，体积明显下降。
import {
  ElAvatar, ElButton, ElForm, ElFormItem, ElIcon, ElInput, ElPopover,
} from 'element-plus'
import 'element-plus/es/components/base/style/css'
import 'element-plus/es/components/avatar/style/css'
import 'element-plus/es/components/button/style/css'
import 'element-plus/es/components/form/style/css'
import 'element-plus/es/components/icon/style/css'
import 'element-plus/es/components/input/style/css'
import 'element-plus/es/components/popover/style/css'
import 'element-plus/es/components/message/style/css'
import 'element-plus/es/components/message-box/style/css'
// Element Plus 暗色主题：与 :root[data-theme='dark'] 配合，
// 使 el-* 组件的颜色跟随主题（EP 用 html.dark 作为选择器，见 App.vue 的同步逻辑）
import 'element-plus/theme-chalk/dark/css-vars.css'
import { createApp } from 'vue'
import App from './App.vue'
import BaseButton from './components/BaseButton.vue'
import router from './router'
import './style.css'

const app = createApp(App)

// 渲染进程的兜底错误上报：组件里大量 catch(e){} 会把异常吞掉，
// 这里至少把「漏网」的 window error / unhandledrejection 写进主进程日志，
// 出问题时 app.log 里能看到，而不是只在 DevTools 闪一下。
try {
    window.addEventListener('error', (e) => {
        try {
            window.desktop?.logError?.('window.error: ' + (e?.message || 'unknown'), {
                file: e?.filename || '', line: e?.lineno || 0,
            })
        } catch (err) { }
    })
    window.addEventListener('unhandledrejection', (e) => {
        try {
            const reason = e?.reason
            const msg = reason && (reason.stack || reason.message) ? (reason.stack || reason.message) : String(reason)
            window.desktop?.logError?.('unhandledrejection: ' + msg)
        } catch (err) { }
    })
} catch (e) { }

const elementComponents = [
  ElAvatar, ElButton, ElForm, ElFormItem, ElIcon, ElInput, ElPopover,
]
for (const component of elementComponents) {
  // 组件名形如 ElButton → el-button，模板里用的就是这个名字
  const name = component.name
  if (name) app.component(name, component)
}

app.use(router)
app.component('BaseButton', BaseButton)
app.mount('#app')
