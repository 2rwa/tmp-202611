# Source provenance and reproduction

## Original Windows driver

- Community thread: https://www.siliconpopculture.com/forum/viewthread/1324/P0/
- Archived driver ZIP: https://web.archive.org/web/20190101id_/http://www.siliconpopculture.com/sonytr/files/pcga-jr1/driver_1.10.1.4.zip
- ZIP size 17172 bytes; SHA-256 e5400a95dc81ed2e3956a2d6146609e7d07e9c8a39c1d75c88539acc602f4960
- dpjdusb.sys: 20914 bytes; SHA-256 f1b1faf40d47c5bda9dc4a2d90633b4e410057232f2bd16eeac451ad830d139e
- INF: USB VID 054C PID 0044; DriverVer 08/28/2001,1.10.1.4.
- Plugin: https://web.archive.org/web/20190101id_/http://www.siliconpopculture.com/sonytr/files/pcga-jr1/plugin.zip
- Utility: https://web.archive.org/web/20190101id_/http://www.siliconpopculture.com/sonytr/files/pcga-jr1/jog_dial_utility-6.41-EN.zip

The archived driver is for the matching USB ID. Community descriptions mention JR1/JRH1. This does not prove every hardware revision is identical.

## Other historical material

- Sony patent: https://patents.google.com/patent/JP2002123361A/ja
- Contemporary review: https://av.watch.impress.co.jp/docs/20020116/zooma43.htm
- Sony compatibility page: https://www.sony.jp/vaio/pc/PCG-TR1_P_all.html
- Cypress EZ-USB technical reference: https://www.infineon.com/assets/row/public/documents/30/44/infineon-an2131-trm-usermanual-en.pdf
- 2025 teardown/demo: https://www.youtube.com/watch?v=AOML4vUfpU8
- Archived individual developer page: https://web.archive.org/web/20070601213130/http://hp.vector.co.jp/authors/VA017649/
- Sony PL1/PL2 update announcements: https://forest.watch.impress.co.jp/article/2002/01/08/driver.html
- Archived PL1: https://web.archive.org/web/20020612090426/http://www.ittrc.sony.co.jp:80/download/W-N07-U45-0.html
- Archived PL2: https://web.archive.org/web/20020203034259/http://www.ittrc.sony.co.jp:80/download/W-N07-U46-0.html

PL1 (jrh1-wdvd.exe) and PL2 (p-jrh1-vas-0.exe) were not recovered; they are audio/application fixes, not confirmed firmware sources.

## Reproduce static inspection

Download the archived driver ZIP yourself, verify its hash, then run:

```sh
python3 inspect_driver.py driver_1.10.1.4.zip
unzip -p driver_1.10.1.4.zip dpjdusb.sys > /tmp/dpjdusb.sys
objdump -h /tmp/dpjdusb.sys
objdump -d -Mintel /tmp/dpjdusb.sys > /tmp/dpjdusb.asm
```

PE .data VMA 0x127c0 maps to file offset 0x27c0. Firmware starts at file offset 0x2810 (VMA 0x12810). Addresses in protocol.md distinguish x86 virtual addresses from 8051 addresses. No original source or firmware binary is redistributed here.
