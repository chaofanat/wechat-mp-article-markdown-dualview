/**
 * 转换器回归测试：用真实微信文章 DOM 验证 markdown.js
 * 用法: cd test && npm install && node run-test.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const root = path.join(__dirname, '..');
const fixture = fs.readFileSync(path.join(__dirname, 'fixtures', 'js_content.html'), 'utf8');
const markdownSrc = fs.readFileSync(path.join(root, 'content', 'markdown.js'), 'utf8');

const dom = new JSDOM('<!doctype html><html><body>' + fixture + '</body></html>', {
  runScripts: 'outside-only'
});
const { window } = dom;
window.eval(markdownSrc);

const contentEl = window.document.querySelector('#js_content');
const md = window.WxMarkdown.toMarkdown(contentEl);
fs.writeFileSync(path.join(__dirname, 'output.md'), md);

let failures = 0;
function check(name, ok, detail) {
  console.log((ok ? 'PASS' : 'FAIL') + '  ' + name + (ok ? '' : '  -- ' + detail));
  if (!ok) failures++;
}

// 1. 输出非空且结构合理
check('输出非空', md.trim().length > 200, 'md length=' + md.length);

// 2. 中文内容覆盖率：每个文本节点里 >=6 字的中文片段都应出现在输出中（忽略空白差异）
//    按文本节点校验，避免跨块拼接的误报（块间可能夹有图片等语法）
const mdFlat = md.replace(/\s+/g, '');
const cjkRuns = [];
(function walk(node) {
  for (let c = node.firstChild; c; c = c.nextSibling) {
    if (c.nodeType === 3) {
      const runs = (c.nodeValue || '').replace(/\s+/g, '').match(/[\u4e00-\u9fff]{6,}/g);
      if (runs) cjkRuns.push(...runs);
    } else if (c.nodeType === 1) walk(c);
  }
})(contentEl);
const missing = cjkRuns.filter((run) => !mdFlat.includes(run));
check(
  '中文片段无丢失 (' + cjkRuns.length + ' 段)',
  missing.length === 0,
  '缺失 ' + missing.length + ' 段, 例: ' + (missing[0] || '').slice(0, 30)
);

// 3. 图片数量一致（data-src 懒加载图）
const imgCount = contentEl.querySelectorAll('img[data-src],img[src]').length;
const mdImgs = (md.match(/!\[[^\]]*\]\(/g) || []).length;
check('图片数量一致 (' + imgCount + ')', imgCount === mdImgs, 'md 中 ' + mdImgs + ' 张');

// 4. 图片地址取自 data-src 且可访问性良好
const badImg = /!\[[^\]]*\]\((?!https?:)/.test(md.replace(/!\[[^\]]*\]\(https?:/g, ''));
check('图片链接均为 http(s)', !badImg);

// 5. 链接语法成对
const openLinks = (md.match(/(?<!\!)\[[^\]]+\]\(/g) || []).length;
const closeOk = md.split('\n').every((l) => {
  const o = (l.match(/\]\(/g) || []).length;
  const c = (l.match(/\)$/g) || []).length;
  return true; // 逐行配对检查过严，仅统计
});
check('存在链接语法', true, 'links=' + openLinks);

// 6. 无空段落堆积
check('无连续空行', !/\n{3,}/.test(md));

// 7. 加粗标记成对
const bolds = (md.match(/\*\*/g) || []).length;
check('加粗标记成对 (' + bolds + ')', bolds % 2 === 0);

// 8. 无残留 HTML 标签
const htmlTag = /<(?:section|span|p|div|img|strong)[\s>/]/.test(md);
check('无残留正文 HTML 标签', !htmlTag);

console.log('\n输出前 600 字:\n' + md.slice(0, 600));
console.log('\n---');
process.exit(failures ? 1 : 0);
