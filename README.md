# dsh-client-ui-frosted-glass

[English](README.md) | [中文](README.zh.md)

A **global frosted-glass (backdrop blur) theme plugin** for the dsh Web UI. It keeps the existing light/dark preference untouched and layers a translucent surface-token override plus a global `backdrop-filter` on top, giving the whole UI an iOS/macOS-style frosted-glass look.

The plugin also adds a **Transition & schedule** row right below **Appearance** in Settings → General, plus a new **Theme settings** section in the settings navigation:

- **Transition & schedule** (General → below Appearance): switch animation + scheduled switching (see below).
- **Theme settings** section: contains the **custom background** (static images + dynamic wallpaper videos) and the **lighting effect** switch (see below).

- **Switch animation**: None / Fade / Circle reveal / Wipe from top — full-screen transitions when light/dark is switched.
- **Scheduled switching**: set a daily dark-theme time and light-theme time; the UI switches automatically at those boundaries, and manual switches last until the next boundary.
- **Custom background** (Theme settings): static images (URL / local) and dynamic wallpaper videos (video URL / local file), with one-click reset to the built-in background.
- **Lighting effect** (Theme settings): a blue glowing edge and halo around the composer, recolored in real time from the theme's brand token; from the moment the conversation starts running until it completes, the glow turns into a rainbow flowing around the border, then reverts. Can be switched off at any time.

## Screenshot

![Frosted glass screenshot](assets/sc.png)

## What it does

Two browser-side halves:

1. **Global stylesheet** (inlined by `lib/client.js`)
   - Paints `bg.jpeg` as a centered, cover background on `body` (inlined as base64; source kept at `assets/bg.jpeg`), shown as-is in light mode and dimmed behind a translucent dark veil in dark mode — the content the blur reveals.
   - Applies `backdrop-filter: blur(...) saturate(...)` to the three-column shell frame and to floating surfaces (`[role="menu"]`, `[role="dialog"]`, `[role="listbox"]`, `[role="tooltip"]`, ...).
   - A MutationObserver auto-marks fixed/absolute panels that other plugins portal under `<body>`, giving them the same frosted glass without any per-plugin adaptation.
   - Strengthens the stock `--dsw-mask-blur` token so dialogs / image masks blur harder.

2. **Translucent surface-token override** (via `ctx.theme.overrideTokens`)
   - Rewrites `--dsw-alias-bg-base`, `--dsw-alias-bg-layer-1/2/3`, `--dsw-alias-bg-overlay`, `--dsw-specific-sidebar-fill`, `--dsw-specific-menu`, ... to translucent `rgba(...)`, each with a `{ light, dark }` pair.
   - Because every component reads `var(--dsw-*)`, this layer is class-name agnostic and survives shell re-hashing.

3. **Theme-switch animations**
   - Wraps `ctx.theme.setTheme` with the browser-native View Transition API: the browser snapshots the REAL before/after frames and uses the new frame as the mask — fade, circle reveal centered on the click, or wipe from top — with no solid-color veil.
   - Respects `prefers-reduced-motion`; switches without an animation when the resolved scheme stays the same (e.g. “System” resolving to the current scheme), and falls back to an instant switch where View Transitions are unavailable.

4. **Scheduled light/dark switching**
   - When enabled, a timer is scheduled for the next “dark theme at” / “light theme at” boundary and uses the same animated switch path.
   - Preferences persist under the `ui-theme` section of the user-settings document with `frosted*`-prefixed fields.

5. **Custom background**
   - Static images: URLs persist as `ui-theme.frostedBackgroundUrl`; local images are compressed and stored in `localStorage`.
   - Dynamic wallpaper: video URLs persist as `ui-theme.frostedBackgroundVideoUrl`; local videos are stored as Blobs in IndexedDB.
   - Videos render through a full-screen `<video>` layer (`object-fit: cover`, muted loop) while static backgrounds override the `--frosted-bg-image` variable on `<body>`.
   - Reset clears every custom source and returns to the built-in `bg.jpeg`.

6. **Composer glow (lighting effect)**
   - The switch persists as `ui-theme.frostedGlowEnabled` (default on) and is mirrored to `body[data-frost-glow]`.
   - Idle: the `[data-composer-card]` input gains a blue glowing edge (masked gradient ring) plus a brand-colored soft glow (`box-shadow`), driven by `--dsw-alias-brand-primary` so it recolors in real time when theme tokens change.
   - Running: the ring turns into a flowing `conic-gradient` rainbow from the moment the conversation starts running until it completes — the session runtime's `running` flag is mirrored to `body[data-conversation-running]` by JS (covers tool-call phases), with `body:has([data-streaming])` as a fallback; the edge reverts to blue when the run ends (respects `prefers-reduced-motion`, degrading to a static rainbow).
   - The glow consists of an outside edge ring plus naturally fading `box-shadow` light — everything stays OUTSIDE the dialog, the interior remains clean with no hard boundary.

![演示截图](assets/sc2.png)

## Layout

    dsh-client-ui-frosted-glass/
    ├── package.json          # dsh.bundle (self-inserting row) + dsh.client (browser half)
    ├── cordis.patch.yml      # bundle patch: inserts the ui-frosted-glass row
    ├── lib/
    │   ├── index.js          # host half (empty apply, only to appear in the Loader)
    │   └── client.js         # browser half (window.__ModuleLoader__.load bundle format)
    ├── README.md
    └── README.zh.md

`lib/client.js` is a hand-authored browser bundle in the same `window.__ModuleLoader__.load({ id, factory })` format tsdown emits — no local build step required.

## Install

Clone the repo, then install into the web profile via the profile plugin manager:

    git clone https://github.com/makuralymi/dsh-webUI-Glass-Theme.git
    dsh plugin --profile web add ./dsh-webUI-Glass-Theme

This runs pnpm in the profile directory and, because the package declares `dsh.bundle.patch`, auto-adds it to `dsh.profile.bundles`; its bundle patch then inserts the `ui-frosted-glass` row automatically — no manual `cordis.patch.yml` edit is needed. Then:

    dsh --profile web
    # or
    dsh web

> Note: the host composition is assembled at boot, so adding/removing a plugin requires **restarting the web process** before a refresh shows it.

### Manual install (without `dsh plugin`)

Use this OR the `dsh plugin` path above, not both (they insert the same row). For cases where `dsh plugin` is unavailable:

1. Add the directory as a profile dependency:

    cd "$DSH_HOME/profiles/web"
    pnpm add <path-to-the-cloned-repo, e.g. ./dsh-webUI-Glass-Theme>

2. Append a row to `$DSH_HOME/profiles/web/cordis.patch.yml`:

    - insert:
        - id: ui-frosted-glass
          name: 'dsh-client-ui-frosted-glass'

## Verify

- The shell frame and its floating surfaces render translucent + blurred in both light and dark.
- DevTools shows a `<style data-plugin="dsh-client-ui-frosted-glass">` in `<head>` and inline translucent tokens (`--dsw-alias-bg-base`, ...) on `body`.
- `body[data-ds-dark-theme]` switches the dark gradient and dark translucent tokens.
- Settings → General → below Appearance shows **Transition & schedule**; picking an animation and clicking light/dark plays the full-screen transition.
- The settings navigation shows a **Theme settings** section (right after General) containing the custom background and lighting items.
- With the schedule enabled, the theme switches automatically at the configured times; settings persist under `ui-theme.frosted*` in `$DSH_HOME/settings.yaml`.
- **Custom background** (Theme settings): choose a static image or a dynamic video; local videos mount a full-screen `<video>` layer immediately, and “Reset to default background” restores the built-in background.
- **Lighting effect** (Theme settings) is on by default: the input shows a blue glowing edge; while the conversation runs it becomes a flowing rainbow aura and reverts when the run completes. Turning the switch off removes the glow immediately (`data-frost-glow` disappears from `body`).

## Customize

- Blur: `--frosted-blur` (default 20px) and `--frosted-saturate` (default 180%) in `lib/client.js`.
- Background: replace `assets/bg.jpeg` then re-inline (or edit the `--frosted-bg-image` data URI in `lib/client.js`); dark-mode dim strength is the `linear-gradient` alpha under `body[data-ds-dark-theme]`.
- Translucency: the `rgba` alpha values in `FROSTED_TOKENS`.
- For broader coverage, add more `--dsw-alias-bg-*` / `--dsw-specific-*` tokens to `FROSTED_TOKENS`.
- Animation speed: `--frost-vt-duration` in `lib/client.js` (default 340ms).
- Animation easing: `--frost-vt-easing`.
- Default times: `frostedDarkTime` / `frostedLightTime` in `SETTINGS_DEFAULTS`.
- Local-image compression: `compressImage` `maxDimension` (default 2560) and `quality` (default 0.86).
- Glow color: `--frost-glow-color` (defaults to `--dsw-alias-brand-primary`) in `lib/client.js`; flow speed is the `frost-glow-ring-flow` animation duration (default 2.4s); glow strength is the idle/running `box-shadow` layers and the edge-ring opacity.

## Known limitations

- The frame and composer-card `backdrop-filter` ride stable `data-*` attributes (`:has(> [data-shell-overlay])` and `[data-composer-card]`) rather than hashed module classes; floating surfaces use `[role=...]`, and the translucent-token override is class-name agnostic.
- Third-party theme token overrides are a runtime layer with no completeness validation; this plugin intentionally overrides only surface-background tokens and leaves text/state tokens readable.