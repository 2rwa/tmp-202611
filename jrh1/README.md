# Sony PCGA-JRH1 / JR1 Linux reverse-engineering notes

Updated 2026-11-27. Goal: use the USB jog remote on Linux, including its monochrome LCD, without opening the housing.

## Status

- USB topology, 8051 RAM download and execution, jog/button GPIO mapping: confirmed on one JRH1.
- Original Windows driver v1.10.1.4 recovered and its embedded firmware executed.
- Original bulk command acknowledgements and bitmap bulk transfers work.
- LCD remains blank in all tested patterns; no reproducible optical change yet.
- Hardware fault is possible, not established. LCD controller IC and PC0/PC1/PC4 physical functions are not identified.

## Documents

- [Sources and reproduction](sources.md)
- [Firmware and protocol review](protocol.md)
- [Experiments and next steps](experiments.md)
- [Static extraction inspector](inspect_driver.py)

This is a public research directory. No proprietary driver/firmware binaries, unredacted room images, private runner logs, machine credentials or hardware access services are included. Existing laboratory scripts and images remain in their original private working environment. The inspector is read-only and does not communicate with USB hardware. Findings are from disassembly, not from Sony's original source code.

## Next milestone

Resolve why the LCD remains blank by reproducing the original host initialization in the correct order and comparing the two native LCD transfer paths. Use camera-based tests with negative controls; ACK alone is not evidence of display success. Do not brute-force unknown GPIO directions or undocumented LCD power settings.
