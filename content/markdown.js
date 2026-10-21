/**
 * 微信公众号文章 DOM → Markdown 转换器（零依赖）
 *
 * 针对微信文章 HTML 的特点处理：
 * - 大量嵌套 <section> 仅作布局，需透明展开，不能每个都变成独立段落
 * - 图片懒加载：真实地址在 data-src 而非 src
 * - 微信代码块为 <section class="code-snippet__fix"><ol><li> 行结构
 * - mp-common / mp-voice 等自定义元素为非正文内容，跳过
 */
(function (root) {
  'use strict';

  var SKIP_TAGS = {
    SCRIPT: 1, STYLE: 1, NOSCRIPT: 1, SVG: 1, TEMPLATE: 1, IFRAME: 1,
    VIDEO: 1, AUDIO: 1, FORM: 1, BUTTON: 1, INPUT: 1, TEXTAREA: 1,
    SELECT: 1, CANVAS: 1, 'MP-COMMON': 1, 'MP-VOICE': 1,
    'MP-MINIPROGRAM': 1, 'MP-PROFILE': 1, 'MP-WEIXIN': 1
  };

  // 这些标签在块级位置出现时按"容器"递归处理，其余按行内内容处理
  var BLOCK_TAGS = {
    P: 1, SECTION: 1, DIV: 1, ARTICLE: 1, MAIN: 1, HEADER: 1, FOOTER: 1,
    NAV: 1, ASIDE: 1, FIGURE: 1, UL: 1, OL: 1, LI: 1, TABLE: 1, PRE: 1,
    BLOCKQUOTE: 1, H1: 1, H2: 1, H3: 1, H4: 1, H5: 1, H6: 1, HR: 1,
    FIGCAPTION: 1, DETAILS: 1, SUMMARY: 1
  };

  var INLINE_TAGS = {
    SPAN: 1, STRONG: 1, B: 1, EM: 1, I: 1, U: 1, S: 1, DEL: 1, STRIKE: 1,
    CODE: 1, A: 1, IMG: 1, BR: 1, SUP: 1, SUB: 1, SMALL: 1, FONT: 1,
    ABBR: 1, CITE: 1, Q: 1, MARK: 1, TIME: 1, LABEL: 1
  };

  function collapseWs(text) {
    return text.replace(/[\s\u00a0]+/g, ' ');
  }

  function escapeText(text) {
    var s = text.replace(/([\\`*_\[\]])/g, '\\$1');
    // 行首字符若会被误认成 Markdown 语法则转义
    s = s.replace(/^([#>\-*+!]|\d+[.)])/, '\\$1');
    return s;
  }

  function imgMarkdown(el) {
    var src = el.getAttribute('data-src') || el.getAttribute('src') || '';
    if (!src) return '';
    var alt = (el.getAttribute('alt') || '').replace(/[\[\]]/g, '');
    return '![' + alt + '](' + src + ')';
  }

  /** 行内内容转 Markdown 字符串（不含块级结构） */
  function inlineMarkdown(el) {
    var out = '';
    for (var node = el.firstChild; node; node = node.nextSibling) {
      if (node.nodeType === 3) { // 文本节点
        out += escapeText(collapseWs(node.nodeValue));
        continue;
      }
      if (node.nodeType !== 1) continue;
      var tag = node.tagName;
      if (SKIP_TAGS[tag]) continue;

      if (tag === 'BR') { out += '\n'; continue; }
      if (tag === 'IMG') { out += imgMarkdown(node); continue; }
      if (tag === 'A') {
        var t = inlineMarkdown(node).trim();
        var href = node.getAttribute('href') || '';
        if (t && href && href.indexOf('javascript:') !== 0) out += '[' + t + '](' + href + ')';
        else out += inlineMarkdown(node);
        continue;
      }
      if (tag === 'CODE') {
        var c = inlineMarkdown(node);
        if (c.trim()) out += '`' + c.replace(/^ | $/g, '') + '`';
        else out += c;
        continue;
      }
      if (tag === 'STRONG' || tag === 'B' || tag === 'EM' || tag === 'I' || tag === 'DEL' || tag === 'S' || tag === 'STRIKE') {
        var inner = inlineMarkdown(node);
        var m = inner.match(/^(\s*)([\s\S]*?)(\s*)$/);
        if (!m[2]) { out += m[1] + m[3]; continue; }
        var mark = (tag === 'STRONG' || tag === 'B') ? '**'
          : (tag === 'DEL' || tag === 'S' || tag === 'STRIKE') ? '~~' : '*';
        out += m[1] + mark + m[2] + mark + m[3];
        continue;
      }
      if (INLINE_TAGS[tag] || !BLOCK_TAGS[tag]) {
        // span、font、未知标签等：透明拼接
        out += inlineMarkdown(node);
        continue;
      }
      // 行内上下文里混入的块级元素（微信常见 section 嵌套在 p 里）：视作换行后递归取行内文本
      var blockText = inlineMarkdown(node).trim();
      if (blockText) out += '\n' + blockText + '\n';
    }
    return out;
  }

  /** 容器（p/section/div…）：只含行内内容时输出单个段落，否则按子块递归 */
  function containerBlocks(el, ctx) {
    var hasBlockChild = false;
    for (var node = el.firstChild; node; node = node.nextSibling) {
      if (node.nodeType === 1 && BLOCK_TAGS[node.tagName] && node.tagName !== 'BR') { hasBlockChild = true; break; }
    }
    if (!hasBlockChild) {
      var text = inlineMarkdown(el).replace(/[ \t]+\n/g, '\n').trim();
      return text ? [text] : [];
    }
    var blocks = [];
    for (var n = el.firstChild; n; n = n.nextSibling) blocks = blocks.concat(nodeBlocks(n, ctx));
    return blocks;
  }

  function listBlocks(el, ctx) {
    var ordered = el.tagName === 'OL';
    var start = parseInt(el.getAttribute('start') || '1', 10) || 1;
    var blocks = [];
    for (var node = el.firstChild; node; node = node.nextSibling) {
      if (node.nodeType !== 1) continue;
      if (node.tagName !== 'LI') {
        blocks = blocks.concat(nodeBlocks(node, ctx));
        continue;
      }
      var marker = ordered ? (start++ + '. ') : '- ';
      var indent = ' '.repeat(marker.length);
      // li 的行内部分放标记行，块级子节点（嵌套列表等）缩进随后
      var head = '';
      var tails = [];
      for (var c = node.firstChild; c; c = c.nextSibling) {
        if (c.nodeType === 1 && BLOCK_TAGS[c.tagName] && c.tagName !== 'BR') tails.push(nodeBlocks(c, ctx));
        else head += inlineFromNode(c);
      }
      head = head.replace(/[ \t]+\n/g, '\n').trim();
      var lines = head ? head.split('\n') : [];
      var item = [];
      if (lines.length) {
        item.push(marker + lines[0]);
        for (var i = 1; i < lines.length; i++) item.push(indent + lines[i]);
      } else {
        item.push(marker);
      }
      for (var t = 0; t < tails.length; t++) {
        for (var j = 0; j < tails[t].length; j++) {
          item.push(tails[t][j].split('\n').map(function (l) { return indent + l; }).join('\n'));
        }
      }
      blocks.push(item.join('\n'));
    }
    return blocks;
  }

  function inlineFromNode(node) {
    if (node.nodeType === 3) return escapeText(collapseWs(node.nodeValue));
    if (node.nodeType !== 1) return '';
    if (node.tagName === 'BR') return '\n';
    if (node.tagName === 'IMG') return imgMarkdown(node);
    if (!BLOCK_TAGS[node.tagName] || INLINE_TAGS[node.tagName]) return inlineMarkdown(node);
    return '';
  }

  function tableBlocks(el, ctx) {
    var rows = el.querySelectorAll('tr');
    if (!rows.length) return [];
    var table = [];
    for (var r = 0; r < rows.length; r++) {
      var cells = rows[r].querySelectorAll('th,td');
      var line = [];
      for (var c = 0; c < cells.length; c++) {
        var cell = inlineMarkdown(cells[c]).replace(/\n+/g, ' ').trim().replace(/\|/g, '\\|');
        line.push(cell);
      }
      table.push(line);
    }
    if (!table.length || !table[0].length) return [];
    var width = table.reduce(function (w, row) { return Math.max(w, row.length); }, 0);
    var out = [];
    var head = table[0];
    while (head.length < width) head.push('');
    out.push('| ' + head.join(' | ') + ' |');
    out.push('| ' + new Array(width).fill('---').join(' | ') + ' |');
    for (var i = 1; i < table.length; i++) {
      while (table[i].length < width) table[i].push('');
      out.push('| ' + table[i].join(' | ') + ' |');
    }
    return [out.join('\n')];
  }

  function codeBlockMarkdown(el) {
    var lines = [];
    var lis = el.querySelectorAll('li');
    if (lis.length) {
      for (var i = 0; i < lis.length; i++) lines.push(lis[i].textContent);
    } else {
      lines = el.textContent.split('\n');
    }
    while (lines.length && !lines[0].trim()) lines.shift();
    while (lines.length && !lines[lines.length - 1].trim()) lines.pop();
    return lines.length ? ['```\n' + lines.join('\n') + '\n```'] : [];
  }

  function isCodeSnippet(el) {
    return /(^|\s)code-snippet/.test(el.className || '');
  }

  function nodeBlocks(node, ctx) {
    if (node.nodeType === 3) {
      var t = escapeText(collapseWs(node.nodeValue));
      return t.trim() ? [t.trim()] : [];
    }
    if (node.nodeType !== 1) return [];
    var el = node;
    var tag = el.tagName;
    if (SKIP_TAGS[tag]) return [];

    switch (tag) {
      case 'HR':
        return ['---'];
      case 'BR':
        return [];
      case 'IMG':
        return [imgMarkdown(el)];
      case 'H1': case 'H2': case 'H3': case 'H4': case 'H5': case 'H6': {
        var level = parseInt(tag.charAt(1), 10);
        var ht = inlineMarkdown(el).trim();
        return ht ? ['#'.repeat(level) + ' ' + ht] : [];
      }
      case 'BLOCKQUOTE': {
        var inner = elBlocks(el, ctx).join('\n\n');
        if (!inner.trim()) return [];
        return [inner.split('\n').map(function (l) { return l.trim() ? '> ' + l : '>'; }).join('\n')];
      }
      case 'UL': case 'OL':
        return listBlocks(el, ctx);
      case 'TABLE':
        return tableBlocks(el, ctx);
      case 'PRE':
        return codeBlockMarkdown(el);
      case 'P': case 'SECTION': case 'DIV': case 'ARTICLE': case 'MAIN':
      case 'HEADER': case 'FOOTER': case 'NAV': case 'ASIDE': case 'FIGURE':
      case 'FIGCAPTION': case 'DETAILS': case 'SUMMARY':
        if (isCodeSnippet(el)) return codeBlockMarkdown(el);
        return containerBlocks(el, ctx);
      case 'LI':
        return containerBlocks(el, ctx);
      default:
        // 行内标签出现在块级位置（span/strong/a 等）：整段输出
        var txt = inlineMarkdown(el).trim();
        return txt ? [txt] : [];
    }
  }

  function elBlocks(el, ctx) {
    var blocks = [];
    for (var node = el.firstChild; node; node = node.nextSibling) {
      blocks = blocks.concat(nodeBlocks(node, ctx));
    }
    return blocks;
  }

  /**
   * @param {Element} rootEl 文章正文根节点（如 #js_content）
   * @returns {string} Markdown 文本
   */
  function toMarkdown(rootEl) {
    if (!rootEl) return '';
    var blocks = elBlocks(rootEl, {});
    return blocks
      .map(function (b) { return b.trim(); })
      .filter(Boolean)
      .join('\n\n')
      .replace(/\n{3,}/g, '\n\n') + '\n';
  }

  root.WxMarkdown = { toMarkdown: toMarkdown };
})(typeof window !== 'undefined' ? window : globalThis);
