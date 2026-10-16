// router/index.js — 路由配置（Hash 模式，管理控制台区域页面切换）
import { createRouter, createWebHashHistory } from 'vue-router'

// 注：曾经有 forceUpdateActive + /update 强制更新页（自建后端的版本检测会在
// 接口不可达时把用户锁在更新页）。该机制已随自建后端一起移除，
// 版本更新改走 GitHub Releases（见「关于」页的检查更新）。

const routes = [
  { path: '/', name: 'home', title: '首页', component: () => import('../pages/HomePage.vue') },
  { path: '/profile', name: 'profile', title: '个人资料', component: () => import('../pages/ProfilePage.vue') },
  { path: '/profile/history', name: 'history', title: '历史记录', component: () => import('../pages/HistoryPage.vue') },
  { path: '/profile/stats', name: 'stats', title: '摸鱼时间统计', component: () => import('../pages/StatsPage.vue') },
  { path: '/profile/rules', name: 'rules', title: '站点规则', component: () => import('../pages/RulesPage.vue') },
  { path: '/profile/about', name: 'about', title: '关于', component: () => import('../pages/AboutPage.vue') },
  { path: '/profile/help', name: 'help', title: '使用说明', component: () => import('../pages/HelpPage.vue') },
]

const router = createRouter({
  history: createWebHashHistory(),
  routes,
})

export default router
