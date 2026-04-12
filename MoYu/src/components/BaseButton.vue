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
  if (props.useEl) {
    // element-plus 接受 type/size/plain/circle
    return { ...base, type: props.type, size: props.size, plain: props.plain, circle: props.circle };
  }
  return base;
});
</script>
