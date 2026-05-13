// router/index.js — 路由配置（Hash 模式，管理控制台区域页面切换）
import { createRouter, createWebHashHistory } from 'vue-router'

let forceUpdateActive = false
export function setForceUpdateActive(val) { forceUpdateActive = val }

const routes = [
  { path: '/', name: 'home', title: '首页', component: () => import('../pages/HomePage.vue') },
  { path: '/profile', name: 'profile', title: '个人资料', component: () => import('../pages/ProfilePage.vue') },
  { path: '/profile/history', name: 'history', title: '历史记录', component: () => import('../pages/HistoryPage.vue') },
  { path: '/profile/stats', name: 'stats', title: '摸鱼时间统计', component: () => import('../pages/StatsPage.vue') },
  { path: '/library', name: 'library', title: '我的书架', component: () => import('../pages/LibraryPage.vue') },
  { path: '/library/:id', name: 'reader', title: '阅读', component: () => import('../pages/ReaderPage.vue') },
  { path: '/update', name: 'update', title: '版本更新', component: () => import('../pages/UpdatePage.vue') },
]

const router = createRouter({
  history: createWebHashHistory(),
  routes,
})

router.beforeEach((to) => {
  if (forceUpdateActive && to.name !== 'update') return { name: 'update' }
})

export default router
