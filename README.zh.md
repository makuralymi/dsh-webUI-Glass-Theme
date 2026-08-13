# dsh-client-ui-frosted-glass

为 dsh Web UI 提供的**全局毛玻璃（frosted glass / backdrop blur）主题插件**。它不改变现有浅色/深色偏好，而是在任意主题之上叠加一层半透明表面 token 覆盖与全局 backdrop-filter 模糊，让整个界面呈现 iOS/macOS 风格的磨砂玻璃质感。

## 截图

![毛玻璃效果截图](assets/sc.png)

## 效果构成

插件由两半组成（都在浏览器端生效）：

1. **全局样式表**（lib/client.js 内联注入）
   - 在 body 上铺一层 bg.jpeg 背景（cover 铺满并居中，base64 内联，源文件在 assets/bg.jpeg），浅色显示原图、深色叠加半透明深色遮罩压暗，作为模糊的“背后内容”。
   - 给外壳三栏框架以及浮层（menu / dialog / listbox / tooltip 等 role）施加 backdrop-filter 模糊。
   - 把内置遮罩模糊 token --dsw-mask-blur 从 blur(2px) 加强，使弹窗/图片遮罩也更“玻璃”。

2. **半透明表面 token 覆盖**（通过 ctx.theme.overrideTokens）
   - 把 --dsw-alias-bg-base、--dsw-alias-bg-layer-1/2/3、--dsw-alias-bg-overlay、--dsw-specific-sidebar-fill、--dsw-specific-menu 等背景 token 改成半透明 rgba，每个都带 light / dark 双色。
   - 因为所有组件都通过 var(--dsw-*) 取色，这一层与 class 名无关，即使外壳重建后 hash 变化，半透明效果依然成立。

## 目录结构

    dsh-client-ui-frosted-glass/
    ├── package.json          # dsh.bundle（自插入行）+ dsh.client（浏览器半）
    ├── cordis.patch.yml      # bundle 补丁：向组合插入 ui-frosted-glass 行
    ├── lib/
    │   ├── index.js          # 宿主半（空 apply，仅为出现在 Loader 中）
    │   └── client.js         # 浏览器半（window.__ModuleLoader__.load 打包格式）
    ├── README.md
    └── README.zh.md

lib/client.js 是手写的浏览器打包产物（与 tsdown 产出的 window.__ModuleLoader__.load({ id, factory }) 格式一致），无需本地构建步骤即可直接使用。

## 安装

本插件通过 profile 的插件管理安装到 web profile：

    dsh plugin --profile web add /mnt/data/project/dsh-plugin

该命令会在 profile 目录内执行 pnpm 安装，并因包声明了 dsh.bundle.patch 而自动把它加入 dsh.profile.bundles，其 bundle 补丁会自动插入 ui-frosted-glass 行，无需再手动改 cordis.patch.yml。随后：

    dsh --profile web
    # 或
    dsh web

> 提示：宿主组合在启动时构建，新增/移除插件需**重启 web 进程**后刷新页面才会生效。

### 手动安装（不依赖 dsh plugin）

以下方式与上面的 dsh plugin 二选一，不要同时使用（会重复插入同一行）。适合不方便运行 dsh plugin 的场景：

1. 把本目录安装为 profile 依赖：

    cd "$DSH_HOME/profiles/web"
    pnpm add /mnt/data/project/dsh-plugin

2. 在 $DSH_HOME/profiles/web/cordis.patch.yml 中追加一行：

    - insert:
        - id: ui-frosted-glass
          name: 'dsh-client-ui-frosted-glass'

## 验证

- 启动后浏览器应看到三栏外壳及其上的浮层呈现半透明磨砂效果，浅色/深色切换都生效。
- 打开开发者工具，确认 head 里存在 style[data-plugin="dsh-client-ui-frosted-glass"]，且 body 内联了 --dsw-alias-bg-base 等半透明 token。
- body[data-ds-dark-theme] 会切换深色渐变与深色半透明 token。

## 自定义

- 模糊强度：改 lib/client.js 中的 --frosted-blur（默认 20px）与 --frosted-saturate（默认 180%）。
- 背景图：替换 assets/bg.jpeg 后重新内联（或改 lib/client.js 里的 --frosted-bg-image data URI）；深色压暗强度改 body[data-ds-dark-theme] 里 linear-gradient 的 alpha。
- 半透明度：改 FROSTED_TOKENS 里各 token 的 rgba alpha 值。
- 需要更彻底的“全局”覆盖时，可继续往 FROSTED_TOKENS 里加 --dsw-alias-bg-* / --dsw-specific-* token。

## 已知限制

- 外壳框架与输入框（composer）的 backdrop-filter 通过稳定的 data-* 属性选择（:has(> [data-shell-overlay]) 与 [data-composer-card]），不依赖构建 hash；浮层走 role 选择器，半透明 token 覆盖同样与 class 名无关。
- 第三方主题 token 覆盖是运行时叠加层，不做完整性校验；这里刻意只覆盖“表面背景”类 token，文本/状态 token 保持可读。