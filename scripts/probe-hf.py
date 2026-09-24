# Lists a Hugging Face model repository's files (size, sha256 where given)
# and checks a browser app may download them (CORS). Run on GitHub Actions.
#   python3 scripts/probe-hf.py muhdur/tilawi-fastconformer-quran
import json, sys, urllib.request
repo = sys.argv[1]
def get(url, method='GET', headers=None):
    req = urllib.request.Request(url, method=method, headers={'User-Agent': 'Mozilla/5.0', **(headers or {})})
    return urllib.request.urlopen(req, timeout=60)
info = json.load(get(f'https://huggingface.co/api/models/{repo}'))
print('sha', info.get('sha'), 'license', info.get('cardData', {}).get('license'), 'tags', info.get('tags'))
tree = json.load(get(f'https://huggingface.co/api/models/{repo}/tree/main?recursive=1'))
for f in tree:
    if f['type'] == 'file':
        print(f"{f['path']:50} {f.get('size', 0):>12,}  lfs-sha256 {(f.get('lfs') or {}).get('oid', '-')}")
first = next(f['path'] for f in tree if f['type'] == 'file' and f['path'].endswith('.json'))
r = get(f'https://huggingface.co/{repo}/resolve/{info["sha"]}/{first}', headers={'Origin': 'https://example.github.io'})
print('CORS on', first, '->', r.headers.get('access-control-allow-origin'), r.status)
for name in ('README.md',):
    try: print(get(f'https://huggingface.co/{repo}/resolve/{info["sha"]}/{name}').read().decode()[:3000])
    except Exception as e: print(name, e)
