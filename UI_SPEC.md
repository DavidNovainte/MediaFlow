# MediaFlow UI Spec (workspace chrome)

Frozen rules for **layout / UI / UX consistency**. Prefer these over one-off page styles.

## Design tokens (`src/styles/ui-tokens.css`)

| Token | Value | Use |
|-------|--------|-----|
| `--ws-control-height` | `32px` | Buttons, inputs, selects in toolbars/inspectors |
| `--ws-control-height-sm` | `28px` | Compact chips / `.btn-sm` |
| `--ws-control-height-lg` | `36px` | Rare emphasis (prefer default 32) |
| `--ws-header-height` | `40px` | Workspace top toolbar row |
| `--ws-inspector-width` | `320px` | Right settings panels |
| `--ws-footer-height` | `70px` | Fixed bottom bars |
| `--ws-footer-clearance` | `84px` | Content `padding-bottom` above fixed footers |
| `--ws-font-meta` | `11px` | Hints, badges, captions |
| `--ws-font-ui` | `12px` | Toolbar / tab / control labels |
| `--ws-font-label` | `12px` | Inspector labels (alias of ui) |
| `--ws-font-body` | `13px` | Settings prose, sidebar nav |
| `--ws-font-title` | `15px` | Compact page / section titles |
| `--ws-segment-radius` | `10px` | Segmented control track |
| `--ws-control-radius` | `8px` | Buttons, chips, inputs |
| `--ws-transition` | `0.12s ease` | Chrome motion |

**Do not invent** 9 / 10 / 12.5 / 13.5px for chrome. Meta=11, UI=12, body=13, title=15 only.

### Theme pair (segment / CTA)

| Theme | Active segment / primary CTA |
|-------|------------------------------|
| **Light** | Dark chip (`#18181b`) + light ink (`#fafafa`) |
| **Dark** | Light chip (`#fafafa`) + dark ink (`#18181b`) |

Never use **light fill + light text** or **dark fill + dark text**.

## Components

### 1. Page chrome
- Sidebar already names the tool → **no tall hero title** on tool pages.
- Decorative title+desc only: hide (a11y keep heading).
- Title + actions: one compact toolbar row.
- Workspace (subtitle / creator): hide decorative title; keep action buttons only.

### 2. Header toolbar & global buttons
- Default `.btn`: **32px** height, **12px** font, **8px** radius, padding `0 12px`.
- `.btn-sm` / `.btn-small` (aliases): **28px** / **12px**.
- `.btn-lg`: **36px** / **13px** (rare).
- Marketing only: `.btn-marketing`, `#page-upgrade .btn` (taller; not the tool default).
- Primary: mono solid (`--ws-cta-*`).
- Secondary: outline, transparent fill.
- Prefer class utilities: `.ws-text-meta|ui|body|title` over inline `font-size`.

### 3. Segmented tabs
- Track: `--fill-muted` + border.
- Active: `--ws-segment-active-bg/fg`.
- No emoji in tab labels.
- No sliding white pill indicators.

### 4. Inspector / right panel
- **Flat sections**: no nested card (no fill + radius + shadow stack).
- Sections separated by **1px border-bottom**.
- Labels: `--text-muted`, 12px.
- Scroll area must clear fixed footers (`--ws-footer-clearance`).

### 5. Empty states
- Full remaining height dashed drop zone **inside** content padding (no `height:100%` overflow).
- Copy: one title + one hint + one primary button.
- Title **15px**, hint **12px**.
- Center content vertically inside the zone.

### 6. Motion
- Prefer `--ws-transition` (0.12s). No bounce / glow / large translateY on chrome.

## File map

| File | Role |
|------|------|
| `src/styles/ui-tokens.css` | Tokens only |
| `src/styles/workspace-chrome.css` | Shared workspace overrides (load **last**) |
| `src/styles/flat-chrome.css` | Glass kill + mono leftovers |
| `src/styles/main.css` | Global shell + `.btn` base + theme base |

## Pages in scope

**Phase 1 (tool workspaces)**  
- `#page-subtitle`, `#page-creator`, `#page-enhance`, `#page-compress`

**Phase 2 (chrome density extended)**  
- `#page-transcribe`, `#page-download`, `#page-history`, `#page-settings`
- Editor tokens align to workspace (`--editor-btn-height` → 32)

## Checklist (manual)

- [ ] Header buttons same height as 详细设置 / 显示检查器
- [ ] Active tab readable in **dark and light**
- [ ] No nested gray cards in right panel
- [ ] Long inspector content scrolls above fixed footer
- [ ] Empty drop zone dashed border fully visible (not clipped)
- [ ] Global `.btn` is 32/12; upgrade page still uses marketing scale
- [ ] No inline `font-size: 13px` on tool chrome (use tokens / `.ws-text-*`)

## Lazy features (Phase D)

| Feature | Loader | Trigger |
|---------|--------|---------|
| **Enhance** | `FeatureLoader.ensureEnhance()` | First `Router.switchPage('enhance')` or drop images while on enhance |
| **Editor** | `FeatureLoader.ensureEditor(app)` | First `Router.switchPage('editor')` / deep-link / drop on editor |
| **Subtitle** | `FeatureLoader.ensureSubtitle(app)` | First `Router.switchPage('subtitle')` / send-to-subtitle / drop on subtitle |
| **Creator** | `FeatureLoader.ensureCreator(app)` | First `Router.switchPage('creator')` / video drop / open-local |

Scripts under enhance/editor/subtitle/creator toolboxes are **not** cold-start (except shared kernels below).  
**Always cold-start:** `TranslationService`, `SubtitleDisplayMode`, Creator export planner trio (`CapabilityMatrix` / `TimelineProjectSnapshot` / `CreatorExportPlanner`) for Editor export.  
`ScriptLoader` + `featureLoader.js` load bundles in dependency order, then construct the flow.

## Out of scope (later)

- Download / history **card redesign** (density already aligned)
- Upgrade marketing page layout (keeps marketing scale by design)
- Editor timeline micro-chrome (8–10px scale labels OK)
- First-open loading toast/spinner for heavy toolboxes
