# Checks the recitation files for each reciter against the text: an ayah's
# recording should be long when the ayah is long. For each reciter and surah it
# downloads every ayah's file, measures its length (ffprobe), and compares
# with the ayah's word count, as recorded and shifted by one ayah either way.
# A clear best shift other than 0 means that reciter's files are numbered off
# by one; a long first file means the basmalah is joined to ayah 1.
# Also reports which folder addresses exist and whether downloads are allowed
# from other websites (CORS). Run on GitHub Actions (check-audio workflow).
import json, glob, subprocess, urllib.request, sys, statistics as st

RECITERS = {
    'alafasy': ['Alafasy_128kbps', 'Alafasy_64kbps'],
    'husary': ['Husary_128kbps', 'Husary_64kbps'],
    'minshawi': ['Minshawy_Murattal_128kbps'],
    'muaiqly': ['MaherAlMuaiqly128kbps', 'Maher_AlMuaiqly_64kbps'],
    'tunaiji': ['khalefa_al_tunaiji_64kbps'],
}
HOSTS = ['https://everyayah.com/data/', 'https://mirrors.quranicaudio.com/everyayah/']
SURAHS = [int(s) for s in (sys.argv[1] if len(sys.argv) > 1 else '1,14,18,36,67,78,112').split(',')]

words = {}
for f in glob.glob('public/data/pages-*.json'):
    for p in json.load(open(f)).values():
        for l in p['lines']:
            for w in l['words']:
                if w['type'] == 'word': words[w['verseKey']] = words.get(w['verseKey'], 0) + 1
counts = {c['id']: c['verses_count'] for c in json.load(open('data/chapters.json'))['chapters']}

def head(url):
    req = urllib.request.Request(url, method='HEAD', headers={'Origin': 'https://example.github.io', 'User-Agent': 'Mozilla/5.0'})
    try:
        with urllib.request.urlopen(req, timeout=30) as r: return r.status, r.headers.get('access-control-allow-origin')
    except urllib.error.HTTPError as e: return e.code, None
    except Exception as e: return str(e)[:40], None

def duration(url):
    try:
        out = subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', url],
                             capture_output=True, text=True, timeout=60).stdout.strip()
        return float(out)
    except Exception: return None

def corr(a, b):
    if len(a) < 3: return float('nan')
    ma, mb = st.mean(a), st.mean(b)
    sa = sum((x - ma) ** 2 for x in a) ** .5; sb = sum((y - mb) ** 2 for y in b) ** .5
    return sum((x - ma) * (y - mb) for x, y in zip(a, b)) / (sa * sb) if sa and sb else float('nan')

print('== addresses (status, CORS)')
for rid, folders in RECITERS.items():
    for host in HOSTS:
        for f in folders:
            print(f'{rid:9} {host}{f}/014001.mp3 ->', *head(f'{host}{f}/014001.mp3'))

for rid, folders in RECITERS.items():
    base = next((f'{h}{f}/' for h in HOSTS for f in folders if head(f'{h}{f}/014001.mp3')[0] == 200), None)
    if not base: print(f'\n== {rid}: no working folder'); continue
    print(f'\n== {rid}: {base}')
    bsml = duration(base + '001001.mp3')
    print(f'   001001 (basmalah) {bsml:.1f}s' if bsml else '   001001 missing')
    for s in SURAHS:
        n = counts[s]
        d = [duration(f'{base}{s:03d}{a:03d}.mp3') for a in range(1, n + 1)]
        extra = duration(f'{base}{s:03d}{n + 1:03d}.mp3')
        w = [words.get(f'{s}:{a}', 0) for a in range(1, n + 1)]
        missing = [a + 1 for a, x in enumerate(d) if x is None]
        pairs = lambda k: [(w[i], d[i + k]) for i in range(n) if 0 <= i + k < n and d[i + k] is not None]
        scores = {k: corr(*zip(*pairs(k))) if pairs(k) else float('nan') for k in (-1, 0, 1)}
        per_word = st.median([d[i] / w[i] for i in range(n) if d[i] and w[i]]) if any(d) else 0
        first_extra = (d[0] - per_word * w[0]) if d and d[0] else None
        print(f'   surah {s:3} ({n} ayahs): shift -1/0/+1 = ' + ' '.join(f'{scores[k]:.2f}' for k in (-1, 0, 1)) +
              f' | missing {missing or "none"} | file {n + 1} exists: {extra is not None}' +
              (f' | ayah 1 longer than expected by {first_extra:.1f}s' if first_extra is not None else ''))
