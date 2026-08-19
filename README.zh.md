# dsh-client-ui-frosted-glass

为 dsh Web UI 提供的**全局毛玻璃（frosted glass / backdrop blur）主题插件**。它不改变现有浅色/深色偏好，而是在任意主题之上叠加一层半透明表面 token 覆盖与全局 backdrop-filter 模糊，让整个界面呈现 iOS/macOS 风格的磨砂玻璃质感。

此外，插件在「设置 → 通用设置」的**外观**下方新增「切换动画与定时」一行，并在设置面板左侧导航新增一个 **主题设置** 分区：

- **切换动画与定时**（通用设置 → 外观下方）：切换动画 / 定时切换（见下）。
- **主题设置** 分区：包含**自定义背景**（静态图片与动态壁纸视频）、**灯光效果**开关与**系统通知**开关（见下）。

- **切换动画**：无动画 / 淡入淡出 / 中心圆形扩散 / 从上向下扫过，点击浅色/深色时全屏过渡。
- **定时切换**：可分别设置每天自动切到深色与浅色的时间（24 小时制）；到点自动切换，手动切换会保留到下一个时间点。
- **自定义背景**（主题设置）：支持静态图片（URL / 本地）与动态壁纸视频（视频 URL / 本地视频），一键恢复默认背景。
- **幻灯片播放**（主题设置）：自定义背景图与视频共用播放列表，可设置切换间隔与切换动画；播放列表弹窗支持预览、排序、删除和添加。
- **灯光效果**（主题设置）：给输入框（composer）加一层蓝色发光边缘与光晕，颜色实时跟随主题品牌色；对话一开始运行（提交即触发，涵盖工具调用阶段）发光自动变为沿边框流动的彩虹彩光，对话完成后自动恢复；可随时关闭。
- **系统通知**（主题设置）：调用浏览器 Notification API，在**对话运行结束**、以及**出现选择/问题建议**（ask_user_question）时发送系统级通知；点击通知聚焦窗口直达结果或待回答的问题。开关默认关闭，打开时请求通知权限并发一条测试通知确认。
- **莫奈取色**（主题设置 → 界面主题）：与毛玻璃并列的独立主题。选择「莫奈取色」后关闭毛玻璃与背景模糊、改用平铺配色；从当前壁纸（或自选图片 / 手动取色）提取种子色，生成色调色板，并通过 `ctx.theme.register` 注册 `monet-light` / `monet-dark` 两套主题定义。

## 截图

![毛玻璃效果截图](assets/sc.png)

## 效果构成

插件由两半组成（都在浏览器端生效）：

1. **全局样式表**（lib/client.js 内联注入）
   - 在 body 上铺一层 bg.jpeg 背景（cover 铺满并居中，base64 内联，源文件在 assets/bg.jpeg），浅色显示原图、深色叠加半透明深色遮罩压暗，作为模糊的“背后内容”。
   - 给外壳三栏框架以及浮层（menu / dialog / listbox / tooltip 等 role）施加 backdrop-filter 模糊。
   - 通过 MutationObserver 自动识别其他插件后挂载到 body 下的 fixed/absolute 面板，自动补上毛玻璃（无需新插件适配）。
   - 把内置遮罩模糊 token --dsw-mask-blur 从 blur(2px) 加强，使弹窗/图片遮罩也更“玻璃”。

2. **半透明表面 token 覆盖**（通过 ctx.theme.overrideTokens）
   - 把 --dsw-alias-bg-base、--dsw-alias-bg-layer-1/2/3、--dsw-alias-bg-overlay、--dsw-specific-sidebar-fill、--dsw-specific-menu 等背景 token 改成半透明 rgba，每个都带 light / dark 双色。
   - 因为所有组件都通过 var(--dsw-*) 取色，这一层与 class 名无关，即使外壳重建后 hash 变化，半透明效果依然成立。

3. **主题切换动画**
   - 包装 ctx.theme.setTheme，使用浏览器原生 View Transition API：由浏览器对切换前后的**真实页面画面**分别截图，把新画面作为蒙版淡入 / 从点击位置圆形扩散 / 从上向下扫过，无纯色填充、过渡无缝。
   - 尊重 `prefers-reduced-motion`；系统偏好不变时（如选择「跟随系统」但解析结果相同）直接切换；不支持 View Transition API 时降级为即时切换。

4. **定时浅色/深色切换**
   - 在设置行中开启后，按「深色开始时间」和「浅色开始时间」安排下一个边界定时器；到点调用同一套动画切换逻辑。
   - 设置存放在用户设置文档的 `ui-theme` 段（`frosted*` 前缀字段），随 profile 持久化。

5. **自定义背景**
   - 静态图片：URL 写入 `ui-theme.frostedBackgroundUrl`；本地图片压缩后写入 `localStorage`。
   - 动态壁纸：视频 URL 写入 `ui-theme.frostedBackgroundVideoUrl`；本地视频以 Blob 形式写入 IndexedDB。
   - 视频通过全屏 `video` 层（`object-fit: cover`、静音循环）作为动态背景；静态背景通过 body 的 `--frosted-bg-image` 变量生效。
   - 恢复默认时清除所有自定义背景，回到内置 `bg.jpeg`。

6. **输入框灯光效果**
   - 开关存于 `ui-theme.frostedGlowEnabled`（默认开启），通过 `body[data-frost-glow]` 属性切换。
   - 空闲态：输入框 `[data-composer-card]` 获得蓝色发光边缘（掩膜渐变描边环）+ 品牌色柔光（box-shadow），颜色取自 `--dsw-alias-brand-primary`，主题 token 变化时实时换色。
   - 运行态：对话**一开始运行**（提交即触发，涵盖工具调用等阶段，直到对话完成）发光即切换为 `conic-gradient` 彩虹，以 `hue-rotate` 动画沿边框流动；运行状态取自会话运行时的 `running` 标志（镜像到 `body[data-conversation-running]`），`body:has([data-streaming])` 作兜底；对话完成后自动恢复蓝色（尊重 `prefers-reduced-motion`，降级为静态彩光）。
   - 发光由外侧渐变描边环与自然衰减的 box-shadow 柔光构成，全部位于**对话框外侧**，内部保持洁净、无明显分界线。

7. **系统通知**
   - 开关存于 `ui-theme.frostedNotifyEnabled`（**默认关闭**，需手动打开）。浏览器的通知权限只能在用户手势中请求，因此采用显式开关：打开开关时会调用 `Notification.requestPermission()`，授权成功后立即发一条测试通知以确认生效。
   - **对话结束**：复用会话运行追踪，当会话 `running` 标志由 true→false（一轮真正结束，切换会话不误报）时发送「对话结束」通知。
   - **选择/问题建议**：用 MutationObserver 监听 `[data-question-key]` / `[data-plan-review-key]`（ask_user_question 的稳定标记）出现，发送「需要你的选择」通知并带上问题标题文本。
   - 浏览器 Notification API 在普通网页（无 Service Worker）下不支持通知内按钮，因此无法直接在通知上点选选项；作为替代，**点击通知会聚焦应用窗口**，直达结果或待回答的问题。

8. **莫奈取色（壁纸取色主题）**
   - 主题模式存于 `ui-theme.frostedSkinMode`（`glass` / `monet`，默认 `glass`）；选择 `monet` 时毛玻璃表面覆盖与背景模糊全部关闭。莫奈的深浅模式存于 `ui-theme.frostedMonetScheme`（system / light / dark），种子色存于 `ui-theme.frostedMonetSeed`。
   - 内置一套零依赖的 OKLCH 色调色板引擎（Material You 风格：同色相跨色调、色度按色域自动收敛），生成别名 token 覆盖。
   - 通过 `ctx.theme.register` 按 ThemeDefinition 规范注册 `monet-light` 与 `monet-dark` 两套具体主题；由于第三方主题 id 只存在于进程内，插件会在每次设置同步后从持久化设置重新应用所选莫奈主题。
   - **取色来源**：从自定义背景图取色（本地 / URL 图片；视频壁纸在播放时截取当前帧）、从电脑桌面取色（宿主侧用跨平台 `wallpaper` 包读取系统壁纸，覆盖 GNOME / KDE / XFCE / MATE / Cinnamon / swaybg / swww / macOS / Windows；失败时回退到内置检测脚本）、从屏幕取色（浏览器 `getDisplayMedia` 捕获整个屏幕，容器/远程环境也通用）、选择本地图片取色、或用 `<input type="color">` 手动选色。
   - 毛玻璃层与莫奈主题互斥：`applySkinMode` 在 `glass` 模式注册半透明表面 token，在 `monet` 模式移除该层并给 `body[data-frost-skin="monet"]` 关闭背景图与 `backdrop-filter`，莫奈主题以不透明平铺表面渲染。

![演示截图](assets/sc2.png)

## 目录结构

    dsh-client-ui-frosted-glass/
    ├── package.json          # dsh.bundle（自插入行）+ dsh.client（浏览器半）
    ├── cordis.patch.yml      # bundle 补丁：向组合插入 ui-frosted-glass 行
    ├── lib/
    │   ├── index.js          # 宿主半（桌面壁纸 API 路由；wallpaper 包 + subprocess 回退）
    │   └── client.js         # 浏览器半（window.__ModuleLoader__.load 打包格式）
    ├── README.md
    └── README.zh.md

lib/client.js 是手写的浏览器打包产物（与 tsdown 产出的 window.__ModuleLoader__.load({ id, factory }) 格式一致），无需本地构建步骤即可直接使用。

## 安装

先克隆本仓库，再通过 profile 的插件管理安装到 web profile：

    git clone https://github.com/makuralymi/dsh-webUI-Glass-Theme.git
    dsh plugin --profile web add ./dsh-webUI-Glass-Theme

该命令会在 profile 目录内执行 pnpm 安装，并因包声明了 dsh.bundle.patch 而自动把它加入 dsh.profile.bundles，其 bundle 补丁会自动插入 ui-frosted-glass 行，无需再手动改 cordis.patch.yml。随后：

    dsh --profile web
    # 或
    dsh web

> 提示：宿主组合在启动时构建，新增/移除插件需**重启 web 进程**后刷新页面才会生效。

### 手动安装（不依赖 dsh plugin）

以下方式与上面的 dsh plugin 二选一，不要同时使用（会重复插入同一行）。适合不方便运行 dsh plugin 的场景：

1. 把本目录安装为 profile 依赖：

    cd "$DSH_HOME/profiles/web"
    pnpm add <克隆下来的仓库路径，例如 ./dsh-webUI-Glass-Theme>

2. 在 $DSH_HOME/profiles/web/cordis.patch.yml 中追加一行：

    - insert:
        - id: ui-frosted-glass
          name: 'dsh-client-ui-frosted-glass'

## 验证

- 启动后浏览器应看到三栏外壳及其上的浮层呈现半透明磨砂效果，浅色/深色切换都生效。
- 打开开发者工具，确认 head 里存在 style[data-plugin="dsh-client-ui-frosted-glass"]，且 body 内联了 --dsw-alias-bg-base 等半透明 token。
- body[data-ds-dark-theme] 会切换深色渐变与深色半透明 token。
- 「设置 → 通用设置 → 外观」下方出现「切换动画与定时」；选择动画后点击浅色/深色，能看到对应的全屏过渡。
- 设置面板左侧导航出现「主题设置」分区（紧随「通用设置」之后），其中包含「自定义背景」与「灯光效果」两项。
- 开启定时后设置深色/浅色时间，到时间点会自动切换；配置持久化在 `$DSH_HOME/settings.yaml` 的 `ui-theme.frosted*` 字段。
- 「主题设置 → 自定义背景」中可分别选择静态图片或动态壁纸：选择本地视频后会出现全屏 `video` 动态背景；点击「恢复默认背景图」后回到内置背景。
- 「主题设置 → 幻灯片播放」：开启后可设置切换间隔与切换动画；点击「打开播放列表」弹出列表修改弹窗，支持添加图片/视频、预览、上移/下移排序和删除。
- 「主题设置 → 灯光效果」默认开启：输入框呈现蓝色发光边缘；对话运行时变为流动彩虹光晕；关闭开关后发光立即消失，body 上的 `data-frost-glow` 属性同步移除。
- 「主题设置 → 系统通知」默认关闭：打开开关时浏览器会请求通知权限，授权后立即收到一条测试通知；之后一轮对话结束收到「对话结束」通知，出现选择/问题建议时收到「需要你的选择」通知，点击通知聚焦窗口。
- 「主题设置 → 界面主题」默认选中「毛玻璃」；切换到「莫奈取色」后立即应用由当前种子色生成的 Material You 平铺配色，背景模糊与半透明玻璃同时关闭。莫奈子项中可调是否应用自定义背景图、背景图透明度、深浅模式、种子色；「从自定义背景图取色」采样当前背景，「从电脑桌面取色」读取操作系统桌面壁纸，「从屏幕取色」通过浏览器屏幕捕获取当前屏幕主色（选“整个屏幕”并最小化窗口后即桌面壁纸），「选择图片取色」采样本地图片，颜色输入与默认色块可手动设定种子色，行内实时显示色板预览。自动取色可设置每 N 分钟从所选来源（自定义背景图 / 电脑桌面 / 屏幕）重新提取；屏幕来源因浏览器授权限制，到点会跳过。

## 自定义

- 模糊强度：改 lib/client.js 中的 --frosted-blur（默认 20px）与 --frosted-saturate（默认 180%）。
- 背景图：替换 assets/bg.jpeg 后重新内联（或改 lib/client.js 里的 --frosted-bg-image data URI）；深色压暗强度改 body[data-ds-dark-theme] 里 linear-gradient 的 alpha。
- 半透明度：改 FROSTED_TOKENS 里各 token 的 rgba alpha 值。
- 需要更彻底的“全局”覆盖时，可继续往 FROSTED_TOKENS 里加 --dsw-alias-bg-* / --dsw-specific-* token。
- 动画速度：改 lib/client.js 中 CSS 变量 `--frost-vt-duration`（默认 340ms）。
- 动画曲线：改 CSS 变量 `--frost-vt-easing`。
- 默认时间：改 lib/client.js 中 SETTINGS_DEFAULTS 的 frostedDarkTime / frostedLightTime。
- 本地图片压缩：改 `compressImage` 的 `maxDimension`（默认 2560）与 `quality`（默认 0.86）。
- 灯光颜色：改 lib/client.js 中 `--frost-glow-color`（默认取 `--dsw-alias-brand-primary`）；流动速度改 `frost-glow-ring-flow` 的动画时长（默认 2.4s）；发光强度改空闲/运行态 box-shadow 与描边环的透明度。

## 已知限制

- 外壳框架与输入框（composer）的 backdrop-filter 通过稳定的 data-* 属性选择（:has(> [data-shell-overlay]) 与 [data-composer-card]），不依赖构建 hash；浮层走 role 选择器，半透明 token 覆盖同样与 class 名无关。
- 第三方主题 token 覆盖是运行时叠加层，不做完整性校验；毛玻璃层刻意只覆盖“表面背景”类 token，而莫奈主题会同时重色 brand/文本/边框/状态类 token。
- 莫奈引擎以 OKLCH 色调色板近似 Material You（而非原版 HCT 求解器），生成的色带感知均匀且忠实于种子色，但与 Android 原生 Monet 并非逐值一致。
- 内置偏好优先：选择莫奈后，点击外观的「浅色 / 深色 / 跟随系统」或触发定时切换会切回毛玻璃主题。
- 莫奈主题默认不显示自定义背景图；开启「应用自定义背景图」后可在莫奈主题下显示全局背景图/视频/幻灯片，并用透明度滑块调节图片透明度。此时主界面、侧栏、模块平台等表面会半透明以透出背景；只有设置面板和对话框保持不透明；仍不使用毛玻璃模糊，与毛玻璃主题完全独立。