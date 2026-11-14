#!/usr/bin/env python3
"""Call Lab LAN control; no third-party dependencies."""
import argparse, hashlib, hmac, json, pathlib, socket, sys
def main():
    p=argparse.ArgumentParser()
    p.add_argument("command",choices=["ping","ring","reject-test"])
    p.add_argument("--config",type=pathlib.Path,default=pathlib.Path(__file__).resolve().with_name("control.json"))
    p.add_argument("--host",help="override configured address")
    p.add_argument("--timeout",type=float,default=5)
    args=p.parse_args()
    cfg=json.loads(args.config.read_text())
    host=args.host or cfg["host"]
    with socket.create_connection((host,int(cfg.get("port",18765))),args.timeout) as s:
        s.settimeout(args.timeout)
        f=s.makefile("r",encoding="ascii")
        def send(line):
            s.sendall((line+"\n").encode("ascii"))
        if args.command=="ping":
            send("PING")
            reply=f.readline(256).strip()
            ok=reply.startswith("PONG ")
        else:
            send("CHALLENGE")
            challenge=f.readline(256).strip().split()
            if len(challenge)!=2 or challenge[0]!="CHALLENGE" or len(challenge[1])!=64:raise ValueError("invalid challenge")
            token=cfg["token"]
            if args.command=="reject-test":token="0"*64
            mac=hmac.new(token.encode("ascii"),("calllab-ring-v1:"+challenge[1]).encode("ascii"),hashlib.sha256).hexdigest()
            send("RING "+mac)
            reply=f.readline(256).strip()
            ok=reply==("OK queued" if args.command=="ring" else "ERR auth")
        print(reply or "ERR empty response")
        return 0 if ok else 1
if __name__=="__main__":
    try:sys.exit(main())
    except (OSError,ValueError,KeyError) as e:
        print("ERR "+str(e),file=sys.stderr);sys.exit(1)
