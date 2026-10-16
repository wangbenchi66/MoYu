<!-- ContextMenu.vue — 右键菜单（支持图标、子菜单、分隔线、禁用态、自动避让屏幕边缘） -->
<template>
  <teleport to="body">
    <div
      v-if="visible"
      ref="menuRef"
      class="context-menu"
      :style="[style, sizeStyle]"
      @click.stop
      @contextmenu.prevent>
      <template
        v-for="(item, i) in visibleItems"
        :key="item.key || item.label || ('sep' + i)">
        <!-- 分隔线 -->
        <div
          v-if="item.type === 'separator'"
          class="context-separator"></div>

        <!-- 普通项 / 带子菜单的项 -->
        <div
          v-else
          class="context-item"
          :class="{ disabled: item.disabled, 'has-sub': hasChildren(item) }"
          @click.prevent="onItemClick(item)"
          @mouseenter="onItemEnter(item, i)">
          <span class="context-item-label">{{ item.label }}</span>
          <span
            v-if="item.hint"
            class="context-item-hint">{{ item.hint }}</span>
          <span class="context-item-icon">
            <!-- 有子菜单时显示箭头 -->
            <span
              v-if="hasChildren(item)"
              class="sub-arrow">›</span>
            <template v-else>
              <component
                v-if="item.iconKey && iconMap[item.iconKey]"
                :is="iconMap[item.iconKey]" />
              <span
                v-else-if="item.icon"
                v-html="item.icon"></span>
              <span v-else-if="item.emoji">{{ item.emoji }}</span>
            </template>
          </span>
        </div>
      </template>
    </div>

    <!-- 子菜单：单独一层，避免被父级 overflow 裁掉 -->
    <div
      v-if="visible && openSubIndex !== null && submenuItems.length"
      class="context-menu submenu"
      :style="[subStyle, sizeStyle]"
      @click.stop
      @contextmenu.prevent>
      <div
        v-for="(item, i) in submenuItems"
        :key="item.key || item.label || ('ssep' + i)">
        <div
          v-if="item.type === 'separator'"
          class="context-separator"></div>
        <div
          v-else
          class="context-item"
          :class="{ disabled: item.disabled }"
          @click.prevent="onItemClick(item)">
          <span class="context-item-label">{{ item.label }}</span>
          <span
            v-if="item.hint"
            class="context-item-hint">{{ item.hint }}</span>
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
    </div>
  </teleport>
</template>

<script setup>
import { ArrowLeft, ArrowRight, Close, View } from '@element-plus/icons-vue';
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';

const props = defineProps({
  visible: { type: Boolean, default: false },
  x: { type: Number, default: 0 },
  y: { type: Number, default: 0 },
  items: { type: Array, default: () => [] }
});
const emit = defineEmits(['select', 'close']);

const menuRef = ref(null);
const openSubIndex = ref(null);
// 避让后的实际坐标（null 表示沿用传入的 x/y）
const adjusted = ref(null);
const subAdjusted = ref(null);
// 窗口太小时被折叠进「更多」的项
const overflowItems = ref([]);
// 自适应尺寸令牌（按窗口大小计算）
const metrics = ref({ itemH: 26, font: 12, padY: 3, gap: 0 });

// 支持的图标映射（使用简短 key）
const iconMap = {
  left: ArrowLeft,
  right: ArrowRight,
  close: Close,
  view: View
};

const MENU_MIN_WIDTH = 130;
const SUBMENU_MIN_WIDTH = 120;
const EDGE_GAP = 4;

/**
 * 按窗口尺寸算出一套紧凑的尺寸令牌。
 * 摸鱼窗口通常很小，默认尺寸会显得笨重，也会更容易溢出。
 */
function computeMetrics() {
  try {
    const vh = window.innerHeight || 800;
    const vw = window.innerWidth || 600
    if (vh < 320 || vw < 380) {
      return { itemH: 20, font: 10.5, padY: 2, gap: 0 };
    }
    if (vh < 520 || vw < 560) {
      return { itemH: 23, font: 11, padY: 2, gap: 0 };
    }
    return { itemH: 26, font: 12, padY: 3, gap: 0 };
  } catch (e) {
    return { itemH: 26, font: 12, padY: 3, gap: 0 };
  }
}

const sizeStyle = computed(() => ({
  '--cm-font': `${metrics.value.font}px`,
  '--cm-pad-y': `${metrics.value.padY}px`,
  '--cm-item-h': `${metrics.value.itemH}px`,
}));

function hasChildren(item) {
  return !!(item && Array.isArray(item.children) && item.children.length);
}

/** 折叠后实际要渲染的项：原列表去掉被折叠的，末尾补一个「更多」入口 */
const visibleItems = computed(() => {
  const hidden = overflowItems.value;
  if (!hidden.length) return props.items;
  const kept = props.items.filter((it) => !hidden.includes(it));
  // 去掉尾部多余的分隔线
  while (kept.length && kept[kept.length - 1].type === 'separator') kept.pop();
  return kept.concat([{
    key: '__overflow__',
    label: '更多',
    children: hidden.map((it) => (it.type === 'separator' ? it : Object.assign({}, it))),
  }]);
});

const submenuItems = computed(() => {
  const it = visibleItems.value[openSubIndex.value];
  return hasChildren(it) ? it.children : [];
});

function onItemClick(item) {
  if (!item || item.disabled) return;
  if (hasChildren(item)) return;      // 有子菜单的项不直接触发
  emit('select', item);
}

function onItemEnter(item, i) {
  openSubIndex.value = hasChildren(item) ? i : null;
  if (hasChildren(item)) {
    nextTick(() => positionSubmenu(i));
  }
}

/**
 * 溢出处理：窗口太小时，把放不下的项折叠进末尾的「更多」子菜单。
 *
 * 策略（按重要性从后往前折叠，并始终保住导航与「更多」本身）：
 *   1. 先量出「全部项都显示」需要多高
 *   2. 超出可用高度时，从**末尾往前**折叠（越靠后越次要）
 *   3. 保底：至少保留前 KEEP_HEAD 项 + 「更多」入口，
 *      防止窗口极小时把导航也折进去（那样等于没有菜单）
 *
 * 参数: availableH - 可用高度（已扣除边距）
 *        fullH - 全部项都渲染时的高度
 */
const KEEP_HEAD = 3;   // 保底保留的头部项数（不随菜单内容变化，防止极端小时菜单被折空）

function computeOverflow(availableH, itemH) {
  const list = props.items;
  if (!list.length) { overflowItems.value = []; return; }

  // 估算一组项的高度：普通项按 itemH，分隔线按一半（下限 4px）
  const estH = (items) => items.reduce((sum, it) => {
    return sum + (it.type === 'separator' ? Math.max(4, Math.round(itemH * 0.5)) : itemH);
  }, 0);

  if (estH(list) <= availableH) { overflowItems.value = []; return; }

  // 标出「始终保留」的项：头部 KEEP_HEAD 个真实项。
  // 保底意义：窗口极小时不能让菜单只剩一个「更多」入口，那样等于没有菜单。
  const keepAlways = new Set();
  let headCount = 0;
  for (const it of list) {
    if (it.type === 'separator') continue;
    if (headCount < KEEP_HEAD) { keepAlways.add(it); headCount++ }
    else break;
  }

  const moreH = itemH;            // 自动生成的「更多」入口占一行
  const hidden = [];

  // 从尾部往前折叠，跳过必须保留的项
  for (let i = list.length - 1; i >= 0; i--) {
    const cand = list[i];
    if (keepAlways.has(cand)) continue;
    if (cand.type === 'separator') {
      // 分隔线跟着一起折，但仅在它后面确实还有内容被折时才需要
      const restH = estH(list.filter((it) => it !== cand && !hidden.includes(it))) + moreH;
      if (restH <= availableH) break;
      hidden.unshift(cand);
      continue;
    }
    hidden.unshift(cand);
    const restH = estH(list.filter((it) => !hidden.includes(it))) + moreH;
    if (restH <= availableH) break;
  }

  // 去掉隐藏组首尾的分隔线，避免「更多」里第一项就是条线
  while (hidden.length && hidden[0].type === 'separator') hidden.shift();
  while (hidden.length && hidden[hidden.length - 1].type === 'separator') hidden.pop();

  overflowItems.value = hidden;
}

/** 计算主菜单坐标与尺寸：先按窗口算令牌，再处理溢出，最后做边缘避让 */
function positionMenu() {
  if (!props.visible) { adjusted.value = null; overflowItems.value = []; return; }
  metrics.value = computeMetrics();
  const itemH = metrics.value.itemH;

  nextTick(() => {
    try {
      const vh = window.innerHeight;
      const vw = window.innerWidth;
      const availH = Math.max(itemH * (KEEP_HEAD + 1) + 8, vh - EDGE_GAP * 2);

      // 先按「不折叠」量一次真实高度，决定是否需要折叠
      const el0 = menuRef.value;
      const fullH = el0 ? el0.offsetHeight : 0;

      if (fullH > availH) {
        computeOverflow(availH, itemH);
      } else {
        overflowItems.value = [];
      }

      // 折叠会改变高度，等 DOM 更新后再做避让定位
      nextTick(() => {
        try {
          const el = menuRef.value;
          const w = el ? el.offsetWidth : MENU_MIN_WIDTH;
          const h = el ? el.offsetHeight : 0;
          let left = props.x;
          let top = props.y;
          if (left + w + EDGE_GAP > vw) left = Math.max(EDGE_GAP, vw - w - EDGE_GAP);
          if (top + h + EDGE_GAP > vh) top = Math.max(EDGE_GAP, vh - h - EDGE_GAP);
          adjusted.value = { left, top };
        } catch (e) { adjusted.value = null; }
      });
    } catch (e) { adjusted.value = null; }
  });
}

/** 子菜单贴着父项右侧；右侧放不下则翻到左侧；下方放不下则向上顶 */
function positionSubmenu(index) {
  try {
    const el = menuRef.value;
    const rows = el ? el.querySelectorAll('.context-item') : [];
    const row = rows[index];
    if (!row) { subAdjusted.value = null; return; }
    const r = row.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const itemH = metrics.value.itemH;
    let left = r.right - 4;
    let top = r.top - 6;
    if (left + SUBMENU_MIN_WIDTH + EDGE_GAP > vw) {
      left = Math.max(EDGE_GAP, r.left - SUBMENU_MIN_WIDTH + 4);
    }
    // 用当前 itemH 估算高度（与主菜单保持同一套尺寸令牌）
    const estH = submenuItems.value.reduce((sum, it) => {
      return sum + (it.type === 'separator' ? Math.max(4, Math.round(itemH * 0.5)) : itemH);
    }, 0);
    if (top + estH + EDGE_GAP > vh) top = Math.max(EDGE_GAP, vh - estH - EDGE_GAP);
    subAdjusted.value = { left, top };
  } catch (e) { subAdjusted.value = null; }
}

const style = computed(() => {
  const p = adjusted.value || { left: props.x, top: props.y };
  return { left: `${p.left}px`, top: `${p.top}px` };
});

const subStyle = computed(() => {
  if (!subAdjusted.value) return {};
  return { left: `${subAdjusted.value.left}px`, top: `${subAdjusted.value.top}px` };
});

watch(() => [props.visible, props.x, props.y], () => {
  openSubIndex.value = null;
  subAdjusted.value = null;
  positionMenu();
}, { immediate: true });

watch(() => props.items, () => { openSubIndex.value = null; subAdjusted.value = null; });

function onDocClick() {
  emit('close');
}
function onKeyDown(e) {
  if (e.key === 'Escape') emit('close');
}
// 摸鱼窗口常被拉伸，尺寸变化时重新评估折叠
function onResize() {
  if (props.visible) positionMenu();
}

onMounted(() => {
  document.addEventListener('click', onDocClick);
  document.addEventListener('keydown', onKeyDown, true);
  window.addEventListener('resize', onResize);
});
onBeforeUnmount(() => {
  document.removeEventListener('click', onDocClick);
  document.removeEventListener('keydown', onKeyDown, true);
  window.removeEventListener('resize', onResize);
});
</script>

<style scoped>
/* 尺寸由 JS 计算后通过 CSS 变量注入（--cm-font / --cm-item-h / --cm-pad-y），
   默认值取紧凑档，保证首帧也不突兀 */
.context-menu {
  position: fixed;
  z-index: 4000;
  -webkit-app-region: no-drag;
  pointer-events: auto;
  background: rgb(var(--bg-rgb));
  border: 1px solid var(--overlay-weak);
  border-radius: 5px;
  box-shadow: 0 6px 18px rgba(16, 23, 32, 0.14);
  min-width: 120px;
  padding: var(--cm-pad-y, 3px) 0;
  overflow: visible;
}
.context-menu.submenu {
  z-index: 4001;
}
.context-item {
  height: var(--cm-item-h, 26px);
  padding: 0 10px;
  font-size: var(--cm-font, 12px);
  line-height: 1;
  color: var(--text);
  cursor: pointer;
  user-select: none;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  white-space: nowrap;
  box-sizing: border-box;
}
.context-item:hover {
  background: var(--fill-soft);
}
.context-item.disabled {
  color: var(--muted);
  cursor: default;
}
.context-item.disabled:hover {
  background: transparent;
}
.context-item-icon {
  width: 14px;
  height: 14px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: calc(var(--cm-font, 12px) + 1px);
  color: var(--muted);
  flex-shrink: 0;
}
.context-item-icon svg {
  width: 12px;
  height: 12px;
}
.context-item-label {
  flex: 1 1 auto;
  text-align: left;
  overflow: hidden;
  text-overflow: ellipsis;
}
.context-item-hint {
  font-size: calc(var(--cm-font, 12px) - 1px);
  color: #b0b4bb;
  flex-shrink: 0;
}
.sub-arrow {
  font-size: calc(var(--cm-font, 12px) + 2px);
  line-height: 1;
  color: #b0b4bb;
  transform: translateY(-1px);
}
.context-separator {
  height: 1px;
  margin: 3px 0;
  background: var(--overlay-weak);
}
</style>
