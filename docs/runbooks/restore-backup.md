# Runbook: restore the database from a backup

Backups are nightly `pg_dump -Fc` files in `/var/backups/ixnos-data` (14 days), copied off the server
to `IXNOS_DATA_BACKUP_REMOTE`. The monthly `restore-check.sh` proves they restore; this is the real
thing, for a lost or corrupted database.

On the server, from `/opt/ixnos-data`:

```sh
C="docker compose -f infra/compose.prod.yaml --env-file .env"
```

## 1. Get the dump

The newest local one is `ls -t /var/backups/ixnos-data/ixnos-data-*.dump | head -1`. If the server itself
was lost, fetch from off-site storage on the new server:

```sh
docker run --rm --env-file .env -v /var/backups/ixnos-data:/data rclone/rclone:1 copy "$IXNOS_DATA_BACKUP_REMOTE" /data --max-age 72h
```

## 2. Stop everything that writes

```sh
$C stop api web caddy
crontab -l > /tmp/crontab.saved && crontab -r
```

## 3. Replace the database

```sh
$C exec -T postgres sh -c 'dropdb -U "$POSTGRES_USER" "$POSTGRES_DB" && createdb -U "$POSTGRES_USER" "$POSTGRES_DB"'
$C exec -T postgres sh -c 'pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --no-owner --exit-on-error' < /var/backups/ixnos-data/ixnos-data-YYYY-MM-DD.dump
```

## 4. Start again

```sh
$C up -d
crontab /tmp/crontab.saved
$C run --rm pipeline khmdhs nightly
$C run --rm pipeline diavgeia nightly
```

The API applies any newer migrations on start. The nightly runs re-fetch the last 7 days, which
covers the gap since the backup; for a longer gap, run seed or backfill commands for the missing
days.

## 5. Check

- `https://<domain>/health/ready` is 200.
- A search returns yesterday's records.
- Accounts can sign in. Sessions and saved searches come from the backup; anything created
  after it is gone. Say so in the changelog.
