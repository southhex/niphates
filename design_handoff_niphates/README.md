# Handoff: Niphates — Visual Language Reskin

## Overview

This package re-skins the existing **Hermes Chat** app (Next.js 15 / React 19 /
TypeScript / Tailwind PWA) into a new visual identity: **Niphates** — a
"classics-inspired terminal" aesthetic (inscriptional serif display, terminal
monospace, a reading serif, gem-and-marble palette, sharp corners, bright
hairline rules).

**This is a styling/identity change only.** All app architecture, routing, data
flow, providers, streaming, and the two-plane Hermes API stay exactly as they
are. Do not touch `lib/`, `app/api/`, the connectors, or the stores. Only the
presentation layer changes: fonts, colors, borders, copy/labels, and the chat
message rendering.

## About the Design Files

The files in `prototypes/` are **design references written in HTML** (Design
Components), not production code to copy verbatim. They show the intended look
and behavior. Your job is to **recreate them in the existing Next.js + Tailwind
codebase using its established patterns** (Tailwind utility classes, the
existing component structure). Do not import the HTML; translate it.

- `prototypes/Niphates Visual Language.dc.html` — the spec board: palette, type
  system, components, and the "dialogue" message treatment. **Read this first.**
- `prototypes/Niphates.dc.html` — the applied, interactive app (Chat, Settings,
  Control) in the new language. This is the target look for the real screens.

## Fidelity

**High-fidelity.** Colors, fonts, letter-spacing, and borders are final — match
them exactly. Spacing/sizing should be matched closely but may be nudged to fit
the real responsive layout and Tailwind's scale.

---

## Design Tokens

### Typography — three faces (add via `next/font/google` or `<link>`)

| Role | Family | Usage |
|------|--------|-------|
| Display / titles | **Cinzel** (400,500,600,700) | Wordmark, page `<h1>`/`<h2>`, big numerals. ALL-CAPS, letter-spaced. |
| UI / terminal | **IBM Plex Mono** (400,500,600 + italic 400) | Default body font, all labels, buttons, inputs, sidebar, code, the **operator's** chat text. |
| Reading / agent | **Spectral** (400,500,600 + italic) | The **agent's** chat replies (long-form prose) and italic epigraphs/blurbs. |

IBM Plex Mono replaces `system-ui` as the base `font-sans`. Suggested
`tailwind.config.ts`:

```ts
fontFamily: {
  sans: ['"IBM Plex Mono"', 'ui-monospace', 'monospace'], // UI default
  display: ['Cinzel', 'serif'],
  read: ['Spectral', 'serif'],
  mono: ['"IBM Plex Mono"', 'ui-monospace', 'monospace'],
},
```

Load fonts in `app/layout.tsx` (preferred, via `next/font/google`) or by
`<link>` in `globals.css`:
```
https://fonts.googleapis.com/css2?family=Cinzel:wght@400;500;600;700&family=IBM+Plex+Mono:ital,wght@0,400;0,500;0,600;1,400&family=Spectral:ital,wght@0,400;0,500;0,600;1,400;1,500&display=swap
```

### Color palette (Obsidian — default dark ground)

Add under `theme.extend.colors` (replaces the slate+amber set):

```ts
colors: {
  void:    '#08070A', // deepest wells: inputs, code blocks, system pre
  ground:  '#100E14', // page background
  paneldk: '#0C0A10', // sidebar, headers, section cards
  panel:   '#18151D', // chips, selects, raised rows
  panel2:  '#1F1B25', // hover/raised
  hair:    '#2E2833', // default hairline border
  hairlit: '#463C4E', // brighter rule: focusable field borders

  marble:  '#ECE6D8', // primary text / titles
  parch:   '#B8B0A0', // secondary text
  parchdk: '#D6CFC0', // body text (operator)
  muted:   '#847C70', // tertiary / meta
  mutedlo: '#6F6760', // placeholder / disabled

  gold:    '#C9A24B', // PRIMARY accent (gilt) — buttons, active rules, links, model name
  goldbri: '#E3C06A', // gold hover
  lapis:   '#4F74E0', // secondary accent — edit/focus, kickers
  malach:  '#3A9D6E', // success / connected / provider-ok dot
  carnelian:'#C0504A',// alert / delete / error
  porphyry:'#8A5BB0', // the AGENT — Niphates speaker rule
  porphlbl:'#A87FD0', // agent speaker label text (lighter porphyry)
},
```

### Marble (light ground — daylight mode, REQUIRED, user-toggleable)

Full parity with Obsidian — same token *names*, different values. The two
themes are a pure CSS-variable swap on a `data-theme` attribute at the app root;
nothing else in the markup changes.

| Token | Obsidian | Marble | Notes |
|-------|----------|--------|-------|
| `void` | `#08070A` | `#F6F2E9` | input wells, code/system `pre` |
| `ground` | `#100E14` | `#EFE9DB` | page background |
| `paneldk` | `#0C0A10` | `#E3DCCB` | sidebar, headers, section cards |
| `panel` | `#18151D` | `#F3EEE2` | chips, selects, active row |
| `panel2` | `#1F1B25` | `#F6F2E9` | hover/raised |
| `hair` | `#2E2833` | `#CABFA6` | default hairline |
| `hairlit` | `#463C4E` | `#B3A98A` | focusable field border |
| `marble` (text) | `#ECE6D8` | `#1C1813` | primary text/titles (name kept for continuity) |
| `parch` | `#B8B0A0` | `#6B6356` | secondary text |
| `parchdk` | `#D6CFC0` | `#3A342A` | operator body text |
| `muted` | `#847C70` | `#8A7F6A` | meta |
| `mutedlo` | `#6F6760` | `#A89E88` | placeholder/disabled |
| `gold` | `#C9A24B` | `#8A6D2A` | primary accent (deepened on light) |
| `goldbri` | `#E3C06A` | `#A4843A` | gold hover |
| `goldink` | `#100E14` | `#F4EFE4` | text on gold buttons |
| `lapis` | `#4F74E0` | `#2F4FB0` | secondary accent |
| `malach` | `#3A9D6E` | `#2F8A5C` | success/connected |
| `carnelian` | `#C0504A` | `#A8392F` | alert/delete |
| `porphyry` | `#8A5BB0` | `#6E4A90` | agent speaker rule |
| `porphlbl` | `#A87FD0` | `#6E4A90` | agent speaker label |
| `agentbody` | `#E3DDD0` | `#241F17` | agent prose color |
| `shadow-gold` | `0 0 0 1px #C9A24B, 0 0 18px rgba(201,162,75,.20)` | `0 0 0 1px #8A6D2A, 0 0 14px rgba(138,109,42,.16)` | primary/focus glow |

#### Implementing the toggle

The prototype (`prototypes/Niphates.dc.html`) ships this working — mirror it:

1. **Define both palettes as CSS variables** keyed by a root attribute, e.g. in
   `globals.css`:
   ```css
   [data-theme="obsidian"] { --ground:#100E14; --gold:#C9A24B; /* …all tokens… */ }
   [data-theme="marble"]   { --ground:#EFE9DB; --gold:#8A6D2A; /* …all tokens… */ }
   ```
   Either consume the vars directly (`bg-[var(--ground)]`, `text-[var(--marble)]`)
   or, cleaner in Tailwind, point the `theme.extend.colors` entries at the vars
   (`ground: 'var(--ground)'`, …) so existing `bg-ground` utilities just work and
   re-theme for free.
2. **Toggle** = set `data-theme` on `<html>` (or the app shell). Persist the
   choice to `localStorage` and read it on load; default to `obsidian`. Optional:
   seed from `window.matchMedia('(prefers-color-scheme: light)')` on first run.
3. **Toggle control** lives in two places (both in the prototype): the **sidebar
   footer** as a 2-segment `☾ OBSIDIAN / ☀ MARBLE` switch (active = gold fill),
   and a compact `☀ MARBLE ⇄ ☾ OBSIDIAN` button in the Settings/Control **command
   bars**. A single switch is fine if you prefer — put it in the sidebar footer.
4. Update the PWA: `viewport.themeColor` and the manifest `theme_color` should
   track the active theme (`#100E14` obsidian / `#EFE9DB` marble) if you want the
   browser chrome to match; static `#100E14` is acceptable for v1.

No component markup differs between themes — if you find yourself writing
theme-conditional JSX for colors, lift it into the variables instead.

### Shape, border, glow

- **Corners: sharp.** `border-radius: 0` everywhere (kill all `rounded-*`).
  At most 1px on nothing — these are inscriptions and terminal panes.
- **Hairlines:** 1px solid `hair`. Focusable inputs use `hairlit`.
- **Bright outline / glow** on primary + focus only:
  - Gold button: `box-shadow: 0 0 0 1px #C9A24B, 0 0 18px rgba(201,162,75,.20);`
  - Input focus: border → `gold`, add `0 0 0 1px #C9A24B, 0 0 18px rgba(201,162,75,.18)`.
  - **Status dots** are 6–8px squares (not circles) with a colored glow:
    `box-shadow: 0 0 7px <color>` (malachite/gold/carnelian).
- **Letter-spacing:** labels/buttons `0.16–0.28em` uppercase; Cinzel titles
  `0.06–0.14em`; mono body normal.
- `::selection { background:#C9A24B; color:#100E14; }`
- Scrollbars: thumb `#2E2833`, transparent track.

---

## Screens / Views

### Global chrome
- App background `ground` (#100E14), base text `marble`, base font IBM Plex Mono.
- Sidebar + section headers use the darker `paneldk` (#0C0A10).
- The settings/control pages get a thin top **command bar**: 1px gold bottom
  border, `NIPHATES // SETTINGS` (or `// CONTROL`) at left in 11px gold,
  `0.16em` tracking, and a `← RETURN` link at right (`muted` → `gold` on hover).

### 1. Sidebar (`components/Sidebar.tsx`)
- Width ~264px, bg `paneldk`, right border 1px `hair`.
- **Brand block** (top, 1px `hair` bottom border): `NIPHATES` in Cinzel 600,
  18px, `0.14em` tracking, `marble`; a small Cinzel `IV` at right in
  `rgba(201,162,75,.6)`.
- **New chat button:** ghost style — `transparent` bg, 1px `gold` border, `gold`
  text, label `❯ NEW DIALOGUE`, 10.5px, `0.18em` tracking, full width. Hover:
  `bg rgba(201,162,75,.10)`.
- **Conversation rows:** mono 12.5px. Each row has a **2px left border**:
  `gold` + bg `panel` when active (text `marble`), else transparent border +
  text `muted`. The `⋯` options button stays (mono). Row menu: 1px `hairlit`
  border on `panel`, items `ARCHIVE` (parchdk) / `DELETE` (carnelian),
  uppercase 12px.
- **Archived divider:** `▸ ARCHIVED · N`, 10px, `0.2em` tracking, `muted`,
  top hairline.
- **Footer links:** `⚡ CONTROL` and `⚙ SETTINGS`, 11px, `0.16em` tracking,
  `parch` → `marble` + bg `panel` on hover. (These currently navigate to
  `/hermes` and `/settings` — keep the routes.)

### 2. Chat header (`app/page.tsx` header)
- Bg `paneldk`, bottom 1px `hair`.
- **Provider select:** wrapped in a `panel` chip with 1px `hair` border; a 6px
  malachite glow-square status dot at left; native `<select>` made transparent
  (`appearance:none`), mono 12.5px, `marble`.
- **Model select:** same chip treatment, text in `gold`, trailing `▾` in `muted`.

### 3. Message list — "The Dialogue" (`components/MessageList.tsx`)
**This is the signature change. Replace chat bubbles with a transcript.**
- Container: centered column, `max-width: 760px`, vertical gap ~28px, padding
  `34px 24px 40px`.
- **Each message is a block, not a bubble:**
  - A **2px left rule**: `gold` for the user, `porphyry` (#8A5BB0) for the agent.
  - **Speaker label** above the text: mono 10.5px, `0.28em` tracking — `OPERATOR`
    in `gold` for the user, `NIPHATES` in `porphlbl` (#A87FD0) for the agent.
  - **Body:**
    - User: IBM Plex Mono, 14px, color `parchdk` (#D6CFC0).
    - Agent: **Spectral serif, 18px, line-height 1.62, color #E3DDD0.** This is
      where the markdown renders — keep `ReactMarkdown` + `remark-gfm`, but
      restyle `.msg-content` (see below).
  - No background fill, no rounded corners, no max-width bubble — full column
    width inside the 760px container, `white-space: pre-wrap`.
- **"Thinking" / streaming placeholder:** a pulsing 8px **gold glow-square**
  (`@keyframes` opacity .35→1, 1.1s) + the word `summoning…` in Spectral italic
  `parch`. (Replaces the spinner + "Thinking…".)
- **Empty state:** centered — a Cinzel kicker `❯ THE MIND IS ITS OWN PLACE`
  (11px, `0.34em`, `lapis`), `NIPHATES` in Cinzel 600 ~46px, a centered gold
  gradient hairline, then a Spectral-italic line: *"Summon the agent. Hermes is
  ready out of the box — add more providers in Settings."*

#### `.msg-content` markdown restyle (`globals.css`)
Keep the markdown structure, swap the chrome to Niphates:
- Base: agent bubble already sets Spectral 18px — so `.msg-content` inherits it.
- Links: `color: #C9A24B; text-underline-offset: 2px;` hover `#E3C06A`.
- Inline `code`: `font-family:"IBM Plex Mono"; background:#18151D; border:1px solid #2E2833; border-radius:0; padding:.05em .35em; font-size:.8em; color:#D6CFC0;`
- `pre`: `background:#08070A; border:1px solid #2E2833; border-radius:0; padding:14px;` `pre code` is mono, transparent, block.
- `blockquote`: `border-left:2px solid #8A5BB0; padding-left:14px; color:#B8B0A0; font-style:italic;`
- `h1–h4`: `font-family:Cinzel; letter-spacing:.04em; color:#ECE6D8;`
- `hr`: `border-color:#2E2833;`
- Tables: header bg `#18151D`, cell borders 1px `#2E2833`, square.

### 4. Composer (`components/Composer.tsx`)
- Centered, `max-width:760px`. The textarea sits inside a **terminal field**:
  1px `hairlit` border on `void` (#08070A) bg, with a `gold ❯` prompt glyph at
  the left (align-items flex-start). Textarea is transparent, mono 13.5px,
  placeholder `summon the agent…` in `mutedlo`. Focus raises the gold
  border+glow described in tokens.
- **Send button:** gold fill, `#100E14` text, label `SEND`, 11px, `0.18em`
  tracking, sharp, with the gold glow shadow. Hover `goldbri`.
- **Stop button** (while streaming): ghost — transparent, 1px `hair` border,
  `parch` text, label `STOP`; hover border+text `carnelian`.

### 5. Settings (`app/settings/page.tsx`)
- Command bar `NIPHATES // SETTINGS` + `← RETURN`.
- Title `Providers` in Cinzel 600 32px with a Cinzel `§` marker at left.
- Provider rows in a 1px-`hair` bordered group (rows separated by 1px `hair`,
  bg `ground`): malachite glow-square dot + name (`marble`) + a square `type`
  tag (1px `hair`, mono 10px `muted`); `baseUrl` line in `muted`, model list in
  `gold`. Action buttons are square ghost mono labels `TEST` (hover malachite) /
  `EDIT` (hover lapis) / `DELETE` (carnelian). `❯ ADD PROVIDER` is the ghost-gold
  button. Keep the existing edit form — restyle inputs as terminal fields
  (square, `void` bg, `hair` border, gold focus), labels mono uppercase `muted`.

### 6. Hermes Control (`app/hermes/page.tsx`)
- Command bar `NIPHATES // CONTROL` + `← RETURN`.
- Title `Hermes Control` Cinzel 600 32px with `⚡`. Intro blurb in Spectral 16px
  `parch`.
- Three sections as 1px-`hair` cards on `paneldk`, each with a mono kicker
  `⌁ CONNECTION` / `⌁ MODEL` / `⌁ SYSTEM` (10.5px, `0.22em`, `muted`).
  Field labels mono uppercase `muted`; inputs are terminal fields. Primary
  `SAVE & TEST` is the gold glow button; secondary actions (`SET ACTIVE`,
  `REFRESH`) are square ghost mono (hover malachite/lapis). The status line uses
  a gold/malachite glow-square dot. The system `<pre>` is a `void` block, 1px
  `hair`, mono 12px `parch`.

---

## Interactions & Behavior
Unchanged from the current app — preserve all of it:
- New chat, select, archive/unarchive, delete (+ confirm), row `⋯` menu with
  outside-click/Escape close.
- Provider/model selects act as a **live switch** on the active conversation.
- Streaming chat via `/api/chat` ndjson; Stop aborts; debounced/flushed history.
- Auto-scroll to newest message on update.
- Only **new visual states** to add: gold-glow pulse for "summoning…", gold
  focus-glow on terminal fields, hover color shifts noted above.

## State Management
No changes. Same `Conversation[]` / provider state, same stores, same
`lib/*`. This is a presentation reskin.

## Naming / copy
The product is being renamed **Niphates** (the chat agent persona is also
"NIPHATES"; the user is "OPERATOR"). Update: `app/layout.tsx` metadata title,
the sidebar wordmark, the manifest `name`/`short_name`, and chat labels. Keep
"Hermes Agent" as the **provider** name (it's the upstream agent/provider), and
keep the `/hermes` Control route + "Hermes Control" heading — Hermes is the
backend; Niphates is the client. Confirm with the owner if unsure.

## Files in the real repo to change
- `app/layout.tsx` — load fonts; update metadata title.
- `app/globals.css` — base font/bg vars; `.msg-content` markdown restyle; selection; remove rounded assumptions.
- `tailwind.config.ts` — new `colors` + `fontFamily`.
- `components/Sidebar.tsx` — brand, ghost new-chat, left-rule rows, footer.
- `components/MessageList.tsx` — **dialogue transcript** + empty state + summoning state.
- `components/Composer.tsx` — terminal field + gold SEND / ghost STOP.
- `app/page.tsx` — header select chips with status dot.
- `app/settings/page.tsx` — command bar, Cinzel title, terminal forms.
- `app/hermes/page.tsx` — command bar, Cinzel title, `⌁` section kickers.
- `public/manifest.webmanifest` — name/short_name/theme color (`#100E14`).
- Do **not** modify `lib/**`, `app/api/**`, stores, connectors, schemas.

## Screenshots (in this bundle, `screenshots/`)

Annotated captures of every screen in both themes — caption banner names the
screen, theme, and key callouts:

| File | Screen | Theme |
|------|--------|-------|
| `1-chat-obsidian.png` | Chat / Dialogue | Obsidian |
| `2-control-obsidian.png` | Hermes Control | Obsidian |
| `3-settings-obsidian.png` | Settings / Providers | Obsidian |
| `4-chat-marble.png` | Chat / Dialogue | Marble |
| `5-control-marble.png` | Hermes Control | Marble |
| `6-settings-marble.png` | Settings / Providers | Marble |

## Design reference files (in this bundle)
- `prototypes/Niphates Visual Language.dc.html`
- `prototypes/Niphates.dc.html`
Open them in a browser to see the live target (fonts load from Google Fonts).
