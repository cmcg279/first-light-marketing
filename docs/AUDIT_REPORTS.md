# Online presence audits

Niamh starts these from the admin **Presence** tab. The public site is unchanged. The worker is the container image from [Report-Generator-FLM](https://github.com/cmcg279/Report-Generator-FLM). This stack does not build that image. It invokes it.

Nothing here calls Apify or an AI provider unless a deploy explicitly turns real runs on. Tests and the default configuration stay on the free path.

## What could not be read

`docs/audit_worker.md` and the worker source are in a private repository. This environment's GitHub token cannot read it, so the invoke contract below is the one this API implements. If the worker uses different field names, status values, or object keys, change `api/presence-audit.ts` (`workerPayload` and `applyWorkerStatus`) rather than the screen.

Assumptions:

- The Lambda is a container image, `arm64`, and its command is the image `CMD`. This stack does not override the handler.
- A run is one asynchronous invoke. The event is also written to `runs/{id}/input.json` before the invoke.
- The worker writes `runs/{id}/status.json` and `runs/{id}/report.pdf` in the existing audit-reports bucket. A finished PDF at that key marks the run complete even if the status file is missing.
- Status JSON may use camelCase or snake_case (`status`, `progress` / `progress_percent`, `message`, `pdf_key`, `cost_gbp` / `estimated_cost_gbp`).
- `AUDIT_WORKER_TEST_MODE=true` forces the free path (no network, sample data, no Apify or AI spend). When that variable is `false`, the worker follows the event fields `testMode` and `test_mode`.
- The brand file is inside the image. `AUDIT_BRAND_CONFIG_PATH` defaults to `brand.json`.
- API tokens are read by the worker from Secrets Manager. The ARNs are `DEEPSEEK_SECRET_ID` and `APIFY_SECRET_ID`. The secret values are not Lambda environment variables.

## Architecture

```text
Admin browser  --Cognito token in X-First-Light-Authorization-->
  CloudFront /api/admin/presence/*  --OAC SigV4-->  AdminFn
    DynamoDB items PRESENCE_RUN# and PRESENCE_SPEND
    S3 runs/{id}/input.json
    lambda:InvokeFunction (async) --> AuditWorkerFn
      S3 runs/{id}/status.json
      S3 runs/{id}/report.pdf
```

Admin routes stay on the existing `api/admin/*` behavior. Function URLs stay `AWS_IAM`. There is no new public route.

DynamoDB uses the existing table. New items are:

| PK | SK | Meaning |
| --- | --- | --- |
| `PRESENCE_RUN#{uuid}` | `META` | One audit run |
| `PRESENCE_SPEND` | `MONTH#{YYYY-MM}` | Pence reserved for real runs that month (UTC) |

`AUDIT_REPORT#` items used by the Instagram / Synology library are left alone.

Admin routes, all behind the same Cognito check as the other admin routes:

| Method | Path | Action |
| --- | --- | --- |
| `POST` | `/api/admin/presence/runs` | Create a run and invoke the worker |
| `GET` | `/api/admin/presence/runs` | List runs and the month-to-date figure |
| `GET` | `/api/admin/presence/runs/{id}` | One run, refreshed from S3 |
| `POST` | `/api/admin/presence/runs/{id}/download` | Presigned PDF URL, 5 minutes |
| `POST` | `/api/admin/presence/runs/{id}/cancel` | Cancel. A queued real run releases its estimate |
| `POST` | `/api/admin/presence/runs/{id}/retry` | Queue a failed or cancelled run again |

POST and PUT from the admin client send `x-amz-content-sha256` through the existing helper.

### Spending guard

Real runs reserve `FIRST_LIGHT_AUDIT_RUN_COST_ESTIMATE_GBP` (default £5) against `FIRST_LIGHT_AUDIT_MONTHLY_CAP_GBP` (default £50) in the same DynamoDB transaction as the run. The next real run is refused once the month total plus the next estimate would pass the cap. A run that lands exactly on the cap is allowed.

If the worker reports a cost on a finished real run, the month total is adjusted to that cost. If it never reports one, the flat estimate stays.

Test-mode runs store £0 and do not touch the counter. Cancelling a run that is still `queued` releases the estimate. Cancelling a run that is already `running` keeps it, because the worker may already have spent the money. The Presence tab shows the month-to-date total next to the cap.

Real runs also require `FIRST_LIGHT_AUDIT_WORKER_ALLOW_REAL=true` on the deploy. The checkbox in the admin cannot turn that on by itself.

## Build and push the image

Do this from a checkout of Report-Generator-FLM, on the Dockerfile named in that repo's `docs/audit_worker.md`. The commands below assume the Dockerfile is at the repository root. The image must be `linux/arm64`.

```bash
aws ecr create-repository \
  --repository-name first-light-audit-worker \
  --region eu-west-1

aws ecr get-login-password --region eu-west-1 \
  | docker login --username AWS --password-stdin ACCOUNT_ID.dkr.ecr.eu-west-1.amazonaws.com

docker buildx build \
  --platform linux/arm64 \
  -t ACCOUNT_ID.dkr.ecr.eu-west-1.amazonaws.com/first-light-audit-worker:dev \
  --push \
  .
```

The repository has to be in the same account and region as the stack, or its policy must allow this account's Lambda service to pull. This CDK app does not create the repository.

## Deploy to dev

The worker is omitted when the tag is empty, so a dev deploy without it still succeeds.

```bash
export FIRST_LIGHT_AUDIT_WORKER_IMAGE_TAG="dev"
export FIRST_LIGHT_AUDIT_WORKER_IMAGE_REPO="first-light-audit-worker"
# Leave this unset. Real mode stays off.
unset FIRST_LIGHT_AUDIT_WORKER_ALLOW_REAL

npm run deploy:dev
```

Confirm the stack outputs `AuditWorkerFunctionName` and `ApifySecretArn`. The Apify secret is created with a random placeholder, not a token. Leave it until a real run is intended. Test mode does not read it.

`STAGE=dev npx cdk synth` in `cdk/` also succeeds with the tag unset. With the tag set, the template contains `AuditWorkerFn` (`arm64`, 2048 MB, 15 minute timeout, 2048 MB ephemeral storage) and does not add a function URL for it.

Memory, timeout, and ephemeral storage can be changed without editing the stack code:

```bash
export FIRST_LIGHT_AUDIT_WORKER_MEMORY_MB="2048"
export FIRST_LIGHT_AUDIT_WORKER_TIMEOUT_MINUTES="15"
export FIRST_LIGHT_AUDIT_WORKER_EPHEMERAL_MB="2048"
```

## Free test run

1. Deploy dev with the image tag and without `FIRST_LIGHT_AUDIT_WORKER_ALLOW_REAL`.
2. Open the dev site `/admin` and sign in.
3. Open **Presence**. **Free test run** is on. Leave it on.
4. Enter a business name and an `https://` website. Social profiles are optional.
5. Choose **Start free test**. The row should move from `queued` to `running` to `completed`, the cost should stay **Free**, and the month-to-date figure should not increase.
6. **Download** returns a PDF link that expires after five minutes.

The page limit cannot be set above 35. The worker environment `AUDIT_PAGE_LIMIT` is 35 unless `FIRST_LIGHT_AUDIT_PAGE_LIMIT` sets a lower cap.

## Real runs, later

Only after a free test has produced a PDF:

```bash
export FIRST_LIGHT_AUDIT_WORKER_ALLOW_REAL="true"
aws secretsmanager put-secret-value \
  --secret-id "first-light/dev/apify-api-token" \
  --secret-string "THE_TOKEN" \
  --region eu-west-1
npm run deploy:dev
```

Put the DeepSeek key in the existing `first-light/dev/deepseek-api-key` secret the same way if the worker needs it. Do not pass either value as a CDK environment variable.

Then turn **Free test run** off for a single business. The cap still applies. Production does not get the worker until `FIRST_LIGHT_AUDIT_WORKER_IMAGE_TAG` is set on a production deploy, and it stays in test mode until `FIRST_LIGHT_AUDIT_WORKER_ALLOW_REAL=true` as well.

## Production diff

Without the image tag, `cdk diff` for `FirstLight` may update AdminFn code and its cap environment variables. It must not replace the DynamoDB table, the site bucket, the media bucket, the audit-report bucket, or the Cognito user pool, and it must not add `AuditWorkerFn`. See [DEPLOY.md](DEPLOY.md).
