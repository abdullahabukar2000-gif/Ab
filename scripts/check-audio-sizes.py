# Fast whole-Quran check of the recitation files: uses each file's size (from a
# HEAD request) as a stand-in for its length, compares with the ayah word
# counts, and lists every surah whose files look shifted against the text.
# For those it prints each file's relative size next to the ayah word counts,
# so the exact numbering can be read off. Run on GitHub Actions.
import json, glob, urllib.request, statistics as st, sys
from concurrent.futures import ThreadPoolExecutor

RECITERS = {
    'alafasy': 'https://everyayah.com/data/Alafasy_128kbps/',
    'husary': 'https://everyayah.com/data/Husary_128kbps/',
    'minshawi': 'https://everyayah.com/data/Minshawy_Murattal_128kbps/',
    'muaiqly': 'https://everyayah.com/data/MaherAlMuaiqly128kbps/',
    'tunaiji': 'https://everyayah.com/data/khalefa_al_tunaiji_64kbps/',
    'ayyub': 'https://everyayah.com/data/Muhammad_Ayyoub_128kbps/',
}
only = sys.argv[1].split(',') if len(sys.argv) > 1 and sys.argv[1] else list(RECITERS)
words = {}
for f in glob.glob('public/data/pages-*.json'):
    for p in json.load(open(f)).values():
        for l in p['lines']:
            for w in l['words']:
                if w['type'] == 'word': words[w['verseKey']] = words.get(w['verseKey'], 0) + 1
counts = {c['id']: c['verses_count'] for c in json.load(open('data/chapters.json'))['chapters']}

def size(url):
    for _ in range(3):
        try:
            req = urllib.request.Request(url, method='HEAD', headers={'User-Agent': 'Mozilla/5.0'})
            with urllib.request.urlopen(req, timeout=30) as r: return int(r.headers.get('content-length') or 0)
        except urllib.error.HTTPError as e:
            if e.code == 404: return None
        except Exception: pass
    return -1

def corr(a, b):
    if len(a) < 3: return float('nan')
    ma, mb = st.mean(a), st.mean(b)
    sa = sum((x - ma) ** 2 for x in a) ** .5; sb = sum((y - mb) ** 2 for y in b) ** .5
    return sum((x - ma) * (y - mb) for x, y in zip(a, b)) / (sa * sb) if sa and sb else float('nan')

for rid in only:
    base = RECITERS[rid]
    urls = [(s, a) for s in range(1, 115) for a in range(1, counts[s] + 2)]
    with ThreadPoolExecutor(32) as ex:
        sizes = dict(zip(urls, ex.map(lambda sa: size(f'{base}{sa[0]:03d}{sa[1]:03d}.mp3'), urls)))
    print(f'\n== {rid} {base}')
    flagged = 0
    for s in range(1, 115):
        n = counts[s]
        d = [sizes[(s, a)] for a in range(1, n + 1)]
        w = [words.get(f'{s}:{a}', 0) for a in range(1, n + 1)]
        missing = [a + 1 for a, x in enumerate(d) if not x or x < 0]
        extra = sizes[(s, n + 1)]
        def sc(k):
            p = [(w[i], d[i + k]) for i in range(n) if 0 <= i + k < n and d[i + k] and d[i + k] > 0]
            return corr(*zip(*p)) if len(p) >= 3 else float('nan')
        scores = {k: sc(k) for k in (-2, -1, 0, 1, 2)}
        best = max(scores, key=lambda k: -9 if scores[k] != scores[k] else scores[k])
        bad = missing or extra or (n >= 5 and (best != 0 and scores[best] - scores[0] > 0.15))
        if not bad: continue
        flagged += 1
        print(f'  surah {s} ({n}): shift ' + ' '.join(f'{k:+d}:{scores[k]:.2f}' for k in scores) + f' missing {missing} extra file {n+1}: {extra}')
        per = st.median([x / y for x, y in zip(d, w) if x and x > 0 and y]) or 1
        print('    file:words ' + ' '.join(f'{a+1}:{(d[a] or 0)/per:.0f}/{w[a]}' for a in range(n)))
    print(f'  {flagged} surahs flagged')
