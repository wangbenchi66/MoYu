/**
 * usePauseOnBlur.js — 失焦/隐藏时暂停媒体与自动滚动
 */
import { settings } from '../useAppState.js'
import { runWebviewJS } from './useWebviewExec.js'
import { syncLocalReaderAutoScroll, stopLocalReaderAutoScroll } from './useLocalReaderAutoScroll.js'
import { syncWebviewAutoScroll } from './useWebviewSync.js'

let _pauseListenerAttached = false
let _pausedByHide = false

function pauseMediaAndScroll() {
  try { stopLocalReaderAutoScroll() } catch (e) {}

  try {
    const script = `(() => {
      try {
        const media = Array.from(document.querySelectorAll('video, audio'));
        media.forEach((el) => {
          try {
            el.__glass_reader_prev_muted = el.muted ? 1 : 0;
            el.__glass_reader_was_playing = el.paused ? 0 : 1;
            if (typeof el.pause === 'function') el.pause();
            try { el.muted = true; } catch(e) {}
          } catch(e) {}
        });
        try { if (window.__glassReaderAutoScrollTimer) { window.clearInterval(window.__glassReaderAutoScrollTimer); window.__glassReaderAutoScrollTimer = null; } } catch(e) {}
        try { if (window.__glassReaderAutoScrollRAF) { window.cancelAnimationFrame(window.__glassReaderAutoScrollRAF); window.__glassReaderAutoScrollRAF = null; } } catch(e) {}
        window.__glassReaderAutoScrollPausedByGlassReader = true;
      } catch(e) {}
      return true;
    })();`
    runWebviewJS(script)
  } catch (e) {}
}

function resumeMediaAndScroll() {
  try { syncLocalReaderAutoScroll() } catch (e) {}

  try {
    const script = `(() => {
      try {
        const media = Array.from(document.querySelectorAll('video, audio'));
        media.forEach((el) => {
          try {
            if (el.__glass_reader_prev_muted !== undefined) {
              try { el.muted = !!el.__glass_reader_prev_muted; } catch(e) {}
              try { delete el.__glass_reader_prev_muted; } catch(e) {}
            }
            if (el.__glass_reader_was_playing === 1 || el.__glass_reader_was_playing === '1') {
              try { const p = el.play(); if (p && typeof p.catch === 'function') p.catch(() => {}); } catch(e) {}
            }
            try { delete el.__glass_reader_was_playing; } catch(e) {}
          } catch(e) {}
        });
        if (window.__glassReaderAutoScrollPausedByGlassReader) {
          window.__glassReaderAutoScrollPausedByGlassReader = false;
        }
      } catch(e) {}
      return true;
    })();`
    runWebviewJS(script)
    // 重新同步 webview 自动滚动
    syncWebviewAutoScroll()
  } catch (e) {}
}

function handleHideEvent() {
  if (!settings.pauseOnBlurHide) return
  if (_pausedByHide) return
  _pausedByHide = true
  pauseMediaAndScroll()
}

function handleShowEvent() {
  if (!settings.pauseOnBlurHide) return
  if (!_pausedByHide) return
  _pausedByHide = false
  resumeMediaAndScroll()
}

function onVisibilityChange() {
  try {
    if (document.hidden) handleHideEvent()
    else handleShowEvent()
  } catch (e) {}
}

function attachPauseListeners() {
  if (_pauseListenerAttached) return
  _pauseListenerAttached = true
  try { document.addEventListener('visibilitychange', onVisibilityChange) } catch (e) {}
}

function detachPauseListeners() {
  if (!_pauseListenerAttached) return
  _pauseListenerAttached = false
  try { document.removeEventListener('visibilitychange', onVisibilityChange) } catch (e) {}
  _pausedByHide = false
}

export { attachPauseListeners, detachPauseListeners }
