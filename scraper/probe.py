import json,subprocess,urllib.parse,time,sys
B="https://www.metal-archives.com/search/ajax-advanced/searching/bands/?"
UA="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36"
def get(params,start=0,n=200):
    p={"bandName":"*","sEcho":1,"iDisplayStart":start,"iDisplayLength":n}; p.update(params)
    out=subprocess.run(["curl","-s","--fail","-A",UA,B+urllib.parse.urlencode(p)],capture_output=True,timeout=120).stdout
    return json.loads(out.decode("utf-8"),strict=False)
if __name__=="__main__":
  for q in sys.argv[1:]:
    params=dict(urllib.parse.parse_qsl(q, keep_blank_values=True)); params.update(yearCreationFrom="", yearCreationTo="")
    d=get(params,n=1); print(q, d["iTotalRecords"], len(d["aaData"][0]) if d["aaData"] else 0, [c[:30] for c in d["aaData"][0][1:]] if d["aaData"] else "")
    time.sleep(1)
