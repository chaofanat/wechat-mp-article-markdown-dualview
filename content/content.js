/**
 * 微信公众号文章 Markdown 双视图 - 内容脚本
 *
 * 页面加载完成后自动将 #js_content 转换为 Markdown，
 * 右半屏注入 Markdown 面板，原文约束在左半屏，双向滚动同步。
 */
(function () {
  'use strict';

  var PANE_ID = 'wxmd-pane';
  var FAB_ID = 'wxmd-fab';
  var AUTO_MIN_WIDTH = 900; // 视口窄于该值时不自动开启，仍可手动打开

  var state = {
    markdown: '',
    meta: null,
    pane: null,
    fab: null,
    syncing: false,
    active: false
  };

  /* ---------- 元信息 ---------- */

  function buildMeta() {
    var title = '';
    var titleEl = document.querySelector('#activity-name') || document.querySelector('.rich_media_title');
    if (titleEl) title = titleEl.textContent.replace(/\s+/g, ' ').trim();

    var account = '';
    var nameEl = document.querySelector('#js_name');
    if (nameEl) account = nameEl.textContent.replace(/\s+/g, ' ').trim();

    return { title: title, account: account, date: findPublishDate(), url: location.href.split('#')[0] };
  }

  function findPublishDate() {
    var el = document.querySelector('#publish_time');
    if (el && el.textContent.trim()) return el.textContent.trim();
    // 页面脚本里 var ct = "1792396060" / var oriCreateTime = '1792396060'
    var scripts = document.getElementsByTagName('script');
    for (var i = 0; i < scripts.length; i++) {
      var m = scripts[i].textContent.match(/var\s+(?:ct|oriCreateTime)\s*=\s*["']?(\d{9,11})/);
      if (m) {
        var ts = parseInt(m[1], 10);
        if (m[1].length <= 10) ts *= 1000;
        var d = new Date(ts);
        return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
      }
    }
    return '';
  }

  /* ---------- 转换 ---------- */

  function convert() {
    var content = document.getElementById('js_content');
    var body = window.WxMarkdown.toMarkdown(content);
    var meta = state.meta = buildMeta();
    var head = '# ' + meta.title;
    var sub = [];
    if (meta.account) sub.push('「' + meta.account + '」微信公众号');
    if (meta.date) sub.push(meta.date);
    sub.push('[原文链接](' + meta.url + ')');
    state.markdown = head + '\n\n> ' + sub.join(' · ') + '\n\n' + body;
  }

  /* ---------- UI ---------- */

  function buildPane() {
    var pane = document.createElement('aside');
    pane.id = PANE_ID;
    pane.className = 'wxmd-pane';

    var head = document.createElement('header');
    head.className = 'wxmd-head';

    var info = document.createElement('div');
    info.className = 'wxmd-info';
    var label = document.createElement('span');
    label.className = 'wxmd-label';
    label.textContent = 'Markdown';
    var metaLine = document.createElement('span');
    metaLine.className = 'wxmd-meta';
    metaLine.textContent = [state.meta.account, state.meta.date].filter(Boolean).join(' · ');
    info.appendChild(label);
    info.appendChild(metaLine);

    var actions = document.createElement('div');
    actions.className = 'wxmd-actions';
    var copyBtn = mkBtn('复制', 'wxmd-primary');
    var dlBtn = mkBtn('下载 .md', '');
    var closeBtn = mkBtn('✕', 'wxmd-icon-only');
    closeBtn.title = '关闭双视图 (Esc)';
    copyBtn.addEventListener('click', onCopy);
    dlBtn.addEventListener('click', onDownload);
    closeBtn.addEventListener('click', function () { setActive(false); });
    actions.appendChild(copyBtn);
    actions.appendChild(dlBtn);
    actions.appendChild(closeBtn);

    head.appendChild(info);
    head.appendChild(actions);

    var body = document.createElement('div');
    body.className = 'wxmd-body';
    var pre = document.createElement('pre');
    pre.className = 'wxmd-pre';
    pre.textContent = state.markdown; // textContent 天然防注入
    body.appendChild(pre);

    var toast = document.createElement('div');
    toast.className = 'wxmd-toast';
    toast.hidden = true;

    pane.appendChild(head);
    pane.appendChild(body);
    pane.appendChild(toast);
    document.body.appendChild(pane);

    state.pane = pane;
    wireScrollSync(body);
    pane.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') setActive(false);
    });
  }

  function mkBtn(text, extraClass) {
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'wxmd-btn' + (extraClass ? ' ' + extraClass : '');
    b.textContent = text;
    return b;
  }

  function buildFab() {
    var fab = document.createElement('button');
    fab.id = FAB_ID;
    fab.type = 'button';
    fab.className = 'wxmd-fab';
    fab.textContent = 'MD 双视图';
    fab.addEventListener('click', function () { setActive(true); });
    document.body.appendChild(fab);
    state.fab = fab;
  }

  function setActive(on) {
    if (on && !state.pane) return;
    state.active = on;
    document.documentElement.classList.toggle('wxmd-on', on);
    state.pane.hidden = !on;
    state.fab.hidden = on;
    applyLeftColumn(on);
    if (on) syncToPane();
  }

  /**
   * 原文约束到左半屏。微信的布局样式在跨域样式表里且带 !important、
   * 晚于内容脚本注入，纯 CSS 竞争不稳定，故用行内样式 + important 强制。
   */
  function applyLeftColumn(on) {
    var ids = ['js_article', 'content_bottom_area'];
    for (var i = 0; i < ids.length; i++) {
      var el = document.getElementById(ids[i]);
      if (!el) continue;
      if (on) {
        el.style.setProperty('max-width', '50vw', 'important');
        el.style.setProperty('margin-inline', '0 auto', 'important');
      } else {
        el.style.removeProperty('max-width');
        el.style.removeProperty('margin-inline');
      }
    }
  }

  /* ---------- 操作 ---------- */

  function showToast(text) {
    var toast = state.pane.querySelector('.wxmd-toast');
    toast.textContent = text;
    toast.hidden = false;
    clearTimeout(showToast._t);
    showToast._t = setTimeout(function () { toast.hidden = true; }, 1600);
  }

  function onCopy() {
    copyText(state.markdown, function (ok) {
      showToast(ok ? '已复制到剪贴板 ✓' : '复制失败，请手动选择文本复制');
    });
  }

  function copyText(text, cb) {
    var legacy = function () {
      var ta = document.createElement('textarea');
      ta.value = text;
      ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0;';
      document.body.appendChild(ta);
      ta.select();
      var ok = false;
      try { ok = document.execCommand('copy'); } catch (e) { /* ignore */ }
      ta.remove();
      cb(ok);
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () { cb(true); }, legacy);
    } else {
      legacy();
    }
  }

  function onDownload() {
    var name = (state.meta.title || '微信公众号文章').replace(/[\\/:*?"<>|\r\n]/g, '').slice(0, 60) || '微信公众号文章';
    var blob = new Blob([state.markdown], { type: 'text/markdown;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = name + '.md';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    showToast('已开始下载 .md');
  }

  /* ---------- 滚动同步（按比例） ---------- */

  function syncToPane() {
    if (!state.active || state.syncing) return;
    var body = state.pane.querySelector('.wxmd-body');
    var maxDoc = document.documentElement.scrollHeight - window.innerHeight;
    var maxPane = body.scrollHeight - body.clientHeight;
    if (maxDoc <= 0 || maxPane <= 0) return;
    state.syncing = true;
    body.scrollTop = (window.scrollY / maxDoc) * maxPane;
    requestAnimationFrame(function () { state.syncing = false; });
  }

  function syncToWindow() {
    if (!state.active || state.syncing) return;
    var body = state.pane.querySelector('.wxmd-body');
    var maxDoc = document.documentElement.scrollHeight - window.innerHeight;
    var maxPane = body.scrollHeight - body.clientHeight;
    if (maxDoc <= 0 || maxPane <= 0) return;
    state.syncing = true;
    window.scrollTo(0, (body.scrollTop / maxPane) * maxDoc);
    requestAnimationFrame(function () { state.syncing = false; });
  }

  function wireScrollSync(body) {
    window.addEventListener('scroll', syncToPane, { passive: true });
    body.addEventListener('scroll', syncToWindow, { passive: true });
  }

  /* ---------- 等待文章就绪 ---------- */

  function articleReady() {
    var content = document.getElementById('js_content');
    if (!content || !document.getElementById('activity-name')) return false;
    // 正文 SSR 直出；为空说明还在加载，继续等
    return content.textContent.trim().length > 0 || content.querySelector('img');
  }

  function whenReady(cb, tries) {
    if (articleReady()) { cb(); return; }
    if (tries <= 0) return;
    setTimeout(function () { whenReady(cb, tries - 1); }, 300);
  }

  whenReady(function () {
    // 微信初始将 js_content 设为 visibility:hidden，页面脚本就绪后才显示，
    // 内容本身已在 DOM 中，稍等片刻让页面先渲染
    setTimeout(function () {
      convert();
      buildPane();
      buildFab();
      setActive(window.matchMedia('(min-width: ' + AUTO_MIN_WIDTH + 'px)').matches);
    }, 200);
  }, 50);
})();
