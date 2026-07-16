#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/assisi-map}"
REPO_URL="${REPO_URL:?REPO_URL is required}"
BRANCH="${BRANCH:-main}"

echo "==> Prepare app directory"
sudo mkdir -p "$APP_DIR"
sudo chown -R "$USER:$USER" "$APP_DIR"
cd "$APP_DIR"

echo "==> Sync git repository (keep existing .env)"
if [ ! -d .git ]; then
  git init
  git remote add origin "$REPO_URL"
else
  git remote set-url origin "$REPO_URL"
fi

git fetch origin "$BRANCH"
git checkout -B "$BRANCH" "origin/$BRANCH"
git reset --hard "origin/$BRANCH"

echo "==> Validate server .env"
if [ ! -f .env ]; then
  echo "ERROR: Missing $APP_DIR/.env on server. Create it first."
  exit 1
fi

for var in APP_DOMAIN POSTGRES_PASSWORD JWT_SECRET; do
  if ! grep -q "^${var}=" .env; then
    echo "ERROR: Missing ${var} in .env"
    exit 1
  fi
done

echo "==> Start containers"
sudo docker compose -f docker-compose.prod.yml up -d --build --remove-orphans
sudo docker compose -f docker-compose.prod.yml ps
sudo docker image prune -f

echo "==> Deploy finished"
