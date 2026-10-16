<!-- HelpPage.vue — 使用说明 -->
<script setup>
defineProps({
  isTransparent: Boolean,
});
</script>

<template>
  <div class="help-page" :class="{ 'transparent-page': isTransparent }">
    <!-- 顶部卡片 -->
    <section class="hero-card">
      <img src="/icon.png" class="app-icon" alt="MoYu" />
      <h1 class="hero-title">摸鱼工作台 使用说明</h1>
      <p class="hero-sub">一个透明浮窗式网页浏览工具，让你优雅地摸鱼</p>
    </section>

    <!-- 快速开始 -->
    <section class="section-card">
      <h2 class="section-title">
        <span class="section-icon">🚀</span>
        快速开始
      </h2>
      <div class="step-list">
        <div class="step-item">
          <span class="step-num">1</span>
          <div class="step-body">
            <strong>输入网址</strong>
            <p>在首页顶部输入框中输入任意网址，回车或点击「打开」即可在工作台内浏览网页</p>
          </div>
        </div>
        <div class="step-item">
          <span class="step-num">2</span>
          <div class="step-body">
            <strong>使用推荐站点</strong>
            <p>首页预置了常用站点卡片，点击即可快速访问。你也可以点击「+ 添加站点」来收藏自己的常用网站</p>
          </div>
        </div>
        <div class="step-item">
          <span class="step-num">3</span>
          <div class="step-body">
            <strong>调整透明度</strong>
            <p>点击顶部栏的透明度百分比按钮，可在 0%、20%、50%、85%、100% 之间循环切换，让窗口融入背景</p>
          </div>
        </div>
      </div>
    </section>

    <!-- 透明模式 -->
    <section class="section-card">
      <h2 class="section-title">
        <span class="section-icon">🪟</span>
        透明模式
      </h2>
      <p class="section-desc">摸鱼工作台的核心特性，让窗口像一层薄纱覆盖在桌面上</p>
      <div class="feature-grid">
        <div class="feature-item">
          <div class="feature-header">
            <span class="feature-badge blue">透明度</span>
          </div>
          <p>点击顶部栏的百分比按钮循环切换透明度档位。也可使用快捷键 <kbd>Alt+↑</kbd> / <kbd>Alt+↓</kbd> 逐级调整</p>
        </div>
        <div class="feature-item">
          <div class="feature-header">
            <span class="feature-badge blue">软件背景透明</span>
          </div>
          <p>顶部栏「显示器」图标，开启后软件外壳、标签栏、工具栏等所有背景变为透明，只留下网页内容</p>
        </div>
        <div class="feature-item">
          <div class="feature-header">
            <span class="feature-badge blue">网页背景透明</span>
          </div>
          <p>顶部栏「图片」图标，开启后网页本身的背景也会变透明，文字浮于桌面之上，适合阅读类场景</p>
        </div>
        <div class="feature-item">
          <div class="feature-header">
            <span class="feature-badge green">灰度模式</span>
          </div>
          <p>在设置中开启，将整个网页变为灰度显示，降低色彩对注意力的吸引</p>
        </div>
      </div>
    </section>

    <!-- 隐藏与伪装 -->
    <section class="section-card">
      <h2 class="section-title">
        <span class="section-icon">🙈</span>
        隐藏与伪装
      </h2>
      <p class="section-desc">关键时刻瞬间消失的多种方式</p>
      <div class="feature-grid">
        <div class="feature-item">
          <div class="feature-header">
            <span class="feature-badge red">老板键</span>
            <kbd class="kbd">Alt+Q</kbd>
          </div>
          <p>全局快捷键，任何情况下按下即可瞬间隐藏整个窗口，再按一次恢复。可在设置中自定义按键</p>
        </div>
        <div class="feature-item">
          <div class="feature-header">
            <span class="feature-badge orange">自动隐藏</span>
          </div>
          <p>顶部栏「鼠标指针」图标。开启后鼠标移出窗口自动隐藏，移入时恢复显示；再次点击可切换为「移入不显示」模式</p>
        </div>
        <div class="feature-item">
          <div class="feature-header">
            <span class="feature-badge orange">悬停标题栏</span>
          </div>
          <p>顶部栏「隐藏」图标。开启后标题栏自动收起，仅当鼠标靠近窗口顶部时才浮现，最大化浏览区域</p>
        </div>
        <div class="feature-item">
          <div class="feature-header">
            <span class="feature-badge orange">鼠标穿透</span>
            <kbd class="kbd">Ctrl+Alt+T</kbd>
          </div>
          <p>启用后鼠标操作会穿透窗口，直接操作下方的应用。适合将窗口当「背景板」使用时开启</p>
        </div>
        <div class="feature-item">
          <div class="feature-header">
            <span class="feature-badge purple">关闭到托盘</span>
          </div>
          <p>点击关闭按钮时，窗口最小化到系统托盘而非退出程序。托盘图标支持右键菜单快速恢复窗口</p>
        </div>
      </div>
    </section>

    <!-- 底部工具栏 -->
    <section class="section-card">
      <h2 class="section-title">
        <span class="section-icon">🔧</span>
        底部工具栏
      </h2>
      <p class="section-desc">将鼠标移到窗口右下角，出现悬浮按钮，点击展开工具栏</p>
      <div class="toolbar-desc">
        <div class="toolbar-group">
          <h3>导航控制</h3>
          <ul>
            <li><strong>← 后退 / → 前进</strong>：网页导航历史来回切换</li>
            <li><strong>刷新</strong>：重新加载当前网页</li>
            <li><strong>缩放</strong>：显示当前缩放比例，点击重置为 100%，滚动滚轮可快速缩放</li>
            <li><strong>外部打开</strong>：在系统默认浏览器中打开当前网页</li>
          </ul>
        </div>
        <div class="toolbar-group">
          <h3>阅读增强</h3>
          <ul>
            <li><strong>字（字号）</strong>：点击开启强制字号模式，滚动滚轮调节 80%–160% 字号范围</li>
            <li><strong>自动滚动</strong>：点击开启/关闭，滚动滚轮调节速度（5–80），适合长文阅读</li>
            <li><strong>无图模式</strong>：隐藏网页中所有图片，专注于文字内容</li>
            <li><strong>文字颜色</strong>：开启后可选色器替换网页文字颜色，适应不同背景</li>
            <li><strong>滚动条</strong>：切换是否显示网页滚动条</li>
          </ul>
        </div>
      </div>
    </section>

    <!-- 快捷键总览 -->
    <section class="section-card">
      <h2 class="section-title">
        <span class="section-icon">⌨️</span>
        快捷键总览
      </h2>
      <div class="shortcut-table">
        <div class="shortcut-row header">
          <span class="shortcut-key-col">快捷键</span>
          <span class="shortcut-action-col">功能</span>
          <span class="shortcut-scope-col">范围</span>
        </div>
        <div class="shortcut-row">
          <span class="shortcut-key"><kbd>Alt+Q</kbd></span>
          <span class="shortcut-action">老板键（瞬间隐藏/恢复窗口）</span>
          <span class="shortcut-scope">
            <span class="scope-badge global">全局</span>
          </span>
        </div>
        <div class="shortcut-row">
          <span class="shortcut-key"><kbd>Alt+↑</kbd></span>
          <span class="shortcut-action">降低透明度</span>
          <span class="shortcut-scope">
            <span class="scope-badge local">窗口</span>
          </span>
        </div>
        <div class="shortcut-row">
          <span class="shortcut-key"><kbd>Alt+↓</kbd></span>
          <span class="shortcut-action">提高透明度</span>
          <span class="shortcut-scope">
            <span class="scope-badge local">窗口</span>
          </span>
        </div>
        <div class="shortcut-row">
          <span class="shortcut-key"><kbd>Ctrl+Alt+T</kbd></span>
          <span class="shortcut-action">切换鼠标穿透</span>
          <span class="shortcut-scope">
            <span class="scope-badge local">窗口</span>
          </span>
        </div>
        <div class="shortcut-row">
          <span class="shortcut-key"><kbd>=</kbd></span>
          <span class="shortcut-action">切换自动滚动</span>
          <span class="shortcut-scope">
            <span class="scope-badge local">窗口</span>
          </span>
        </div>
        <div class="shortcut-row">
          <span class="shortcut-key"><kbd>[</kbd></span>
          <span class="shortcut-action">减慢自动滚动速度</span>
          <span class="shortcut-scope">
            <span class="scope-badge local">窗口</span>
          </span>
        </div>
        <div class="shortcut-row">
          <span class="shortcut-key"><kbd>]</kbd></span>
          <span class="shortcut-action">加快自动滚动速度</span>
          <span class="shortcut-scope">
            <span class="scope-badge local">窗口</span>
          </span>
        </div>
      </div>
      <p class="hint-text">所有快捷键均可在「设置 → 快捷键」中自定义修改</p>
    </section>

    <!-- 其他功能 -->
    <section class="section-card">
      <h2 class="section-title">
        <span class="section-icon">✨</span>
        更多功能
      </h2>
      <div class="feature-grid">
        <div class="feature-item">
          <div class="feature-header">
            <span class="feature-badge blue">摸鱼统计</span>
          </div>
          <p>自动记录你在工作台中停留的时长，按日分组统计。在「个人中心 → 摸鱼时间统计」查看今日、历史和累计数据</p>
        </div>
        <div class="feature-item">
          <div class="feature-header">
            <span class="feature-badge green">历史记录</span>
          </div>
          <p>自动记录浏览过的网站，支持搜索和分页。在「首页 → 历史记录」中查看</p>
        </div>
        <div class="feature-item">
          <div class="feature-header">
            <span class="feature-badge purple">书架与阅读</span>
          </div>
          <p>支持导入 EPUB / PDF / TXT 本地文件，内置连续滚动阅读器，支持目录导航和字号调节</p>
        </div>
        <div class="feature-item">
          <div class="feature-header">
            <span class="feature-badge green">站点规则</span>
          </div>
          <p>内置知乎、微信读书等站点增强脚本，可针对不同网站自动注入优化样式。开发者可自行添加新规则</p>
        </div>
        <div class="feature-item">
          <div class="feature-header">
            <span class="feature-badge orange">窗口置顶</span>
          </div>
          <p>顶部栏「锁」图标，开启后窗口始终浮于所有应用之上，不会被其他窗口遮挡</p>
        </div>
        <div class="feature-item">
          <div class="feature-header">
            <span class="feature-badge red">防截屏</span>
          </div>
          <p>在设置中开启，启用系统内容保护，防止录屏/截屏软件捕获窗口内容</p>
        </div>
      </div>
    </section>

    <!-- 使用技巧 -->
    <section class="section-card tips-card">
      <h2 class="section-title">
        <span class="section-icon">💡</span>
        使用技巧
      </h2>
      <div class="tip-list">
        <div class="tip-item">
          <strong>最佳摸鱼组合</strong>
          <span>开启「软件背景透明」+「网页背景透明」+ 适当透明度（50%~85%），窗口几乎融入桌面背景</span>
        </div>
        <div class="tip-item">
          <strong>阅读模式</strong>
          <span>开启「自动滚动」+「无图模式」+ 合适字号，双手解放阅读长文，老板键随时待命</span>
        </div>
        <div class="tip-item">
          <strong>多标签浏览</strong>
          <span>顶部标签栏支持右键菜单管理标签页，在不同网站之间自由切换</span>
        </div>
        <div class="tip-item">
          <strong>鼠标穿透看大盘</strong>
          <span>开启鼠标穿透后，可以把网页行情数据固定在桌面背景上，鼠标完全不影响操作</span>
        </div>
      </div>
    </section>
  </div>
</template>

<style scoped>
.help-page {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 8px 6px;
  max-width: 800px;
  margin: 0 auto;
  width: 100%;
  box-sizing: border-box;
}

.help-page.transparent-page .hero-card,
.help-page.transparent-page .section-card,
.help-page.transparent-page .tips-card {
  background: transparent !important;
  box-shadow: none !important;
}

.help-page.transparent-page kbd {
  background: rgba(var(--bg-rgb), 0.2) !important;
  border-color: rgba(var(--bg-rgb), 0.3) !important;
}

/* 顶部卡片 */
.hero-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  padding: 24px 12px 18px;
  background: var(--surface);
  border-radius: 8px;
  text-align: center;
}

.app-icon {
  width: 48px;
  height: 48px;
  border-radius: 12px;
}

.hero-title {
  margin: 4px 0 0;
  font-size: 16px;
  font-weight: 600;
  color: var(--text);
}

.hero-sub {
  margin: 0;
  font-size: 12px;
  color: var(--text-secondary);
}

/* 通用卡片 */
.section-card {
  background: var(--surface);
  border-radius: 8px;
  padding: 12px;
}

.section-title {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 14px;
  font-weight: 600;
  color: var(--text);
  margin: 0 0 8px;
}

.section-icon {
  font-size: 16px;
  line-height: 1;
}

.section-desc {
  font-size: 12px;
  color: var(--text-secondary);
  margin: 0 0 10px;
  line-height: 1.5;
}

/* 步骤列表 */
.step-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.step-item {
  display: flex;
  gap: 10px;
  align-items: flex-start;
}

.step-num {
  flex-shrink: 0;
  width: 22px;
  height: 22px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  background: var(--primary-soft);
  color: var(--primary);
  font-size: 11px;
  font-weight: 700;
}

.step-body {
  flex: 1;
  min-width: 0;
}

.step-body strong {
  font-size: 13px;
  font-weight: 600;
  color: var(--text);
}

.step-body p {
  margin: 2px 0 0;
  font-size: 12px;
  color: var(--text-secondary);
  line-height: 1.5;
}

/* 功能网格 */
.feature-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}

.feature-item {
  padding: 10px;
  border-radius: 8px;
  background: var(--overlay-weak);
  border: 1px solid var(--fill-soft);
}

.feature-header {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 6px;
}

.feature-badge {
  font-size: 11px;
  font-weight: 600;
  padding: 2px 8px;
  border-radius: 4px;
  white-space: nowrap;
}

.feature-badge.blue {
  background: var(--primary-soft);
  color: var(--primary);
}

.feature-badge.green {
  background: rgba(103, 194, 58, 0.1);
  color: var(--success);
}

.feature-badge.red {
  background: rgba(245, 108, 108, 0.1);
  color: var(--danger);
}

.feature-badge.orange {
  background: rgba(230, 162, 60, 0.1);
  color: var(--warning);
}

.feature-badge.purple {
  background: rgba(156, 100, 220, 0.1);
  color: #9c64dc;
}

.feature-item p {
  margin: 0;
  font-size: 12px;
  color: var(--text-secondary);
  line-height: 1.6;
}

/* 工具栏说明 */
.toolbar-desc {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.toolbar-group h3 {
  font-size: 12px;
  font-weight: 600;
  color: var(--text);
  margin: 0 0 6px;
}

.toolbar-group ul {
  margin: 0;
  padding-left: 16px;
}

.toolbar-group li {
  font-size: 12px;
  color: var(--text-secondary);
  line-height: 1.8;
}

.toolbar-group li strong {
  color: var(--text);
  font-weight: 600;
}

/* 快捷键表格 */
.shortcut-table {
  display: flex;
  flex-direction: column;
  border: 1px solid var(--fill-soft);
  border-radius: 8px;
  overflow: hidden;
}

.shortcut-row {
  display: flex;
  align-items: center;
  padding: 8px 10px;
  border-bottom: 1px solid var(--fill-soft);
  font-size: 12px;
}

.shortcut-row:last-child {
  border-bottom: none;
}

.shortcut-row.header {
  background: var(--overlay-weak);
  font-weight: 600;
  color: var(--text-secondary);
  font-size: 11px;
}

.shortcut-key-col {
  width: 100px;
  flex-shrink: 0;
}

.shortcut-action-col {
  flex: 1;
  min-width: 0;
}

.shortcut-scope-col {
  width: 44px;
  flex-shrink: 0;
  text-align: right;
}

.shortcut-key {
  width: 100px;
  flex-shrink: 0;
}

.shortcut-action {
  flex: 1;
  min-width: 0;
  color: var(--text-secondary);
}

.shortcut-scope {
  width: 44px;
  flex-shrink: 0;
  text-align: right;
}

kbd {
  display: inline-block;
  padding: 1px 6px;
  font-family: inherit;
  font-size: 11px;
  font-weight: 600;
  color: var(--text);
  background: var(--overlay-weak);
  border: 1px solid var(--overlay);
  border-radius: 4px;
  white-space: nowrap;
}

.scope-badge {
  display: inline-block;
  padding: 1px 6px;
  font-size: 10px;
  font-weight: 600;
  border-radius: 3px;
}

.scope-badge.global {
  background: rgba(245, 108, 108, 0.1);
  color: var(--danger);
}

.scope-badge.local {
  background: var(--primary-soft);
  color: var(--primary);
}

.hint-text {
  margin: 8px 0 0;
  font-size: 11px;
  color: var(--muted);
  text-align: center;
}

/* 使用技巧 */
.tip-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.tip-item {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 8px 10px;
  border-radius: 6px;
  background: rgba(47, 120, 255, 0.04);
  border-left: 3px solid var(--primary);
}

.tip-item strong {
  font-size: 12px;
  font-weight: 600;
  color: var(--text);
}

.tip-item span {
  font-size: 12px;
  color: var(--text-secondary);
  line-height: 1.5;
}

/* 响应式：窄屏单列 */
@media (max-width: 400px) {
  .feature-grid {
    grid-template-columns: 1fr;
  }
}
</style>
