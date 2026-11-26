#!/usr/bin/env python3
"""Read-only targeted inventory of public Echo Flex OTA files."""
import pathlib, subprocess, re, struct, hashlib, sys
root=pathlib.Path(sys.argv[1])
def cmd(*args, data=None):
    return subprocess.run(args,input=data,stdout=subprocess.PIPE,stderr=subprocess.DEVNULL,check=False).stdout.decode("utf-8","replace")
def report(label, rows, limit=65):
    rows=list(dict.fromkeys(rows))
    print(f"{label}: {len(rows)} distinct (showing up to {limit})")
    for x in rows[:limit]: print(" ",x[:300])
def strings(p, enc="s"):
    return cmd("strings","-a","-e",enc,str(p)).splitlines()
def digest(p):
    return hashlib.sha256(p.read_bytes()).hexdigest()
focus=re.compile(r"usb|ttyACM|cdc.acm|auxdev|serial|baud|termios|vendor.?id|product.?id|vid.pid|descriptor|framing|packet.?header|stream.?id|av[sS].?compact|device.?information|device.?config|transport.?version|motion.?sensor|night.?light|companion.?ota",re.I)
for pattern in ("init.project.rc","ueventd.mt8167.rc"):
    p=root/pattern
    if p.exists():
        lines=p.read_text(errors="replace").splitlines()
        print(f"\n### {pattern}")
        hits={j for i,l in enumerate(lines) if re.search(r'companion|croissant USB|ttyACM|USB AMA',l,re.I) for j in range(max(0,i-2),min(len(lines),i+7))}
        for i in sorted(hits): print(f"{i+1}: {lines[i]}")
for name in ("libacehal_auxdev_ama.so","libace_amagwstack.so","libSmartHomeAmaAdapter.so","libSmartHomeAmaProtobuf.so","gadgetsd"):
    matches=list(root.rglob(name))
    for p in matches:
        if p.is_symlink(): continue
        print(f"\n### ELF {p.relative_to(root)} {p.stat().st_size} SHA256 {digest(p)}")
        print(cmd("file",str(p)).strip())
        report("Dependencies",[l.strip() for l in cmd("readelf","-d",str(p)).splitlines() if "NEEDED" in l],25)
        raw=cmd("readelf","--dyn-syms","--wide",str(p))
        syms=[l.split()[-1].split("@")[0] for l in raw.splitlines() if re.match(r"\s*\d+:",l) and len(l.split())>=8]
        dem=cmd("c++filt",data=("\n".join(syms)+"\n").encode()).splitlines()
        if name=="libSmartHomeAmaProtobuf.so":
            report("Proto filenames", [l for l in strings(p) if re.fullmatch(r"[\w./-]+\.proto",l)],100)
            report("Relevant descriptor names",[l for l in dem if "descriptor_table" in l and re.search(r"motion|power|bright|color|device|endpoint|capabil|discover|report",l,re.I)],50)
        else:
            report("Relevant dynamic symbols",[l for l in dem if focus.search(l) and not l.startswith(("std::","typeinfo","vtable"))],75)
            report("Relevant printable strings",[l for l in strings(p) if focus.search(l) and not l.startswith(("_Z","_GLOBAL"))],75)
for p in sorted(root.glob("system/vendor/companionota/*")):
    if not p.is_file() or p.is_symlink(): continue
    data=p.read_bytes()
    print(f"\n### Companion OTA {p.name} size={len(data)} sha256={digest(p)}")
    print(cmd("file",str(p)).strip())
    print("First 64 bytes:",data[:64].hex(" "))
    report("USB / product ASCII", [l for l in strings(p) if re.search(r"Third Reality|3RNL|MotionSensor|Nightlight|CDC|USB|AMA|STM32|GD32|CH55|Cortex|AVS|Alexa\.",l,re.I)],55)
    report("USB / product UTF16LE", [l for l in strings(p,"l") if re.search(r"Third|Reality|motion|light|clock|USB|CDC|[0-9A-Z]{4,}040U",l,re.I)],30)
    # Candidate USB device descriptors; structural checks, not assertions of identity.
    candidates=[]
    for m in re.finditer(rb"\x12\x01",data):
        o=m.start()
        if o+18>len(data): continue
        a=data[o:o+18]
        usb,vid,pid,rev=struct.unpack_from("<H",a,2)[0],*struct.unpack_from("<HHH",a,8)
        if usb in (0x110,0x200,0x201,0x210) and a[7] in (8,16,32,64) and 1<=a[17]<=4 and vid not in (0,65535) and pid not in (0,65535):
            candidates.append(f"offset=0x{o:x} USB={usb:04x} class={a[4]:02x} EP0={a[7]} VID={vid:04x} PID={pid:04x} bcdDevice={rev:04x} descriptor={a.hex()}")
    report("Structurally plausible USB device descriptors", candidates,20)
