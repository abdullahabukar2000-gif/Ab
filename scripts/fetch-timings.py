# Ayah start times for reciters whose recordings are one file per surah
# ("gapless"), from the Quran Android app's timing databases (the same data
# that app uses). Writes public/data/timings/<name>.json as
# {"<surah>": [start of ayah 1 (ms), start of ayah 2, ..., end]}.
# Also checks the timings against the text: longer ayahs should take longer.
#   python3 scripts/fetch-timings.py abdurrashid_sufi [--audio URL_BASE]
import io, json, os, sqlite3, sys, tempfile, urllib.request, zipfile, glob, statistics as st
name = sys.argv[1]
audio = sys.argv[sys.argv.index('--audio') + 1] if '--audio' in sys.argv else None
def get(url):
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
    with urllib.request.urlopen(req, timeout=120) as r: return r.read()
raw = get(f'https://android.quran.com/data/databases/audio/{name}.zip')
z = zipfile.ZipFile(io.BytesIO(raw))
print('zip contents:', z.namelist())
db = next(n for n in z.namelist() if n.endswith('.db'))
path = os.path.join(tempfile.mkdtemp(), 't.db'); open(path, 'wb').write(z.read(db))
con = sqlite3.connect(path)
for (sql,) in con.execute("select sql from sqlite_master where type='table'"): print(sql)
rows = con.execute('select sura, ayah, time from timings order by sura, ayah').fetchall()
print(len(rows), 'rows; first', rows[:4])
out = {}
for s, a, t in rows: out.setdefault(s, {})[a] = t
counts = {c['id']: c['verses_count'] for c in json.load(open('data/chapters.json'))['chapters']}
words = {}
for f in glob.glob('public/data/pages-*.json'):
    for p in json.load(open(f)).values():
        for l in p['lines']:
            for w in l['words']:
                if w['type'] == 'word': words[w['verseKey']] = words.get(w['verseKey'], 0) + 1
result, problems = {}, []
for s in range(1, 115):
    t = out.get(s, {})
    n = counts[s]
    if not all(a in t for a in range(1, n + 1)): problems.append(f'{s}: missing ayahs'); continue
    # ayah 0 (if present) marks the basmalah; the entry after the last ayah (n+1 or 999) marks the end
    end = t.get(n + 1) or t.get(999)
    starts = [t[a] for a in range(1, n + 1)]
    if sorted(starts) != starts: problems.append(f'{s}: times out of order')
    result[s] = starts + ([end] if end else [])
    if n >= 8 and end:
        d = [b - a for a, b in zip(result[s], result[s][1:])]
        w = [words.get(f'{s}:{a}', 0) for a in range(1, n + 1)]
        ma, mb = st.mean(w), st.mean(d)
        c = sum((x - ma) * (y - mb) for x, y in zip(w, d)) / ((sum((x - ma) ** 2 for x in w) * sum((y - mb) ** 2 for y in d)) ** .5)
        if c < 0.7: problems.append(f'{s}: timings match ayah lengths poorly ({c:.2f})')
print('surahs with an end time:', sum(1 for s in result if len(result[s]) == counts[s] + 1), 'of 114')
print('ayah 0 (basmalah) present in', sum(1 for s in out if 0 in out[s]), 'surahs')
print('problems:', problems or 'none')
os.makedirs('public/data/timings', exist_ok=True)
json.dump(result, open(f'public/data/timings/{name}.json', 'w'), separators=(',', ':'))
print('wrote', f'public/data/timings/{name}.json', os.path.getsize(f'public/data/timings/{name}.json'), 'bytes')
if audio:
    req = urllib.request.Request(audio + '014.mp3', method='HEAD', headers={'Origin': 'https://example.github.io', 'User-Agent': 'Mozilla/5.0'})
    try:
        with urllib.request.urlopen(req, timeout=30) as r: print('audio', r.status, r.headers.get('content-type'), r.headers.get('content-length'), 'CORS:', r.headers.get('access-control-allow-origin'))
    except Exception as e: print('audio check failed', e)
