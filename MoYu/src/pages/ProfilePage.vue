<!-- ProfilePage.vue — 个人中心（菜单导航入口） -->
<script setup>
import { useRouter } from 'vue-router';

defineProps({
  isTransparent: Boolean,
});

const router = useRouter();

const menuItems = [
  {
    key: 'history',
    route: 'history',
    label: '历史记录',
    icon: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`,
  },
  {
    key: 'stats',
    route: 'stats',
    label: '摸鱼时间统计',
    icon: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"/></svg>`,
  },
  {
    key: 'rules',
    route: 'rules',
    label: '站点规则',
    icon: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="9" y1="13" x2="15" y2="13"/><line x1="9" y1="17" x2="13" y2="17"/></svg>`,
  },
  {
    key: 'help',
    route: 'help',
    label: '使用说明',
    icon: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 015.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`,
  },
  {
    key: 'about',
    route: 'about',
    label: '关于',
    icon: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>`,
  },
];

function onMenuClick(item) {
  if (item.route) {
    router.push({ name: item.route });
  }
}
</script>

<template>
  <div class="profile-page" :class="{ 'transparent-page': isTransparent }">
    <section class="menu-section">
      <div
        v-for="item in menuItems"
        :key="item.key"
        class="menu-item"
        @click="onMenuClick(item)">
        <span class="menu-icon" v-html="item.icon"></span>
        <span class="menu-label">{{ item.label }}</span>
        <svg class="menu-arrow" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="9 18 15 12 9 6"/>
        </svg>
      </div>
    </section>
  </div>
</template>

<style scoped>
.profile-page {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 8px 6px;
  max-width: 800px;
  margin: 0 auto;
  width: 100%;
  box-sizing: border-box;
}

.profile-page.transparent-page .menu-section,
.profile-page.transparent-page .menu-item {
  background: transparent !important;
  box-shadow: none !important;
  border-color: transparent !important;
}

.menu-section {
  background: var(--surface);
  border-radius: 8px;
  overflow: hidden;
}

.menu-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  cursor: pointer;
  transition: background 0.12s;
  border-bottom: 1px solid var(--fill-soft);
}

.menu-item:last-child {
  border-bottom: none;
}

.menu-item:hover {
  background: var(--primary-faint);
}

.menu-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-secondary);
  flex-shrink: 0;
}

.menu-label {
  flex: 1;
  font-size: 13px;
  font-weight: 500;
  color: var(--text, var(--text));
}

.menu-arrow {
  flex-shrink: 0;
  color: var(--muted);
}
</style>
