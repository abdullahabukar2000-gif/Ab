# Meaning groups for every ayah, worked out automatically.
#
# For each ayah it uses quran.com's word-by-word English (one short gloss per
# Arabic word, from the npm package @kmaslesa/holy-quran-word-by-word-full-data)
# to find which part of The Clear Quran each Arabic word is translated in:
#
#   1. The translation is cut into short pieces at punctuation and at words
#      that start a new clause (and, but, who, when, ...). The pieces are exact
#      slices of the published text; nothing is reworded.
#   2. Each Arabic word goes to the piece whose words best match its gloss
#      (words with no match go with the word after them).
#   3. Pieces are merged until every group is an unbroken run of Arabic words
#      and no two groups' runs overlap. Pieces with no Arabic words join the
#      piece before them.
#
# Merging only ever makes groups bigger, so a doubtful match gives a larger
# block, never a block paired with the wrong words. The hand-checked groups in
# align-source.py (Surah Ibrahim and around it) are kept as they are.
#
#   python3 scripts/align-auto.py <path to data.json of the npm package>
#
# Writes data/align/clear-quran.json (hand-checked + automatic) and prints how
# closely the automatic groups agree with the hand-checked ones.

import json, glob, os, re, sys

ROOT = os.path.join(os.path.dirname(__file__), '..')
WBW = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, 'node_modules/@kmaslesa/holy-quran-word-by-word-full-data/data.json')

translation = json.load(open(os.path.join(ROOT, 'public/data/clear-quran.json')))

# Arabic word counts from our own pages: groups must match these exactly.
counts = {}
for f in glob.glob(os.path.join(ROOT, 'public/data/pages-*.json')):
    for page in json.load(open(f)).values():
        for line in page['lines']:
            for w in line['words']:
                if w['type'] == 'word':
                    counts[w['verseKey']] = counts.get(w['verseKey'], 0) + 1

glosses = {}
for page in json.load(open(WBW)):
    for a in page['ayahs']:
        for w in a['words']:
            if w['char_type_name'] == 'word':
                glosses.setdefault(w['parentAyahVerseKey'], []).append(w['translation']['text'] or '')

STOP = set('''a an the of to is are was were be been being it its this that these those
he him his she her they them their we us our you your i me my
and or but so then not no nor do does did has have had will shall would should can could may might must
in on at by for from with as into upon over about than there here what which who whom
indeed surely verily certainly truly only very all ever'''.split())

CLAUSE_WORDS = set('''and but so then who whom which whoever whatever when whenever if until while
except unless or yet before after because since though although where lest'''.split())


def norm(word):
    word = word.lower().strip("˹˺()[]“”‘’\"'.,;:!?—-")
    word = word.replace('’', "'")
    for suf in ("'s", 'ing', 'ed', 'es', 's'):
        if len(word) > len(suf) + 2 and word.endswith(suf):
            return word[: -len(suf)]
    return word


def words_of(text):
    """(normalised word, start offset) for each word in text."""
    return [(norm(m.group()), m.start()) for m in re.finditer(r"[^\s—]+", text)]


def content(ws):
    return [w for w in ws if w and w not in STOP and not w.isdigit()]


def same(a, b):
    if a == b:
        return True
    n = min(len(a), len(b))
    return n >= 4 and a[:n] == b[:n] and abs(len(a) - len(b)) <= 3


def cut(text):
    """Split points: after punctuation followed by a space, and before clause words."""
    points = set()
    for m in re.finditer(r'[,;:.!?—](?=\s|$)|—', text):
        end = m.end()
        while end < len(text) and text[end] == ' ':
            end += 1
        if 0 < end < len(text):
            points.add(end)
    for m in re.finditer(r'(?<= )(\S+)', text):
        if norm(m.group(1)) in CLAUSE_WORDS and m.group(1)[0].islower():
            points.add(m.start())
    # Also before an opening quote.
    for m in re.finditer(r'(?<= )[“‘]', text):
        points.add(m.start())
    points = sorted(points)
    bounds, start = [], 0
    for p in points + [len(text)]:
        if p > start:
            bounds.append([start, p])
            start = p
    # A piece of one word joins the next piece (or the one before, at the end).
    merged = []
    for b in bounds:
        if merged and len(text[merged[-1][0]:merged[-1][1]].split()) < 2:
            merged[-1][1] = b[1]
        else:
            merged.append(b)
    if len(merged) > 1 and len(text[merged[-1][0]:merged[-1][1]].split()) < 2:
        merged[-2][1] = merged[-1][1]
        merged.pop()
    return merged


def align(key):
    text = translation.get(key)
    gl = glosses.get(key)
    n = counts.get(key, 0)
    if not text or not gl or len(gl) != n:
        return None
    pieces = cut(text)
    if len(pieces) < 2 or n < 2:
        return None
    piece_words = [content([w for w, _ in words_of(text[a:b])]) for a, b in pieces]
    mid = [((a + b) / 2) / len(text) for a, b in pieces]

    # 2. Each Arabic word to its best piece.
    home = [None] * n
    for i, g in enumerate(gl):
        gw = content([w for w, _ in words_of(g)])
        if not gw:
            continue
        where = (i + 0.5) / n
        best, best_score = None, 0
        for p, pw in enumerate(piece_words):
            hits = sum(1 for x in gw if any(same(x, y) for y in pw))
            if not hits:
                continue
            score = hits / len(gw) - 0.6 * abs(mid[p] - where)
            if score > best_score:
                best, best_score = p, score
        home[i] = best
    if all(h is None for h in home):
        return None
    for i in range(n - 1, -1, -1):          # unmatched: go with the next word
        if home[i] is None and i + 1 < n:
            home[i] = home[i + 1]
    for i in range(n):                       # trailing unmatched: the word before
        if home[i] is None:
            home[i] = home[i - 1]

    # 3. Union pieces until each group is one unbroken run of Arabic words.
    parent = list(range(len(pieces)))
    def find(x):
        while parent[x] != x:
            parent[x] = parent[parent[x]]
            x = parent[x]
        return x
    first = min(home)
    for p in range(len(pieces)):             # pieces without Arabic words join the one before
        if p not in home:
            parent[p] = p - 1 if p > first else first
    changed = True
    while changed:
        changed = False
        span = {}
        for i, h in enumerate(home):
            r = find(h)
            lo, hi = span.get(r, (i, i))
            span[r] = (min(lo, i), max(hi, i))
        roots = sorted(span, key=lambda r: span[r])
        for a, b in zip(roots, roots[1:]):
            if span[b][0] <= span[a][1]:
                parent[find(b)] = find(a)
                changed = True
                break
    span = {}
    for i, h in enumerate(home):
        r = find(h)
        lo, hi = span.get(r, (i, i))
        span[r] = (min(lo, i), max(hi, i))
    roots = sorted(span, key=lambda r: span[r])
    if len(roots) < 2:
        return None
    group_of = {r: g for g, r in enumerate(roots)}
    ends = [span[r][1] for r in roots]

    # Pieces in English order; neighbours in the same group become one piece.
    out = []
    for p, (a, b) in enumerate(pieces):
        g = group_of[find(p)]
        end = b
        while end > a and text[end - 1] == ' ':
            end -= 1
        if out and out[-1][2] == g:
            out[-1][1] = end
        else:
            out.append([a, end, g])
    return {'ends': ends, 'pieces': out}


def check(key, a):
    n = counts[key]
    ends = a['ends']
    assert ends == sorted(set(ends)) and ends[-1] == n - 1, key
    text = translation[key]
    at = 0
    for s, e, g in a['pieces']:
        assert at <= s < e <= len(text) and 0 <= g < len(ends), key
        assert text[at:s].strip() == '', (key, text[at:s])
        at = e
    assert text[at:].strip() == '', key
    assert set(g for _, _, g in a['pieces']) == set(range(len(ends))), key


out_path = os.path.join(ROOT, 'data/align/clear-quran.json')
existing = json.load(open(out_path))
hand = existing['verses']

auto = {}
for key in counts:
    a = align(key)
    if a:
        check(key, a)
        auto[key] = a

# How close to the hand-checked groups? (boundary agreement)
tp = fp = fn = 0
for key, h in hand.items():
    a = auto.get(key)
    hb = set(h['ends'][:-1])
    ab = set(a['ends'][:-1]) if a else set()
    tp += len(hb & ab); fp += len(ab - hb); fn += len(hb - ab)
print(f'against the hand-checked ayahs: {tp} breaks agree, {fp} extra, {fn} missed')

verses = {**auto, **hand}
sizes = [len(v['ends']) for v in verses.values()]
print(f'{len(verses)} of {len(counts)} ayahs grouped ({len(counts) - len(verses)} left whole: one piece or no match); '
      f'{sum(sizes)} groups, {sum(sizes) / len(sizes):.1f} per ayah')

existing['verses'] = dict(sorted(verses.items(), key=lambda kv: tuple(map(int, kv[0].split(':')))))
existing['note'] = ('Groups for 13:43-15:15 checked by hand (scripts/align-source.py); the rest matched automatically '
                    'from quran.com word-by-word glosses (scripts/align-auto.py). Pieces are exact slices of the translation.')
if '--write' in sys.argv:
    json.dump(existing, open(out_path, 'w'), ensure_ascii=False, separators=(',', ':'))
    print('wrote', out_path)
