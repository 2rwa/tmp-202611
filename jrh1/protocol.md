# Protocol review (2026-11-27)

## USB and hardware

| Device | USB ID | Status |
|---|---|---|
| Internal hub | 0451:2036 | Enumerated |
| Audio/HID | 0471:0104 | UDA1321 quirk in Linux log; audio playback not tested |
| Controller | 054c:0044 | EZ-USB A0 RAM access and 8051 execution confirmed |

Exact EZ-USB silicon variant not verified. Bootloader bcdDevice 0.00. Embedded descriptor bcdDevice 0.01, SONY Corp., USB Jog-Dial. Linux may retain the bootloader descriptor after firmware start. Embedded configuration is interface 0, alt 1, 13 endpoints. Bulk OUT 02 command, IN 82 reply, OUT 04 bitmap. Interrupt IN 81 is a candidate for jog events; firmware uses IN1BUF and 4-byte records; not yet decoded on USB.

### GPIO

PB0 SHIFT, PB1 BACK, PB3 JOG press, all active low. PB2/PB4 quadrature; idle 11; observed right 11→10→00→01→11, left reverse. Debounce required.

PC2 serial data MSB first, PC3 clock (rising transitions after data setup). PC0 initialization transition; reset function not physically confirmed. PC1 framing/control, LOW during both native transfer routines; consistent with active-low chip-select, physical function unverified. PC4 independent active-low request convention (request 0 gives pin high, nonzero low). All Port C outputs enabled according to 8051-side MOVX read; direct USB A0 reads of some GPIO registers are unreliable. Port C pin state and output enable confirmed in CPU snapshots (1b/1b/ff or 0b/0b/ff), not a scope measurement.

## Embedded firmware

299 type-0 records, 22 bytes per record, format little-endian u16 length, u16 address, u8 type, up to 16 data bytes, padding. Start 0x2810, EOF 0x41c2; 3789 unique bytes. Reset vector LJMP 0x0925. CPUCS 0x7f92, bit0 reset; only volatile RAM used. RAM image is sparse and must not blindly assume gaps are firmware bytes.

## USB command dispatcher

8051 routine around 0x07c3 reads OUT2BUF (0x7dc0); reply IN2BUF (0x7e00), two bytes [opcode,status]. Status 0 means dispatched, not that LCD has acknowledged. Unknown opcode gets ff.

| USB 4-byte packet | 8051 routine | Interpretation |
|---|---|---|
| 00 00 00 00 | 0x0d35, 0x0a5c, 0x0e75 | GPIO init, LCD init, queue reset |
| 10 xx 00 00 | 0x0e3d | xx!=0 sends LCD 0x0f; zero sends 0x08 |
| 11 xx 00 00 | 0x0a09 | Fill display RAM with byte |
| 12 xx 00 00 | 0x0df7 | LCD 0x28 followed by min(xx,63); likely contrast |
| 13 xx yy 00 | 0x0cab | LCD 0xc0 followed by bounded x/y (0x0c,0x33) |
| 20 xx 00 00 | 0x0ec0 | PC4 low for nonzero, high for zero |

Firmware fill loop writes 0x297 = 663 bytes. 13 bytes × 51 rows is consistent with addressing and 104×51 1-bit storage, but exact visible pixel geometry is unconfirmed (address clamp y=51, not necessarily 51 visible rows).

### LCD native routines: corrected interpretation

- 0x0eD3: arg=0 clears PC1 LOW; arg!=0 sets PC1 HIGH. The JZ at 0x0ed4 has next PC 0x0ed6 and target 0x0ede, the AND FD branch. This corrects an earlier reversed branch interpretation.
- 0x0c43: eight-bit shift, MSB first, clock PC3; does not alter PC1.
- 0x0a5c: derives OUTC from PINSC & 0x10 | 0x0a, then sets PC0 high immediately. Sends 0x27 and 0x18 in separate frames; sets level 0x20; clears and sets origin.
- 0x0a09: sets origin with C0 00 00; sends B0 and 663 fill bytes; sets origin again. Calls 0x0ed3(0) before each frame and 0x0ed3(1) afterward. PC1 LOW during transmission.
- 0x0651: OUT4 handler snapshots PINSC into internal RAM 0x20, explicitly clears bit1, shifts B0, shifts OUT4BC bytes from OUT4BUF at 0x7cc0, then sets bit1 before returning. PC1 LOW during transmission. This matches 0x0a09: LOW during transmission, HIGH afterward. The physical function is not yet verified.
- 0x0df7: clamp level to 63, send LCD 28 followed by level. 0x0e3d: LCD 0f/08. 0x0e59: LCD 10/11 (used in power paths; wake/sleep interpretation tentative). 0x0ec0: PC4 request polarity confirmed by CPU readback.
- 0x0adf: initializes state and GPIO, queues a record starting with 0x10, sets PC4 high, initializes LCD.
- 0x0f02/0x0f0e: call 0x0e59 with 1/0; 0x0f02 also queues a record 0x11. Main loop 0x0625 handles suspend flag then waits on USBCS bit7 and calls resume routine.

## Windows x86 host path: reread

- dpjdusb.sys 0x11036 reads device and configuration descriptors (0x1050c), selects configuration via 0x105c4, then calls 0x10ace.
- 0x10ace calls 0x108b0 with reset=1, 0x10928 with record table VMA 0x12810, then 0x108b0 with reset=0. This is the expected download order; host config precedes firmware start, unlike some experimental reloads.
- 0x10b84 calls 0x11036 then sends two 4-byte command buffers via 0x109c0. VMA 0x127cc contains 10 01 00 00; VMA 0x127d4 contains 12 13 00 00. Thus host sends display enable then level **0x13**, not just embedded default 0x20. Similar sequence in another path at 0x11584 / 0x1159a.
- 0x109c0 builds a bulk OUT URB then a bulk IN URB; Windows requests a 2-byte reply.
- dpjdusb.dll provides Sjusb_SearchOpen/Open/Close/OpenPipe/ClassRequest/VendorRequest/ResetPipe/ResetDevice/AbortPipes/GetDeviceDescriptor/GetConfigurationDescriptor/GetCurrentPowerState/GetStatusEndpoint/Check.
- jdplug.dll 0x10002e17 and 0x10002e34 construct 11 00 00 00 and 13 00 00 00 to clear and return origin. It exports JDPEnterBitmapMode/JDPDrawBitmap/JDPExitBitmapMode and application activation APIs. 0x1000322c constructs a position packet before preparing a bitmap. Complete image geometry/stride/packet framing in host DLL not yet reconstructed.

## Open questions

1. Confirm PC1 physical function and compare timing between fill and OUT4 paths; both use the same LOW-during-transfer framing.
2. Identify LCD IC from instruction set 27,18,28+level,0f/08,10/11,C0 x y,B0 data. No datasheet match confirmed.
3. Compare exact original Windows cold-start configuration and post-download command order to Linux test. Earlier experiments changed host USB configuration after CPU start to resynchronize endpoints; this works for USB but may affect suspend/restore state.
4. PC0 reset pulse width and power-up wait: original code has no explicit delay between output writes. Do not assume reset function until verified.
5. Capture/measure an actual LCD serial transaction or test in a Windows VM with known original software and USB passthrough. An ACK only verifies firmware path, not LCD.
