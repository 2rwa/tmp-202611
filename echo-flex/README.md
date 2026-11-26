# Echo Flex USB accessory interoperability research

Read-only analysis of original public Amazon OTA packages. No Amazon or Third Reality firmware binaries are committed, and no physical Echo device is modified.

## Reproduction

The workflow [.github/workflows/echo-flex-ota-analysis.yml](../.github/workflows/echo-flex-ota-analysis.yml) downloads the 3471 (2021) and 8349 (2026) OTAs, verifies the published MD5, extracts the system partition using payload-dumper-go, then extracts the SquashFS filesystem. The scripts inspect.py and descriptors.py report metadata without executing the firmware.

## Verified findings

- [Initial extraction, both versions](https://github.com/2rwa/tmp-202611/actions/runs/45737935535)
- [Targeted inspection, both versions](https://github.com/2rwa/tmp-202611/actions/runs/45738363409)
- [Protobuf descriptor inspection](https://github.com/2rwa/tmp-202611/actions/runs/45738516008) (separate follow-up run)

The extracted companion firmware images are identical across both versions.

| Accessory | Model | VID:PID candidate from embedded USB descriptor | Bytes | SHA256 |
|---|---|---|---:|---|
| Motion sensor | 3RMS050U_1 | 31b6:0120 | 97484 | 54324fd8111bb04b0ad32e1ae87222fb08794f374d5d3a214d549e3cf4e32b9f |
| Night light | 3RNL040U_1 | 31b6:0118 | 114620 | 41e1ba606e73bb97aef0fafb90fb8d68148941a67d971fb0d33037e4a032ad6c |

Each descriptor occurs twice per binary, class/subclass 02/02, EP0 size 64, USB 2.0 and bcdDevice 0200. Offsets are 0xb170 and 0x16f98 (motion), 0xcef0 and 0x1ae8c (light). Actual enumeration on a physical device remains untested.

The 2026 host HAL exports enumerate_usb_tty_devices and aceAuxDevHal_registerHotplugCallback; it contains a legacy VID:PID check log. ueventd grants system:ama access to /dev/ttyACM*. The AMA gateway depends on nanopb and exposes GetDeviceInformation and GetDeviceConfiguration field tables. Its strings indicate that USB devices can be labelled smart home products. The smart home adapter depends on libprotobuf3 and libSmartHomeAmaProtobuf and exposes motion-event processing and v3 Envelope serialization. These are static observations, not confirmed runtime call relationships.

The host protobuf library contains 17 named .proto descriptors in 2021 and 18 in 2026, including Envelope, Header, Endpoint, AlexaDiscovery, AlexaMotionSensor, and AlexaTemperatureSensor. The additional 2026 descriptor is AlexaGadget. USB support for arbitrary capability types is not established.

## Public reference

Amazon's [AMA sample client](https://github.com/alexa-samples/ama-sample-client) uses a 16-bit transport header with version/stream/reserved/length-width flags and variable 8/16-bit payload lengths. Its stream zero contains a protobuf ControlEnvelope. This is a Bluetooth example, not proof that Echo Flex uses exactly the same USB framing.

## Open questions

- Validate configuration descriptors and endpoint addresses.
- Recover protobuf descriptor metadata; separate the AMA control protocol from the AVS compact smart-home envelope.
- Verify USB-specific framing and startup negotiation via passive observation on owned hardware.
- Determine whether a new accessory with its own lawful USB identity can be accepted. Do not assume an existing VID/PID or device identity may be freely reused.
- Test only on owned hardware, without bypassing identity or authentication checks.
