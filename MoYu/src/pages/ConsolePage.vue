<script setup>
import { computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useDesktopApp } from '../composables/useDesktopApp';

const { settings } = useDesktopApp();
const route = useRoute();
const router = useRouter();

const isTransparent = computed(() => settings.pageTransparentMode || settings.fullWindowTransparent);

const isHome = computed(() => route.name === 'home');
const isProfile = computed(() => route.name === 'profile' || route.path.startsWith('/profile'));
const isUpdatePage = computed(() => route.name === 'update');
const isReaderPage = computed(() => route.name === 'reader');
</script>

<template>
  <div class="console-page" :class="{ 'transparent-mode': isTransparent }">
    <div class="console-content">
      <router-view :is-transparent="isTransparent" />
    </div>

    <div v-if="!isUpdatePage && !isReaderPage" class="console-tab-bar no-drag">
      <button class="tab-btn" :class="{ active: isHome }" @click="router.push({ name: 'home' })">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/>
          <polyline points="9 22 9 12 15 12 15 22"/>
        </svg>
        <span>首页</span>
      </button>
      <button class="tab-btn" :class="{ active: isProfile }" @click="router.push({ name: 'profile' })">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/>
          <circle cx="12" cy="7" r="4"/>
        </svg>
        <span>个人中心</span>
      </button>
    </div>
  </div>
</template>

<style scoped>
.console-page {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  overflow: hidden;
}

.console-content {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
}

.console-tab-bar {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  border-top: 1px solid #f0f0f0;
  background: var(--surface, #fff);
  padding: 0;
}

.console-page.transparent-mode .console-tab-bar {
  background: transparent;
  border-color: transparent;
}

.tab-btn {
  flex: 1;
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: center;
  gap: 3px;
  padding: 3px 0;
  border: none;
  background: transparent;
  cursor: pointer;
  color: #999;
  font-size: 9px;
  line-height: 1;
  transition: color 0.15s;
}

.tab-btn:hover {
  color: #666;
}

.tab-btn.active {
  color: #409eff;
}

.tab-btn svg {
  display: block;
}
</style>
