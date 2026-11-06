<!-- BaseButton.vue — 通用按钮（自动判断渲染为 el-button 或原生 button） -->
<template>
  <component
    :is="tag"
    v-bind="mergedAttrs">
    <slot />
  </component>
</template>

<script setup>
import { computed, useAttrs } from 'vue';

const props = defineProps({
  // 当需要使用 element-plus 的样式时，传入 `:use-el="true"`
  useEl: { type: Boolean, default: false },
  type: { type: String, default: undefined },
  size: { type: String, default: undefined },
  plain: { type: Boolean, default: false },
  circle: { type: Boolean, default: false }
});

// 根据 useEl 决定渲染的标签
const tag = computed(() => (props.useEl ? 'el-button' : 'button'));

// 为 el-button 提供专有 props，否则只透传 $attrs 到原生 button
const attrs = useAttrs();

const mergedAttrs = computed(() => {
  const base = { ...attrs };
  // 可访问名称：没有显式 aria-label 时用 title 兜底。
  // 这个应用里大量图标按钮只写了 title，读屏软件读不到名字。
  if (!base['aria-label'] && typeof base.title === 'string' && base.title.trim()) {
    base['aria-label'] = base.title;
  }
  if (props.useEl) {
    // element-plus 接受 type/size/plain/circle
    return { ...base, type: props.type, size: props.size, plain: props.plain, circle: props.circle };
  }
  // 原生 button 默认 type=button：避免以后被放进 form 时意外提交
  if (!base.type) base.type = 'button';
  return base;
});
</script>
