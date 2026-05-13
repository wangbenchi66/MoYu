/**
 * useLocalReaderAutoScroll.js — 本地阅读器（local-text）自动滚动
 */
import { ref } from 'vue'
import { activeTab, settings } from '../useAppState.js'

const localReaderRef = ref(null)
let localScrollTimer = null
let localScrollRaf = null
let localScrollLastTs = null
let localScrollAcc = 0
let localUserInteractingAt = null
let localAutoHandlers = null

function stopLocalReaderAutoScroll() {
  if (localScrollTimer) {
    window.clearInterval(localScrollTimer)
    localScrollTimer = null
  }
  if (localScrollRaf) {
    try { window.cancelAnimationFrame(localScrollRaf) } catch (e) {}
    localScrollRaf = null
    localScrollLastTs = null
  }
  try {
    const el = localReaderRef && localReaderRef.value ? localReaderRef.value : null
    if (el && localAutoHandlers) {
      try { el.removeEventListener('wheel', localAutoHandlers.wheel) } catch (e) {}
      try { el.removeEventListener('pointerdown', localAutoHandlers.pointerdown) } catch (e) {}
      try { el.removeEventListener('touchstart', localAutoHandlers.touchstart) } catch (e) {}
      try { el.removeEventListener('keydown', localAutoHandlers.keydown) } catch (e) {}
    }
  } catch (e) {}
  localAutoHandlers = null
  localUserInteractingAt = null
  localScrollAcc = 0
}

function syncLocalReaderAutoScroll() {
  stopLocalReaderAutoScroll()

  if (!settings.autoScrollEnabled || activeTab.value?.kind !== 'local-text' || !localReaderRef.value) {
    return
  }

  const speedPxPerSec = Math.max(12, Math.round((settings.autoScrollSpeed || 22) * 3))
  localScrollLastTs = performance.now()
  localScrollAcc = 0

  try {
    const el = localReaderRef.value
    if (el) {
      const onUser = function () { localUserInteractingAt = performance.now() }
      const onKey = function (ev) {
        try {
          const k = ev && ev.key ? ev.key : ''
          if (['ArrowDown', 'ArrowUp', 'PageDown', 'PageUp', ' '].includes(k)) localUserInteractingAt = performance.now()
        } catch (e) {}
      }
      localAutoHandlers = { wheel: onUser, pointerdown: onUser, touchstart: onUser, keydown: onKey }
      try { el.addEventListener('wheel', onUser, { passive: true }) } catch (e) { try { el.addEventListener('wheel', onUser) } catch (e) {} }
      try { el.addEventListener('pointerdown', onUser, { passive: true }) } catch (e) { try { el.addEventListener('pointerdown', onUser) } catch (e) {} }
      try { el.addEventListener('touchstart', onUser, { passive: true }) } catch (e) { try { el.addEventListener('touchstart', onUser) } catch (e) {} }
      try { el.addEventListener('keydown', onKey) } catch (e) {}
    }
  } catch (e) {}

  function localStep(ts) {
    try {
      const now = ts || performance.now()
      const delta = now - localScrollLastTs
      localScrollLastTs = now

      if (localUserInteractingAt && now - localUserInteractingAt < 300) {
        localScrollRaf = window.requestAnimationFrame(localStep)
        return
      }

      localScrollAcc += (speedPxPerSec * delta) / 1000
      const toScroll = Math.floor(localScrollAcc)
      if (toScroll >= 1) {
        try {
          if (localReaderRef.value) localReaderRef.value.scrollBy({ top: toScroll, behavior: 'auto' })
        } catch (e) {}
        localScrollAcc -= toScroll
      }
    } catch (e) {}
    localScrollRaf = window.requestAnimationFrame(localStep)
  }

  localScrollRaf = window.requestAnimationFrame(localStep)
}

function applyLocalReaderStyles() {
  try {
    if (!localReaderRef.value) return
    if (settings.forceReaderTextColor) {
      localReaderRef.value.style.color = settings.readerTextColor || ''
    } else {
      localReaderRef.value.style.color = ''
    }
    if (settings.forceReaderFont) {
      localReaderRef.value.style.fontSize = `${settings.readerFontScale}%`
    } else {
      localReaderRef.value.style.fontSize = ''
    }
  } catch (e) {}
}

export {
  localReaderRef,
  stopLocalReaderAutoScroll, syncLocalReaderAutoScroll, applyLocalReaderStyles,
}
