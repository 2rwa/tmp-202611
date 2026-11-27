# Experiments and current state

All experiments on one physical PCGA-JRH1 on 2026-11-27 JST. Camera images and original detailed logs remain private.

| Experiment | Result |
|---|---|
| A0 internal RAM read | 6976 bytes; high entropy, presumed uninitialized SRAM |
| RAM custom 8051 marker test | CPU executed custom code and wrote marker; RAM restored |
| GPIO input polling | buttons and quadrature mapped; 0.5 ms requested poll with actual latency |
| Original firmware RAM upload | 299 records readback verified; CPU released; bulk ACK works |
| 4 s fill/contrast cycle | ACKs but no visible display change |
| 8051 native routine call with PC4 variants | initial process stopped after 7 patterns; corrected version completed 87 patterns over ~6 min before manual stop; user saw no change |
| Physical USB power cycle | full cold start; matching firmware and 4-byte command ACK |
| Camera cold-start measurement | no meaningful difference |
| Camera contrast/PC4/bitmap sweep | all packets/bitmap transfers successful after USB resync; no meaningful optical change |

## Camera methodology

UVC camera 0458:7082, 640×480 frame downsampled to 320×240 grayscale. LCD ROI x=110..199, y=87..115 (2610 px); reference region x=30..89, y=130..144 (housing). Compare absolute difference and signed brightness; subtract mean reference drift. Fixed camera; repeat same-state capture to establish noise. JPEG/autoexposure and small ROI are limitations; only persistent changes in central region tested, not brief startup flicker or edge-only changes. No raw camera images in public repo.

## Results

Corrected mean absolute difference (8-bit levels). All ROI pixels changing >=15 levels: 0 in these tests.

| Test | corrected MAE |
|---|---:|
| cold baseline repeat | 0.961 |
| cold boot vs baseline | 0.824 |
| cold fill 00 vs FF | 0.810 |
| cold fill 00 vs AA | 0.882 |
| cold fill 00 vs 00 repeat | 0.751 |
| sweep baseline repeat | 0.730 |
| level 08 | 0.775 |
| level 13 | 0.605 |
| level 20 | 0.736 |
| level 30 | 0.770 |
| level 38 | 0.798 |
| PC4 request 0 | 0.657 |
| PC4 request 1 | 0.900 |
| OUT4 fill FF vs 00 | 0.723 |
| OUT4 AA55 vs 00 | 0.752 |
| OUT4 00 repeat | 0.716 |

The last experiment ended with level 20, PC4 request 0, display-enable request 1, fill 00. This was a protocol-level success and optical negative result, not a working LCD.

## Next tests (prioritized)

1. Read full host routines and recover the exact cold startup (configure before firmware load; display enable; level 13); check original DLL bitmap handling and its format. Avoid guessing additional opcodes.
2. Instrument native code using a RAM trace to record GPIO transitions, command byte sequences, timings and PC1 distinction. Compare against annotated disassembly. GPIO snapshots alone cannot verify fast serial edges or physical continuity.
3. Capture stable camera stream around initialization, including before and immediately after, with fixed exposure if available; expand ROI or rectify perspective, repeat controls.
4. Test original PC0 transition with measured longer delay and conservative settling after release, then slower clock, one variable at a time. Only existing proven pin outputs and original LCD commands. Restore original firmware after every altered test. Do not change drive voltages or brute-force unknown pins.
5. If accessible, Windows 2000/XP with matching driver and USB passthrough is a high-value reference; verify VM and USB stack, preferably trace USB transfers. If known original setup fails, physical diagnosis becomes more compelling.
6. If none respond, inspect LCD power/charge-pump components, flex continuity, and physical PC0/PC1/PC4 connection if nondestructively possible. Do not claim hardware failure until electrical or reference-software evidence.

## Operational notes

Temporary udev permissions on the matching USB controller and camera can survive reconnect until reboot. Stop mutually exclusive monitor before changing firmware. CPUCS reset and verified RAM download are volatile; no EEPROM programming. Host endpoint resynchronization (configuration 1, alt 1, clear halt 02/82/04) resolved repeated reload timeouts, but is not evidence of LCD power/initialization. Retain the cold-start baseline and negative control for regression testing.
