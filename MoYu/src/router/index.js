import { createRouter, createWebHashHistory } from 'vue-router'

const routes = [
  { path: '/', name: 'home', title: '首页', component: () => import('../pages/HomePage.vue') },
  { path: '/profile', name: 'profile', title: '个人资料', component: () => import('../pages/ProfilePage.vue') },
  { path: '/profile/history', name: 'history', title: '历史记录', component: () => import('../pages/HistoryPage.vue') },
]

const router = createRouter({
  history: createWebHashHistory(),
  routes,
})

export default router
