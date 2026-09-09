# Trade.io design system

Direction: **share certificate**. A deep petrol ground (felt on a card table under
a lamp), warm bone type, brass as the colour of money. The one signature element
is the **certificate** — a company share and a collectible card render as the
*same component*, because they are the same thing to the price engine.

Everything below lives in `web/styles.css` as custom properties. Change a token
there and it changes everywhere.

## Colour

| Token | Night | Day | Job |
|---|---|---|---|
| `--ink` | `#0A1618` | `#F2EBDB` | Page ground |
| `--ink-lift` | `#102124` | `#FBF6EA` | Card surface |
| `--ink-raise` | `#162B2F` | `#FFFFFF` | Pressed / raised |
| `--ink-edge` | `#1E3A3F` | `#DFD3BB` | Hairlines |
| `--bone` | `#EDE4D3` | `#14282B` | Primary text — 15.1:1 |
| `--bone-dim` | `#9FB0AE` | `#46605F` | Secondary text — 7.4:1 |
| `--bone-mute` | `#6E817F` | `#66807E` | Tertiary text — 4.6:1 |
| `--brass` | `#D3A94F` | `#8A6C24` | Cash, legendary, focus ring |
| `--jade` | `#3ECF8E` | `#0E7A4E` | Price up |
| `--ember` | `#F0644E` | `#C0392B` | Price down |
| `--common` / `--rare` / `--legendary` | `#8795A0` / `#6AA6F0` / brass | `#5C6A73` / `#1E5FAE` / brass | Rarity |

Two rules:

1. **Brass is both cash and legendary.** Deliberate — in this game, legendary
   cards *are* money.
2. **Colour never carries meaning alone.** Every price change ships a glyph
   (`▲ ▼ —`) and a signed number next to the hue, so the UI still works for
   red-green colour blindness, in greyscale, and under `prefers-contrast: more`.

## Type

| Role | Face | Why |
|---|---|---|
| Display | Fraunces 700 | Engraved, certificate-like. Names and headings only. |
| UI | Archivo 400/500/700 | Sturdy grotesque, holds up at 11px. Max 3 weights. |
| Numerals | IBM Plex Mono 600 | `font-variant-numeric: tabular-nums` — digits keep their column, so prices don't jitter as they tick. |

Body text floors at **16px** (`--t-body`) — below that, iOS zooms the page on
input focus. Headings run 1.15 line-height, body 1.5.

## Touch

- Every interactive element is at least **44×44px** (`--tap`), with ≥8px between.
- Primary destinations sit in the bottom tab bar, inside thumb reach.
- Press feedback fires in **110ms** (`--dur-tap`) via `transform: scale()`.
- The sheet dismisses on swipe-down, backdrop tap, or Escape.
- Safe-area insets are respected top and bottom (`env(safe-area-inset-*)`).

## Micro-interactions

| Interaction | Trigger | What happens | Feedback | Duration |
|---|---|---|---|---|
| Press | `:active` on any control | `scale(0.97)` + surface lift | Immediate, under 100ms | 110ms |
| Price flash | Price differs from last tick | Jade/ember wash behind the number | Says *which* price just moved | 180ms |
| Sparkline | Every tick | Path `d` rewritten | Shape of recent history | — |
| Sheet open | Tap a certificate | Slides up, scrim fades in | Focus moves into the sheet | 280ms |
| Trade confirm | Buy/sell succeeds | Check draws itself, sheet closes | Toast persists after close | 260ms + 900ms hold |
| Inline validation | Typing in the founding form | Opening share price recalculates live | Teaches cost → price link before committing | — |
| Error | Trade rejected | Toast with ember border | Says what to do, doesn't apologise | 2.6s |

All animation is **feedback, never information** — so
`prefers-reduced-motion: reduce` disables every transition and the app still
reads correctly.

## Accessibility checklist

- [x] Contrast ≥ 4.5:1 for all text (measured above)
- [x] Colour never the sole carrier of meaning
- [x] 44px minimum touch targets, 8px apart
- [x] Visible `:focus-visible` ring (brass, 2px, offset 2px)
- [x] Semantic `<nav>`/`<main>`/`<section>`, `aria-current` on the active tab
- [x] Sheet is `role="dialog" aria-modal="true"`, Escape closes, focus returns
- [x] Toast is `role="status" aria-live="polite"`
- [x] Ticker tape is `aria-hidden` — it repeats on-screen data and would spam a
      screen reader every second
- [x] Reduced motion honoured
- [x] No time limits on any action

## Performance

- **Zero images.** All iconography is inline SVG; the whole UI is ~40kb of JS
  plus one stylesheet.
- **Only `transform` and `opacity` animate** — no layout-triggering properties.
- The price flash runs on an `::after` overlay so it never triggers reflow.
- Rows are built **once** and only their changing values are rewritten each
  tick — no innerHTML thrash on the lists that update most.
- Only the **visible tab** does DOM work; hidden views wait until shown.
- Fonts load with `display=swap` behind `preconnect`, with real fallback stacks.

## Breakpoints

| Range | Layout |
|---|---|
| 320–767px | Single column. Bottom tab bar. **Primary target.** |
| 768–1023px | Two-column card grid, sheet centred at 560px |
| 1024px+ | Tab bar becomes a left rail; type scale steps up so it doesn't read as a stretched phone |
| 1400px+ | Three-column card grid |

## Testing

1. **Phone first** — 390×844 in device emulation, then 320px for the narrow floor.
2. **Both themes** — toggle day/night; check every token, not just backgrounds.
3. **Reduced motion** — enable it and confirm state still changes visibly.
4. **Keyboard only** — tab through; every control must show the brass ring, and
   the sheet must trap and return focus.
5. **Greyscale** — screenshot in greyscale; every up/down must still be readable.
6. **Throttled CPU** — 4× slowdown; ticks should stay smooth.
