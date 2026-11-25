# Two-VM Samba regression

The original v2 script is published here at `scripts/lan-share/setup-samba-host.sh`, copied unchanged from the private bridge repository with the owner's permission.

Run via the **Samba QEMU regression** GitHub Actions workflow (GitHub-hosted ubuntu-24.04 runner), or on a disposable Ubuntu host:

`bash tests/samba-qemu/run.sh scripts/lan-share/setup-samba-host.sh`

Two Ubuntu cloud images (24.04 and 26.04), isolated tap bridge and independent NAT interfaces for SSH/package installation. The harness drives the original interactive setup over SSH PTYs, using randomly generated disposable credentials. Checks clean-client mDNS bootstrap, mutual server/client setup, idempotence, real CIFS mounts, permissions, guest/SMB2 rejection, bidirectional file operations and SHA-256, and reboot persistence. If clean bootstrap fails, it records the failure, installs discovery dependencies and attempts the remaining checks. No physical host or production credentials are used. KVM if available, otherwise TCG. Logs are uploaded as an Actions artifact.
