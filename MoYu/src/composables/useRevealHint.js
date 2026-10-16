/**
 * useRevealHint.js — 窗口被唤出时的一闪提示
 *
 * 解决的问题：
 *   当「软件背景透明 + 网页背景透明 + 标题栏悬停隐藏」同时开启时，窗口虽然显示
 *   出来了，但视觉上和桌面几乎无法区分。用户连按几次老板键后会完全找不到窗口，
 *   只能靠托盘"显示主窗口"或反复试探鼠标位置。
 *
 * 做法：
 *   主进程在窗口显示时广播 `window:revealed`，这里收到后给外壳加一个 class，
 *   让窗口**四周闪一下细描边**（150ms），随后自动移除。
 *
 *   ⚠️ 只画描边，**不**恢复透明度、**不**弹出顶栏 —— 见 App.vue 中
 *   `.window-shell.reveal-hint` 的注释：这是摸鱼软件，
 *   "突然出现的实心方块"比一条细线显眼得多，风险也高得多。
 *
 * 关键设计：
 *   1. **不改设置、不落盘** —— 只是临时的视觉覆盖（CSS class），
 *      用户的选择不会被这次闪烁篡改；结束后完全回到原样。
 *   2. 时长极短（见 REVEAL_DURATION_MS），原则是「看到时已经结束了」。
 *   3. 多次按键时重新计时，而不是叠加多个定时器。
 *   4. 用户一旦有任何操作（点击/按键/滚轮），立即结束 ——
 *      说明他已经找到窗口了，不必再等。
 */

import { ref, onUnmounted } from 'vue'

// 提示持续时长。
//
// ⚠️ 这个值刻意压到极短，因为**这是摸鱼软件**：
// 任何持续存在的视觉异常都可能被旁边的人发现。用户的原话是
// "时间长容易被发现"。所以原则是「看到的时候已经结束了」。
//
// 演进：2200ms（太像卡顿）→ 520ms（仍嫌久）→ 150ms。
//
// 与 CSS 动画时长（App.vue 的 reveal-flash，0.15s）对齐；
// 这里留 30ms 余量纯粹是兜底——确保动画放完后才移除 class，
// 避免在动画中途撤掉导致视觉上"闪一半"。
const REVEAL_DURATION_MS = 180

// 是否正在高亮
export const isRevealing = ref(false)

let _timer = null
let _detach = null

/**
 * 开始高亮。重复调用会重新计时。
 */
function startReveal() {
  isRevealing.value = true

  if (_timer) clearTimeout(_timer)
  _timer = setTimeout(() => {
    isRevealing.value = false
    _timer = null
  }, REVEAL_DURATION_MS)
}

/**
 * 立刻结束高亮
 */
function endReveal() {
  if (_timer) {
    clearTimeout(_timer)
    _timer = null
  }
  isRevealing.value = false
}

/**
 * 判断当前是否需要高亮。
 *
 * 两个条件都为真才高亮：
 *   1. 设置里允许（revealHintOnShow，默认开）—— 用户可以关掉这个打扰
 *   2. 窗口真的可能看不见 —— 软件透明（外壳没了）或 标题栏悬停隐藏（顶栏没了）
 *
 * 第 2 条用「或」：任一成立用户就可能需要提示。
 * 两者都关时窗口本身清晰可见，高亮纯属打扰，因此不高亮。
 */
function needsReveal(settings) {
  try {
    if (!settings) return false
    // 用户关掉了这个功能
    if (settings.revealHintOnShow === false) return false
    return !!(settings.fullWindowTransparent || settings.hoverHeaderMode)
  } catch (e) {
    return false
  }
}

/**
 * 安装监听。由 App.vue 在挂载时调用一次。
 * 参数 getSettings: () => 当前 settings 对象（用函数取值，避免闭包锁死旧值）
 */
export function attachRevealHint(getSettings) {
  // 用户有操作即认为"已经找到了"，提前结束高亮
  const onUserAction = () => {
    if (isRevealing.value) endReveal()
  }

  try {
    window.addEventListener('pointerdown', onUserAction, true)
    window.addEventListener('keydown', onUserAction, true)
    window.addEventListener('wheel', onUserAction, { capture: true, passive: true })
  } catch (e) { }

  const desktop = typeof window !== 'undefined' ? window.desktop : null
  if (!desktop || typeof desktop.onWindowRevealed !== 'function') {
    // 纯浏览器环境（npm run dev:web）没有这个事件，静默跳过
    _detach = () => {
      try {
        window.removeEventListener('pointerdown', onUserAction, true)
        window.removeEventListener('keydown', onUserAction, true)
        window.removeEventListener('wheel', onUserAction, true)
      } catch (e) { }
    }
    return
  }

  const off = desktop.onWindowRevealed(() => {
    if (needsReveal(getSettings && getSettings())) {
      startReveal()
    }
  })

  _detach = () => {
    try { if (typeof off === 'function') off() } catch (e) { }
    try {
      window.removeEventListener('pointerdown', onUserAction, true)
      window.removeEventListener('keydown', onUserAction, true)
      window.removeEventListener('wheel', onUserAction, true)
    } catch (e) { }
  }
}

/**
 * 卸载监听与定时器
 */
export function detachRevealHint() {
  endReveal()
  if (_detach) {
    try { _detach() } catch (e) { }
    _detach = null
  }
}

/**
 * 在组件中使用：自动在 onUnmounted 时清理
 */
export function useRevealHint(getSettings) {
  attachRevealHint(getSettings)
  onUnmounted(() => detachRevealHint())
  return { isRevealing, endReveal }
}
