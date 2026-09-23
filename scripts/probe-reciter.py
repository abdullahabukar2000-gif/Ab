# Looks up a reciter in everyayah.com's and quranicaudio.com's own lists and
# prints every matching entry (folder, bitrate, riwayah where given).
#   python3 scripts/probe-reciter.py "sufi|soufi"
import re, sys, json, urllib.request
pat = re.compile(sys.argv[1], re.I)
def get(url):
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
    with urllib.request.urlopen(req, timeout=60) as r: return r.read().decode('utf-8', 'replace')
for url in ['https://everyayah.com/data/recitations.js', 'https://everyayah.com/recitations_ayat.html']:
    try:
        text = get(url)
        print(f'== {url} ({len(text)} bytes)')
        for block in re.split(r'\n\s*\n|},', text):
            if pat.search(block): print(block.strip()[:600]); print('--')
    except Exception as e: print(url, 'failed', e)
for url in ['https://quranicaudio.com/api/qaris', 'https://api.quran.com/api/v4/resources/recitations', 'https://mp3quran.net/api/v3/reciters?language=eng']:
    try:
        text = get(url)
        print(f'== {url} ({len(text)} bytes)')
        data = json.loads(text)
        items = data if isinstance(data, list) else next((v for v in data.values() if isinstance(v, list)), [])
        for it in items:
            if pat.search(json.dumps(it, ensure_ascii=False)): print(json.dumps(it, ensure_ascii=False)[:1500]); print('--')
    except Exception as e: print(url, 'failed', e)
