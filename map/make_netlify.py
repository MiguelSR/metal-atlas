"""Builds map/netlify/: a copy of site/ ready for any static host (Netlify, Cloudflare Pages...).

site/index.html is written for claude.ai artifacts, which wrap the page in its own <!doctype>/<head>/<body>.
Static hosts serve the file as-is, so here it gets a full HTML document. Data files are hard-linked (no extra disk space).

Usage: python3 make_netlify.py   ->  drag the map/netlify folder onto Netlify.
"""
import os, shutil

HERE = os.path.dirname(os.path.abspath(__file__))
SRC, DST = os.path.join(HERE, "site"), os.path.join(HERE, "netlify")

shutil.rmtree(DST, ignore_errors=True)
shutil.copytree(SRC, DST, copy_function=os.link, ignore=shutil.ignore_patterns("index.html", ".*"))

page = open(os.path.join(SRC, "index.html"), encoding="utf-8").read()
cut = page.index('<div class="app">')
head, body = page[:cut], page[cut:]
doc = ('<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n'
       '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n'
       + head + '</head>\n<body>\n' + body + '\n</body>\n</html>\n')
open(os.path.join(DST, "index.html"), "w", encoding="utf-8").write(doc)
n = sum(len(f) for _, _, f in os.walk(DST))
print(f"netlify/ ready: {n} files")
