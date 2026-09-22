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
