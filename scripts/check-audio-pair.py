# Which ayah is in each file? Compares one reciter's files for a surah with a
# reference reciter's, by length (ffprobe), after scaling for tempo, and
# prints the best-matching reference ayah for every file.
#   python3 scripts/check-audio-pair.py SURAH TEST_FOLDER REF_FOLDER
import subprocess, sys, json, statistics as st
from concurrent.futures import ThreadPoolExecutor
s, test, ref = int(sys.argv[1]), sys.argv[2], sys.argv[3]
n = {c['id']: c['verses_count'] for c in json.load(open('data/chapters.json'))['chapters']}[s]
B = 'https://everyayah.com/data/'
def dur(url):
    out = subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', url], capture_output=True, text=True, timeout=90).stdout.strip()
    try: return float(out)
    except ValueError: return None
with ThreadPoolExecutor(12) as ex:
    t = list(ex.map(lambda a: dur(f'{B}{test}/{s:03d}{a:03d}.mp3'), range(1, n + 1)))
    r = list(ex.map(lambda a: dur(f'{B}{ref}/{s:03d}{a:03d}.mp3'), range(1, n + 1)))
    b = list(ex.map(dur, [f'{B}{test}/001001.mp3', f'{B}{ref}/001001.mp3']))
scale = st.median([t[i] / r[i + 1] for i in range(n - 1) if t[i] and r[i + 1]] + [t[i] / r[i] for i in range(n) if t[i] and r[i]])
print(f'surah {s}: {test} vs {ref}, tempo scale {scale:.2f}; basmalah files {b[0]} / {b[1]}')
print('file  secs   ~ref-secs of ref ayah (a-1, a, a+1)  best')
for i in range(n):
    near = {a: r[a - 1] * scale for a in (i, i + 1, i + 2) if 1 <= a <= n and r[a - 1]}
    near['bsml'] = b[1] * scale if b[1] else 0
    best = min(near, key=lambda a: abs(near[a] - (t[i] or 0)))
    print(f'{i+1:4} {t[i] or 0:6.1f}   ' + '  '.join(f'{a}:{v:5.1f}' for a, v in near.items() if a != 'bsml') + f'   -> {best}')
print('ref total', round(sum(x for x in r if x)), 'test total', round(sum(x for x in t if x)))
