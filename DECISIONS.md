# Answers to BUILD-SPEC §9

1. **Default translation:** the same one quran.com uses by default, The Clear Quran
   (Dr. Mustafa Khattab), resource 131. Check this ID against `/resources/translations`
   when translations are wired up in Phase 4.
2. **Hiding translations:** yes, flashcard-style. Tapping a phrase shows its translation;
   tapping again hides it.
3. **Pages:** support both a single page and a two-page spread. The spread is laid out
   like a real mushaf: odd page on the right, even page on the left.
4. **Progress:** yes, show memorisation progress, kept subtle (for example a small
   margin mark).
5. **Language:** keep explanations plain and simple.
6. **Data:** the 14:24–14:27 range in the spec was only an example of the user's own
   progress. Page contents always come from the quran.com API.

# Phase 2 findings (where the spec's assumptions didn't hold)

- **Lines are not pre-justified.** §2 says QCF V2 lines all measure ~15.3–16.1em. Measured
  on pages 255–262 they run 11.4–19.6em wide. Lines are therefore set flush to both
  margins (`space-between`, like print) in a 19.3em block, and the rare line wider than
  that is scaled down to fit (page 258 line 8: 95%). Short lines get wider word gaps.
- **Data source.** quran.com is blocked from the cloud build machine, so pages come from
  github.com/zonetecde/mushaf-layout (pinned). Every ayah's glyph codes are checked
  against the King Fahd Complex's own listing (`mushaf-v2.txt` in
  github.com/mustafa0x/qpc-fonts, pinned), and every page against its own font file.
  Page 254 fails that check (a glyph between 13:37 and 13:38 is missing from the
  GitHub data) and is left out.
- **Fonts are stored in the project**, unmodified, in `public/fonts/qcf2/`, not loaded
  from a CDN, because the app must work offline. Page fonts are `QCF2nnn.ttf`, the
  basmalah is `QCF2BSML.ttf`.
- **Juz and hizb** aren't in the margin yet: none of the reachable sources has a
  trustworthy table. The margins show the surah name and page number.
- **Surah headings** are a drawn frame with the name in Amiri Quran, since the
  heading-name glyphs in QCF2BSML aren't mapped yet.

# Phase 3 notes

- **Flashcard meanings (answer 2).** Tapping a phrase opens it with its meaning covered;
  tapping it again reveals the meaning, and again hides it.
- **Splitting lives in the phrase panel** for now: the ayah is shown word by word with a
  tap zone between each pair. Study mode (Phase 4) will add splitting inline.
- **Meaning and note can be typed in the panel** so the flashcard can be tried before
  study mode exists. Edits are kept in this browser only until Phase 4 saves them
  properly.
- **Phrase marks** are drawn in a layer behind the text: a 2px baseline rule in the
  phrase's tone (at half strength when not selected) and an 8% wash on the selected
  phrase. Checked at phone size: the Arabic reads the same marked or unmarked.
- **Example:** 14:24 comes pre-split as an example (breaks only, no meanings). It's
  labelled "example" until edited.

# After Phase 3 feedback

- **Colours removed** (user won't use them). The mushaf page shows no marks at rest;
  only the tapped phrase gets the 8% wash and baseline rule, in the accent.
- **Verse by verse view** (like quran.com's): each ayah in its mushaf glyphs, grouped
  into phrases, with The Clear Quran underneath. "Hide translations" covers them for
  recall; tap one to check. Switching views keeps your place.
- **Translation source:** The Clear Quran (Dr. Mustafa Khattab, "Allah" edition) from
  github.com/fawazahmed0/quran-api, pinned; wording matched quran.com for 14:22–23.
  Saved offline by `scripts/translations.js`.
- **Suggested grouping for every ayah** (`src/suggest.ts`): the mushaf's pause signs
  (ۖ ۗ ۘ ۚ) always end a phrase; longer stretches are cut into groups of about 3–5
  words, preferring cuts after an indefinite noun or before a clause opener, never
  after a small leaning word, and not between a noun and its adjective. It proposes
  boundaries only, never meanings. Once you edit an ayah, your grouping is saved and
  the suggestion no longer moves it; "use suggestion" goes back.
- **Editing groups:** in verse by verse, a faint dot sits between every two words
  (tap to split) and a bar between phrases (tap to join).
- **quran.com's page 258 differs** from the user's printed copy in its middle lines
  (e.g. where "أن دعوتكم" falls). The app follows the printed copy, which the user
  checked line by line.

# Phrase cards (after verse-by-verse feedback)

- **Verse by verse is now a stack of phrase cards** per ayah (inspired by the user's
  flashcard screenshot). Tap a card to fill in its English; tap again to hide it.
- **Card English is quran.com's word-by-word translation**, joined for the words in
  the card (repeated glosses shown once). Source: npm
  @kmaslesa/holy-quran-word-by-word-full-data@1.0.6, saved offline by
  `scripts/wordbyword.js`, which checks every ayah's word count matches ours. The
  full Clear Quran translation stays under each ayah.
- **Regrouping by dragging:** a grip between two cards; drag down to pull words up
  into the card above, up to push words down. Dragging a card to nothing joins the
  two. Arrow keys move one word at a time. "Split in two" on an open card.
- **Bottom buttons** are always visible now, in the accent colour, on a bar; the
  selected option is filled. (The spec's fade-away controls were too hard to see.)

# Boxes across the line (after card feedback)

- **Verse by verse flows horizontally again**, like quran.com: each phrase group sits in
  a box within the ayah's line, boxes wrapping naturally. No vertical card stack.
- **One English line per ayah, built box by box** from quran.com's word-by-word English.
  Tapping a box (or its part of the English) reveals or hides that box's part; a hidden
  part keeps its length as a pale blank. "Hide translations" sets whether parts start
  hidden. "Show the full sentence" swaps the line for The Clear Quran and back.
- **Regrouping:** drag the grip between two boxes left or right onto a word; the box
  before ends at that word. Dragging past a whole box joins the two. Double-tap a word
  to split its box after it. Arrow keys move a focused grip one word.
- Per-phrase meaning/note fields are no longer in verse by verse (they stay in the
  mushaf page's phrase panel).

# Mushaf page simplified (user: "get rid of the extra stuff")

- The mushaf view is now just the pages: every added page one after another, each
  filling the screen, scrolled vertically. No phrase panel, highlights, page-turn
  buttons or one/two-page switch.
- Verse by verse lists every added ayah in one scroll. Switching views keeps the page
  you were on.
- The per-phrase meaning/note fields are gone from the interface (stored notes are
  kept, unused). Controls: "verse by verse" / "mushaf page", and "hide translations"
  in verse view.

# Icons, horizontal mushaf, two pages, crimson

- **Accent is crimson** (#a3172f): ayah markers, buttons, open boxes, focus rings.
- **Every clickable control is a button with an icon** (inline line icons in
  `src/icons.ts`): next/previous, one/two pages, mushaf/verse by verse, hide/show
  translations, use suggestion, full sentence/box by box. On phones the bar becomes
  icon-over-label tabs.
- **The mushaf swipes horizontally**, one screen at a time, laid out right to left:
  the first page is on the right and the next arrives from the left, as when turning
  a printed mushaf. Arrow keys and the chevron buttons turn pages on desktop.
- **Two-page view is back** (odd page on the right). Hidden on phones, where the
  spread would be too small to read.
- Verse by verse stays a vertical scroll. Switching views or layouts keeps your page.
