#!/usr/bin/env python3
"""MCP stdio client for the MLIT Geospatial MCP alpha server."""
import argparse
import datetime as dt
import json
import os
from pathlib import Path
import queue
import subprocess
import sys
import threading


class MCPError(RuntimeError):
    pass


class Client:
    def __init__(self, command, timeout):
        self.command, self.timeout = command, timeout
        self.inbox, self.seq, self.proc = queue.Queue(), 0, None

    def __enter__(self):
        self.proc = subprocess.Popen(
            self.command, stdin=subprocess.PIPE, stdout=subprocess.PIPE,
            text=True, encoding="utf-8", bufsize=1, stderr=None,
        )
        threading.Thread(target=self.read, daemon=True).start()
        return self

    def read(self):
        try:
            for line in self.proc.stdout:
                if line.strip():
                    self.inbox.put(line.strip())
        finally:
            self.inbox.put(None)

    def send(self, message):
        self.proc.stdin.write(json.dumps(message, ensure_ascii=False) + "\n")
        self.proc.stdin.flush()

    def request(self, method, params=None):
        self.seq += 1
        rid = self.seq
        self.send({"jsonrpc": "2.0", "id": rid, "method": method, "params": params or {}})
        while True:
            try:
                line = self.inbox.get(timeout=self.timeout)
            except queue.Empty as e:
                raise MCPError(f"{method}: timed out ({self.timeout}s)") from e
            if line is None:
                raise MCPError(f"{method}: server exited ({self.proc.poll()})")
            try:
                obj = json.loads(line)
            except json.JSONDecodeError as e:
                raise MCPError(f"{method}: invalid JSON on stdout: {line[:120]}") from e
            if obj.get("id") != rid:
                continue
            if "error" in obj:
                raise MCPError(f"{method}: {obj['error']}")
            if "result" not in obj:
                raise MCPError(f"{method}: no result")
            return obj["result"]

    def __exit__(self, *_):
        if self.proc and self.proc.poll() is None:
            self.proc.terminate()
            try:
                self.proc.wait(timeout=3)
            except subprocess.TimeoutExpired:
                self.proc.kill()
                self.proc.wait()


def extract_geojson(value, max_features=2000):
    features, seen = [], set()

    def visit(v, depth=0):
        if depth > 12 or len(features) >= max_features:
            return
        if isinstance(v, dict):
            if v.get("type") == "FeatureCollection" and isinstance(v.get("features"), list):
                for f in v["features"]:
                    visit(f, depth + 1)
                return
            if v.get("type") == "Feature" and isinstance(v.get("geometry"), dict):
                digest = json.dumps(v, sort_keys=True, ensure_ascii=False)
                if digest not in seen:
                    features.append(v)
                    seen.add(digest)
                return
            for child in v.values():
                visit(child, depth + 1)
        elif isinstance(v, list):
            for child in v:
                visit(child, depth + 1)
    visit(value)
    return {"type": "FeatureCollection", "features": features}


def run(args):
    try:
        apis = [int(s.strip()) for s in args.apis.split(",") if s.strip()]
    except ValueError as e:
        raise MCPError("API numbers must be integers") from e
    if not (1 <= len(apis) <= 8) or any(not 1 <= n <= 30 for n in apis):
        raise MCPError("--apis requires 1–8 IDs in the 1–30 range")
    if not (-90 <= args.lat <= 90 and -180 <= args.lon <= 180):
        raise MCPError("invalid latitude/longitude")
    if not (0 < args.distance <= 425):
        raise MCPError("--distance must be 0–425 m (exclusive of 0)")
    if args.mock:
        server = Path(__file__).with_name("mock_server.py")
    else:
        if not os.environ.get("LIBRARY_API_KEY"):
            raise MCPError("LIBRARY_API_KEY is required for live mode (or use --mock)")
        if not args.server:
            raise MCPError("live mode requires --server path/to/upstream/src/server.py")
        server = Path(args.server).expanduser().resolve()
        if not server.is_file():
            raise MCPError(f"server not found: {server}")
    parameters = {"lat": args.lat, "lon": args.lon, "target_apis": apis,
                  "distance": args.distance, "save_file": False}
    if args.year is not None:
        parameters["year"] = args.year

    with Client([sys.executable, str(server)], args.timeout) as mcp:
        hello = mcp.request("initialize", {
            "protocolVersion": "2025-03-26", "capabilities": {},
            "clientInfo": {"name": "tmp-202611-geo-probe", "version": "1.0.0"},
        })
        mcp.send({"jsonrpc": "2.0", "method": "notifications/initialized"})
        listed = mcp.request("tools/list")
        if "get_multi_api" not in [t.get("name") for t in listed.get("tools", [])]:
            raise MCPError("get_multi_api was not advertised by server")
        raw = mcp.request("tools/call", {
            "name": "get_multi_api", "arguments": parameters,
        })
    if raw.get("isError"):
        raise MCPError(f"tools/call error: {raw}")
    texts = [c.get("text", "") for c in raw.get("content", []) if c.get("type") == "text"]
    if not texts:
        raise MCPError("empty MCP tool response")
    try:
        result = json.loads(texts[0])
    except json.JSONDecodeError as e:
        raise MCPError("MCP tool text is not valid JSON") from e
    if result.get("status") == "error":
        raise MCPError(f"upstream error: {result.get('data')}")
    if isinstance(result.get("data"), dict) and result["data"].get("status") == "need_confirmation":
        raise MCPError("upstream unexpectedly requested save_file confirmation")
    return {"meta": {
        "mode": "mock" if args.mock else "live",
        "source": "chirikuuka/mlit-geospatial-mcp",
        "retrieved_at": dt.datetime.now(dt.timezone.utc).isoformat(),
        "query": parameters,
        "protocol_version": hello.get("protocolVersion"),
        "note": "Synthetic test fixtures; NOT real government data" if args.mock
                else "Actual API response; validate data vintage and coverage",
    }, "result": result, "geojson": extract_geojson(result)}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--mock", action="store_true")
    parser.add_argument("--server", help="upstream src/server.py (live mode)")
    parser.add_argument("--lat", type=float, default=35.5074)
    parser.add_argument("--lon", type=float, default=139.6176)
    parser.add_argument("--apis", default="3,5,26", help="comma-separated IDs 1..30")
    parser.add_argument("--distance", type=float, default=250)
    parser.add_argument("--year", type=int)
    parser.add_argument("--timeout", type=int, default=60)
    parser.add_argument("--out", help="JSON output file, stdout by default")
    args = parser.parse_args()
    try:
        output = run(args)
        data = json.dumps(output, ensure_ascii=False, indent=2) + "\n"
        if args.out:
            path = Path(args.out)
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(data, encoding="utf-8")
            print(f"{output['meta']['mode']}: {len(output['geojson']['features'])} features -> {path}", file=sys.stderr)
        else:
            sys.stdout.write(data)
        return 0
    except (MCPError, OSError, ValueError) as e:
        print(f"Geo MCP test failed: {e}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
