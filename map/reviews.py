import json, subprocess, time, os, re, sys
from collections import defaultdict

UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36"
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "reviews_pages")
os.makedirs(OUT, exist_ok=True)
LETTERS = ["nbr"] + [chr(c) for c in range(ord("A"), ord("Z") + 1)]


def fetch(letter, start):
    url = (f"https://www.metal-archives.com/review/ajax-list-browse/by/alpha/selection/{letter}"
           f"?sEcho=1&iDisplayStart={start}&iDisplayLength=200")
    for attempt in range(8):
        r = subprocess.run(["curl", "-s", "-w", "\n%{http_code}", "-A", UA, url], capture_output=True, timeout=180)
        body, _, code = r.stdout.rpartition(b"\n")
        if code == b"200":
            try:
                return json.loads(body.decode("utf-8", "replace"), strict=False)
            except Exception as e:
                print("parse err", e, flush=True)
        w = min(300, 10 * 2 ** attempt)
        print(f"  HTTP {code.decode()} {letter} {start}, retry {w}s", flush=True)
        time.sleep(w)
    raise RuntimeError(url)


for L in LETTERS:
    safe = {"~": "tilde"}.get(L, L)
    start, total = 0, None
    while total is None or start < total:
        f = os.path.join(OUT, f"{safe}_{start}.json")
        if os.path.exists(f):
            d = json.load(open(f))
        else:
            d = fetch(L, start)
            json.dump(d, open(f, "w"))
            time.sleep(0.8)
        total = d["iTotalRecords"]
        start += 200
    print(L, total, flush=True)

# aggregate: band id -> [count, sum of ratings]
agg = defaultdict(lambda: [0, 0])
for fn in os.listdir(OUT):
    for r in json.load(open(os.path.join(OUT, fn)))["aaData"]:
        m = re.search(r"/bands/[^\"]*/(\d+)\"", r[2])
        p = re.search(r"(\d+)%", r[4])
        if m:
            a = agg[int(m.group(1))]
            a[0] += 1
            a[1] += int(p.group(1)) if p else 0
json.dump(agg, open(os.path.join(os.path.dirname(OUT), "reviews_by_band.json"), "w"))
print("bands with reviews", len(agg), "reviews", sum(a[0] for a in agg.values()))
