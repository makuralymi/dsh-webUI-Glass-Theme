# dsh-client-ui-frosted-glass

A **global frosted-glass (backdrop blur) theme plugin** for the dsh Web UI. It keeps the existing light/dark preference untouched and layers a translucent surface-token override plus a global `backdrop-filter` on top, giving the whole UI an iOS/macOS-style frosted-glass look.

## Screenshot

![Frosted glass screenshot](assets/sc.png)

## What it does

Two browser-side halves:

1. **Global stylesheet** (inlined by `lib/client.js`)
   - Paints `bg.jpeg` as a centered, cover background on `body` (inlined as base64; source kept at `assets/bg.jpeg`), shown as-is in light mode and dimmed behind a translucent dark veil in dark mode — the content the blur reveals.
   - Applies `backdrop-filter: blur(...) saturate(...)` to the three-column shell frame and to floating surfaces (`[role="menu"]`, `[role="dialog"]`, `[role="listbox"]`, `[role="tooltip"]`, ...).
   - Strengthens the stock `--dsw-mask-blur` token so dialogs / image masks blur harder.

2. **Translucent surface-token override** (via `ctx.theme.overrideTokens`)
   - Rewrites `--dsw-alias-bg-base`, `--dsw-alias-bg-layer-1/2/3`, `--dsw-alias-bg-overlay`, `--dsw-specific-sidebar-fill`, `--dsw-specific-menu`, ... to translucent `rgba(...)`, each with a `{ light, dark }` pair.
   - Because every component reads `var(--dsw-*)`, this layer is class-name agnostic and survives shell re-hashing.

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

## Customize

- Blur: `--frosted-blur` (default 20px) and `--frosted-saturate` (default 180%) in `lib/client.js`.
- Background: replace `assets/bg.jpeg` then re-inline (or edit the `--frosted-bg-image` data URI in `lib/client.js`); dark-mode dim strength is the `linear-gradient` alpha under `body[data-ds-dark-theme]`.
- Translucency: the `rgba` alpha values in `FROSTED_TOKENS`.
- For broader coverage, add more `--dsw-alias-bg-*` / `--dsw-specific-*` tokens to `FROSTED_TOKENS`.

## Known limitations

- The frame and composer-card `backdrop-filter` ride stable `data-*` attributes (`:has(> [data-shell-overlay])` and `[data-composer-card]`) rather than hashed module classes; floating surfaces use `[role=...]`, and the translucent-token override is class-name agnostic.
- Third-party theme token overrides are a runtime layer with no completeness validation; this plugin intentionally overrides only surface-background tokens and leaves text/state tokens readable.