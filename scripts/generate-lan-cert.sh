#!/usr/bin/env bash
set -euo pipefail

LAN_IP="${1:-}"
if [[ -z "$LAN_IP" ]]; then
  echo "Usage: bash scripts/generate-lan-cert.sh <LAN_IP>"
  echo "Example: bash scripts/generate-lan-cert.sh 192.168.1.22"
  exit 1
fi

mkdir -p certs

cat > certs/openssl-ca.cnf <<EOF
[req]
default_bits = 4096
prompt = no
default_md = sha256
x509_extensions = v3_ca
distinguished_name = dn

[dn]
CN = MCC Local Root CA

[v3_ca]
basicConstraints = critical, CA:true
keyUsage = critical, keyCertSign, cRLSign
subjectKeyIdentifier = hash
authorityKeyIdentifier = keyid:always,issuer
EOF

cat > certs/openssl-server.cnf <<EOF
[req]
default_bits = 2048
prompt = no
default_md = sha256
distinguished_name = dn
req_extensions = v3_req

[dn]
CN = macOS Control Center Deck Local Server

[v3_req]
basicConstraints = CA:false
keyUsage = critical, digitalSignature, keyEncipherment
extendedKeyUsage = serverAuth
subjectAltName = @alt_names

[alt_names]
DNS.1 = localhost
DNS.2 = dcc.local
IP.1 = 127.0.0.1
IP.2 = ${LAN_IP}
EOF

openssl genrsa -out certs/dcc-ca.key 4096
openssl req -x509 -new -nodes -key certs/dcc-ca.key -sha256 -days 3650 \
  -out certs/dcc-ca.crt -config certs/openssl-ca.cnf

openssl genrsa -out certs/dcc-local.key 2048
openssl req -new -key certs/dcc-local.key -out certs/dcc-local.csr -config certs/openssl-server.cnf

openssl x509 -req -in certs/dcc-local.csr -CA certs/dcc-ca.crt -CAkey certs/dcc-ca.key -CAcreateserial \
  -out certs/dcc-local.crt -days 825 -sha256 -extfile certs/openssl-server.cnf -extensions v3_req

cat certs/dcc-local.crt certs/dcc-ca.crt > certs/dcc-local.fullchain.crt

echo "Created files:"
echo "- certs/dcc-ca.crt (install this on tablet as CA certificate)"
echo "- certs/dcc-ca.key"
echo "- certs/dcc-local.crt (server cert)"
echo "- certs/dcc-local.key (server key)"
echo "- certs/dcc-local.fullchain.crt"
