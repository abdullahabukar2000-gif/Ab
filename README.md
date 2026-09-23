# Mushaf memorisation app

See `BUILD-SPEC.md` for the full plan and `DECISIONS.md` for choices made along the way.

## Run it

```
npm install
npm run dev            # open the address it prints
```

Keys: ← next page, → previous page (a mushaf reads right to left).

Other scripts: `node scripts/translations.js` saves The Clear Quran for added surahs;
`python3 scripts/align-source.py` checks and writes the meaning groups.

`npm run preview:build` makes `dist/preview.html`, a single shareable file (fonts in
`dist/fonts/`).

## Get a page's layout (Phase 1)

Needs Node 18 or newer and `npm install`. No login.

```
node scripts/ingest.js 258          # one page
node scripts/ingest.js 255-261      # several pages
node scripts/ingest.js --surah 14   # every page of a surah
```

If quran.com can't be reached, add `--source github` to use a community copy of the
same layout instead (page numbers only). `data/pages/258.json` currently comes from
that copy; its `source` field says so.

Each page is saved to `data/pages/<page>.json`, and its 15 lines are printed so you
can compare them with your printed mushaf. If anything looks off (not 15 lines, or
two downloads of the same page disagree), the script stops and names the page
instead of saving it.
