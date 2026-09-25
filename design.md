# DocLens: UI Design Specification

Version 1.2 · UI only (no backend, retrieval, or model decisions in this document)

---

## 1. What this is

DocLens is a chat interface for asking questions about **one document at a time**. The person uploads documents first, picks one, then chats with it.

**One-line design idea:** a dark, grainy, glass-topped chat window set inside a rich cherry-red frame, like a lens held up to a document.

**The memorable element** (where the boldness is spent): the hero-to-chat transition. The logo and wordmark start centered above the composer, then travel up and turn into a frosted glass header that messages scroll underneath. Everything else stays quiet.

---

## 2. Sketch reading (source of truth)

| Sketch element | Interpretation in this spec |
|---|---|
| Left column with "DocLens" logo, highlighted "New chat" pill, then ch3, ch2, ch1 | Sidebar: brand, New chat button, chat history (newest on top) |
| Note "Rich Dark Red Cherry" pointing at sidebar | Sidebar and outer frame are cherry (section 4.1) |
| Large rounded rectangle on the right | Main panel with large corner radius |
| Note "Apple-aesthetic, Glass, Grain, Dark" pointing at main panel | Main panel is dark, film-grain textured, with Apple-style glass surfaces |
| Logo (magnifier) + "DocLens" centered above a pill input | Empty state hero (screen 1) |
| Half-circle notch on right edge with an upload icon | Upload tab on the right bezel; opens the upload drawer |
| Screen 2: Q bubbles right, A bubbles left, DocLens at top, input at bottom with a divider above | Active chat state (screen 4): header floats as glass, composer docked at bottom |
| Persian sentence under the composer in screen 2 | Sample query. **The UI must fully support Persian and RTL text** (section 12) |

### Confirmed decisions

1. **One document per chat.** Choosing a different document starts a new chat (confirmed).
2. **Accepted files:** PDF, DOCX, TXT, MD. **Maximum 10 MB per file** (confirmed). Several files can be uploaded at once.
3. **Source citations** appear under answers (confirmed, section 8.7).
4. **Upload drawer width:** 38.2% of the main panel, clamped between 380px and 560px. You asked for whatever looks most polished and smooth. This ratio gives about 440px on a 1440px screen, the same width polished apps use for side sheets, and it keeps the chat readable behind it. It is one token (`--drawer-ratio`) if you want to tune it.
5. **Interface language:** all buttons, labels, tooltips and error messages are English. Conversations (questions and answers) can be English or Persian (section 12).

### Remaining assumptions

6. Desktop-first, with a defined tablet and mobile adaptation.
7. Dark theme only.
8. Not in the sketch and therefore excluded: settings, profile, search, sharing, voice input, themes.

---

## 3. Design principles

1. **Two materials only.** Cherry (warm, saturated, matte-satin) for the frame. Graphite grain (cool-neutral, dark) for the work area. Glass is the only third surface, and it appears only where something floats above content.
2. **Glass means "floating".** The header, the composer zone, the upload tab, and the upload drawer are glass. Nothing that sits flat on the panel is glass.
3. **One accent family.** All color accents come from the cherry ramp. No second hue except for status colors.
4. **Motion answers actions.** Nothing animates on its own except the one-time hint on the upload tab. Every transition is a response to a click, a drop, or a send.
5. **The document is the hero of the flow.** The UI always shows which document the chat is about.

---

## 4. Design tokens

### 4.1 Color

```css
:root {
  /* Cherry ramp (frame, sidebar, accents) */
  --cherry-950: #1F060C;
  --cherry-900: #2E0A13;
  --cherry-800: #43101D;
  --cherry-700: #5C1226;   /* sidebar base */
  --cherry-600: #7A1B31;   /* user bubble, hover fills */
  --cherry-500: #A32846;   /* primary buttons, active states */
  --cherry-400: #D14468;   /* focus ring base, progress fill */
  --cherry-300: #F0708A;   /* focus ring, small highlights */

  /* Graphite grain ramp (main panel) */
  --ink-950: #0C0A0C;      /* page behind everything */
  --ink-900: #121012;      /* main panel base */
  --ink-850: #171417;      /* raised surface */
  --ink-800: #1F1B1F;      /* inputs, chips */

  /* Text */
  --text-1: #F3ECEE;       /* primary */
  --text-2: #B9A9AE;       /* secondary */
  --text-3: #94838A;       /* placeholders, hints (5:1 on ink-900) */

  /* Status (used only in the upload drawer) */
  --ok: #6FCF97;
  --warn: #E8B04A;
  --err: #FF8A80;

  /* Glass */
  --glass-fill: rgba(255, 255, 255, 0.06);
  --glass-fill-strong: rgba(30, 20, 25, 0.58);
  --glass-drawer: rgba(38, 22, 29, 0.62);
  --glass-border: rgba(255, 255, 255, 0.10);
  --glass-highlight: inset 0 1px 0 rgba(255, 255, 255, 0.14);
  --glass-blur: blur(28px) saturate(170%);
  --glass-blur-drawer: blur(44px) saturate(180%);
}
```

**Sidebar background:**
```css
background:
  radial-gradient(120% 60% at 0% 0%, rgba(163, 40, 70, 0.38), transparent 60%),
  linear-gradient(180deg, var(--cherry-700) 0%, var(--cherry-800) 100%);
```

**Outer frame (bezel):** `var(--cherry-800)`, the same family as the sidebar so the two read as one continuous cherry body with the main panel inset into it.

**Main panel background:**
```css
background:
  radial-gradient(90% 50% at 0% 100%, rgba(122, 27, 49, 0.14), transparent 70%),
  var(--ink-900);
```

### 4.2 Grain

Static film grain over the main panel and, more faintly, over the sidebar. It is not animated (cheaper and calmer).

```css
.grain::after {
  content: "";
  position: absolute; inset: 0;
  pointer-events: none;
  border-radius: inherit;
  opacity: 0.07;                 /* sidebar: 0.05 */
  mix-blend-mode: overlay;
  background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='220' height='220'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 0.9 0'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>");
  z-index: 0;
}
```
Content sits above the grain (`z-index: 1`). Glass surfaces sit above content and blur the grain along with it, which is what makes the glass feel real.

### 4.3 Typography

| Role | Family | Fallback |
|---|---|---|
| Wordmark "DocLens" | **Instrument Serif** (regular) | Georgia, serif |
| UI and messages, Latin | **Instrument Sans** | system-ui, -apple-system, sans-serif |
| Persian / Arabic script (all roles) | **Vazirmatn** | Tahoma, sans-serif |

**Type direction: "Claude chat + Apple".** The wordmark and hero use a refined serif, the way Claude's chat greets you with a serif line. Everything you read and press (messages, buttons, lists) uses a clean sans with Apple-style tight tracking (`letter-spacing: -0.011em` on `body` and `ui`, `-0.02em` on `title`). The serif is used only for the DocLens wordmark, so it stays a signature rather than a texture.

Font stack for all UI text: `"Instrument Sans", "Vazirmatn", system-ui, sans-serif`. The wordmark stays Latin.

| Token | Size / line-height | Weight | Use |
|---|---|---|---|
| `wordmark-hero` | 44 / 48 | 400, letter-spacing -0.01em | Hero title |
| `wordmark-header` | 19 / 22 | 400 | Glass header |
| `title` | 17 / 24 | 600 | Drawer title |
| `body` | 15.5 / 25 | 400 | Messages |
| `ui` | 14 / 20 | 500 | Buttons, list items |
| `caption` | 12.5 / 18 | 400 | File meta, hints, timestamps |

Rules: sentence case everywhere, no all-caps labels. Message line length capped at about 68 characters through the bubble max-width. Persian text gets +2px line-height (`body-fa`: 15.5 / 27) because the script has taller ascenders and dots.

### 4.4 Radius (varies by hierarchy, not one radius everywhere)

| Token | Value | Use |
|---|---|---|
| `--r-panel` | 32px | Main panel |
| `--r-drawer` | 28px | Upload drawer (left corners) |
| `--r-card` | 18px | Document rows, dropzone |
| `--r-bubble` | 22px (with one 6px corner, see 8.6) | Messages |
| `--r-pill` | 999px | New chat, composer, chips, buttons |

### 4.5 Spacing

4px base: 4, 8, 12, 16, 20, 24, 32, 48, 64.
Frame inset (bezel thickness) around the main panel: **12px** on top, right, bottom. Left edge of the panel meets the sidebar with a 0px seam (the panel is inset 12px from the sidebar's right edge visually through the bezel, see layout 5.1).

### 4.6 Elevation

```css
--shadow-panel: 0 0 0 1px rgba(0,0,0,.45), 0 40px 90px -30px rgba(0,0,0,.7);
--shadow-glass: 0 12px 40px -12px rgba(0,0,0,.55);
--shadow-drawer: -24px 0 80px -20px rgba(0,0,0,.65);
```
Main panel also has `box-shadow: inset 0 0 0 1px rgba(255,255,255,.06), inset 0 1px 0 rgba(255,255,255,.05)`.

### 4.7 Motion

```css
--ease-apple: cubic-bezier(0.32, 0.72, 0, 1);   /* main curve */
--ease-out:   cubic-bezier(0.2, 0.8, 0.2, 1);
--t-micro: 160ms;     /* hover, press, focus */
--t-std:   320ms;     /* menus, chips, list changes */
--t-drawer: 520ms;    /* upload drawer */
--t-hero:  640ms;     /* hero to chat transition */
```
Reduced motion: every transition becomes a 120ms opacity cross-fade, no blur animation, no translate. See section 11.

---

## 5. Layout

### 5.1 Desktop (≥ 1200px)

```
┌──────────────────────────────────────────────────────────────┐  cherry-800 bezel (12px)
│ ┌───────────┐ ┌──────────────────────────────────────────┐   │
│ │ ◎ DocLens │ │                                          ◖   │  ◖ = upload tab, on the right bezel
│ │           │ │            main panel  (r = 32)          │   │
│ │ (New chat)│ │                                          │   │
│ │           │ │                                          │   │
│ │ Today     │ │                                          │   │
│ │  ch3      │ │                                          │   │
│ │  ch2      │ │                                          │   │
│ │  ch1      │ │                                          │   │
│ └───────────┘ └──────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────────┘
```

- Sidebar: **280px** wide, full height, cherry gradient, flush with the bezel (no separate radius on its outer edges).
- Main panel: fills the rest, inset **12px** from top, right, and bottom. Left side is inset 0 from the sidebar edge but rounded on all four corners, so the cherry shows in the corner cutouts. Radius 32px.
- Content column inside the panel: centered, max-width **760px**, horizontal padding 24px.

### 5.2 Tablet (768–1199px)
Sidebar collapses to a **72px icon rail** (logo mark, New chat as a round button, chat list as initials-in-circles with tooltips). Hovering or tapping the logo mark expands it as an overlay at 280px with the glass drawer treatment. Panel and drawer behave as on desktop; drawer width is 44% (min 380px).

### 5.3 Mobile (< 768px)
- Sidebar becomes a left sheet (85% width, max 320px) opened by a menu button in the header. The header gets a 44px menu button at the leading edge.
- The main panel loses its bezel inset and radius except for a 24px top radius; it fills the screen.
- Upload tab stays on the right edge, half-circle 48px, vertically at 30%.
- Upload drawer becomes a **bottom sheet at 62% of viewport height** (the golden ratio's larger part) with a 5px x 36px grabber. Swipe down to close.
- Composer stays at the bottom, respects `env(safe-area-inset-bottom)`.

---

## 6. Screens and states

The interface has six states. Everything else is a variation of these.

### State A: First visit, no documents
```
┌─────────────────────────────────────────────┐
│                                             │
│                                          ◖  │  upload tab pulses once (section 9.2)
│                  (◎)  ← logo 56px           │
│                DocLens ← 44px serif         │
│                                             │
│        ╭───────────────────────────────╮    │
│        │  Add a document to begin    ⌕ │    │  composer is LOCKED
│        ╰───────────────────────────────╯    │
│                                             │
└─────────────────────────────────────────────┘
```
- Composer is locked: placeholder "Add a document to begin", send button hidden, the whole pill is clickable and opens the upload drawer.
- Sidebar shows New chat (disabled) and the empty history text: "Your chats will appear here."

### State B: Documents uploaded, none chosen
Same as State A, but the composer placeholder reads "Choose a document to ask about" and clicking opens the drawer at the document list.

### State C: Document chosen, chat not started (hero)
- Composer unlocks. A **document chip** appears inside the composer at the leading edge: file glyph + truncated file name (max 180px) + a small × to clear.
- Placeholder: "Ask about {short file name}" (truncate name to 24 characters with an ellipsis in the middle).
- Logo and wordmark stay centered above the composer.

### State D: Active chat
```
┌─────────────────────────────────────────────┐
│░░░░░░░░░░░░░ (◎) DocLens ░░░░░░░░░░░░░░░░░░░░│ ← glass header, messages scroll under it
│                                          ◖  │
│                        ╭────────────────╮   │
│                        │ Q  right-aligned│  │
│                        ╰────────────────╯   │
│   ╭───────────────────────╮                 │
│   │ A  left-aligned        │                 │
│   ╰───────────────────────╯                 │
│░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░│ ← glass fade zone above composer
│   ╭─ 📄 file.pdf ─ Ask a follow-up ─── ↑ ╮   │
│   ╰──────────────────────────────────────╯   │
└─────────────────────────────────────────────┘
```

### State E: Upload drawer open
Detailed in section 8.8. Can be opened from any state above.

### State F: Streaming answer
The answer bubble grows as text arrives. A small lens-ring pulse (section 8.9) sits at the start of the bubble until the first token, then disappears. The send button becomes a stop button while streaming.

---

## 7. Sidebar (component detail)

**Brand row** (top, 20px padding): logo mark 28px + wordmark "DocLens" at 19px serif, leading aligned. Clicking it returns to State C/A (a fresh hero, same as New chat).

**New chat button**
- Full-width pill, height 44px, margin 16px.
- Fill: `rgba(255,255,255,0.10)`, 1px border `rgba(255,255,255,0.16)`, glass highlight. Plus icon 16px + label "New chat".
- Hover: fill 0.14. Press: scale 0.98 for 160ms. Focus: ring (section 11).
- This matches the sketch's highlighted pill.

**Chat history**
- Grouped with plain sentence-case group titles in `caption` size, `--text-2` at 70%: "Today", "Yesterday", "Earlier". Newest at the top (ch3, ch2, ch1 in the sketch).
- Row: height 52px, radius 14px, padding 10px 12px. Two lines: title (`ui`, 1 line, ellipsis) and document name (`caption`, `--text-2`, 1 line, ellipsis).
- Default: transparent. Hover: `rgba(255,255,255,0.06)`. Active chat: `rgba(255,255,255,0.11)` with a 1px inner border `rgba(255,255,255,0.10)`.
- On hover or focus a "⋯" button appears at the trailing edge with: Rename, Delete. Delete asks for confirmation inline ("Delete chat?" with Delete and Cancel).
- Titles auto-generate from the first question (truncated to 40 characters).
- List scrolls independently. Custom thin scrollbar (4px, `rgba(255,255,255,0.18)`, appears on hover).

**Empty history:** "Your chats will appear here." in `caption`, `--text-2`.

---

## 8. Main panel components

### 8.1 Logo mark
A magnifying glass: circular ring at the upper right, handle running to the lower left (as sketched). Inside the lens ring, a small page with a folded top-right corner in outline. Stroke 2.5px at 56px size (scales proportionally). Color: `--text-1` for the ring, `--cherry-300` for the folded page corner. A soft glow `0 0 32px rgba(209,68,104,0.35)` sits behind it in the hero only.
Sizes: 56px hero, 24px header, 28px sidebar.

### 8.2 Hero group (State A–C)
- Logo + wordmark stacked and centered, gap 12px.
- Vertical position: the group's optical center is at **40%** of the panel height; the composer sits **32px** below the wordmark.
- The group is one element so it can be animated as a unit (section 9.1).

### 8.3 Composer
| Property | Value |
|---|---|
| Width | `min(720px, 100% - 48px)`, centered |
| Height | 56px single line, grows to a max of 6 lines (about 168px) |
| Shape | Pill; radius eases from 999px to 28px once it wraps to a second line |
| Fill | `--glass-fill-strong` with `--glass-blur`, 1px `--glass-border`, `--glass-highlight`, `--shadow-glass` |
| Text | `body`, `--text-1`; placeholder `--text-3` |
| Leading | Document chip (State C/D) |
| Trailing | Send button: 40px circle, `--cherry-500`, up-arrow icon, appears (scale 0.8 to 1, 160ms) when there is text |
| Enter | Send. Shift+Enter: new line |
| Streaming | Send button becomes a stop button (square icon on cherry) |
| Locked | Fill `--ink-800` at 60%, text `--text-3`, cursor pointer, no caret |

The composer input uses `dir="auto"` so Persian text right-aligns automatically and English left-aligns, per message.

### 8.4 Glass header (State D)
- Height 64px, spans the full width of the main panel, sticky at the top, top corners follow the panel radius.
- Content: logo mark 24px + wordmark 19px, centered as one unit, gap 8px.
- Surface: `rgba(18,16,18,0.55)`, `--glass-blur`, bottom border `rgba(255,255,255,0.08)`, `--glass-highlight`.
- Messages scroll **under** the header, so blurred text is visible through it.
- Below the header, a 24px gradient helps the blur feel soft: `linear-gradient(rgba(18,16,18,0.5), transparent)`.

### 8.5 Message list
- Container padding: top 88px (clears the header), bottom 140px (clears the composer zone).
- Vertical gap between messages: 16px; between a question and its answer: 8px; between exchanges: 24px.
- Auto-scrolls to the newest message. If the person has scrolled up, do not force-scroll; show a floating glass "Jump to latest" pill (radius pill, 36px tall) above the composer.

### 8.6 Bubbles

| | Question (Q) | Answer (A) |
|---|---|---|
| Alignment | Right | Left |
| Max width | 68% of content column | 76% of content column |
| Fill | `linear-gradient(180deg, rgba(163,40,70,.60), rgba(122,27,49,.60))` | `rgba(255,255,255,0.05)` |
| Border | 1px `rgba(255,255,255,0.14)` | 1px `rgba(255,255,255,0.08)` |
| Radius | 22px 22px 6px 22px | 22px 22px 22px 6px |
| Padding | 12px 16px | 14px 18px |
| Text | `--text-1` | `--text-1` |

The small 6px corner points toward the speaker's side. In a Persian (RTL) message the text direction flips inside the bubble but the bubble stays on the same side (questions right, answers left) so the layout does not jump between languages.

Answer formatting supported: paragraphs, bold, italic, bullet and numbered lists, inline code, code blocks (fill `--ink-800`, radius 12px, horizontal scroll), simple tables (horizontal scroll inside the bubble).

Bubble actions on hover (answers only): Copy, Regenerate. 28px round glass buttons below the bubble, fade in over 160ms.

### 8.7 Source chips (click opens a glass popover, confirmed)
Under an answer: a row of small pills such as "p. 12" or "Section 3", each `caption` size, `--glass-fill`, radius pill. Clicking one opens a small glass popover (max 320px) showing the retrieved passage with the matching text highlighted in `rgba(209,68,104,0.30)`.

### 8.8 Upload tab (right bezel half-circle)

This is the signature interaction from the sketch.

**Shape**
- The main panel's right edge has a **concave semicircular cutout**, and inside it sits a **half-circle handle** of the bezel color that protrudes into the panel. Together they read as a tab growing out of the frame.
- Diameter 64px (radius 32), protruding 32px into the panel. Position: **vertically at 30%** of the panel height (as sketched), on the right edge.
- The handle is `--cherry-700` with the sidebar-style grain and a glass highlight along its curved edge (`inset 0 1px 0 rgba(255,255,255,.18)`).
- Icon: an upload glyph (arrow rising from a tray), 20px, `--text-1`, placed in the visible half. Not a paperclip.
- A small count badge appears at the top of the tab when uploads are processing (8px cherry-300 dot, no number).

**States**
- Rest: as above.
- Hover: handle protrudes an extra 6px (spring, 240ms) and the icon lifts 2px.
- Press: scale 0.96.
- Open: the tab morphs into the drawer (section 9.2). While open, the tab's icon becomes a close chevron and it is attached to the drawer's left edge.
- Focus: focus ring on the half-circle.

**Accessible name:** "Upload and choose documents". Tooltip on hover: "Documents".

### 8.9 Upload drawer

**Size and position**
- Overlays the main panel, anchored to the right edge, full height of the panel.
- Width: `clamp(380px, 38.2% of panel width, 560px)`.
- Left corners radius `--r-drawer` (28px); right corners follow the panel radius so it fits the frame.
- Surface: `--glass-drawer`, `--glass-blur-drawer`, 1px `--glass-border` on the left and top edges, `--glass-highlight`, `--shadow-drawer`.
- The main panel content behind it dims to 88% brightness and blurs 6px (a scrim of `rgba(0,0,0,0.28)`). Clicking the scrim closes the drawer.

**Layout (top to bottom)**
```
┌────────────────────────────────────┐
│  Your documents                 ✕  │  title (17/24, 600) + close
│                                    │
│  ┌ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┐   │
│  │   ⬆  Drop files here         │   │  dropzone (h 148px, dashed, radius 18)
│  │   or browse · PDF DOCX TXT MD │   │
│  └ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┘   │
│                                    │
│  ▣ report-q3.pdf        Chat ›     │  document rows
│    3.2 MB · 48 pages · Today       │
│  ▣ contract.docx        Ready      │
│    …                               │
└────────────────────────────────────┘
```

**Dropzone**
- Dashed 1.5px border `rgba(255,255,255,0.22)`, radius 18px, fill `rgba(255,255,255,0.03)`.
- Drag over (file dragged anywhere on the window opens the drawer automatically): border becomes solid `--cherry-300`, fill `rgba(209,68,104,0.12)`, icon lifts 4px, copy changes to "Release to upload".
- Once at least one document exists, the dropzone shrinks to a 72px strip so the list gets the space.

**Document row**
- Height 68px, radius 18px, padding 12px 14px, fill `rgba(255,255,255,0.04)`, hover 0.07.
- Leading: 36px file-type tile (radius 10px, `rgba(255,255,255,0.08)`, extension text in `caption`).
- Middle: file name (`ui`, 1 line, ellipsis in the middle so the extension stays visible) and meta line (`caption`, `--text-2`): size · pages · relative date.
- Trailing: primary action, described below. A "⋯" menu holds Rename and Delete.
- **Selected document** (the one used by the current chat): fill `rgba(163,40,70,0.28)`, border `rgba(240,112,138,0.45)`, check icon at the trailing edge.

**Row lifecycle (per file)**
| Stage | What the person sees |
|---|---|
| Uploading | Thin progress bar (3px, `--cherry-400`) along the bottom of the row, percentage in the meta line |
| Reading | Meta line: "Reading the document…" with the lens-ring pulse in place of the trailing action |
| Ready | Trailing pill button **"Chat"** (`--cherry-500` fill, 32px tall) |
| Failed | Row border `--err` at 50%, meta line explains the reason, trailing button "Try again" |

Pressing **Chat** on a ready document: the drawer closes (section 9.3), the document becomes the active one, and the composer unlocks (State C). If a chat is already in progress on a different document, ask first with an inline row confirmation: "Start a new chat with this document?" with Start chat and Cancel.

**Error and edge copy**
- Wrong type: "This file type isn't supported. Use PDF, DOCX, TXT or MD."
- Too large: "This file is over 10 MB. Try a smaller file."
- Unreadable: "We couldn't read this file. If it's a scan, try a text-based version."
- Empty list: "No documents yet. Drop a file above to start."

### 8.10 Deleting a document (chats stay as read-only history)

- Delete lives in the row's "⋯" menu. It asks inline in the row: "Delete this document? Its chats stay as read-only history." with **Delete** (`--err` text, ghost pill) and **Cancel**.
- After deletion, chats that used it remain in the sidebar. Their second line (the document name) changes to "Document removed" in `--text-3`, and the row gets a small lock glyph (12px) at the trailing edge.
- Opening such a chat shows the full conversation as normal, but the composer is in the **locked** style with the placeholder "This document was removed. Chats about it are read-only." The document chip is replaced by a lock glyph. There is no send button.
- Source chips in a read-only chat stay clickable if the passage text is still available. If not, the chip is dimmed (50%) and shows the tooltip "Document removed".
- Below the last message a **New chat** pill (same style as the sidebar button) lets the person start over with another document.
- If the deleted document is the one in the current active chat, the same read-only state applies immediately, with a 320ms cross-fade on the composer.

---

## 9. Interactions and transitions

### 9.1 Hero to chat (on first send)
Duration `--t-hero` (640ms), `--ease-apple`. Use the View Transitions API or FLIP so the logo group is the *same element* before and after.

1. **t = 0:** the question appears as a bubble (fade + 8px rise, 240ms).
2. **t = 0 to 640:** the logo group translates from center to the top center and scales to about 42% (logo 56 to 24px, wordmark 44 to 19px). No opacity change on the group itself.
3. **t = 160 to 560:** the glass header surface fades in behind the group (opacity 0 to 1, blur ramps 0 to 28px).
4. **t = 0 to 640:** the composer slides from mid-panel down to its docked position, 24px above the bottom edge.
5. **t = 300 to 640:** the bottom glass fade zone (section 9.4) fades in.
6. The answer stream starts after the transition finishes (or at t = 400 at the earliest so the two motions do not compete).

Starting a new chat reverses the animation at 480ms.

### 9.2 Opening the upload drawer
Duration `--t-drawer` (520ms), `--ease-apple`.

1. The half-circle tab **expands**: its curved edge stretches into the drawer's left edge (the tab becomes the top-left "ear" of the drawer, so it feels like one glass sheet pulling out of the bezel).
2. The drawer translates from `translateX(24px)` at opacity 0 to rest, while its width animates from the tab width to full (use `clip-path` or width animation so the contents do not reflow mid-move).
3. Backdrop blur ramps from 0 to `blur(44px)` over the first 360ms.
4. Panel content scales to 0.985, dims to 88%, and shifts 12px left (a soft parallax), 520ms.
5. Drawer content (title, dropzone, rows) fades in with a **single** 200ms fade starting at t = 200. No per-item staggering.

**First-visit hint (only motion that is not user triggered):** on State A only, the tab pulses once after 800ms (protrudes 10px and returns, 700ms). It never repeats in that session.

### 9.3 Closing the drawer
Reverse of 9.2 at 420ms. Triggers: Esc, the close button, clicking the scrim, choosing a document with Chat, swiping the drawer to the right (touch), or the tab (which is now a chevron).

### 9.4 Bottom glass fade zone (State D)
A 132px zone behind the composer:
```css
background: linear-gradient(to top, rgba(18,16,18,0.92) 30%, rgba(18,16,18,0));
backdrop-filter: blur(14px);
mask-image: linear-gradient(to top, #000 55%, transparent);
```
Messages scroll under it and blur out softly as they approach the composer. This is the "divider line" in the sketch, replaced by a soft glass edge.

### 9.5 Other micro-interactions
- Buttons: press scale 0.98, 160ms.
- New message: fade + 8px rise, 240ms.
- Lens-ring pulse (waiting for first token): the small logo ring scales 1 to 1.12 and its glow cycles opacity 0.4 to 0.9, 1200ms loop, only while waiting.
- Hover states never use transforms larger than 2px.

---

## 10. Copy (all UI text)

| Location | Text |
|---|---|
| Composer, locked (no docs) | Add a document to begin |
| Composer, locked (docs exist) | Choose a document to ask about |
| Composer, ready | Ask about {file name} |
| Composer, mid-chat | Ask a follow-up |
| New chat button | New chat |
| History empty | Your chats will appear here. |
| Drawer title | Your documents |
| Dropzone | Drop files here, or browse |
| Dropzone, dragging | Release to upload |
| Row action | Chat |
| Row action, failed | Try again |
| Jump pill | Jump to latest |
| Tab tooltip | Documents |
| Delete confirmation | Delete this document? Its chats stay as read-only history. |
| Sidebar, removed document | Document removed |
| Composer, read-only chat | This document was removed. Chats about it are read-only. |
| Source chip tooltip, removed | Document removed |

Voice: short, plain verbs, sentence case. Errors say what happened and what to do, with no apology.

---

## 11. Accessibility and quality floor

- **Contrast:** `--text-1` on ink-900 is above 15:1. `--text-2` on ink-900 is about 8:1 and on cherry-700 about 6:1. `--text-3` is used only for placeholders and captions and is about 5:1 on ink-900. Never place `--text-3` on cherry.
- **Focus:** visible on every interactive element: `outline: 2px solid var(--cherry-300); outline-offset: 2px;` (on glass surfaces add a `0 0 0 5px rgba(240,112,138,0.20)` halo).
- **Keyboard:** Tab order is sidebar (New chat, history), header (none), message actions, composer, upload tab. Enter sends; Shift+Enter is a new line; **Ctrl/Cmd+U** opens the upload drawer; **Esc** closes it and returns focus to the tab. The open drawer traps focus.
- **Screen readers:** message list is `role="log"` with `aria-live="polite"`; each message announces its speaker ("You said", "DocLens said"). The drawer is `role="dialog"` with `aria-modal="true"` and a labelled title. The upload tab is a button with an accessible name and `aria-expanded`.
- **Reduced motion** (`prefers-reduced-motion: reduce`): all transitions become a 120ms fade; no translate, no scale, no blur animation, no first-visit pulse, no lens-ring pulse (static glow instead).
- **Reduced transparency** (`prefers-reduced-transparency: reduce`) and browsers without `backdrop-filter`: glass surfaces become solid `rgba(30,20,25,0.94)`; the layout is unchanged.
- **Touch targets:** at least 44 x 44px on mobile.
- **Performance:** grain is a single static tiled background, not a per-frame filter. Limit simultaneous `backdrop-filter` layers to three (header, composer zone, drawer).

---

## 12. Persian and RTL support

The sketch's sample query is in Persian, so this is a requirement, not an extra.

- Every message bubble and the composer use `dir="auto"` so each message picks its own direction.
- Bubble side (Q right, A left) does not change with text direction.
- Persian text uses Vazirmatn with `body-fa` (15.5 / 27). Numbers follow the message's language (Persian digits in Persian text are not force-converted).
- Mixed-direction text (English file names inside Persian sentences) is isolated with `unicode-bidi: plaintext` or `<bdi>`.
- Bullets and numbered lists mirror correctly in RTL messages.
- Document chip and file names: keep the extension on the visible end (middle ellipsis) in both directions.
- The interface itself (sidebar, buttons, labels, tooltips, errors) is English and left-to-right only. Only message content and the composer text switch direction.

---

## 13. Build checklist (acceptance criteria)

1. Sidebar is cherry with grain; main panel is dark grain with 32px radius and the 12px cherry bezel.
2. Half-circle upload tab sits on the right edge at 30% height, with the concave cutout in the panel.
3. State A shows a locked composer that opens the drawer on click.
4. Drawer opens at 38.2% width (min 380, max 560) with the tab-to-drawer morph, and closes with all five triggers.
5. Dropping a file anywhere on the window opens the drawer and highlights the dropzone.
6. Each uploaded file shows the four row stages; "Chat" unlocks the composer with a document chip.
7. Sending the first message runs the 640ms hero-to-chat transition; the header becomes glass and messages scroll under it with visible blur.
8. Composer docks at the bottom with the glass fade zone; grows to 6 lines then scrolls.
9. Q bubbles right, A bubbles left, with the specified radii and fills.
10. Persian and English messages both render correctly in the same conversation.
11. Reduced motion, reduced transparency, keyboard, and screen reader behaviors from section 11 all pass.
12. Layout works at 1440, 1024, 768, and 390px widths as described in section 5.

---

## 14. Decision log

| Decision | Value | Status |
|---|---|---|
| File types | PDF, DOCX, TXT, MD | Assumed, not yet contradicted |
| File size limit | 10 MB per file | Confirmed |
| Switching document | Starts a new chat | Confirmed |
| Source citations | Included | Confirmed |
| Drawer width | 38.2% of panel, 380 to 560px | Designer's choice (aesthetic ratio) |
| Interface language | English only, LTR | Confirmed |
| Conversation languages | English and Persian | Confirmed |
| Citation click | Small glass popover with the passage | Confirmed |
| Deleted document | Chats stay as read-only history (section 8.10) | Confirmed |
| Wordmark style | Serif wordmark (Claude-chat feel) with Apple-style sans UI | Confirmed |

All open questions are resolved. Anything not listed here is either specified in the sections above or explicitly excluded in section 2.
