<template>
  <teleport to="body">
    <div
      v-if="visible"
      class="context-menu"
      :style="style"
      @click.stop>
      <div
        v-for="item in items"
        :key="item.key || item.label"
        class="context-item"
        @click.prevent="select(item)">
        <span class="context-item-label">{{ item.label }}</span>
        <span class="context-item-icon">
          <component
            v-if="item.iconKey && iconMap[item.iconKey]"
            :is="iconMap[item.iconKey]" />
          <span
            v-else-if="item.icon"
            v-html="item.icon"></span>
          <span v-else-if="item.emoji">{{ item.emoji }}</span>
        </span>
      </div>
    </div>
  </teleport>
</template>

<script setup>
import { ArrowLeft, ArrowRight, Close, View } from '@element-plus/icons-vue';
import { computed, onBeforeUnmount, onMounted } from 'vue';

const props = defineProps({
  visible: { type: Boolean, default: false },
  x: { type: Number, default: 0 },
  y: { type: Number, default: 0 },
  items: { type: Array, default: () => [] }
});
const emit = defineEmits(['select', 'close']);

// 支持的图标映射（使用简短 key）
const iconMap = {
  left: ArrowLeft,
  right: ArrowRight,
  close: Close,
  view: View
};

function select(item) {
  emit('select', item);
}

function onDocClick() {
  emit('close');
}

onMounted(() => {
  document.addEventListener('click', onDocClick);
});
onBeforeUnmount(() => {
  document.removeEventListener('click', onDocClick);
});

const style = computed(() => ({
  left: `${props.x}px`,
  top: `${props.y}px`
}));
</script>

<style scoped>
.context-menu {
  position: fixed;
  z-index: 4000;
  -webkit-app-region: no-drag;
  pointer-events: auto;
  background: #ffffff;
  border: 1px solid rgba(0, 0, 0, 0.06);
  border-radius: 6px;
  box-shadow: 0 8px 24px rgba(16, 23, 32, 0.12);
  min-width: 140px;
  overflow: hidden;
}
.context-item {
  padding: 8px 12px;
  font-size: 13px;
  color: #222;
  cursor: pointer;
  user-select: none;
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.context-item:hover {
  background: #f5f7fa;
}
.context-item-icon {
  width: 18px;
  height: 18px;
  margin-left: 8px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  color: var(--muted);
}
.context-item-icon svg {
  width: 14px;
  height: 14px;
}
.context-item-label {
  flex: 1 1 auto;
  text-align: left;
}
</style>
