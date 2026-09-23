# Mushaf memorisation app

See `BUILD-SPEC.md` for the full plan and `DECISIONS.md` for choices made along the way.

## Run it

```
npm install
npm run dev            # open the address it prints
```

Keys: ← next page, → previous page (a mushaf reads right to left).

The page layouts for all 604 pages are in `data/pages/`, packed for the app into
`public/data/` (index, 31 files of 20 pages, the translation). Only a few page fonts
are kept in git; the rest are downloaded by the ingest script:

```
node scripts/ingest.js 1-604 --source github --allow-typed   # layouts + fonts
node scripts/check-quran.js     # every ayah present once, every word in order
node scripts/translations.js    # The Clear Quran, every surah
node scripts/pack.js            # writes public/data/
python3 scripts/align-source.py # checks and writes the meaning groups
```

`npm run preview:build` makes `dist/preview.html`, the page that's published. The
published app reads its page fonts from the artifact's file store; `data/font-assets.json`
lists where each one is (page → address) and is published as `data/fonts.json`.

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
