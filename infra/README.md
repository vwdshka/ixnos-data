# Production

One VPS runs everything with Docker Compose: PostgreSQL, the API, the web app and Caddy
(HTTPS). The pipeline runs as one-off containers started by the host's cron.

## First setup

1. A Debian or Ubuntu server with Docker, a `deploy` user in the `docker` group, and DNS for
   your domain pointing at it (ports 80 and 443 open).
2. `git clone https://github.com/vwdshka/ixnos-data /opt/ixnos-data`, then create `/opt/ixnos-data/.env` from
   `.env.example` with a strong `IXNOS_DATA_DB_PASSWORD` and `IXNOS_DATA_DOMAIN`.
3. `docker compose -f infra/compose.prod.yaml --env-file .env up -d`. The API applies database
   migrations on start; Caddy obtains the certificate.
4. Load the CPV and NUTS codes and the Διαύγεια organisation register, then ingest recent
   records (the crontab also refreshes the register weekly):

   ```sh
   C="docker compose -f infra/compose.prod.yaml --env-file .env"
   $C run --rm --entrypoint python pipeline -m ixnos_data_pipeline.reference.load
   $C run --rm --entrypoint python pipeline -m ixnos_data_pipeline.sources.diavgeia.organisations
   $C run --rm pipeline khmdhs nightly
   ```
5. `sudo mkdir -p /var/log/ixnos-data /var/backups/ixnos-data && sudo chown deploy /var/log/ixnos-data /var/backups/ixnos-data`,
   then `crontab infra/crontab` as `deploy`.
6. In GitHub, set the variable `DEPLOY_HOST` and the secrets `DEPLOY_SSH_KEY` (a key the
   `deploy` user accepts) and `DEPLOY_KNOWN_HOSTS` (`ssh-keyscan <host>`). Every push to
   `main` then builds images and deploys them.

## Dry run on a development machine

The whole production setup runs locally under its own Compose project, so it never touches the
development database:

```sh
docker build -t ixnos-data-local-api:dry -f backend/src/IxnosData.Api/Dockerfile backend
docker build -t ixnos-data-local-pipeline:dry pipeline
docker build -t ixnos-data-local-web:dry web
# dryrun.env: IXNOS_DATA_DB_PASSWORD=..., IXNOS_DATA_DOMAIN=localhost, IXNOS_DATA_IMAGE_PREFIX=ixnos-data-local, IXNOS_DATA_TAG=dry
docker compose -p ixnos-data-dryrun -f infra/compose.prod.yaml --env-file dryrun.env up -d
```

Caddy serves `https://localhost` with its own local certificate. Then follow "First setup"
step 4 with `-p ixnos-data-dryrun`; without an SMTP host, emails are written to `/tmp/ixnos-data-mail` in
the API container. On Windows Git Bash, set `MSYS_NO_PATHCONV=1` so container paths like
`/srv/exports` are not rewritten. Remove it all with `docker compose -p ixnos-data-dryrun ... down -v`.

## Backups

`infra/scripts/backup.sh` runs nightly: a `pg_dump` kept 14 days in `/var/backups/ixnos-data`, then
copied off the server when `.env` sets `IXNOS_DATA_BACKUP_REMOTE` (an rclone remote). For Hetzner
Object Storage:

```sh
IXNOS_DATA_BACKUP_REMOTE=offsite:ixnos-data-backups
RCLONE_CONFIG_OFFSITE_TYPE=s3
RCLONE_CONFIG_OFFSITE_PROVIDER=Other
RCLONE_CONFIG_OFFSITE_ENDPOINT=fsn1.your-objectstorage.com
RCLONE_CONFIG_OFFSITE_ACCESS_KEY_ID=...
RCLONE_CONFIG_OFFSITE_SECRET_ACCESS_KEY=...
```

The dumps hold account emails and saved searches, so encrypt them before they leave the server.
An rclone `crypt` remote wraps the bucket and encrypts file contents and names on the way out;
backups then go to the crypt remote instead:

```sh
IXNOS_DATA_BACKUP_REMOTE=secure:
RCLONE_CONFIG_SECURE_TYPE=crypt
RCLONE_CONFIG_SECURE_REMOTE=offsite:ixnos-data-backups
# Both from `docker run --rm rclone/rclone:1 obscure '<a long random passphrase>'`
RCLONE_CONFIG_SECURE_PASSWORD=...
RCLONE_CONFIG_SECURE_PASSWORD2=...
```

Keep the two passphrases (not the obscured values) in a password manager as well: without them the
off-server copies can't be read, and they are the only copies left if the server is lost. The
restore runbook reads from `IXNOS_DATA_BACKUP_REMOTE` too, so it decrypts without changes.

Give the bucket a lifecycle rule (e.g. delete after 90 days). `infra/scripts/restore-check.sh`
restores the newest dump into a scratch database on the 1st of each month and logs the row
counts; a real restore is in `docs/runbooks/restore-backup.md`.

## Email

Sign-in links and the daily digests go out over SMTP: set `IXNOS_DATA_SMTP_HOST`, `IXNOS_DATA_SMTP_USERNAME`,
`IXNOS_DATA_SMTP_PASSWORD` and `IXNOS_DATA_EMAIL_FROM` in `.env` for any transactional email provider
(with SPF and DKIM set up for the sending domain). The crontab runs the digest at 07:00.

## Monitoring

Point an external uptime check at `https://<domain>/health/ready` (API and database) and
`https://<domain>/health/ingestion`, which returns 503 when ΚΗΜΔΗΣ or Διαύγεια has added no records
for 24 hours or its last two runs failed.
