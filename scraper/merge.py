import json, os, re, sys, html, glob, urllib.parse
from collections import Counter

PAGES = os.path.join(os.path.dirname(os.path.abspath(__file__)), "pages")
OUTFILE = sys.argv[1]

STATUS = {1: "Active", 2: "On hold", 3: "Split-up", 4: "Unknown", 5: "Changed name", 6: "Disputed"}
# column layouts (after name column) per job
LAYOUT = {}
for s in STATUS:
    LAYOUT[f"status{s}"] = ["genre", "country", "label"]
LAYOUT.update({"location": ["genre", "country", "location"],
               "themes": ["genre", "country", "themes"],
               "notes": ["genre", "country", "notes_html"],
               "year": ["genre", "country", "year"]})

NAME_RE = re.compile(r'<a href="([^"]+)">(.*?)</a>\s*(?:\(<strong>a\.k\.a\.</strong>\s*(.*?)\))?\s*<!--', re.S)
TAG_RE = re.compile(r"<[^>]+>")


def text(s):
    s = re.sub(r"<br\s*/?>", "\n", s)
    return html.unescape(TAG_RE.sub("", s)).strip()


def rows(job):
    files = sorted(glob.glob(os.path.join(PAGES, job, "*.json")),
                   key=lambda f: int(os.path.basename(f).split(".")[0]))
    for f in files:
        for r in json.load(open(f))["aaData"]:
            yield r


bands = {}
seen = Counter()
for job, cols in LAYOUT.items():
    if not os.path.isdir(os.path.join(PAGES, job)):
        print("missing job", job); continue
    n = 0
    for r in rows(job):
        m = NAME_RE.match(r[0])
        if not m:
            print("unparsed", job, r[0][:200]); continue
        url, name, aka = m.groups()
        bid = int(url.rstrip("/").rsplit("/", 1)[1])
        b = bands.get(bid)
        if b is None:
            b = bands[bid] = {"id": bid, "name": text(name), "url": url}
            if aka:
                aka = text(aka)
                b["aka"] = aka
                b["aka_list"] = [a.strip() for a in re.split(r"[;,]", aka) if a.strip()]
        vals = dict(zip(cols, [c.strip() for c in r[1:]]))
        for k in ("genre", "country"):
            if vals.get(k) and k not in b:
                b[k] = text(vals[k])
        if "year" in vals and "formed_in" not in b:
            y = vals["year"]
            b["formed_in"] = int(y) if y.isdigit() else None
        if job.startswith("status"):
            b["status"] = STATUS[int(job[6:])]
            lab = text(vals["label"])
            b["label"] = lab or None
        if job == "location":
            b["location"] = text(vals["location"]) or None
        if job == "themes":
            b["themes"] = text(vals["themes"]) or None
        if job == "notes":
            raw = vals["notes_html"]
            b["notes"] = text(raw)
            b["notes_truncated"] = raw.rstrip().endswith("...")
            emails = re.findall(r"[\w.+-]+@[\w-]+(?:\.[\w-]+)+", b["notes"])
            if emails:
                b["contact_emails"] = sorted(set(emails))
        n += 1
    seen[job] = n
    print(f"{job}: {n} rows, {len(bands)} unique bands so far", flush=True)

FIELDS = ["id", "name", "aka", "aka_list", "url", "genre", "country", "location", "status",
          "formed_in", "themes", "label", "notes", "notes_truncated", "contact_emails"]
out = []
for bid in sorted(bands):
    b = bands[bid]
    out.append({k: b.get(k) for k in FIELDS})

cov = {k: sum(1 for b in out if b[k] not in (None, [], "")) for k in FIELDS}
print("bands:", len(out))
print("coverage:", json.dumps(cov, indent=1))
with open(OUTFILE, "w", encoding="utf-8") as f:
    json.dump(out, f, ensure_ascii=False, indent=1)
