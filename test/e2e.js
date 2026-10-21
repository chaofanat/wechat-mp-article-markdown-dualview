/**
 * 端到端验证：启动带插件的 Edge（有头模式），打开测试文章，
 * 断言双视图 DOM 生效，并截图保存。
 * 用法: cd test && node e2e.js
 */
'use strict';
const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawn } = require('child_process');
const puppeteer = require('puppeteer-core');

const EXT_PATH = path.resolve(__dirname, '..');
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const URL = 'https://mp.weixin.qq.com/s/On43blUWO2Egy-8nm7CJoA';
const PORT = 9333;

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

(async () => {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'wxmd-e2e-'));
  const browserProc = spawn(EDGE, [
    '--remote-debugging-port=' + PORT,
    '--user-data-dir=' + profile,
    '--no-first-run',
    '--no-default-browser-check',
    '--window-size=1800,1400',
    '--load-extension=' + EXT_PATH,
    'about:blank'
  ], { stdio: 'ignore', detached: false });

  // 等调试端口就绪
  let browser = null;
  for (let i = 0; i < 30; i++) {
    await sleep(500);
    try {
      browser = await puppeteer.connect({ browserURL: 'http://127.0.0.1:' + PORT, defaultViewport: null });
      break;
    } catch (e) { /* retry */ }
  }
  if (!browser) throw new Error('无法连接 Edge 调试端口');

  let failures = 0;
  const check = (name, ok, detail) => {
    console.log((ok ? 'PASS' : 'FAIL') + '  ' + name + (ok ? '' : '  -- ' + detail));
    if (!ok) failures++;
  };

  try {
    const page = await browser.newPage();
    await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
    // 等待内容脚本完成注入（轮询面板出现）
    let pane = false;
    for (let i = 0; i < 40; i++) {
      await sleep(500);
      pane = await page.evaluate(() => !!document.getElementById('wxmd-pane') && !document.getElementById('wxmd-pane').hidden);
      if (pane) break;
    }

    check('双视图面板已注入并激活', pane);

    if (pane) {
      const facts = await page.evaluate(() => {
        const paneEl = document.getElementById('wxmd-pane');
        const pre = paneEl.querySelector('.wxmd-pre');
        const article = document.getElementById('js_article');
        const vw = window.innerWidth;
        return {
          htmlOn: document.documentElement.classList.contains('wxmd-on'),
          mdLength: pre.textContent.length,
          mdHead: pre.textContent.slice(0, 120),
          imgCount: (pre.textContent.match(/!\[[^\]]*\]\(https?:/g) || []).length,
          domImgs: document.querySelectorAll('#js_content img[data-src]').length,
          articleRight: Math.round(article.getBoundingClientRect().right),
          paneLeft: Math.round(paneEl.getBoundingClientRect().left),
          paneVisible: paneEl.offsetWidth > 0 && paneEl.offsetHeight > 0,
          fabHidden: !document.getElementById('wxmd-fab') || document.getElementById('wxmd-fab').hidden,
          viewport: vw + 'x' + window.innerHeight
        };
      });
      console.log(JSON.stringify(facts, null, 2));

      check('html 带 wxmd-on 类', facts.htmlOn);
      check('Markdown 非空且含标题', facts.mdLength > 1000 && facts.mdHead.includes('OPC贷'), facts.mdHead);
      check('图片链接数与正文一致 (' + facts.domImgs + ')', facts.imgCount >= facts.domImgs, facts.imgCount + ' vs ' + facts.domImgs);
      check('原文约束在左半屏 (right≈paneLeft)', Math.abs(facts.articleRight - facts.paneLeft) < 40, facts.articleRight + ' vs ' + facts.paneLeft);
      check('悬浮按钮已隐藏', facts.fabHidden);

      // 测试关闭/重新打开
      await page.evaluate(() => { document.querySelector('#wxmd-pane .wxmd-icon-only').click(); });
      await sleep(300);
      const closed = await page.evaluate(() => !document.documentElement.classList.contains('wxmd-on') && document.getElementById('wxmd-fab').hidden === false);
      check('关闭后恢复单视图且悬浮按钮出现', closed);
      await page.evaluate(() => { document.getElementById('wxmd-fab').click(); });
      await sleep(300);
      const reopened = await page.evaluate(() => document.documentElement.classList.contains('wxmd-on'));
      check('悬浮按钮可重新打开双视图', reopened);

      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight * 0.4));
      await sleep(500);
      const sync = await page.evaluate(() => {
        const body = document.querySelector('#wxmd-pane .wxmd-body');
        return body.scrollTop > 10;
      });
      check('滚动同步生效', sync);

      await page.evaluate(() => window.scrollTo(0, 0));
      await sleep(300);
      await page.screenshot({ path: path.join(__dirname, 'e2e-screenshot.png') });
      console.log('截图已保存 test/e2e-screenshot.png');
    }
  } finally {
    browserProc.kill();
    try { browser.disconnect(); } catch (e) { /* ignore */ }
  }
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error('E2E ERROR:', e.message); process.exit(2); });
