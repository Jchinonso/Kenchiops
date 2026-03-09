#!/usr/bin/env bash
#
# Kenchi VPS Setup Script
#
# Run once on a fresh Ubuntu VPS to install Docker, Caddy, and configure firewall.
# Usage: ssh root@<VPS_IP> 'bash -s' < deploy/setup-vps.sh
#

set -euo pipefail

echo "=== Kenchi VPS Setup ==="
echo "Target: Ubuntu VPS with Docker"
echo ""

# ==================== System Updates ====================

echo "[1/6] Updating system packages..."
apt-get update -qq
apt-get upgrade -y -qq

# ==================== Docker ====================

echo "[2/6] Installing Docker..."
if command -v docker &>/dev/null; then
  echo "  Docker already installed: $(docker --version)"
else
  # Install prerequisites
  apt-get install -y -qq ca-certificates curl gnupg lsb-release

  # Add Docker GPG key
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
  chmod a+r /etc/apt/keyrings/docker.asc

  # Add Docker repository
  echo \
    "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu \
    $(. /etc/os-release && echo "${UBUNTU_CODENAME:-${VERSION_CODENAME}}") stable" | \
    tee /etc/apt/sources.list.d/docker.list > /dev/null

  apt-get update -qq
  apt-get install -y -qq docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

  # Enable and start Docker
  systemctl enable docker
  systemctl start docker

  echo "  Docker installed: $(docker --version)"
fi

# Verify Docker Compose
echo "  Docker Compose: $(docker compose version)"

# ==================== App Directory ====================

echo "[3/6] Creating app directory..."
mkdir -p /opt/kenchi

echo "  Created /opt/kenchi"

# ==================== Firewall ====================

echo "[4/6] Configuring firewall (UFW)..."
if ! command -v ufw &>/dev/null; then
  apt-get install -y -qq ufw
fi

ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp   # SSH
ufw allow 80/tcp   # HTTP (Caddy redirect to HTTPS)
ufw allow 443/tcp  # HTTPS (Caddy)

# Enable UFW non-interactively
echo "y" | ufw enable
ufw status

# ==================== Git ====================

echo "[5/6] Installing Git..."
if command -v git &>/dev/null; then
  echo "  Git already installed: $(git --version)"
else
  apt-get install -y -qq git
  echo "  Git installed: $(git --version)"
fi

# ==================== Summary ====================

echo "[6/6] Creating secrets directory..."
mkdir -p /etc/kenchi
chmod 0700 /etc/kenchi
echo "  Created /etc/kenchi (mode 0700)"

echo ""
echo "=== Setup Complete ==="
echo ""
echo "=== Next Steps ==="
echo "1. Clone the repo:     cd /opt/kenchi && git clone <repo-url> ."
echo "2. Create secrets file: cp deploy/.env.production.template /etc/kenchi/.env.production"
echo "3. Edit secrets:        nano /etc/kenchi/.env.production  (fill in all values)"
echo "4. Lock secrets:        chmod 0600 /etc/kenchi/.env.production && chattr +i /etc/kenchi/.env.production"
echo "5. First deploy:        cd /opt/kenchi && bash deploy/server-deploy.sh"
echo ""
echo "IMPORTANT: Secrets live at /etc/kenchi/.env.production (NOT in /opt/kenchi/)."
echo "To edit secrets later:  chattr -i /etc/kenchi/.env.production && nano /etc/kenchi/.env.production && chattr +i /etc/kenchi/.env.production"
echo ""
echo "Caddy runs inside Docker (auto HTTPS via Let's Encrypt)."
echo "CI/CD will auto-deploy on push to main via GitHub Actions."
echo ""
echo "VPS setup complete!"
