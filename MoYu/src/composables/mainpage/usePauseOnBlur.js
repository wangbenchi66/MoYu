/**
 * usePauseOnBlur.js — 失焦/隐藏时暂停媒体与自动滚动
 */
import { settings } from '../useAppState.js'
import { runWebviewJS } from './useWebviewExec.js'
import { syncWebviewAutoScroll } from './useWebviewSync.js'

let _pauseListenerAttached = false
let _pausedByHide = false

/**
 * 判断一个媒体元素是否属于「音频」——应允许它在后台继续播放。
 *
 * 判定规则（任一命中即视为音频）：
 *   - 标签是 <audio>
 *   - <video> 没有可见画面：无 videoWidth（未加载到画面）且不是明确带画面的元素
 * 说明：<video> 在只播放音轨（或画面被隐藏）时也应视作音频，
 *       例如部分播客站用 <video> 承载音频。
 */
const AUDIO_DETECT_SNIPPET = `
function __glassIsAudioOnly(el) {
  try {
    if (!el) return false;
    var tag = (el.tagName || '').toLowerCase();
    if (tag === 'audio') return true;
    if (tag !== 'video') return false;
    // <video>：无画面尺寸且不可见 => 当作音频
    var noPicture = !el.videoWidth && !el.videoHeight;
    var hidden = el.offsetWidth === 0 || el.offsetHeight === 0;
    var style = window.getComputedStyle ? window.getComputedStyle(el) : null;
    var cssHidden = style ? (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') : false;
    return (noPicture && hidden) || cssHidden;
  } catch (e) { return false; }
}
`

function pauseMediaAndScroll() {
  try {
    // 允许后台播音频时，跳过纯音频元素
    const keepAudio = settings.keepAudioPlayingInBackground !== false
    const script = `(() => {
      try {
        ${AUDIO_DETECT_SNIPPET}
        const keepAudio = ${keepAudio ? 'true' : 'false'};
        const media = Array.from(document.querySelectorAll('video, audio'));
        media.forEach((el) => {
          try {
            // 允许后台播出时，纯音频元素直接放过（不暂停、不静音、不留标记）
            if (keepAudio && __glassIsAudioOnly(el)) return;
            el.__glass_reader_prev_muted = el.muted ? 1 : 0;
            el.__glass_reader_was_playing = el.paused ? 0 : 1;
            // 标记「本次确实被我们暂停了」，恢复时只处理这些元素
            el.__glass_reader_paused_by_us = 1;
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
  try {
    const script = `(() => {
      try {
        const media = Array.from(document.querySelectorAll('video, audio'));
        media.forEach((el) => {
          try {
            // 只还原「上次被我们暂停过」的元素。
            // 音频在允许后台播出时没有留下标记，因此不会被误动。
            if (!el.__glass_reader_paused_by_us) return;
            if (el.__glass_reader_prev_muted !== undefined) {
              try { el.muted = !!el.__glass_reader_prev_muted; } catch(e) {}
              try { delete el.__glass_reader_prev_muted; } catch(e) {}
            }
            if (el.__glass_reader_was_playing === 1 || el.__glass_reader_was_playing === '1') {
              try { const p = el.play(); if (p && typeof p.catch === 'function') p.catch(() => {}); } catch(e) {}
            }
            try { delete el.__glass_reader_was_playing; } catch(e) {}
            try { delete el.__glass_reader_paused_by_us; } catch(e) {}
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

/**
 * 重新评估当前暂停状态。
 * 用于「允许后台播音频」开关在暂停期间被改动时：先按旧策略恢复，再按新策略重暂停，
 * 避免遗留标记错位（表现为音频被误停 / 视频不恢复）。
 */
function reevaluatePauseState() {
  try {
    if (!_pausedByHide) return
    resumeMediaAndScroll()
    // 下一帧再暂停，确保恢复脚本已执行完（脚本是异步注入的）
    setTimeout(() => {
      try { if (_pausedByHide) pauseMediaAndScroll() } catch (e) { }
    }, 60)
  } catch (e) { }
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

export { attachPauseListeners, detachPauseListeners, reevaluatePauseState }
