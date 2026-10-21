# 微信公众号文章 Markdown 双视图

Chrome / Edge 浏览器扩展（Manifest V3）。打开微信公众号文章后，自动将正文转换为 Markdown，并以「原文 | Markdown」左右双视图并列展示。

## 功能

- **自动转换**：文章页加载完成后自动生成 Markdown，无需手动操作
- **左右双视图**：原文约束在左半屏，右侧为 Markdown 面板，两侧滚动按比例同步
- **Markdown 头部信息**：自动附加标题、公众号名、发布日期、原文链接
- **一键复制 / 下载 .md**：面板顶部按钮，下载文件名取自文章标题
- **可关闭可重开**：`✕` 按钮或 `Esc` 关闭双视图，右下角悬浮按钮随时重新打开
- **窄屏适配**：视口宽度 < 900px 时不自动开启（可手动打开，面板全屏覆盖）

转换器针对微信文章 HTML 特点处理：嵌套 `<section>` 布局块透明展开、图片懒加载地址取自 `data-src`、微信代码块（`code-snippet`）、`mp-common` 等非正文元素跳过；支持加粗/斜体/删除线、链接、无序有序列表、引用、表格、分隔线。

## 安装（开发者模式加载）

1. 打开 Chrome，地址栏输入 `chrome://extensions/`（Edge 为 `edge://extensions/`）
2. 右上角打开「开发者模式」
3. 点击「加载已解压的扩展程序」，选择本目录（`manifest.json` 所在文件夹）
4. 打开任意微信公众号文章（如 `https://mp.weixin.qq.com/s/...`），双视图自动出现

> 注：品牌版 Google Chrome 已在命令行禁用 `--load-extension`，脚本化调试请用 Edge 或 Chromium。

## 文件结构

```
├── manifest.json        # MV3 清单：仅内容脚本，无后台/权限申请
├── icons/               # 插件图标（tools/gen-icons.js 生成）
├── content/
│   ├── markdown.js      # 零依赖 DOM→Markdown 转换器（window.WxMarkdown）
│   ├── content.js       # 双视图 UI：注入面板、复制/下载、滚动同步
│   └── content.css      # 面板样式 + 原文左半屏约束
├── tools/
│   └── gen-icons.js     # 图标生成脚本（node tools/gen-icons.js）
└── test/
    ├── fixtures/        # 真实文章 #js_content DOM 夹具
    ├── run-test.js      # 转换器回归测试（Node + jsdom）
    ├── e2e.js           # 端到端测试（puppeteer-core + Edge 加载扩展）
    └── output.md        # 转换器实际输出样例
```

## 测试

```bash
cd test
npm install        # 安装 jsdom + puppeteer-core
node run-test.js   # 转换器测试：中文片段无丢失、图片数量一致、语法成对等
node e2e.js        # 端到端：启动带扩展的 Edge 打开真实文章，断言双视图 DOM 与交互
```

## 已知限制

- 深色模式下右侧 Markdown 面板保持浅色（Markdown 源码阅读场景）
- 投票、小程序卡片等微信互动组件不纳入 Markdown
- 图片保留微信图床原始链接，未做本地化/转存
