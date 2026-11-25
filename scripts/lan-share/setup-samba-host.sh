#!/usr/bin/env bash
# Managed by 2rwa LAN Samba host setup v2.
# Bootstrap a physical Ubuntu 24.04 or 26.04 host as an SMB server/client.
# Never run automatically in GitHub Actions: requires an interactive root session.
set -Eeuo pipefail
set +x  # Never echo credentials, including if caller used bash -x.

readonly MARKER='# Managed by 2rwa LAN Samba host setup v2'
readonly CONF='/etc/samba/smb.conf'
readonly SHARE='/srv/runner-share'
readonly CRED_DIR='/etc/samba/credentials'
readonly FSTAB='/etc/fstab'

usage() {
  cat <<'EOF'
Usage:
  setup-samba-host.sh server --expected-host HOST --iface IFACE \
      --allow-network CIDR [--enable-mdns] [--replace-smb-conf]
  setup-samba-host.sh client --expected-host HOST --iface IFACE \
      --peer NAME [--peer-host DNS_NAME | --peer-ip IPV4] [--rotate-credentials]
  setup-samba-host.sh status --expected-host HOST --iface IFACE [--peer NAME]

By default, --peer br00 connects to br00.local using mDNS.
--peer-host overrides this with an explicitly configured DNS name.
--peer-ip is a temporary IP-only fallback (does not survive IP changes).
No firewall, DNS, DHCP, or LXC configuration is modified.
EOF
}
die() { printf 'ERROR: %s\n' "$*" >&2; exit 1; }
log() { printf '==> %s\n' "$*"; }
need_root() { [[ ${EUID} -eq 0 ]] || die 'Run with sudo/root from an interactive terminal'; }
check_tty() { [[ -r /dev/tty && -w /dev/tty ]] || die 'Interactive /dev/tty required for password entry'; }

cmd="${1:-}"
if [[ "$cmd" == "--help" || "$cmd" == "-h" ]]; then usage; exit 0; fi
[[ -n "$cmd" ]] || { usage; exit 2; }
shift
HOST='' IFACE='' PEER='' PEER_IP='' PEER_HOST='' ALLOW_NETWORK='' ENABLE_MDNS=0 REPLACE_CONF=0 ROTATE_CREDS=0
ALLOWED_IPS=()
while (($#)); do
  case "$1" in
    --expected-host) (($# >= 2)) || die 'Missing --expected-host value'; HOST="$2"; shift 2 ;;
    --iface) (($# >= 2)) || die 'Missing --iface value'; IFACE="$2"; shift 2 ;;
    --peer) (($# >= 2)) || die 'Missing --peer value'; PEER="$2"; shift 2 ;;
    --peer-ip) (($# >= 2)) || die 'Missing --peer-ip value'; PEER_IP="$2"; shift 2 ;;
    --peer-host) (($# >= 2)) || die 'Missing --peer-host value'; PEER_HOST="$2"; shift 2 ;;
    --allow-network) (($# >= 2)) || die 'Missing --allow-network value'; ALLOW_NETWORK="$2"; shift 2 ;;
    --allow-from) (($# >= 2)) || die 'Missing --allow-from value'; ALLOWED_IPS+=("$2"); shift 2 ;;
    --enable-mdns) ENABLE_MDNS=1; shift ;;
    --replace-smb-conf) REPLACE_CONF=1; shift ;;
    --rotate-credentials) ROTATE_CREDS=1; shift ;;
    -h|--help) usage; exit 0 ;;
    *) die "Unknown argument: $1" ;;
  esac
done

[[ "$cmd" =~ ^(server|client|status)$ ]] || die "Invalid action: $cmd"
[[ "$HOST" =~ ^[a-z][a-z0-9-]{0,30}$ ]] || die 'Specify --expected-host (simple hostname)'
[[ "$(hostname -s)" == "$HOST" ]] || die "This host is $(hostname -s), expected $HOST"
[[ "$IFACE" =~ ^[a-zA-Z0-9_.:-]+$ ]] || die 'Specify --iface (e.g. enp1s0)'
ip link show dev "$IFACE" >/dev/null || die "Interface not found: $IFACE"
[[ -z "$PEER" || "$PEER" =~ ^[a-z][a-z0-9-]{0,30}$ ]] || die 'Invalid --peer name'
[[ -z "$PEER_HOST" || "$PEER_HOST" =~ ^[A-Za-z0-9][A-Za-z0-9.-]{0,250}$ ]] || die 'Invalid --peer-host'
[[ -z "$PEER_HOST" || -z "$PEER_IP" ]] || die 'Choose --peer-host OR --peer-ip'

valid_ipv4() {
  python3 - "$1" <<'PY'
import ipaddress,sys
try:
    a = ipaddress.IPv4Address(sys.argv[1])
    assert not (a.is_loopback or a.is_multicast or a.is_unspecified or a.is_link_local)
except (ValueError,AssertionError):
    sys.exit(1)
PY
}
local_ipv4() {
  ip -o -4 addr show dev "$IFACE" scope global | awk 'NR==1{split($4,a,"/");print a[1]}'
}
assert_direct_peer() {
  local address="$1" route
  valid_ipv4 "$address" || die "Invalid IPv4: $address"
  route="$(ip -4 route get "$address" 2>/dev/null)" || die "No route to $address"
  [[ " $route " == *" dev $IFACE "* ]] || die "Route to $address does not use $IFACE: $route"
  [[ " $route " != *" via "* ]] || die "Route to $address goes through a gateway: $route"
  [[ "$address" != "$(local_ipv4)" ]] || die 'Peer must not be this host'
}

[[ -n "$(local_ipv4)" ]] || die "No global IPv4 on $IFACE"
validate_network() {
  python3 - "$1" "$(local_ipv4)" <<'PY'
import ipaddress,sys
try:
    network=ipaddress.IPv4Network(sys.argv[1], strict=True)
    address=ipaddress.IPv4Address(sys.argv[2])
    assert 8 <= network.prefixlen <= 32 and address in network
except (ValueError, AssertionError):
    sys.exit(1)
PY
}
PEER_TARGET=''
resolve_peer() {
  local resolved
  if [[ -n "$PEER_IP" ]]; then
    PEER_TARGET="$PEER_IP"
    resolved="$PEER_IP"
    log 'WARNING: --peer-ip will not follow IP changes'
  else
    PEER_TARGET="${PEER_HOST:-${PEER}.local}"
    resolved="$(getent ahostsv4 "$PEER_TARGET" | awk 'NR==1{print $1}' || true)"
    [[ -n "$resolved" ]] || die "Cannot resolve $PEER_TARGET: check Avahi, NSS libnss-mdns and UDP/5353"
  fi
  assert_direct_peer "$resolved"
  log "Peer $PEER_TARGET resolves to $resolved via $IFACE"
}
case "$cmd" in
  server)
    [[ -n "$ALLOW_NETWORK" ]] || die 'server requires --allow-network CIDR'
    validate_network "$ALLOW_NETWORK" || die "Invalid LAN subnet: $ALLOW_NETWORK"
    for address in "${ALLOWED_IPS[@]}"; do assert_direct_peer "$address"; done
    ;;
  client)
    [[ -n "$PEER" ]] || die 'client requires --peer'
    [[ "$PEER" != "$HOST" ]] || die 'Cannot mount self as peer'
    resolve_peer
    ;;
  status)
    if [[ -n "$PEER" ]]; then resolve_peer; fi
    ;;
esac

if [[ "$cmd" == 'status' ]]; then
  printf 'hostname=%s iface=%s host_ip=%s\n' "$HOST" "$IFACE" "$(local_ipv4)"
  if [[ -n "$PEER_TARGET" ]]; then getent ahostsv4 "$PEER_TARGET" || true; fi
  for bin in smbd smbclient mount.cifs testparm avahi-daemon; do command -v "$bin" || true; done
  systemctl is-active smbd 2>/dev/null || true
  systemctl is-active avahi-daemon 2>/dev/null || true
  findmnt -t cifs -o TARGET,SOURCE,FSTYPE || true
  exit 0
fi

need_root
check_tty
[[ -f /etc/os-release ]] || die 'Cannot identify OS'
# shellcheck disable=SC1091
source /etc/os-release
case "${ID:-}:${VERSION_ID:-}" in
  ubuntu:24.04|ubuntu:26.04)
    log "Supported Ubuntu release: $VERSION_ID"
    ;;
  *)
    die "Unsupported OS: ${PRETTY_NAME:-unknown}; supported: Ubuntu 24.04 and 26.04 LTS"
    ;;
esac
[[ "$(id -u runner)" =~ ^[0-9]+$ ]] || die 'Linux user runner does not exist'

if [[ "$cmd" == 'server' ]]; then
  if [[ -e "$CONF" ]] && ! grep -Eq "^# Managed by 2rwa LAN Samba host setup v[12]$" "$CONF"; then
    ((REPLACE_CONF == 1)) || die "Existing $CONF is unmanaged; review it, then pass --replace-smb-conf to back up and replace it"
  fi
  log 'Installing Samba and SMB client tools'
  export DEBIAN_FRONTEND=noninteractive
  apt-get update
  apt-get install -y samba smbclient cifs-utils libnss-mdns avahi-daemon
  if ((ENABLE_MDNS == 1)); then
    apt-get install -y avahi-daemon
  fi

  install -d -o runner -g runner -m 2770 "$SHARE"
  host_ip="$(local_ipv4)"
  tmp="$(mktemp)"
  trap 'rm -f "$tmp"' EXIT
  {
    printf '%s\n' "$MARKER"
    cat <<EOF
[global]
    server role = standalone server
    security = user
    map to guest = never
    passdb backend = tdbsam
    server min protocol = SMB3_00
    disable netbios = yes
    smb ports = 445
    interfaces = lo $IFACE
    bind interfaces only = yes
    hosts allow = 127.0.0.1 $ALLOW_NETWORK $(printf '%s ' "${ALLOWED_IPS[@]}")
    hosts deny = ALL
    load printers = no
    disable spoolss = yes
    usershare allow guests = no

[share]
    comment = Local runner exchange (physical host)
    path = ${SHARE}
    browseable = yes
    read only = no
    guest ok = no
    valid users = runner
    force user = runner
    force group = runner
    create mask = 0660
    directory mask = 0770
    force directory mode = 2770
EOF
  } > "$tmp"
  testparm -s "$tmp" >/dev/null || die 'New smb.conf failed validation; original unchanged'
  if [[ -e "$CONF" ]]; then
    backup="${CONF}.backup.$(date +%Y%m%dT%H%M%S)"
    cp -a "$CONF" "$backup"
    log "Backed up $CONF to $backup"
  fi
  install -o root -g root -m 0644 "$tmp" "$CONF"
  trap - EXIT
  rm -f "$tmp"
  systemctl disable --now nmbd.service 2>/dev/null || true
  systemctl enable --now smbd.service
  systemctl restart smbd.service

  if ! pdbedit -L | cut -d: -f1 | grep -Fxq runner; then
    log 'Register Samba password for LOCAL runner (will not echo password)'
    smbpasswd -a runner </dev/tty
  else
    log 'Samba runner already registered; password unchanged'
  fi

  if ((ENABLE_MDNS == 1)); then
    install -d -m 0755 /etc/avahi/services
    if [[ -e /etc/avahi/services/runner-smb.service ]] && ! grep -Fq 'Managed by 2rwa LAN Samba host setup' /etc/avahi/services/runner-smb.service; then
      die 'Existing Avahi runner-smb.service is unmanaged; refusing overwrite'
    fi
    cat > /etc/avahi/services/runner-smb.service <<'EOF'
<?xml version="1.0" standalone='no'?>
<!DOCTYPE service-group SYSTEM "avahi-service.dtd">
<!-- Managed by 2rwa LAN Samba host setup -->
<service-group>
  <name replace-wildcards="yes">%h SMB</name>
  <service>
    <type>_smb._tcp</type>
    <port>445</port>
  </service>
</service-group>
EOF
    systemctl enable --now avahi-daemon.service
  fi
  log "Server configured on $IFACE (currently $host_ip); allows $ALLOW_NETWORK"
  log 'Firewall rules were NOT changed. Ensure TCP/445 inbound is allowed only from intended LAN peers.'
  log 'Samba uses interface name; restart smbd after interface IP changes. mDNS follows hostname.'
  exit 0
fi

# client phase: install CIFS, create root-only peer credentials, and configure automount.
log 'Installing CIFS client tools'
export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get install -y cifs-utils smbclient libnss-mdns avahi-daemon
install -d -o root -g root -m 0700 "$CRED_DIR"
cred="$CRED_DIR/$PEER.cred"
if [[ ! -f "$cred" || "$ROTATE_CREDS" == 1 ]]; then
  log "Enter the SMB password configured on PEER $PEER for its runner account"
  printf 'Password for runner on %s: ' "$PEER" >/dev/tty
  IFS= read -r -s secret </dev/tty || die 'Could not read SMB password'
  printf '\n' >/dev/tty
  [[ -n "$secret" ]] || die 'Refusing empty SMB password'
  tmp="$(mktemp "$CRED_DIR/.${PEER}.XXXXXX")"
  trap 'rm -f "$tmp"' EXIT
  chmod 0600 "$tmp"
  printf 'username=runner\npassword=%s\n' "$secret" > "$tmp"
  unset secret
  mv -f "$tmp" "$cred"
  trap - EXIT
  log "Stored peer credential in $cred (root-only; plaintext, never committed)"
else
  [[ "$(stat -c '%a %u' "$cred")" == '600 0' ]] || die "Credential file must be root-owned mode 0600: $cred"
  log 'Reusing existing peer credential (use --rotate-credentials to replace)'
fi

mountpoint="/mnt/peers/$PEER/share"
install -d -o root -g root -m 0755 "$mountpoint"
runner_uid="$(id -u runner)" runner_gid="$(id -g runner)"
entry="//$PEER_TARGET/share $mountpoint cifs credentials=$cred,vers=3.1.1,uid=$runner_uid,gid=$runner_gid,forceuid,forcegid,file_mode=0660,dir_mode=0770,_netdev,nofail,noexec,nosuid,nodev,x-systemd.automount,x-systemd.idle-timeout=600,x-systemd.mount-timeout=20s 0 0"
# Only update entries previously written by this script. No unrelated fstab edits.
existing="$(awk -v mp="$mountpoint" '$2==mp {print}' "$FSTAB")"
if [[ -n "$existing" && "$existing" != "$entry" ]] && findmnt -t cifs --mountpoint "$mountpoint" >/dev/null 2>&1; then
  die "Existing CIFS mount is active: $mountpoint; stop jobs and unmount before changing"
fi
cp -a "$FSTAB" "${FSTAB}.backup.$(date +%Y%m%dT%H%M%S)"
python3 - "$FSTAB" "$mountpoint" "$PEER" "$entry" <<'PY'
import os,pathlib,stat,sys,tempfile
path=pathlib.Path(sys.argv[1])
mountpoint,peer,entry=sys.argv[2:5]
marker=f'# Managed by 2rwa LAN Samba host setup: {peer}'
lines=path.read_text().splitlines(keepends=True)
indices=[i for i,line in enumerate(lines) if not line.lstrip().startswith('#') and len(line.split())>=2 and line.split()[1]==mountpoint]
if len(indices)>1 or (indices and (indices[0]==0 or lines[indices[0]-1].strip()!=marker)):
    raise SystemExit('Refusing to overwrite unmanaged or duplicate fstab entry for '+mountpoint)
if indices:
    if lines[indices[0]].strip() == entry:
        sys.exit(0)
    lines[indices[0]] = entry+'\n'
else:
    lines.extend(['\n', marker+'\n',entry+'\n'])
fd,temp=tempfile.mkstemp(prefix='.fstab.',dir=str(path.parent))
try:
    with os.fdopen(fd,'w') as f: f.writelines(lines)
    os.chmod(temp,stat.S_IMODE(path.stat().st_mode))
    os.replace(temp,path)
finally:
    if os.path.exists(temp): os.unlink(temp)
PY
log 'Verified/updated script-owned mount entry in /etc/fstab'
systemctl daemon-reload
unit="$(systemd-escape --path --suffix=automount "$mountpoint")"
systemctl start "$unit"
log "Automount ready: $mountpoint (does NOT test peer password or write data)"
log "Test as runner: timeout 30 ls $mountpoint; verify CIFS is mounted before copying"
