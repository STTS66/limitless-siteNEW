#!/usr/bin/env bash
set -euo pipefail

ENV_FILE="${1:-.env.vds}"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Env file not found: $ENV_FILE" >&2
  exit 1
fi

SERVICES=(postgres backend telegram-bot support-bot frontend)

echo "[deploy] Using env file: $ENV_FILE"
echo "[deploy] Pulling latest images/build context"
docker compose --env-file "$ENV_FILE" build "${SERVICES[@]}"

echo "[deploy] Starting database first"
docker compose --env-file "$ENV_FILE" up -d postgres

echo "[deploy] Updating backend services one by one"
docker compose --env-file "$ENV_FILE" up -d --no-deps backend
docker compose --env-file "$ENV_FILE" up -d --no-deps telegram-bot
docker compose --env-file "$ENV_FILE" up -d --no-deps support-bot

echo "[deploy] Updating frontend last"
docker compose --env-file "$ENV_FILE" up -d --no-deps frontend

echo "[deploy] Current status"
docker compose --env-file "$ENV_FILE" ps
