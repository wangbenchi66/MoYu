import { createRouter, createWebHashHistory } from 'vue-router'

let forceUpdateActive = false
export function setForceUpdateActive(val) { forceUpdateActive = val }

const routes = [
  { path: '/', name: 'home', title: '首页', component: () => import('../pages/RecommendedPage.vue') },
  { path: '/profile', name: 'profile', title: '个人资料', component: () => import('../pages/ProfilePage.vue') },
  { path: '/profile/history', name: 'history', title: '历史记录', component: () => import('../pages/HistoryPage.vue') },
  { path: '/profile/stats', name: 'stats', title: '摸鱼时间统计', component: () => import('../pages/StatsPage.vue') },
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
