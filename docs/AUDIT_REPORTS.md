# Online presence audits

Niamh starts these from the admin **Reports** tab. That tab is the online-presence audit. The older Instagram report library stays in the admin source behind `SHOW_LEGACY_AUDIT_REPORTS` in `src/pages/Admin.tsx` (left `false`, so it is not rendered). Its API routes, DynamoDB items, and bucket objects are unchanged. The public site is unchanged. The worker is the container image from [Report-Generator-FLM](https://github.com/cmcg279/Report-Generator-FLM) (`social_audit.job.handler`). This stack does not build that image. It invokes it.

Nothing here calls Apify or an AI provider unless a deploy explicitly turns real runs on. Tests and the default configuration stay on the free path.

The site and the worker share one job shape. `api/presence-audit.ts` checks that shape with the same rules as the worker's `validate_job` before it invokes. Unknown fields are rejected, so the form cannot send a field the worker would refuse.

## Job the worker accepts

Top-level keys only: `schema`, `run_id`, `business_id`, `requested_by`, `kind`, `company`, `website`, `handles`, `brand`, `options`, `test_mode`.

| Field | What this API sends |
| --- | --- |
| `schema` | `1` |
| `run_id` | 26-character ULID |
| `business_id` | Slug from the company, `^[a-z0-9-]{2,60}$`, unless the request already sends a valid slug |
| `requested_by` | `admin:` plus the verified Cognito email or username, at most 200 characters. Falls back to `admin` |
| `kind` | `admin` |
| `company` | Required, at most 120 characters |
| `website` | Optional. When set, an `https://` URL. No credentials, no IP address, no `localhost`, no host without a dot, no `.local` / `.internal` / `.localhost`, port empty or 443, length at most 300. Omitted from the worker job when blank. A run with no website must include a Google Maps link or at least one social handle. The worker must accept a missing `website` ([Report-Generator-FLM#24](https://github.com/cmcg279/Report-Generator-FLM/pull/24)) before the site sends a run without one |
| `handles` | Optional `instagram`, `tiktok`, and `facebook` only. LinkedIn, YouTube, and X are rejected. Facebook is a page URL such as `https://www.facebook.com/VPJebb`, or the name from that URL. Surrounding spaces, tabs, and newlines are trimmed. A space that remains, or an invisible character (U+200B–U+200D, U+2060, U+180E, U+FEFF), is rejected by the Reports form before submit, and the API returns 422 with the same message |
| `brand` | `first_light`. `BRAND_IDS` in `api/presence-audit.ts` (`first_light`, `example_brand`) must stay the same as the `brands:` entries in the worker's `social_audit/brands.yaml` |
| `options` | Optional legal name (`business`, ≤200), area (`competitors.area`, ≤60), `google_maps` (≤500), and on retry `compare_to_run_id` of the previous run. `google_maps` is an https Maps URL, a place ID that starts with `ChIJ` or `GhIJ`, or a numeric CID of 10 to 22 digits. Allow-listed hosts, with or without `www.`, are `google.com`, `google.co.uk`, `google.ie`, `google.fr`, `google.de`, `google.es`, `google.it`, `google.nl`, `google.be`, `google.ca`, `google.com.au`, `google.co.nz`, `google.pt`, `google.se`, `google.dk`, `google.no`, `google.fi`, `google.ch`, `google.at`, `google.pl`, `google.co.za`, and `google.co.in`, and the path must start with `/maps`. `maps.google.com` and `maps.app.goo.gl` are allowed on any path. `goo.gl` must start with `/maps`. Other country hosts such as `google.com.br` are rejected. The value may contain only letters, digits, and URL characters, so spaces, quotes, and unencoded non-ASCII are rejected. It is omitted when blank. The site checks the host and the shape only and does not fetch the link. These are the same rules as the worker's `parse_maps_input` in [Report-Generator-FLM#24](https://github.com/cmcg279/Report-Generator-FLM/pull/24) (worker max 600 characters). That worker must be live before a run sends `google_maps` |
| `test_mode` | The free-test checkbox |

`run_id` is always a valid ULID and `business_id` is always a valid slug, so a worker-side `bad_input` still writes the status row. The invoke is asynchronous (`InvocationType` `Event`). AdminFn reads the status code, `FunctionError`, and any body. An empty event body is normal. A `bad_input` or failed body is applied immediately. A non-202 result marks the run failed and releases its reservation. A run that stays queued or running for more than 16 minutes is marked failed with `timeout` and its reservation is released.

`AuditWorkerFn` has an event invoke config of zero retries and a one-minute maximum event age. Lambda does not retry a throttled or crashed run, and it does not hold the event for hours. The row shows failed, and the way to try again is to start a new run. A throttled invoke is dropped after that minute without a callback, so the portal keeps showing the run as queued until the 16-minute timeout marks it failed and releases the reservation.

## Where the worker reads and writes

```text
Admin browser  --Cognito token in X-First-Light-Authorization-->
  CloudFront /api/admin/presence/*  --OAC SigV4-->  AdminFn
    DynamoDB BIZ#<business_id> / RUN#<run_id>
    DynamoDB PRESENCE_SPEND / MONTH#YYYY-MM
    lambda:InvokeFunction (async) --> AuditWorkerFn
      S3 runs/<business_id>/<run_id>/report.pdf
      S3 runs/<business_id>/<run_id>/snapshot.json
      S3 runs/<business_id>/<run_id>/result.json
      DynamoDB status row (UpdateItem)
```

Admin routes stay on the existing `api/admin/*` behavior. Function URLs stay `AWS_IAM`. There is no new public route. POST and PUT from the admin client send `x-amz-content-sha256` through the existing helper.

The worker's environment, set only when the image tag is present:

| Variable | Value |
| --- | --- |
| `AUDIT_REPORTS_BUCKET_NAME` | Existing audit-reports bucket |
| `AUDIT_REPORTS_PREFIX` | Empty |
| `AUDIT_TABLE_NAME` | Existing table |
| `SOCIAL_AUDIT_SECRET_ID` | ARN of the JSON secret below |
| `SOCIAL_AUDIT_TEST_MODE` | `1` unless `FIRST_LIGHT_AUDIT_WORKER_ALLOW_REAL` is exactly `true`. It is omitted in that case, never set to the string `false` |

The worker does not get the DeepSeek secret. AdminFn still uses that secret for the existing Instagram settings.

### Status rows

The worker writes `PK=BIZ#<business_id>`, `SK=RUN#<run_id>`, `GSI1PK=RUNS`, `GSI1SK=<started_at>#<run_id>`. The list reads that index. It does not scan the table.

`GSI1` (partition `GSI1PK`, sort `GSI1SK`, projection `ALL`) is added on the existing table. That is an in-place index update. It does not replace the table, and it is created even when the worker image is unset so the list can query it later.

Portal bookkeeping on the same item (`flReservedCents`, `flCostSource`, `flTracked`, and the other `fl*` fields) survives the worker's `UpdateItem`, which sets its own attributes and does not remove these.

The month counter is a separate item, `PK=PRESENCE_SPEND`, `SK=MONTH#YYYY-MM`, attribute `amountCents`. The worker cannot write it. `AUDIT_REPORT#` items used by the Instagram / Synology library are left alone.

### Objects

| Key | When |
| --- | --- |
| `runs/<business_id>/<run_id>/result.json` | Succeeded and needs-review runs. Failures live on the DynamoDB row |
| `runs/<business_id>/<run_id>/report.pdf` | Succeeded and needs-review runs |
| `runs/<business_id>/<run_id>/snapshot.json` | History for the next comparison |

A PDF on its own does not complete a run. Download is offered when the status is `succeeded` or `needs_review` and that exact PDF key exists. `needs_review` is not labelled Completed. The Reports row shows an amber banner, "Needs review - check before sending to a client", then the readiness message and the raw `qualityFailures` check codes. The button is labelled "Download (needs review)". There is no extra confirm dialog. `failed`, `cancelled`, `queued`, and `running` stay unavailable.

### States

| Worker status | What the tab shows |
| --- | --- |
| `succeeded` | Completed. Download is available once the PDF is there |
| `needs_review` | Needs review. Includes `quality_gate.failures` such as `too_many_pages` (more than 35 pages). Not a completed report. The PDF can be downloaded, with the amber banner above |
| `failed` | Failed. `website_unreachable`, `bad_input`, `timeout`, `internal` |
| `cancelled` | Cancelled. Includes `social_required` |
| `running` / `queued` | Running or Queued, until the 16-minute limit |

### Cost, and an optional cap

This is an internal tool. Production does not stop a run because of a monthly budget. `FIRST_LIGHT_AUDIT_MONTHLY_CAP_USD` unset or `0` means AdminFn enforces no cap and holds no per-run reservation, so there is no "cap reached" refusal. The CDK default is `0`, which is what production uses. Dev can export a positive amount (for example `65`) and then each real run reserves `FIRST_LIGHT_AUDIT_RUN_COST_ESTIMATE_USD` (default `$6`, AdminFn `AUDIT_RUN_COST_ESTIMATE_USD`). A new real run is refused only in that case, when the month total plus the next estimate would pass the cap. Landing exactly on the cap is allowed. There is no pound conversion.

Either way the worker's `cost_usd.total` is stored on the run (`flCostUsd`). The Reports table shows that recorded total once the run has finished. A queued or running row shows an em dash, not the reservation. A finished run with no recorded cost also shows an em dash. `needs_review` is not a failure: a reported cost is stored. When a cap is on, a failed, timed-out, or cancelled run with no reported cost releases the flat estimate, and stopping tracking does the same. Test runs reserve `$0`.

Spend is watched with the stack's existing AWS Budget (`first-light-<stage>-monthly`), not by refusing runs in the portal. Production alerts at $65 and dev at $13, on actual spend at 80% and 100% and on the forecast at 100%, filtered to the `FirstLightStage` tag. This change does not add another budget.

Real runs also require `FIRST_LIGHT_AUDIT_WORKER_ALLOW_REAL=true` on the deploy. The checkbox in the admin cannot turn that on by itself. While it is unset, the worker itself has `SOCIAL_AUDIT_TEST_MODE=1`, so a bad event still cannot call Apify or an AI provider.

### Cancel

The worker has no cancel. **Stop tracking** sets `flTracked=false` and releases the reservation immediately, including while a real job is still running. It does not write a cancel file and it does not overwrite the worker's status. The tab says tracking stopped and that spend may already be committed. Until `result.json` arrives, that run is not in the month total, so the cap can be understated. If the worker later reports `cost_usd`, that actual cost replaces the released estimate. Stopping tracking does **not** release the one-run lock. The worker may still be executing, and with reserved concurrency unset that lock is the only one-at-a-time guard. Another audit is refused until the worker's row is terminal (`succeeded`, `needs_review`, `failed`, or `cancelled`) or 16 minutes have passed.

### One run at a time

A new real or test run is refused while another is still queued or running, including one whose tracking was stopped and whose worker may still be going. The API returns `A run is already in progress.` and the Reports tab shows that sentence. Submit stays enabled; the refusal comes from the API. A queued or running run older than 16 minutes, tracked or not, is marked failed with `timeout`, and any held reservation is released, before that check. It does not block the next run.

The race control is a conditional put of `PK=LOCK#presence-audit`, `SK=LOCK`, allowed when the item is missing, its `expiresAt` is in the past, or the holder is the same run. `expiresAt` is 16 minutes after the run is accepted. The table has no DynamoDB TTL attribute. The lock does not need one: there is a single lock item, a finished run deletes it, and a later put overwrites it once `expiresAt` is past. TTL deletion can lag, and adding it would show up on the production table even when the worker image is unset. The lock is deleted when a read sees a terminal row, including a row the worker wrote itself (`succeeded`, `needs_review`, or `failed`) before the portal had changed it. Before taking the lock, a new run also reads the holder's row and releases the lock when that run is already terminal or past the 16-minute timeout. The timeout uses the same path that marks the run failed and releases its reservation. Stopping tracking does not delete the lock.

The portal used to release the lock only when it wrote a status change. The worker writes the terminal status straight onto the `BIZ#` / `RUN#` row, so that path never ran and the next start stayed refused until `expiresAt`. Listing, fetching, or starting a run now releases the lock for every terminal row it sees.

Open runs are read from `GSI1`, which is eventually consistent, so two creates in the same moment can both miss a row that was just written. The lock condition is what stops the second insert. A holder read uses that same index, so a terminal status that has not reached the index yet keeps the lock until a later read sees it or `expiresAt` passes. AdminFn already has read and write on the table. The worker's `UpdateItem` is limited to keys starting with `BIZ#`, so it cannot write the lock.

Retry creates a new ULID and sets `options.compare_to_run_id` to the previous run. It does not reuse the run id.

### IAM

The worker role can `s3:GetObject` and `s3:PutObject` on `runs/*`, and `s3:ListBucket` with prefix `runs/` and `runs/*`. It can `secretsmanager:GetSecretValue` on the one JSON secret, and `dynamodb:UpdateItem` on the table only when the leading key matches `BIZ#*`. It cannot delete objects, abort uploads, or read the spend counter. AdminFn can invoke it.

Reserved concurrency is off unless `FIRST_LIGHT_AUDIT_WORKER_RESERVED_CONCURRENCY` is `1` or `2`. This account's Lambda concurrent-executions quota is 10, and Lambda keeps 10 unreserved, so reserving 1 fails with "decreases account's UnreservedConcurrentExecution below its minimum value of [10]". The default is unset. `none` and `unset` leave the property off. A value of `0` is also off: it does not mean "reserve zero" and it does not set `ReservedConcurrentExecutions`. Dev and production can deploy today. After the quota is raised to 100 or more, export `FIRST_LIGHT_AUDIT_WORKER_RESERVED_CONCURRENCY=1` and redeploy. That caps the worker at one execution. `2` is the maximum.

## Admin routes

All of these use the same Cognito check as the other admin routes.

| Method | Path | Action |
| --- | --- | --- |
| `POST` | `/api/admin/presence/runs` | Create a run and invoke the worker |
| `GET` | `/api/admin/presence/runs` | List runs from `GSI1`. The response still includes the month counter; Reports does not show it |
| `GET` | `/api/admin/presence/runs/{id}` | One run, refreshed from the status row and `result.json` |
| `POST` | `/api/admin/presence/runs/{id}/download` | Presigned PDF URL, 5 minutes, for `succeeded` and `needs_review` runs whose PDF key matches and the object exists. Other statuses, a mismatched key, or a missing object return 409 |
| `POST` | `/api/admin/presence/runs/{id}/cancel` | Stop tracking and release the reservation. The one-run lock stays until a terminal result or 16 minutes |
| `POST` | `/api/admin/presence/runs/{id}/retry` | New run for a failed, cancelled, or needs-review audit |

## Build and push the image

Do this from a checkout of Report-Generator-FLM. The Dockerfile uses `public.ecr.aws/lambda/python:3.12`, builds fonts (the build needs network), and sets `CMD ["social_audit.job.handler"]`. This stack does not override that command. The image and the function are both arm64.

```bash
aws ecr create-repository \
  --repository-name first-light-audit-worker \
  --region eu-west-1

aws ecr get-login-password --region eu-west-1 \
  | docker login --username AWS --password-stdin ACCOUNT_ID.dkr.ecr.eu-west-1.amazonaws.com

docker buildx build \
  --platform linux/arm64 \
  --build-arg GIT_SHA="$(git rev-parse --short HEAD)" \
  -t ACCOUNT_ID.dkr.ecr.eu-west-1.amazonaws.com/first-light-audit-worker:dev \
  --push \
  .
```

The repository has to be in the same account and region as the stack, or its policy must allow this account's Lambda service to pull. This CDK app does not create the repository.

## Deploy to dev

The worker, its role, and the social-audit secret are omitted when the tag is empty, so a dev deploy without it still succeeds. The GSI is still added.

```bash
export FIRST_LIGHT_AUDIT_WORKER_IMAGE_TAG="dev"
export FIRST_LIGHT_AUDIT_WORKER_IMAGE_REPO="first-light-audit-worker"
# Optional. Unset or 0 means no cap. A positive value, such as 65, reserves the estimate below.
export FIRST_LIGHT_AUDIT_MONTHLY_CAP_USD="65"
export FIRST_LIGHT_AUDIT_RUN_COST_ESTIMATE_USD="6"
# Leave this unset. Real mode stays off and the worker gets SOCIAL_AUDIT_TEST_MODE=1.
unset FIRST_LIGHT_AUDIT_WORKER_ALLOW_REAL

npm run deploy:dev
```

Confirm the stack outputs `AuditWorkerFunctionName` and `SocialAuditSecretArn`. The secret `first-light/<stage>/social-audit` uses `GenerateSecretString`. The template JSON has empty `APIFY_TOKEN`, `GOOGLE_API_KEY`, `OPENAI_API_KEY`, and `GEMINI_API_KEY`, plus a generated `cdkGenerated` field the worker ignores. CloudFormation writes that value when the secret is created. A later deploy does not write it again unless that generate block changes, so tokens entered afterwards stay. Do not edit the generate block after the secret exists: a change creates a new secret version. Production retains the secret on stack delete. Test mode does not read it. Do not put those values in a Lambda environment variable.

`STAGE=dev npx cdk synth` in `cdk/` also succeeds with the tag unset. With the tag set, the template contains `AuditWorkerFn` (arm64, 2048 MB, 15 minute timeout, 512 MB ephemeral storage, no reserved concurrency unless the variable below is `1` or `2`) and does not add a function URL for it.

```bash
export FIRST_LIGHT_AUDIT_WORKER_MEMORY_MB="2048"
export FIRST_LIGHT_AUDIT_WORKER_TIMEOUT_MINUTES="15"
export FIRST_LIGHT_AUDIT_WORKER_EPHEMERAL_MB="512"
# Leave unset until the Lambda concurrent-executions quota is 100 or more.
# export FIRST_LIGHT_AUDIT_WORKER_RESERVED_CONCURRENCY="1"
```

## Free test run

1. Deploy dev with the image tag and without `FIRST_LIGHT_AUDIT_WORKER_ALLOW_REAL`.
2. Open the dev site `/admin` and sign in.
3. Open **Reports**. **Free test run** is on. Leave it on.
4. Enter a company. A website is optional. With no website, add a Google Maps link or a social handle. If you set a website, it must be `https://`. Instagram and TikTok are optional. Facebook, if set, is a page URL such as `https://www.facebook.com/VPJebb` or the name from that URL, with no spaces. The API returns 422 for a Facebook value that contains spaces.
5. Choose **Start free test**. The row should move from Queued to Running to Completed. The cost column stays an em dash until the run finishes.
6. **Download** returns a PDF link that expires after five minutes. The PDF is sample data.

The page count is a worker quality gate (`too_many_pages` above 35). It is not an input and it is not an environment variable.

## Real runs, later

Only after a free test has produced a PDF:

```bash
export FIRST_LIGHT_AUDIT_WORKER_ALLOW_REAL="true"
aws secretsmanager put-secret-value \
  --secret-id "first-light/dev/social-audit" \
  --secret-string '{"APIFY_TOKEN":"THE_TOKEN","GOOGLE_API_KEY":"","OPENAI_API_KEY":"","GEMINI_API_KEY":""}' \
  --region eu-west-1
npm run deploy:dev
```

That replaces the generated placeholder. The following deploy does not put the empty template back while the generate block in the stack is unchanged. The deploy also omits `SOCIAL_AUDIT_TEST_MODE`, so the checkbox controls `test_mode` on each event. Do not pass token values as CDK environment variables. The DeepSeek secret used by Instagram settings is separate and is not read by this worker.

Then turn **Free test run** off for a single company. With the cap unset, the run is not refused for spend, and the cost column fills in from `cost_usd` when the run finishes. Set `FIRST_LIGHT_AUDIT_MONTHLY_CAP_USD` only if this dev stack should refuse a real run that would pass that amount. Production does not get the worker until `FIRST_LIGHT_AUDIT_WORKER_IMAGE_TAG` is set on a production deploy, leaves the monthly cap unset, and the worker stays in forced test mode until `FIRST_LIGHT_AUDIT_WORKER_ALLOW_REAL=true` as well. Account spend is the AWS Budget alert, not a check in the Reports tab.

## Production diff

Without the image tag, `cdk diff` for `FirstLight` may update AdminFn code. `AUDIT_MONTHLY_CAP_USD` is `0` unless `FIRST_LIGHT_AUDIT_MONTHLY_CAP_USD` is set, which means the portal does not stop runs for spend. The diff adds `GSI1` on the existing table. It must not replace the DynamoDB table, the site bucket, the media bucket, the audit-report bucket, or the Cognito user pool, and it must not add `AuditWorkerFn` or `SocialAuditSecret`. See [DEPLOY.md](DEPLOY.md).
