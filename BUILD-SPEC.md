# BUILD SPEC — Mushaf memorisation app

You are building this for me. Read this whole file before writing any code. Ask me the
questions in §9 before you start, then build in the phases in §8.

---

## 1. What this is

A personal memorisation tool. I paste or look up ayahs. The app works out which
**Madani Mushaf page** they live on and renders that page as a true 15-line mushaf
page — the same line breaks as the printed copy I memorise from, because I memorise
by *position on the page*, not by verse number.

On top of that page, each ayah is broken into **phrases** (breath-groups). I tap a
phrase, its meaning and my memorisation note come up. I can re-cut the phrase
boundaries word by word, because deciding where the breaks fall is itself part of
learning the ayah.

Two modes over the same data:

- **Mushaf** — the real 15-line page. Nothing but the page. This is the default.
- **Study** — ayah by ayah, translation underneath, notes visible, editing on.

Mode is a state of the same page, not a different screen. Switching must not scroll,
reflow or lose my place.

---

## 2. The hard part, read this first

The printed Madani Mushaf is **604 pages, 15 lines each**. Quran.com renders it exactly
by using the **KFGQPC QCF V2 fonts**: every word of every page is one pre-shaped glyph,
pre-stretched so the line is already justified. There is **one font file per page — 604
of them** — loaded on demand.

This has one dangerous property that the whole codebase must be organised around:

> **The glyph codes are not characters.** Every page's codes start at the same
> codepoint. Rendering page N's codes in page M's font paints different, wrong
> Qur'anic text — and it will not throw an error. It just renders the wrong words.

Non-negotiable rules that follow:

1. **Nothing renders in glyph mode until that exact page's font is confirmed loaded**
   (`document.fonts.load()` → `check()`). Until then, show real Unicode Uthmani text.
   Never show a glyph string against an unconfirmed or fallback font.
2. **Derive the type size, don't pick it.** Every mushaf line measures roughly
   15.3–16.1 em wide, because the glyphs carry their own justification. Set the page
   box to a fixed em width (~16.1em) and let font-size fall out of the container width.
   Do **not** use `justify-content: space-between` or `text-align: justify` — flex
   justification opens gulfs between words that the printed page does not have.
3. **Resolve line breaks at build time, not at runtime.** The public API serves page
   layout from more than one backing table and they disagree — identical requests for
   the same page have returned layouts a full line apart. Fetch once, commit the
   resolved layout to a local data file, render from that. The app must work offline.
4. **Centred lines come from a table.** Surah headings, basmalah, and short final lines
   of a surah are centred, not justified. Keep an explicit list; don't infer it.

If any of this turns out to be wrong when you test it, **tell me** rather than shipping
something that looks plausible. Wrong Qur'anic text is the one unacceptable failure.

---

## 3. Data

**Source:** Quran Foundation content API, `https://apis.quran.foundation/content/api/v4`.
Auth is `x-auth-token` + `x-client-id` — I'll register and give you credentials; keep
them in `.env`, never in committed code or client-side JS.

Endpoints you need:

- `/pages/lookup?chapter_number={n}&mushaf=1` — which pages a surah spans
- `/verses/by_page/{page}?mushaf=1&words=true&word_fields=code_v2,line_number,page_number`
  — every word of a page with its glyph code and **line number**. `mushaf=1` is QCF V2.
- `/verses/by_key/{s}:{a}?fields=text_uthmani&translations={id}` — for the study view
- `/resources/translations` — let me pick which translation, don't hardcode one

Fonts: the QCF V2 page fonts are free to use and distribute but **must not be modified,
subsetted or sold**. Reference them from the public CDN rather than re-cutting them.

**Write a one-off ingest script** (`scripts/ingest.js`) that takes a page number or a
surah, pulls the layout, and writes `data/pages/{n}.json`:

```json
{
  "page": 258,
  "lines": [
    { "line": 1, "centered": false,
      "words": [{ "code": "...", "uthmani": "...", "verseKey": "14:24", "pos": 3 }] }
  ],
  "verses": ["14:24", "14:25", "14:26", "14:27"]
}
```

Fifteen line objects, always. Assert that. If a page comes back with a different count,
fail loudly with the page number — don't paper over it.

My own layer is stored separately so re-ingesting never destroys my work:

```json
// data/notes/14-24.json
{ "verseKey": "14:24",
  "breaks": [5, 9, 11],
  "phrases": {
    "0":  { "tone": "ink",  "meaning": "...", "note": "..." },
    "6":  { "tone": "leaf", "meaning": "...", "note": "..." }
  } }
```

`breaks` are word indices that **end** a phrase. Phrases are derived from breaks, so
"take a word out of this group" is one click, not a data migration.

---

## 4. Design direction

The last attempt at this looked like generic AI output. Do not repeat it. Specifically
**do not**: gradient headers, emoji as icons, a card with a shadow for every element,
everything at `border-radius: 12px`, Inter for every piece of text, a purple-to-blue
accent, or a control bar crowded with pill buttons.

The reference is **printed Islamic book design**, not a web dashboard. Look at how a
good mushaf is set: a generous margin, the text block as the object, ornament used once
and with meaning, and nothing else on the paper.

**Principles**

- *The page is the object; the app is furniture.* In Mushaf mode the chrome should
  nearly disappear — controls fade to near-invisible until pointer or tap intent, or
  collapse to a thin edge. I should be able to forget I'm in an app.
- *One accent, used rarely.* Ayah markers, the active phrase, the current line. Nothing
  else gets colour.
- *Asymmetry over centred everything.* Page furniture (page number, juz, hizb) sits in
  the margin, small, in the Latin serif — the way a printed page numbers itself. Not a
  centred header bar.
- *Never obscure the text.* This is the rule that kills flat coloured highlight blobs.
  A phrase mark should be a **low-alpha wash (≤8%) plus a 2px baseline rule in the tone
  colour**, or a subtle warm paper-tint. The Arabic must read exactly as clearly marked
  as unmarked. Test this at the smallest size before you accept it.
- *Motion is a fade, 120ms, and nothing else.* No slide-ins, no spring, no scale.

**Palette** — ink on paper, three moods. Pick exact values and put them in one tokens
file; no colour literals anywhere else.

- `paper` (light): a warm off-white, not `#fff`. Near `#faf7f0`.
- `sepia`: aged paper, warmer and slightly darker, with ink browned to match. This is
  not "light with a beige background" — the ink shifts too.
- `night`: not black. A very dark warm neutral near `#141310`, ink at ~88% not 100%,
  so it doesn't glare in a dark room.
- Accent: a deep muted green-teal, the traditional mushaf ornament colour. One value,
  one lighter wash of it.
- Phrase tones: six, all desaturated and of *equal perceived weight* so no phrase looks
  more important than another. Name them (`ink`, `leaf`, `clay`, `plum`, `sea`, `stone`),
  never `color1`.

**Type**

- Arabic (study/fallback): Amiri Quran, with Scheherazade New and Noto Naskh Arabic
  selectable. Mushaf mode uses the QCF page fonts and ignores this setting — say so in
  the UI rather than letting the control look broken.
- Latin: a **serif** — Spectral, Newsreader or Source Serif. Not Inter, not system-ui.
  Translations and notes should read like a printed commentary, not UI copy.
- One small caps / letterspaced style for page furniture. That's the whole scale:
  page furniture, body, translation, note. Four steps, no more.

Dark, sepia and light must each look deliberately designed. If sepia looks like light
mode with a tint, it isn't done.

---

## 5. Interaction

**Mushaf mode**
- Tap a phrase → it takes the wash + rule; meaning and note appear in the margin on
  wide screens, in a bottom sheet on narrow ones. Never a modal over the page.
- Tap the page background → deselect.
- `←` / `→` page through. Page turns are instant; prefetch the next page's font.
- Untouched ayahs (no phrases cut yet) render as plain page text — no marks at all.

**Study mode**
- One ayah per block, translation underneath in the serif.
- Editing lives here. Between any two words sits an invisible hit zone; click it to cut
  or heal a phrase boundary. Zones only become visible when editing is on. Keyboard:
  arrow keys move between boundaries, space toggles.
- Per phrase: meaning field, note field, tone picker. Save on blur, no Save button.

**Persistence:** local JSON files on disk via the dev server, not localStorage — I want
these backed up and version-controlled. Ship an export/import anyway.

---

## 6. What you must not generate

Do not write translations or tafsir content yourself. Translations come from the API
(let me choose the resource) or from what I paste. Notes are mine to write. If you want
to offer an optional "suggest phrase boundaries" feature using the Anthropic API, it may
propose **where the breath-groups fall** and a structural hint (shared root, mirrored
word, contrast) — not a rendering of the meaning. Key from `.env`, server-side only,
off by default.

---

## 7. Stack

Your call, but: it must run with one command, work offline after ingest, and stay small.
Vite + vanilla TS, or Vite + a light framework if you justify it. No component library —
the design above is the point and a library will fight it. No CSS framework; hand-written
CSS with custom properties.

---

## 8. Phases — stop after each and show me

1. **Ingest.** Script + `data/pages/258.json` (Surah Ibrahim). Print the 15 lines as
   plain Uthmani text to the terminal so I can eyeball the line breaks against my copy
   before any UI exists.
2. **The page.** Mushaf mode only, correct QCF font gating, correct 15 lines, light
   theme. No phrases, no notes. It should already look better than quran.com.
3. **Phrases.** Cutting, tones, marks-that-don't-obscure, the margin panel.
4. **Study mode + notes.** Editing, translation, persistence to disk.
5. **Themes, fonts, export/import.** Sepia and night properly art-directed.
6. **Optional:** boundary suggestions, audio, spaced repetition over phrases.

Don't build ahead. Phase 2 landing correctly matters more than phases 3–6 existing.

---

## 9. Ask me these before you start

1. Which translation resource should be the default?
2. Should I be able to hide translations entirely in study mode (recall testing)?
3. One page at a time, or the traditional two-page spread on a wide screen?
4. Should the page show my memorisation progress at all, or stay completely clean?

---

## 10. Done means

- Page 258 renders 15 lines, line breaks identical to the printed Madani Mushaf.
- Nothing ever renders a glyph code against an unconfirmed font.
- Phrase marks never reduce the legibility of the Arabic.
- All three themes look deliberately designed.
- Works with the wifi off.
- Nothing about it reads as a default template.
