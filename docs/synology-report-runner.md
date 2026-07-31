# Synology Report Runner

This keeps report generation on Synology while the finished PDFs live in S3.

## Local Synology Trial First

Before deploying the AWS runner endpoints, you can test the Synology setup with a local JSON queue. This proves Python, dependencies, the Instagram session and PDF generation all work on the NAS.

Create a local report job:

```bash
cd /volume1/first-light-marketing
export FIRST_LIGHT_AUDIT_SCRIPT="/volume1/first-light-marketing/audit.py"
export FIRST_LIGHT_REPORT_WORKDIR="/volume1/first-light-marketing/reports"
export FIRST_LIGHT_INSTAGRAM_LOGIN="newdawneramc"
export FIRST_LIGHT_PYTHON="/volume1/first-light-marketing/venv/bin/python"

/volume1/first-light-marketing/venv/bin/python scripts/synology_report_runner.py \
  --local-queue /volume1/first-light-marketing/local-report-queue.json \
  --add-local-report niamhdonnellyx \
  --local-posts 10 \
  --once
```

That command adds a queued report to `local-report-queue.json`, runs it immediately, and writes the PDF to `/volume1/first-light-marketing/reports`.

Run queued local jobs without adding a new one:

```bash
/volume1/first-light-marketing/venv/bin/python scripts/synology_report_runner.py \
  --local-queue /volume1/first-light-marketing/local-report-queue.json \
  --once
```

Inspect the queue:

```bash
cat /volume1/first-light-marketing/local-report-queue.json
```

When this works, switch to the AWS-backed mode below.

## Flow

1. Niamh creates a report record in the admin portal.
2. Synology polls AWS for queued reports.
3. Synology runs `audit.py` locally.
4. Synology uploads the PDF to S3 using a signed upload URL.
5. The admin portal marks the report as completed and can download/delete it.

Synology does not need inbound ports open.

## Deploy Setup

Set a runner token before deploying CDK:

```bash
export FIRST_LIGHT_AUDIT_RUNNER_TOKEN="$(openssl rand -hex 32)"
npm run deploy
```

Save the token somewhere private. The same value must be configured on Synology as `FIRST_LIGHT_RUNNER_TOKEN`.

## Synology Environment

Required:

```bash
export FIRST_LIGHT_API_URL="https://www.firstlightmarketing.co.uk"
export FIRST_LIGHT_RUNNER_TOKEN="the-token-from-deploy"
export FIRST_LIGHT_AUDIT_SCRIPT="/volume1/first-light-marketing/audit.py"
```

Recommended:

```bash
export FIRST_LIGHT_REPORT_WORKDIR="/volume1/first-light-marketing/reports"
export FIRST_LIGHT_INSTAGRAM_LOGIN="newdawneramc"
export FIRST_LIGHT_PYTHON="/volume1/first-light-marketing/venv/bin/python"
export DEEPSEEK_API_KEY="your-deepseek-key"
```

Optional:

```bash
export FIRST_LIGHT_MAX_REPORTS="1"
export FIRST_LIGHT_POLL_SECONDS="1800"
export FIRST_LIGHT_LOGO="/volume1/first-light-marketing/public/logos/6-transparent-thick.png"
export FIRST_LIGHT_AUDIT_EXTRA_ARGS=""
```

## Test Command

Run one cycle manually:

```bash
cd /volume1/first-light-marketing
FIRST_LIGHT_API_URL="https://www.firstlightmarketing.co.uk" \
FIRST_LIGHT_RUNNER_TOKEN="the-token-from-deploy" \
FIRST_LIGHT_AUDIT_SCRIPT="/volume1/first-light-marketing/audit.py" \
FIRST_LIGHT_REPORT_WORKDIR="/volume1/first-light-marketing/reports" \
FIRST_LIGHT_INSTAGRAM_LOGIN="newdawneramc" \
/volume1/first-light-marketing/venv/bin/python scripts/synology_report_runner.py --once
```

## Synology Task Scheduler

Create a scheduled task that runs every 30-60 minutes.

Command:

```bash
cd /volume1/first-light-marketing
export FIRST_LIGHT_API_URL="https://www.firstlightmarketing.co.uk"
export FIRST_LIGHT_RUNNER_TOKEN="the-token-from-deploy"
export FIRST_LIGHT_AUDIT_SCRIPT="/volume1/first-light-marketing/audit.py"
export FIRST_LIGHT_REPORT_WORKDIR="/volume1/first-light-marketing/reports"
export FIRST_LIGHT_INSTAGRAM_LOGIN="newdawneramc"
export FIRST_LIGHT_PYTHON="/volume1/first-light-marketing/venv/bin/python"
export DEEPSEEK_API_KEY="your-deepseek-key"
/volume1/first-light-marketing/venv/bin/python scripts/synology_report_runner.py --once
```

Use `--once` for scheduled tasks. The scheduler handles repetition.

## Notes

- If a report fails, the runner marks it as `failed` in the admin portal with the error message.
- If `aiEnabled` is off on a report, the runner removes `DEEPSEEK_API_KEY` for that run.
- If recommendations are off, the runner passes `--no-recs` to `audit.py`.
- Keep the Instagram session file on Synology, not in AWS.
