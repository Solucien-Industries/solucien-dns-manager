#!/bin/sh
# Runs once on first Postgres init. Creates the dedicated PowerDNS database and
# loads the gpgsql schema into it. The main app database ($POSTGRES_DB) is
# created automatically by the postgres image and managed by Prisma migrations.
set -e

echo "Creating PowerDNS database 'pdns'..."
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
  CREATE DATABASE pdns OWNER $POSTGRES_USER;
EOSQL

echo "Loading PowerDNS gpgsql schema into 'pdns'..."
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname pdns \
  -f /docker-entrypoint-initdb.d/schema.pgsql.sql

echo "PowerDNS database ready."
