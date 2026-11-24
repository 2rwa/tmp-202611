#!/usr/bin/env python3
"""Chunked exhaustive 32-bit screen, with durable progress and exact record comparison."""
import argparse
import json
import re
import subprocess
import time
from fractions import Fraction
from pathlib import Path

SPACE = 1 << 32
BASE = Fraction(5850, 20180)
ROW = re.compile(r"^(?:threshold: )?([0-9A-F]{8})\s+11T=\s*([\d.]+)% length=\s*([\d.]+)% count=(\d+) n11=(\d+)$")
def main():
    p = argparse.ArgumentParser()
    p.add_argument("--threads", type=int, required=True)
    p.add_argument("--start", type=int, default=0)
    p.add_argument("--count", type=int, default=SPACE)
    p.add_argument("--chunk", type=int, default=10_000_000)
    p.add_argument("--limit-seconds", type=int, default=13_500)
    p.add_argument("--progress-seconds", type=float, default=30)
    p.add_argument("--out", type=Path, default=Path("results"))
    a = p.parse_args()
    if not (1 <= a.threads <= 1024 and 0 <= a.start < SPACE and 0 < a.count <= SPACE-a.start and a.chunk > 0 and a.limit_seconds > 0 and a.progress_seconds > 0):
        p.error("invalid range or limits")
    a.out.mkdir(parents=True, exist_ok=True)
    end = a.start+a.count
    pos = a.start
    best = {"q":"03079A90", "n11":5850, "count":20180, "pct":float(BASE*100), "length_pct":46.34831}
    records = []
    above = {}
    top = {}
    started = time.monotonic()
    last = started
    def ratio(x):
        return Fraction(x["n11"], x["count"])
    def save(status):
        elapsed = time.monotonic()-started
        doc = dict(status=status, start=a.start, end_exclusive=end, next_index=pos, tested=pos-a.start,
                   elapsed_seconds=elapsed, threads=a.threads, chunk=a.chunk, best=best, records=records,
                   above_previous_record=sorted(above.values(), key=lambda x:(-ratio(x),x["q"])),
                   top_validated=sorted(top.values(), key=lambda x:(-ratio(x),x["q"]))[:64],
                   method="2-frame exhaustive screen; per-chunk top 32 and all screen>=old record checked over 96 frames (per-thread threshold best retained); no ECC")
        tmp = a.out/"checkpoint.tmp"
        tmp.write_text(json.dumps(doc, indent=2)+"\n")
        tmp.replace(a.out/"checkpoint.json")
        return elapsed
    def progress(status):
        elapsed = save(status)
        done = pos-a.start
        rate = done/max(elapsed, 1e-9)
        eta = (end-pos)/rate if rate else None
        print(f"PROGRESS status={status} tested={done}/{a.count} ({100*done/a.count:.5f}%) next_index={pos} elapsed={elapsed:.2f}s rate={rate:.0f}/s ETA={eta if eta is not None else 'unknown'}s best={best['q']} 11T={best['pct']:.8f}%", flush=True)
    print(f"START range=[{a.start},{end}) threads={a.threads} chunk={a.chunk} limit={a.limit_seconds}s old_record={best['q']} {best['pct']:.8f}%", flush=True)
    progress("running")
    with (a.out/"chunks.log").open("a", buffering=1) as log:
        while pos < end:
            remaining = a.limit_seconds-(time.monotonic()-started)
            if remaining <= 0:
                progress("time_limit")
                return
            n = min(a.chunk,end-pos)
            try:
                result = subprocess.run(["./search","--threads",str(a.threads),"--start",str(pos),"--count",str(n)], capture_output=True, text=True, timeout=remaining, check=True)
            except subprocess.TimeoutExpired:
                print(f"TIME_LIMIT: interrupted chunk at {pos}; not counted", flush=True)
                progress("time_limit")
                return
            except subprocess.CalledProcessError as e:
                print(e.stdout or "", flush=True)
                print(e.stderr or "", flush=True)
                progress("failed")
                raise
            log.write(result.stdout)
            rows = []
            for line in result.stdout.splitlines():
                m = ROW.fullmatch(line)
                if m:
                    q, _, length, total, hits = m.groups()
                    row = dict(q=q, n11=int(hits), count=int(total), pct=100*int(hits)/int(total), length_pct=float(length), chunk_start=pos)
                    rows.append(row)
            if not rows or not re.search(r"threads=\d+ count="+str(n)+r" start="+str(pos)+r"\b", result.stdout):
                progress("failed")
                raise RuntimeError("invalid child output")
            for row in sorted(rows,key=lambda x:(-ratio(x),x["q"])):
                top[row["q"]] = row
                if ratio(row)>BASE and row["q"] not in above:
                    above[row["q"]]=row
                    print(f"ABOVE_PREVIOUS q={row['q']} 11T={row['pct']:.8f}% length={row['length_pct']:.5f}% n11={row['n11']}/{row['count']} chunk_start={pos}",flush=True)
                if ratio(row)>ratio(best):
                    best=row
                    records.append(row)
                    print(f"NEW_RECORD q={row['q']} 11T={row['pct']:.8f}% length={row['length_pct']:.5f}% n11={row['n11']}/{row['count']} chunk_start={pos}",flush=True)
            if len(top)>128:
                top={r["q"]:r for r in sorted(top.values(),key=lambda x:(-ratio(x),x["q"]))[:64]}
            pos += n
            save("running")
            if time.monotonic()-last>=a.progress_seconds or pos==end:
                progress("complete" if pos==end else "running")
                last=time.monotonic()
    print("COMPLETE full requested range screened", flush=True)

if __name__=="__main__":
    main()
