<!-- PrivacyConsent.vue — 首次启动隐私知情同意弹窗，未同意则每次启动持续弹出 -->
<script setup>
const emit = defineEmits(['agreed', 'dismissed']);

function handleAgree() {
  localStorage.setItem('moyu-privacy-consent', '1');
  emit('agreed');
}

// 仅关闭本次显示，不写 localStorage，下次启动仍会弹出
function handleDismiss() {
  emit('dismissed');
}
</script>

<template>
  <div class="privacy-overlay">
    <div class="privacy-card">
      <img
        src="/icon.png"
        class="privacy-icon"
        alt="MoYu" />
      <h2 class="privacy-title">帮助我们做得更好</h2>

      <p class="privacy-text">摸鱼工作台会匿名收集极少量的设备信息，用于统计活跃用户数和崩溃分析，帮助我们改进产品。</p>
      <p class="privacy-text">我们不会收集任何能识别你个人身份或硬件的信息。所有数据均以加密哈希形式匿名上报，无法追溯到具体设备。</p>

      <div class="btn-group">
        <button
          class="dismiss-btn"
          @click="handleDismiss"
          title="暂不同意，下次继续提示">
          ✕
        </button>
        <button
          class="agree-btn"
          @click="handleAgree">
          同意并继续
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.privacy-overlay {
  position: fixed;
  inset: 0;
  z-index: 99999;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(255, 255, 255, 0.92);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
}

.privacy-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  width: min(380px, 88%);
  padding: 32px 28px 24px;
  background: #fff;
  border-radius: 16px;
  box-shadow:
    0 20px 60px rgba(0, 0, 0, 0.12),
    0 0 0 1px rgba(0, 0, 0, 0.04);
  text-align: center;
}

.privacy-icon {
  width: 56px;
  height: 56px;
  border-radius: 14px;
  margin-bottom: 16px;
}

.privacy-title {
  font-size: 18px;
  font-weight: 600;
  color: var(--text, #283247);
  margin: 0 0 16px;
}

.privacy-text {
  font-size: 13px;
  color: var(--text-secondary, #6f7a90);
  line-height: 1.7;
  margin: 0 0 10px;
  text-align: left;
  width: 100%;
}

.privacy-text:last-of-type {
  margin-bottom: 20px;
}

.btn-group {
  display: flex;
  gap: 8px;
  width: 100%;
  align-items: stretch;
}

.agree-btn {
  flex: 1;
  padding: 13px 0;
  border: none;
  border-radius: 10px;
  background: #409eff;
  color: #fff;
  font-size: 15px;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.15s ease;
  letter-spacing: 0.5px;
}

.agree-btn:hover {
  background: #337ecc;
}

.dismiss-btn {
  flex: 0 0 44px;
  width: 44px;
  border: 1px solid #e8e8e8;
  border-radius: 10px;
  background: #fafafa;
  color: #bbb;
  font-size: 15px;
  cursor: pointer;
  transition:
    background 0.12s,
    border-color 0.12s,
    color 0.12s;
  display: flex;
  align-items: center;
  justify-content: center;
}

.dismiss-btn:hover {
  background: #f0f0f0;
  border-color: #ccc;
  color: #888;
}
</style>
