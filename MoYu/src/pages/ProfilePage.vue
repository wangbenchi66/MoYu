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
];

function onMenuClick(item) {
  if (item.route) {
    router.push({ name: item.route });
  }
}
</script>

<template>
  <div class="profile-page" :class="{ 'transparent-page': isTransparent }">
    <section class="user-card">
      <el-avatar :size="56" style="background: #409eff; font-size: 24px">摸</el-avatar>
      <span class="nickname">摸鱼达人</span>
    </section>

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

.profile-page.transparent-page .user-card,
.profile-page.transparent-page .menu-section,
.profile-page.transparent-page .menu-item {
  background: transparent !important;
  box-shadow: none !important;
  border-color: transparent !important;
}

.user-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 20px 0 12px;
  background: var(--surface);
  border-radius: 8px;
}

.nickname {
  font-size: 16px;
  font-weight: 600;
  color: var(--text, #333);
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
  border-bottom: 1px solid #f5f5f5;
}

.menu-item:last-child {
  border-bottom: none;
}

.menu-item:hover {
  background: rgba(64, 158, 255, 0.04);
}

.menu-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  color: #666;
  flex-shrink: 0;
}

.menu-label {
  flex: 1;
  font-size: 13px;
  font-weight: 500;
  color: var(--text, #333);
}

.menu-arrow {
  flex-shrink: 0;
  color: #ccc;
}
</style>
