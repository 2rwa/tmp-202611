# Two-VM Samba regression

Run only on a disposable Ubuntu GitHub-hosted runner. The original setup script is supplied as an argument from its private repository; this public repository does not contain it. No physical host or production credentials are used.

`bash tests/samba-qemu/run.sh /path/to/setup-samba-host.sh`

Two Ubuntu cloud images (24.04 and 26.04) boot on an isolated tap bridge with independent NAT interfaces for packages and SSH. The test drives the real interactive setup via a pseudo-terminal, validates clean-client mDNS bootstrap, both server/client roles, repeat setup, CIFS mounts, credentials permissions, negative guest/SMB2 authentication, bidirectional 8 MiB data and ownership, deletion, and reboot persistence. If clean bootstrap fails, the test explicitly records failure, installs missing discovery dependencies, and continues other checks before exiting nonzero. Logs and the source SHA identify the tested version. KVM is used when available, otherwise TCG. No production script is modified.
