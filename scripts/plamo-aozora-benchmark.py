#!/usr/bin/env python3
"""Real PLaMo 3 Translate 0.8B CPU benchmark with attributed Aozora Bunko prose.

Standard library only. No benchmark number is reported without actual inference.
"""
import argparse
import hashlib
from html.parser import HTMLParser
import json
import os
from pathlib import Path
import platform
import re
import subprocess
import sys
import threading
import time
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

MODEL = "pfnet/plamo-3-translate-0.8b-GGUF/plamo-3-translate-0.8b-Q4_K_M.gguf"
SOURCES = {
    "order": {
        "author": "宮沢賢治",
        "title": "注文の多い料理店",
        "url": "https://www.aozora.gr.jp/cards/000081/files/43754_17659.html",
        "card": "https://www.aozora.gr.jp/cards/000081/card43754.html",
    },
    "cat": {
        "author": "夏目漱石",
        "title": "吾輩は猫である",
        "url": "https://www.aozora.gr.jp/cards/000148/files/789_14547.html",
        "card": "https://www.aozora.gr.jp/cards/000148/card789.html",
    },
}
# The fractions fix the starting location in each original work, not random samples.
CASES = [
    ("short", "order", 120, 0.10, 256),
    ("medium", "order", 370, 0.30, 768),
    ("long", "cat", 850, 0.05, 1792),
    ("extra_long", "cat", 1700, 0.15, 3072),
]
STOP = ["<|plamo:tag|>", "<|plamo:bos|>"]


class AozoraMainText(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.in_main = False
        self.depth = 0
        self.hidden = 0
        self.parts = []

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag == "div":
            if self.in_main:
                self.depth += 1
            elif "main_text" in attrs.get("class", "").split():
                self.in_main, self.depth = True, 1
        if not self.in_main:
            return
        if tag in ("rt", "rp", "script", "style"):
            self.hidden += 1
        if tag in ("p", "br", "hr", "h3"):
            self.parts.append("\n")

    def handle_endtag(self, tag):
        if not self.in_main:
            return
        if tag in ("rt", "rp", "script", "style") and self.hidden:
            self.hidden -= 1
        if tag in ("p", "h3"):
            self.parts.append("\n")
        if tag == "div":
            self.depth -= 1
            if self.depth == 0:
                self.in_main = False

    def handle_data(self, data):
        if self.in_main and not self.hidden:
            self.parts.append(data)

    def paragraphs(self):
        return [
            re.sub(r"\s+", " ", item).strip()
            for item in "".join(self.parts).splitlines()
            if len(re.sub(r"\s+", "", item)) >= 12
        ]


def load_source(source):
    req = Request(source["url"], headers={"User-Agent": "PLaMo-Aozora-Benchmark/1.0 (research)"})
    with urlopen(req, timeout=60) as response:
        raw = response.read()
    parser = AozoraMainText()
    parser.feed(raw.decode("shift_jis"))
    paragraphs = parser.paragraphs()
    if len(paragraphs) < 10 or sum(map(len, paragraphs)) < 2500:
        raise ValueError("Aozora HTML extraction returned insufficient main_text: " + source["url"])
    return paragraphs, hashlib.sha256(raw).hexdigest()


def select_excerpt(paragraphs, chars, fraction):
    start = int(len(paragraphs) * fraction)
    selected = []
    for paragraph in paragraphs[start:]:
        selected.append(paragraph)
        if len(" ".join(selected)) >= chars:
            break
    text = "\n".join(selected)
    if len(text) < chars * 0.8:
        raise ValueError("Corpus too short for requested test size")
    return text


def post_json(url, payload, timeout=420):
    req = Request(url, data=json.dumps(payload, ensure_ascii=False).encode("utf-8"),
                  headers={"Content-Type": "application/json"}, method="POST")
    with urlopen(req, timeout=timeout) as response:
        return json.loads(response.read().decode("utf-8"))


def wait_ready(endpoint, pid, timeout=160):
    start = time.monotonic()
    while time.monotonic() - start < timeout:
        try:
            with urlopen(endpoint + "/health", timeout=3) as response:
                data = json.loads(response.read().decode("utf-8"))
            if data.get("status") == "ok":
                return round(time.monotonic() - start, 3)
        except (OSError, ValueError, URLError):
            pass
        if pid and not Path(f"/proc/{pid}").exists():
            raise RuntimeError("llama-server exited before readiness; inspect server.log")
        time.sleep(1)
    raise TimeoutError("llama-server did not become healthy within timeout")


def rss_kb(pid):
    try:
        text = Path(f"/proc/{pid}/status").read_text()
        match = re.search(r"^VmRSS:\s+(\d+)\s+kB", text, flags=re.M)
        return int(match.group(1)) if match else None
    except (FileNotFoundError, PermissionError):
        return None


class MemorySampler:
    def __init__(self, pid):
        self.pid, self.peak_kb = pid, 0
        self.stopped = threading.Event()
        self.thread = threading.Thread(target=self.run, daemon=True)

    def run(self):
        while not self.stopped.is_set():
            value = rss_kb(self.pid)
            if value is not None:
                self.peak_kb = max(self.peak_kb, value)
            self.stopped.wait(0.1)

    def start(self):
        self.thread.start()

    def stop(self):
        self.stopped.set()
        self.thread.join(timeout=1)
        value = rss_kb(self.pid)
        if value is not None:
            self.peak_kb = max(self.peak_kb, value)


def translate(endpoint, source, max_tokens):
    payload = {
        "model": "plamo-3-translate",
        "messages": [{"role": "user", "content": source}],
        "chat_template_kwargs": {"source_lang": "ja", "target_lang": "en"},
        "temperature": 0,
        "max_tokens": max_tokens,
        "stop": STOP,
        "stream": False,
    }
    start = time.monotonic()
    response = post_json(endpoint + "/v1/chat/completions", payload)
    elapsed = time.monotonic() - start
    choice = response["choices"][0]
    translated = (choice["message"]["content"] or "").strip()
    usage = response.get("usage") or {}
    timings = response.get("timings") or {}
    tokens = usage.get("completion_tokens")
    predicted_ms = timings.get("predicted_ms")
    return {
        "wall_seconds": round(elapsed, 3),
        "prompt_tokens": usage.get("prompt_tokens"),
        "completion_tokens": tokens,
        "effective_tokens_per_sec": round(tokens / elapsed, 2) if tokens is not None and elapsed else None,
        "decode_tokens_per_sec": round(tokens / (predicted_ms / 1000), 2)
            if tokens is not None and isinstance(predicted_ms, (float, int)) and predicted_ms > 0 else None,
        "server_timings": timings,
        "finish_reason": choice.get("finish_reason"),
        "translation": translated,
        "success": bool(translated) and choice.get("finish_reason") != "length",
    }


def machine_details():
    data = {
        "platform": platform.platform(),
        "python": platform.python_version(),
        "cpu_count": os.cpu_count(),
        "cpu_model": None,
        "mem_total_kb": None,
    }
    try:
        cpu = Path("/proc/cpuinfo").read_text()
        match = re.search(r"^model name\s*:\s*(.+)$", cpu, flags=re.M)
        if match:
            data["cpu_model"] = match.group(1)
        mem = re.search(r"^MemTotal:\s+(\d+)", Path("/proc/meminfo").read_text(), flags=re.M)
        if mem:
            data["mem_total_kb"] = int(mem.group(1))
    except OSError:
        pass
    return data


def report_markdown(result):
    lines = [
        "# PLaMo 3 Translate — Aozora Bunko CPU benchmark",
        "",
        f"- Engine: llama.cpp (CPU, 4 threads, ctx=8192, no GPU)",
        f"- Model: {MODEL}",
        f"- Time to healthy server (includes loading model): {result['load_seconds']} s",
        f"- Peak llama-server RSS: {result['peak_rss_mib']} MiB (sampled)",
        f"- CPU: {result['machine']['cpu_model']} ({result['machine']['cpu_count']} logical CPUs)",
        "",
        "| Size | Work | Japanese chars | Wall time (s) | Output tokens | End-to-end tok/s | Complete |",
        "|---|---|---:|---:|---:|---:|---|",
    ]
    for row in result["runs"]:
        tps = row["effective_tokens_per_sec"]
        lines.append(
            f"| {row['case']} | {row['title']} | {row['source_chars']} | "
            f"{row['wall_seconds']} | {row['completion_tokens']} | "
            f"{tps if tps is not None else 'n/a'} | {'yes' if row['success'] else 'NO'} |")
    lines.extend([
        "",
        "End-to-end tok/s includes prompt prefill and API overhead, not only decoding.",
        "All source passages and full translations are in cases.json and results.json.",
        "This measures Linux CPU llama.cpp, NOT browser WebGPU/WASM or macOS/iPhone.",
        "",
        "Sources: 青空文庫 (Aozora Bunko), original texts by 宮沢賢治 and 夏目漱石.",
    ])
    for value in SOURCES.values():
        lines.append(f"- {value['author']}『{value['title']}』: {value['card']}")
    return "\n".join(lines) + "\n"


def main():
    cli = argparse.ArgumentParser()
    cli.add_argument("--endpoint", required=True)
    cli.add_argument("--pid", type=int, required=True)
    cli.add_argument("--output", type=Path, required=True)
    args = cli.parse_args()
    args.output.mkdir(parents=True, exist_ok=True)

    # Start readiness measurement immediately after the server process is spawned,
    # before any network downloads of the benchmark passages.
    load_seconds = wait_ready(args.endpoint, args.pid)

    source_data = {}
    for key, source in SOURCES.items():
        paragraphs, sha = load_source(source)
        source_data[key] = {"paragraphs": paragraphs, "sha256": sha}
        print(f"Aozora source {source['title']}: paragraphs={len(paragraphs)}, sha256={sha}", flush=True)

    cases = []
    for name, key, target, fraction, cap in CASES:
        src = SOURCES[key]
        passage = select_excerpt(source_data[key]["paragraphs"], target, fraction)
        cases.append({"case": name, "author": src["author"], "title": src["title"],
                      "source_url": src["url"], "source_sha256": source_data[key]["sha256"],
                      "source": passage, "source_chars": len(passage), "max_tokens": cap})
    (args.output / "cases.json").write_text(json.dumps(cases, ensure_ascii=False, indent=2) + "\n")

    sampler = MemorySampler(args.pid)
    sampler.start()
    runs = []
    try:
        # Explicit warm-up; record separately so first benchmark request isn't conflated with initialization.
        warmup = translate(args.endpoint, cases[0]["source"], cases[0]["max_tokens"])
        print(f"warm-up: {warmup['wall_seconds']} s, success={warmup['success']}", flush=True)
        if not warmup["success"]:
            raise RuntimeError("PLaMo warm-up did not produce a complete translation")
        for case in cases:
            print(f"Translating {case['case']}: {case['source_chars']} Japanese chars", flush=True)
            output = translate(args.endpoint, case["source"], case["max_tokens"])
            entry = {k: v for k, v in case.items() if k != "source"}
            entry.update(output)
            runs.append(entry)
            print(f"  {output['wall_seconds']}s, tok/s={output['effective_tokens_per_sec']}, "
                  f"finish={output['finish_reason']}", flush=True)
    finally:
        sampler.stop()
        result = {"model": MODEL, "engine": "llama.cpp CPU", "threads": 4,
                  "load_seconds": load_seconds, "peak_rss_mib": round(sampler.peak_kb / 1024, 1),
                  "machine": machine_details(), "sources": SOURCES,
                  "warmup": warmup if "warmup" in locals() else None, "runs": runs,
                  "benchmark_version": 1}
        (args.output / "results.json").write_text(
            json.dumps(result, ensure_ascii=False, indent=2) + "\n")
        (args.output / "results.md").write_text(report_markdown(result))
    if not all(row["success"] for row in runs):
        raise RuntimeError("At least one translation was empty or hit output token limit")


if __name__ == "__main__":
    main()
