#!/usr/bin/env python3
"""Extract protobuf descriptor metadata and validate embedded USB descriptors."""
import pathlib, sys, re, struct, json, io
from elftools.elf.elffile import ELFFile
from google.protobuf import descriptor_pb2
from google.protobuf.message import DecodeError
root=pathlib.Path(sys.argv[1])
p=root/"system/lib/libSmartHomeAmaProtobuf.so"
data=p.read_bytes()
elf=ELFFile(io.BytesIO(data))
segments=[s for s in elf.iter_segments() if s["p_type"]=="PT_LOAD"]
def fromva(va,n):
    for s in segments:
        if s["p_vaddr"] <= va and va+n <= s["p_vaddr"]+s["p_filesz"]:
            o=s["p_offset"]+va-s["p_vaddr"]
            return data[o:o+n]
    raise ValueError(f"unmapped 0x{va:x}+{n}")
def varint(buf,i):
    v=0
    for shift in range(0,70,7):
        b=buf[i];i+=1;v|=(b&127)<<shift
        if b<128:return v,i
    raise ValueError("bad varint")
def scan_descriptor(name):
    # Fallback: scan the wire-encoded name, walk field boundaries, and
    # require valid protobuf descriptor metadata with at least one definition.
    needle=b"\x0a"+bytes([len(name)])+name.encode()
    for m in re.finditer(re.escape(needle),data):
        start=m.start(); i=start; best=None; last=0
        try:
            while i<min(start+65536,len(data)):
                tag,i=varint(data,i); field=tag>>3; wire=tag&7
                if field not in {1,2,3,4,5,6,7,8,9,10,11,12,14}:break
                if field==1 and i>start+1:break
                if wire==2:n,i=varint(data,i);i+=n
                elif wire==0:_,i=varint(data,i)
                elif wire==1:i+=8
                elif wire==5:i+=4
                else:break
                if i>len(data) or i-start>65536:break
                obj=descriptor_pb2.FileDescriptorProto()
                try:obj.ParseFromString(data[start:i])
                except DecodeError:break
                if obj.name==name and (obj.message_type or obj.enum_type) and all(x.name and all(f.name and f.number>0 for f in x.field) for x in obj.message_type):
                    # Prefer a normal explicit syntax terminator when present.
                    best=(obj,i-start,start)
                    if obj.syntax in ("proto2","proto3"):return best
        except (IndexError,ValueError):pass
        if best:return best
    return None
def brief_message(m,prefix=""):
    name=prefix+m.name
    print(" message",name)
    for f in m.field:
        t=f.type_name or descriptor_pb2.FieldDescriptorProto.Type.Name(f.type)
        print(f"   {f.number}: {f.name} {t}"+(" repeated" if f.label==3 else "")+(f" oneof={m.oneof_decl[f.oneof_index].name}" if f.HasField("oneof_index") and f.oneof_index<len(m.oneof_decl) else ""))
    for e in m.enum_type:print(" enum",name+"."+e.name,[(v.name,v.number) for v in e.value])
    for c in m.nested_type:brief_message(c,name+".")
print("### DESCRIPTOR TABLES")
symbols=elf.get_section_by_name(".dynsym")
found={}
for s in symbols.iter_symbols():
    if not s.name.startswith("descriptor_table_") or s["st_shndx"]=="SHN_UNDEF":continue
    name=s.name.removeprefix("descriptor_table_").replace("_2e",".").replace("_2f","/")
    if not name.endswith(".proto"):continue
    # protobuf C++ DescriptorTable on 32-bit: bools, padding, size, descriptor pointer, filename pointer.
    obj=None;method=""
    try:
        raw=fromva(s["st_value"],16)
        n,ptr=struct.unpack_from("<II",raw,4)
        if 0<n<65536:
            candidate=descriptor_pb2.FileDescriptorProto.FromString(fromva(ptr,n))
            if candidate.name==name:obj=candidate;method=f"symbol size={n}"
    except (ValueError,DecodeError,struct.error):pass
    if obj is None:
        hit=scan_descriptor(name)
        if hit:obj,n,offset=hit;method=f"wire scan size={n} offset=0x{offset:x}"
    if obj is not None:found[name]=(obj,method)
    else:print("unresolved",name)
print("Recovered",len(found),"descriptors")
for name,(obj,method) in sorted(found.items()):
    print(f"\n### PROTO {name} package={obj.package} {method}")
    if name in {"Envelope.proto","Header.proto","Endpoint.proto","AlexaDiscovery.proto","AlexaMotionSensor.proto","AlexaTemperatureSensor.proto","Property.proto"}:
        for e in obj.enum_type:print(" enum",e.name,[(v.name,v.number) for v in e.value])
        for m in obj.message_type:brief_message(m)
    else:print(" messages:",[m.name for m in obj.message_type])
print("\n### COMPANION MANIFEST")
manifest=root/"system/vendor/companionota/firmware_manifest.json"
if manifest.exists():
    m=json.loads(manifest.read_text())
    for im in m.get("images",[]):
        print({k:v for k,v in im.items() if k.lower() not in {"remoteuri","url"}})
print("\n### USB CONFIGURATION CANDIDATES")
for f in sorted(manifest.parent.glob("*.bin")):
    b=f.read_bytes(); print(f.name)
    for m in re.finditer(rb"\x09\x02",b):
        pos=m.start()
        if pos+9>len(b):continue
        total=int.from_bytes(b[pos+2:pos+4],"little")
        if not 25<=total<=512 or b[pos+4] not in (1,2,3) or b[pos+5]!=1 or not b[pos+7]&128 or pos+total>len(b):continue
        i=pos;ds=[]
        while i<pos+total:
            n=b[i]
            if n<2 or i+n>pos+total:break
            ds.append(b[i:i+n]);i+=n
        if i!=pos+total:continue
        if not any(d[1]==4 and len(d)>=9 and d[5]==2 for d in ds):continue
        if not any(d[1]==5 and len(d)==7 for d in ds):continue
        print(f" offset={pos:#x} length={total} interfaces={b[pos+4]}")
        for d in ds:
            if d[1]==4:print("  interface",d[2],"class/sub/proto",d[5:8].hex())
            elif d[1]==5:print("  endpoint",hex(d[2]),"attributes",hex(d[3]),"max packet",int.from_bytes(d[4:6],"little"),"interval",d[6])
            elif d[1]==0x24:print("  CDC functional",d.hex())
