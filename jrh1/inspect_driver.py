#!/usr/bin/env python3
"""Read-only, hash-pinned inspection of the original JR1/JRH1 Windows driver."""
import hashlib
import pathlib
import struct
import sys
import zipfile

ZIP_SHA = "e5400a95dc81ed2e3956a2d6146609e7d07e9c8a39c1d75c88539acc602f4960"
SYS_SHA = "f1b1faf40d47c5bda9dc4a2d90633b4e410057232f2bd16eeac451ad830d139e"

def need(ok, message):
    if not ok:
        raise ValueError(message)

def inspect(path):
    z = pathlib.Path(path)
    need(hashlib.sha256(z.read_bytes()).hexdigest() == ZIP_SHA, "ZIP digest mismatch")
    with zipfile.ZipFile(z) as f:
        d = f.read("dpjdusb.sys")
    need(hashlib.sha256(d).hexdigest() == SYS_SHA, "SYS digest mismatch")
    mem = {}
    count = 0
    for off in range(0x2810, 0x41c2, 22):
        n, addr, kind = struct.unpack_from("<HHB", d, off)
        need(1 <= n <= 16 and kind == 0 and addr+n <= 0x1b40, "bad record")
        for i, v in enumerate(d[off+5:off+5+n]):
            need(mem.get(addr+i, v) == v, "conflicting record")
            mem[addr+i] = v
        count += 1
    need(d[0x41c2:0x41c7] == b"\0\0\0\0\1", "bad EOF")
    need(count == 299 and len(mem) == 3789, "unexpected record count")
    need(bytes(mem[i] for i in range(3)) == b"\x02\x09\x25", "reset vector")
    print("records", count, "unique_bytes", len(mem), "reset_vector", "0925")
    for off in (0x27cc, 0x27d4, 0x27d8, 0x27e0):
        print("host_packet", hex(off + 0x10000), d[off:off+4].hex(" "))
    # Verify opcode signatures for the key GPIO and LCD control routines.
    for addr, hexbytes in {
        0x0ed3: "ef6008907f98e04402f022907f98e054fdf022",
        0x0651: "907f9be0f520c201907f98f0",
        0x0a09: "a907e4ff120ed37fc0120c43",
        0x0a5c: "907f9be05410440a907f98f0e04401f0",
        0x0d35: "e4907f95f0907f94f0907f9e74fff0",
    }.items():
        expected = bytes.fromhex(hexbytes)
        need(bytes(mem[addr+i] for i in range(len(expected))) == expected, f"signature {addr:04x}")
        print("signature_verified", f"{addr:04x}")
    print("STATIC_INSPECTION_OK")

if __name__ == "__main__":
    if len(sys.argv) != 2:
        raise SystemExit("usage: inspect_driver.py driver_1.10.1.4.zip")
    inspect(sys.argv[1])
