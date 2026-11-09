#!/usr/bin/env python3
"""Deterministic, synthetic MCP server for protocol and map tests."""
import json
import sys


def send(rid, result=None, error=None):
    response = {"jsonrpc": "2.0", "id": rid}
    response["error" if error else "result"] = error if error else result
    print(json.dumps(response, ensure_ascii=False), flush=True)


def make_feature(geometry, code):
    return {"type": "Feature", "geometry": geometry, "properties": {
        "name": f"架空のAPI {code} サンプル", "api_id": code,
        "mock": True, "warning": "合成テストデータ。実際の地価・防災情報ではありません",
    }}


def get_result(args):
    if args.get("save_file") is not False:
        return {"status": "error", "data": "save_file must be false"}
    lat, lon = args["lat"], args["lon"]
    d = 0.0012
    ring = [[lon-d, lat-d], [lon+d, lat-d], [lon+d, lat+d],
            [lon-d, lat+d], [lon-d, lat-d]]
    features = []
    for code in args["target_apis"]:
        if code in (5, 26, 29):
            geometry = {"type": "Polygon", "coordinates": [ring]}
        elif code == 15:
            geometry = {"type": "LineString", "coordinates": [
                [lon-d, lat], [lon, lat+d/2], [lon+d, lat],
            ]}
        else:
            geometry = {"type": "Point", "coordinates": [
                lon + (code % 3 - 1) * 0.0005,
                lat + (code % 2) * 0.0005,
            ]}
        features.append(make_feature(geometry, code))
    return {"status": "success", "data": {
        "input": {"lat": lat, "lon": lon},
        "api_results": [{"data": {
            "type": "FeatureCollection", "features": [f],
        }} for f in features],
        "map_url": None, "saved_file_paths": [],
    }}


for line in sys.stdin:
    if not line.strip():
        continue
    rid = None
    try:
        msg = json.loads(line)
        rid = msg.get("id")
        if rid is None:
            continue
        method = msg.get("method")
        if method == "initialize":
            send(rid, {"protocolVersion": "2025-03-26",
                "capabilities": {"tools": {"listChanged": False}},
                "serverInfo": {"name": "synthetic-mlit-mcp", "version": "1.0"},
            })
        elif method == "tools/list":
            send(rid, {"tools": [{
                "name": "get_multi_api", "description": "Synthetic test only",
                "inputSchema": {"type": "object", "properties": {
                    "lat": {"type": "number"}, "lon": {"type": "number"},
                }},
            }]})
        elif method == "tools/call" and msg.get("params", {}).get("name") == "get_multi_api":
            send(rid, {"content": [{"type": "text",
                "text": json.dumps(get_result(msg["params"]["arguments"]),
                                   ensure_ascii=False)}]})
        else:
            send(rid, error={"code": -32601, "message": "unknown tool"})
    except Exception as e:
        if rid is not None:
            send(rid, error={"code": -32603, "message": str(e)})
