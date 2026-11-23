#!/bin/bash
# Overnight job: verify the game bands against iTunes, and keep game.json (verified bands baked in, the rest searched live) + map/netlify/ up to date.
# Run with:  nohup caffeinate -ims bash night.sh > night.log 2>&1 &
cd "$(dirname "$0")"
log() { echo "$(date +%H:%M) $*"; }

rebuild() {
  # wait for the Metal Archives download (lineups/photos/reviews) so game.json has every band it can
  while pgrep -f "members.py" >/dev/null; do sleep 60; done
  (cd ../map && python3 game.py && python3 make_netlify.py) 2>&1 | sed "s/^/$(date +%H:%M) /"
}

left() {
  python3 - <<'EOF'
import json, os
ids = json.load(open("../map/site/bands.json"))["id"][:6000]
n = 0
for i in ids:
    p = f"itunes/{i}.json"
    n += not (os.path.exists(p) and json.load(open(p)).get("v") == 3)
print(n)
EOF
}

# rebuild every 30 min while verifying, so whatever is verified by morning is ready to upload
( while true; do sleep 1800; rebuild; done ) &
REB=$!

for pass in 1 2 3 4 5 6 7 8; do
  n=$(left)
  log "pass $pass: $n bands left to verify"
  [ "$n" -eq 0 ] && break
  ITUNES_GAP=${ITUNES_GAP:-6} python3 verify.py 6000 2 >> verify.log 2>&1
done

kill $REB 2>/dev/null
rebuild
log "finished: $(left) bands left unverified"
