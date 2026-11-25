#!/usr/bin/env bash
# Run on a disposable GitHub-hosted Ubuntu runner, never on a physical LAN host.
set -Eeuo pipefail
source_script="$(realpath "${1:?path to original setup-samba-host.sh required}")"
bash -n "$source_script"
work="$(mktemp -d)"
key="$work/key"
declare -a opts=(-o BatchMode=yes -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -o ConnectTimeout=5)
declare -a pids=()
cleanup() {
  local rc=$?
  for p in "${pids[@]}"; do kill "$p" 2>/dev/null || true; done
  for p in "${pids[@]}"; do wait "$p" 2>/dev/null || true; done
  sudo ip link del smb-tap-a 2>/dev/null || true
  sudo ip link del smb-tap-b 2>/dev/null || true
  sudo ip link del smb-test-br 2>/dev/null || true
  if ((rc)); then for f in "$work"/*.serial; do [[ ! -f "$f" ]] || tail -n 100 "$f"; done; fi
  rm -rf "$work"
}
trap cleanup EXIT
trap 'echo "ERROR: harness line $LINENO exited $?" >&2' ERR
sudo apt-get update
sudo apt-get install -y qemu-system-x86 qemu-utils cloud-image-utils python3-pexpect
ssh-keygen -q -t ed25519 -N '' -f "$key"
opts+=(-i "$key")
sudo ip link add smb-test-br type bridge
sudo ip link set smb-test-br up
for n in a b; do
  sudo ip tuntap add dev "smb-tap-$n" mode tap user "$(id -un)"
  sudo ip link set "smb-tap-$n" master smb-test-br
  sudo ip link set "smb-tap-$n" up
done
accel=tcg
if [[ -c /dev/kvm ]]; then sudo chmod a+rw /dev/kvm; [[ ! -r /dev/kvm || ! -w /dev/kvm ]] || accel=kvm; fi
echo "QEMU accelerator: $accel"
boot() {
  local n="$1" ver="$2" port="$3" addr="$4" uid="$5" suffix="$6"
  local name="smb-$n" lanmac="52:54:00:77:00:$suffix" wanmac="52:54:00:78:00:$suffix"
  curl -fL --retry 3 "https://cloud-images.ubuntu.com/releases/$ver/release/ubuntu-$ver-server-cloudimg-amd64.img" -o "$work/$n.base"
  qemu-img create -f qcow2 -F qcow2 -b "$work/$n.base" "$work/$n.qcow2" 12G
  cat >"$work/$n.user" <<EOF
#cloud-config
hostname: $name
manage_etc_hosts: true
users:
  - name: runner
    uid: $uid
    groups: [sudo]
    shell: /bin/bash
    sudo: ALL=(ALL) NOPASSWD:ALL
    lock_passwd: true
    ssh_authorized_keys:
      - $(cat "$key.pub")
ssh_pwauth: false
EOF
  cat >"$work/$n.meta" <<EOF
instance-id: $name
local-hostname: $name
EOF
  cat >"$work/$n.net" <<EOF
version: 2
ethernets:
  lan:
    match: {macaddress: "$lanmac"}
    set-name: lan0
    addresses: [$addr/24]
    dhcp4: false
    dhcp6: false
    link-local: []
    optional: true
  wan:
    match: {macaddress: "$wanmac"}
    set-name: wan0
    dhcp4: true
    dhcp6: false
EOF
  cloud-localds --network-config="$work/$n.net" "$work/$n.seed" "$work/$n.user" "$work/$n.meta"
  qemu-system-x86_64 -machine "q35,accel=$accel" -m 2048 -smp 2 -display none -monitor none \
    -serial "file:$work/$n.serial" -drive "file=$work/$n.qcow2,if=virtio,format=qcow2" \
    -drive "file=$work/$n.seed,if=virtio,format=raw,readonly=on" \
    -netdev "user,id=wan,hostfwd=tcp:127.0.0.1:$port-:22" -device "virtio-net-pci,netdev=wan,mac=$wanmac" \
    -netdev "tap,id=lan,ifname=smb-tap-$n,script=no,downscript=no" -device "virtio-net-pci,netdev=lan,mac=$lanmac" &
  pids+=("$!")
}
guest() { local port="$1"; shift; ssh "${opts[@]}" -p "$port" runner@127.0.0.1 "$@"; }
ready() {
  local p="$1" addr
  case "$p" in 22011) addr=10.77.0.11;; 22012) addr=10.77.0.12;; *) return 1;; esac
  for i in {1..180}; do
    if guest "$p" true 2>/dev/null; then
      guest "$p" "rc=0; sudo cloud-init status --wait --long || rc=\$?; echo cloud-init-exit=\$rc; ip -br link; ip -br -4 addr; ip -4 route; cat /etc/os-release; sudo networkctl list --no-pager; if [ \"\$rc\" -ne 0 ]; then sudo journalctl -u systemd-networkd -u systemd-networkd-wait-online --no-pager -n 80; fi; test \"\$rc\" -le 2 && ip -o -4 addr show dev lan0 | grep -F '$addr/24' && ip -4 route show default | grep -q 'dev wan0' && id runner"
      return
    fi
    sleep 5
  done
  return 1
}
interactive() {
  local p="$1"; shift
  /usr/bin/python3 - "$key" "$p" "$*" <<'PY'
import os,sys,pexpect
key,port,command=sys.argv[1:]
p=pexpect.spawn("ssh",["-tt","-o","BatchMode=yes","-o","StrictHostKeyChecking=no","-o","UserKnownHostsFile=/dev/null","-i",key,"-p",port,"runner@127.0.0.1",command],encoding="utf-8",timeout=900)
p.logfile_read=sys.stdout
while True:
    n=p.expect([r"(?i)(?:new smb password|retype new smb password|password for runner on [^:\r\n]+):",pexpect.EOF,pexpect.TIMEOUT])
    if n==0: p.sendline(os.environ["SMB_TEST_PASSWORD"])
    elif n==1:
        p.close()
        sys.exit(p.exitstatus if p.exitstatus is not None else 1)
    else:
        p.close(force=True)
        sys.exit("timed out waiting for interactive setup")
PY
}
export SMB_TEST_PASSWORD="$(openssl rand -hex 24)"
if [[ "${GITHUB_ACTIONS:-}" == true ]]; then echo "::add-mask::$SMB_TEST_PASSWORD"; fi
boot a 24.04 22011 10.77.0.11 1101 11
boot b 26.04 22012 10.77.0.12 1201 12
for p in 22011 22012; do
  ready "$p"
  scp "${opts[@]}" -P "$p" "$source_script" runner@127.0.0.1:/tmp/setup-samba-host.sh
  guest "$p" 'bash -n /tmp/setup-samba-host.sh && sha256sum /tmp/setup-samba-host.sh'
done
sha256sum "$source_script"
base='sudo bash /tmp/setup-samba-host.sh'
server() { interactive "$1" "$base server --expected-host smb-$2 --iface lan0 --allow-network 10.77.0.0/24 --enable-mdns --replace-smb-conf"; }
client() { interactive "$1" "$base client --expected-host smb-$2 --iface lan0 --peer smb-$3"; }
echo 'TEST wrong-host rejection'
if guest 22011 "$base status --expected-host wrong --iface lan0"; then exit 1; fi
echo 'TEST A server / B clean client using mDNS'
server 22011 a
fail=0
if ! client 22012 b a; then
  echo 'FAIL clean client bootstrap; collect resolver state and retry after dependencies'
  fail=1
  guest 22012 'getent ahostsv4 smb-a.local || true; dpkg-query -W libnss-mdns avahi-daemon || true; sudo apt-get update && sudo apt-get install -y libnss-mdns avahi-daemon'
  client 22012 b a
fi
echo 'TEST B server / A client'
server 22012 b
client 22011 a b
echo 'TEST idempotence'
server 22011 a
server 22012 b
client 22011 a b
client 22012 b a
for spec in '22011 a b' '22012 b a'; do
  read -r p n peer <<<"$spec"
  echo "TEST $n status, CIFS, permissions, auth rejection, file I/O"
  guest "$p" "$base status --expected-host smb-$n --iface lan0 --peer smb-$peer"
  guest "$p" "set -eu; mp=/mnt/peers/smb-$peer/share; ls \"\$mp\"; findmnt -n -t cifs --mountpoint \"\$mp\"; test \"\$(sudo stat -c '%a %u' /etc/samba/credentials/smb-$peer.cred)\" = '600 0'; test \"\$(grep -c ' /mnt/peers/smb-$peer/share cifs ' /etc/fstab)\" = 1; sudo testparm -s >/dev/null; systemctl is-active smbd; ss -ltn '( sport = :445 )'; if smbclient //smb-$peer.local/share -N -c ls; then exit 1; fi; if sudo smbclient //smb-$peer.local/share -A /etc/samba/credentials/smb-$peer.cred --option='client min protocol=SMB2_10' --option='client max protocol=SMB2_10' -c ls; then exit 1; fi; dd if=/dev/urandom of=/var/tmp/payload-$n bs=1M count=8 status=none; cp /var/tmp/payload-$n \"\$mp/$n.bin\"; cmp /var/tmp/payload-$n \"\$mp/$n.bin\"; mkdir \"\$mp/$n-dir\"; mv \"\$mp/$n.bin\" \"\$mp/$n-dir/data.bin\"; sha256sum /var/tmp/payload-$n"
done
for spec in '22011 a b 22012' '22012 b a 22011'; do
  read -r p n peer other <<<"$spec"
  expected="$(guest "$other" "sha256sum /var/tmp/payload-$peer" | awk '{print $1}')"
  actual="$(guest "$p" "sha256sum /srv/runner-share/$peer-dir/data.bin" | awk '{print $1}')"
  test "$expected" = "$actual"
  guest "$p" "test \"\$(stat -c %U:%G /srv/runner-share/$peer-dir/data.bin)\" = runner:runner"
done
echo 'TEST reboot persistence'
old="$(guest 22012 cat /proc/sys/kernel/random/boot_id)"
guest 22012 'sudo systemctl reboot' || true
for i in {1..120}; do
  now="$(guest 22012 cat /proc/sys/kernel/random/boot_id 2>/dev/null || true)"
  [[ -n "$now" && "$now" != "$old" ]] && break
  sleep 5
done
test -n "$now"; test "$now" != "$old"
ready 22012
guest 22012 'ls /mnt/peers/smb-a/share; findmnt -n -t cifs --mountpoint /mnt/peers/smb-a/share; cmp /var/var/tmp/payload-b /mnt/peers/smb-a/share/b-dir/data.bin'
guest 22011 'rm /mnt/peers/smb-b/share/a-dir/data.bin; rmdir /mnt/peers/smb-b/share/a-dir'
guest 22012 'test ! -e /srv/runner-share/a-dir'
guest 22012 'rm /mnt/peers/smb-a/share/b-dir/data.bin; rmdir /mnt/peers/smb-a/share/b-dir'
guest 22011 'test ! -e /srv/runner-share/b-dir'
if ((fail)); then echo 'FAIL: clean client bootstrap regression'; exit 1; fi
echo 'PASS: two-VM Samba regression'
