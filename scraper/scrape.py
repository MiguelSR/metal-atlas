import json, subprocess, urllib.parse, time, os, sys

B = "https://www.metal-archives.com/search/ajax-advanced/searching/bands/?"
UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36"
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "pages")
os.makedirs(OUT, exist_ok=True)
N = 200
DELAY = float(os.environ.get("DELAY", "0.8"))

# name -> extra params. Blank yearCreationFrom/To widens the set from 164k to all 202k bands
# (but hides the year column), so year gets its own job.
Y = {"yearCreationFrom": "", "yearCreationTo": ""}
JOBS = {}
for s in range(1, 7):
    JOBS[f"status{s}"] = {**Y, "status": s, "bandLabelName": "*"}
JOBS["location"] = {**Y, "location": "*"}
JOBS["themes"] = {**Y, "themes": "*"}
JOBS["notes"] = {**Y, "bandNotes": "*"}
JOBS["year"] = {"yearCreationFrom": "*", "yearCreationTo": "*"}


def fetch(params, start):
    p = {"bandName": "*", "sEcho": 1, "iDisplayStart": start, "iDisplayLength": N,
         "iSortCol_0": 0, "sSortDir_0": "asc"}
    p.update(params)
    url = B + urllib.parse.urlencode(p)
    for attempt in range(8):
        r = subprocess.run(["curl", "-s", "-w", "\n%{http_code}", "-A", UA,
                            "-H", "X-Requested-With: XMLHttpRequest", url],
                           capture_output=True, timeout=180)
        body, _, code = r.stdout.rpartition(b"\n")
        if code == b"200":
            try:
                return json.loads(body.decode("utf-8", "replace"), strict=False)
            except Exception as e:
                print("parse err", e, file=sys.stderr)
        wait = min(300, 10 * 2 ** attempt)
        print(f"  HTTP {code.decode()} start={start}, retry in {wait}s", flush=True)
        time.sleep(wait)
    raise RuntimeError(f"failed {url}")


def run(job):
    params = JOBS[job]
    d = os.path.join(OUT, job)
    os.makedirs(d, exist_ok=True)
    first = os.path.join(d, "0.json")
    if not os.path.exists(first):
        data = fetch(params, 0)
        json.dump(data, open(first, "w"))
        time.sleep(DELAY)
    total = json.load(open(first))["iTotalRecords"]
    print(f"{job}: {total} records", flush=True)
    for start in range(N, total, N):
        f = os.path.join(d, f"{start}.json")
        if os.path.exists(f):
            continue
        data = fetch(params, start)
        json.dump(data, open(f + ".tmp", "w"))
        os.replace(f + ".tmp", f)
        if (start // N) % 50 == 0:
            print(f"  {job} {start}/{total}", flush=True)
        time.sleep(DELAY)
    print(f"{job}: done", flush=True)


if __name__ == "__main__":
    for job in (sys.argv[1:] or JOBS):
        run(job)
