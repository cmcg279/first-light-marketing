# Deploying First Light

Deploy the dev stack first, test it on its `cloudfront.net` address, then deploy production in the phases below. Do not put secrets in git. `.env` is gitignored. Pass tokens only as shell environment variables for the command that runs `cdk deploy`.

The CDK app is in `cdk/`. Production is the stack `FirstLight` in `eu-west-1`. Dev is a second stack, `FirstLight-Dev`, in the same account and region. Each stack has its own Cognito pool, DynamoDB table, buckets, and CloudFront distribution.

`npm run deploy` and `npm run deploy:dev` ask for approval when a change broadens IAM (`--require-approval broadening`).

## One-time setup

```bash
aws login   # or your usual AWS SSO / credential flow
npx -w cdk cdk bootstrap aws://ACCOUNT_ID/eu-west-1
```

Bootstrap once per account and region. No AWS credentials are required to run `cdk synth`.

## Environment

Check what is already exported before a deploy. A leftover `FIRST_LIGHT_MFA=required` or `FIRST_LIGHT_LAMBDA_RUNTIME=nodejs24.x` would turn on the later phases early.

```bash
env | grep FIRST_LIGHT || true
```

### Domain and certificate (production)

```bash
export FIRST_LIGHT_DOMAIN_NAMES="www.firstlightmarketing.co.uk,firstlightmarketing.co.uk"
export FIRST_LIGHT_CERTIFICATE_ARN="arn:aws:acm:us-east-1:ACCOUNT:certificate/certificate-id"
```

The certificate must be in `us-east-1`. Keep both variables set for every production deploy so CloudFront does not drop the aliases. Dev ignores both, so a shell that still has them cannot attach the live domain to `FirstLight-Dev`.

### Cognito domain prefix (production)

The hosted UI hostname is `https://PREFIX.auth.eu-west-1.amazoncognito.com`. `PREFIX` is the existing production value. Export it on every production deploy:

```bash
export FIRST_LIGHT_COGNITO_DOMAIN_PREFIX="the-prefix-already-on-the-live-pool"
```

If this is unset, the stack uses `first-light-marketing-<account id>-production`. If that string is not the live prefix, CloudFormation replaces the user pool domain and the current sign-in URL stops working. `cdk diff` must show no change to `AdminUserPoolDomain` before you deploy. Dev ignores this variable and always gets its own prefix, so it cannot take the production hostname.

### Callback URLs, logout URLs, and allowed origins

Production callback and logout URLs are `${origin}/admin` for each allowed origin, plus any extras below. Allowed origins are:

- `https://` plus each name in `FIRST_LIGHT_DOMAIN_NAMES`
- `https://d2w5467qfdqefq.cloudfront.net`
- `http://localhost:5173` and `http://localhost:5174`
- each origin in `FIRST_LIGHT_ALLOWED_ORIGINS` (comma-separated)

```bash
# Only if the live app client already has callback or logout URLs that are not in the list above.
export FIRST_LIGHT_COGNITO_CALLBACK_URLS="https://extra.example/admin"
export FIRST_LIGHT_COGNITO_LOGOUT_URLS="https://extra.example/admin"

# Adds CORS origins and, on production, callback and logout URLs. Leave unset unless those
# origins are already on the live client. A new origin changes the client.
export FIRST_LIGHT_ALLOWED_ORIGINS=""
```

Dev does not use the production domain list, the production CloudFront URL, or the callback/logout extra variables. Its client allows localhost plus `https://<its own distribution domain>/admin`. The dev API also accepts an `https://*.cloudfront.net` browser origin so sign-in on the dev distribution works.

### Other settings

```bash
export FIRST_LIGHT_ALERT_EMAIL="niamh@firstlightmarketing.co.uk"   # default is cdk.json context alertEmail
export FIRST_LIGHT_AUDIT_RUNNER_TOKEN="the-existing-runner-token"  # required on production if the runner is already enabled
```

`FIRST_LIGHT_ADMIN_PASSWORD` and `FIRST_LIGHT_ADMIN_SESSION_SECRET` are no longer read. Admin sign-in is Cognito only.

### Online presence audits (optional)

Leave these unset for a normal production deploy. The audit worker, its role, and the social-audit JSON secret are created only when an image tag is set. Without that tag the stack does not gain a Lambda. The table, buckets, and user pool are not replaced. The existing table does gain `GSI1` (`GSI1PK` / `GSI1SK`) so presence runs can be listed without a scan. That index update is in place. The table does not gain a TTL attribute. The presence-audit lock is one item, and the next conditional put treats it as free once `expiresAt` is in the past, so DynamoDB TTL is not required. Leaving TTL off keeps that change out of the production diff, including a deploy with no worker image.

Production does not set a monthly cap, so the portal does not reserve money or refuse a run for spend. `FIRST_LIGHT_AUDIT_MONTHLY_CAP_USD` unset or `0` is that mode, and it is the CDK default (`AUDIT_MONTHLY_CAP_USD=0` on AdminFn). Each finished run still stores the worker's `cost_usd`. Dev can export a positive cap when a stack should refuse a real run that would pass it. The one-run lock and the reserved-concurrency setting are unchanged. Account spend is watched by the existing AWS Budget alert (see Alarms and budgets), not by stopping runs in Reports. Reset that month's presence spend counter before turning a cap back on in a month that already has one: amounts left from an earlier reservation stay in the counter when the cap goes from `0` to a positive value.

```bash
export FIRST_LIGHT_AUDIT_WORKER_IMAGE_TAG=""          # empty skips the worker
export FIRST_LIGHT_AUDIT_WORKER_IMAGE_REPO="first-light-audit-worker"
# Leave the monthly cap unset in production. Dev may set a positive amount, for example 65.
# export FIRST_LIGHT_AUDIT_MONTHLY_CAP_USD="65"
export FIRST_LIGHT_AUDIT_RUN_COST_ESTIMATE_USD="6"    # used only when a cap above 0 is set
# Leave reserved concurrency unset. See AUDIT_REPORTS.md.
```

Do not export `FIRST_LIGHT_AUDIT_WORKER_ALLOW_REAL=true` until a dev test run has been checked. Real mode is off unless that value is exactly `true`. While it is off, the worker gets `SOCIAL_AUDIT_TEST_MODE=1`. Dev and production both default the worker to free test mode. The full build, push, and dev test steps are in [AUDIT_REPORTS.md](AUDIT_REPORTS.md). Do not put an Apify token or an AI key in the environment. The worker secret is one JSON object (`APIFY_TOKEN`, `GOOGLE_API_KEY`, `OPENAI_API_KEY`, `GEMINI_API_KEY`) created with `GenerateSecretString` when the image tag is set. A later stack update does not reset values entered in Secrets Manager unless that generate block changes. Production retains the secret.

The Reports form can send `options.google_maps`: an https Maps URL whose host matches the worker's Google host pattern (path `/maps`; `maps.google.com` any path; `maps.app.goo.gl` any path; `goo.gl/maps`), or a place ID (starts `ChIJ` or `GhIJ`) or a numeric CID of 10 to 22 digits. The host is the lowercased raw authority and is not stripped of a trailing dot, so `www.google.com.` is rejected. The value must begin with exactly `https://` and a non-delimiter, the authority must not contain `%`, and `/maps` is required on the raw path. The value may contain only letters, digits, and URL characters. The site does not parse the link with `new URL()` before these checks. The site caps it at 500 characters and does not fetch the link. [Report-Generator-FLM#24](https://github.com/cmcg279/Report-Generator-FLM/pull/24) `parse_maps_input` accepts the same shapes up to 600 characters, and it also accepts a job with no `website`. The worker rejects unknown option keys, and an older worker still requires `website`. Ship that worker before this site sends `options.google_maps` or a run with no website. Until it is live, leave the Google Maps field blank and keep a website on every run. Downloading a `needs_review` PDF does not depend on that worker change.

This account's Lambda concurrent-executions quota is 10. Lambda keeps 10 unreserved, so `ReservedConcurrentExecutions: 1` fails the deploy with "decreases account's UnreservedConcurrentExecution below its minimum value of [10]". The same failure would hit production. `FIRST_LIGHT_AUDIT_WORKER_RESERVED_CONCURRENCY` therefore defaults to unset. `none` and `unset` do the same. A value of `0` is also off: it does not reserve zero executions, and the property is omitted. The function is created with no reserved concurrency. After the quota is raised to 100 or more, turn it back on and redeploy:

```bash
export FIRST_LIGHT_AUDIT_WORKER_RESERVED_CONCURRENCY="1"
```

`2` is the highest value this stack accepts.

MFA and the Lambda runtime have their own switches. Leave them unset for the first production deploy. `cdk.json` defaults are `mfa=optional` and `lambdaRuntime=nodejs20.x`. The environment variable wins when it is set.

```bash
export FIRST_LIGHT_MFA="optional"                  # phase 2 only: required
export FIRST_LIGHT_LAMBDA_RUNTIME="nodejs20.x"     # later deploy only: nodejs24.x
```

## Safe order

Presence reports that include a Google Maps link, or that omit `website`, depend on [Report-Generator-FLM#24](https://github.com/cmcg279/Report-Generator-FLM/pull/24). Deploy that worker image before this site sends `options.google_maps` or a run with no website. Until then, leave the Google Maps field blank and keep a website on every run. A filled-in link against a worker that does not know the key fails the job, and a missing website fails on a worker that still requires one. `needs_review` PDF download is site-only and can ship with this change.

1. Deploy dev and run the tests in the next section, including the MFA enrolment test.
2. Back up the production DynamoDB table. Point-in-time recovery is already on. Take an on-demand backup as well. The table name is the `TableName` output of `FirstLight`, or:

   ```bash
   aws cloudformation describe-stack-resource \
     --stack-name FirstLight \
     --logical-resource-id TableCD117FA1 \
     --region eu-west-1 \
     --query 'StackResourceDetail.PhysicalResourceId' \
     --output text
   aws dynamodb create-backup \
     --table-name "THAT_TABLE_NAME" \
     --backup-name "first-light-before-phase-1" \
     --region eu-west-1
   ```

3. Run `cdk diff` against the live production stack. See the diff section below. Do not deploy if the user pool domain or app client changes.
4. Phase 1, off-hours, with MFA left optional and the Lambda runtime left on Node.js 20. Expect a few minutes of HTTP 403s on `/api/...` while CloudFront publishes the new behavior.
5. Phase 2, later, while both admins are on a call. Set `FIRST_LIGHT_MFA=required` and enrol one user at a time.
6. Update the Synology script only after phase 1 is working. Do not wait for phase 2, and do not update the NAS before phase 1.
7. Node.js 24 is a further deploy of its own, after a dev smoke test. Do not combine it with phase 1 or phase 2.

## Dev first

```bash
unset FIRST_LIGHT_MFA FIRST_LIGHT_LAMBDA_RUNTIME
npm ci
npm run deploy:dev
```

That builds the site and deploys `FirstLight-Dev` with MFA optional and Node.js 20. The stack output `SiteUrl` is the `https://….cloudfront.net` address. There is no custom domain. The outputs `MfaMode` and `LambdaRuntime` should be `optional` and `nodejs20.x`.

Dev is safe to throw away:

- removal policy `DESTROY` on the table, media bucket, audit-report bucket, user pool, and secrets
- the site bucket also deletes its objects
- no SES identity is created, and the contact Lambda has `EMAIL_ENABLED=false`, so a form submission is stored and does not email anyone
- its own Cognito pool

Create the dev admin user in the Cognito console (self sign-up is off). Use an email address you control, mark the email verified, and set a temporary password. With MFA still optional, **Sign in securely** asks for the password and does not offer an authenticator. That is expected. The hosted UI does not enrol TOTP while MFA is optional.

Confirm:

- the marketing pages load, including a refresh on `/about` and `/blog`. A blog post slug must not contain a dot: the CloudFront SPA function treats a path with a dot as a file and leaves it unchanged, so S3 returns 403. Dashes work (`my-post`), dots do not (`my.post`)
- the contact form returns success and a row appears in the dev table
- no email arrives
- `/admin` signs in with the password only
- a direct call to the `ContactFnUrl` or `AdminFnUrl` output, without AWS SigV4, returns 403
- the POST checks below: no hash is 403, a matching hash is JSON from the API
- an `OPTIONS` preflight from `http://localhost:5173` returns 204 with `access-control-allow-origin`

### POST body hash

CloudFront signs the request to Lambda. For POST and PUT, the viewer must send `x-amz-content-sha256` set to the hex SHA-256 of the exact body bytes. That header is not forwarded through the origin request policy. CloudFront rejects `x-amz-content-sha256` on an allow-list, and Origin Access Control uses the viewer-supplied value when it signs the request to the Lambda function URL. The site and the Synology script still send it, and CORS still allows it. GET does not need it.

Replace `SITE` with the dev `SiteUrl` (no trailing slash).

```bash
# No hash. Expect 403 and x-amzn-errortype: InvalidSignatureException.
# The body must stay JSON, not the site homepage.
curl -sS -D - -o /tmp/no-hash.txt -X POST "$SITE/api/contact" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json" \
  --data '{"name":"Test"}'
head -n 20 /tmp/no-hash.txt

# Matching hash, incomplete lead. Expect 422 JSON
# {"error":"Please complete the required form fields."}
# That is the Lambda, not a signature error and not index.html.
# Use the contact form itself when you want a saved row.
BODY='{"name":"Dev Test"}'
HASH=$(printf '%s' "$BODY" | sha256sum | awk '{print $1}')
curl -sS -D - -o /tmp/with-hash.txt -X POST "$SITE/api/contact" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json" \
  -H "x-amz-content-sha256: $HASH" \
  --data "$BODY"

# Same pair against an admin route. No hash: 403 signature error.
# Matching hash and no login: 401 JSON {"error":"Please log in again."}
curl -sS -D - -o /dev/null -X POST "$SITE/api/admin/uploads" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json" \
  --data '{}'
ADMIN_BODY='{}'
ADMIN_HASH=$(printf '%s' "$ADMIN_BODY" | sha256sum | awk '{print $1}')
curl -sS -D - -X POST "$SITE/api/admin/uploads" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json" \
  -H "x-amz-content-sha256: $ADMIN_HASH" \
  --data "$ADMIN_BODY"
```

A wrong hash, or a hash of different bytes than `--data` sent, fails the same way as a missing hash.

### CORS preflight

Same-origin calls from the site do not send a preflight. A browser on another origin does, because of the custom headers. The `OPTIONS` response is generated by a CloudFront Function. CloudFront does not apply the response headers policy to that generated response, so the function adds the CORS headers itself.

```bash
curl -sS -D - -o /dev/null -X OPTIONS "$SITE/api/contact" \
  -H "Origin: http://localhost:5173" \
  -H "Access-Control-Request-Method: POST" \
  -H "Access-Control-Request-Headers: content-type,x-amz-content-sha256,x-first-light-authorization"
```

Expect 204, `access-control-allow-origin: http://localhost:5173`, and an allow-headers value that includes `x-amz-content-sha256`. Repeat with `Origin: https://evil.example`. That response must not echo the evil origin. The function always sends `access-control-allow-methods`, `access-control-allow-headers`, and `access-control-max-age`. It sets `access-control-allow-origin` only when the request `Origin` is in the allowed-origins list. Production adds `https://` plus each `FIRST_LIGHT_DOMAIN_NAMES` entry, and `https://d2w5467qfdqefq.cloudfront.net`, to that list. With the production domain export, a preflight from `https://firstlightmarketing.co.uk` or `https://www.firstlightmarketing.co.uk` gets `access-control-allow-origin` echoed back. A synth that leaves `FIRST_LIGHT_DOMAIN_NAMES` unset does not include the apex, so that preflight omits `access-control-allow-origin`.

### MFA enrolment on dev, including abandoning it

Do this on dev before phase 2. It is a second dev deploy.

```bash
export FIRST_LIGHT_MFA=required
npm run deploy:dev
```

`MfaMode` should be `required`. Create a fresh dev user (verified email, temporary password). Open `/admin`, choose **Sign in securely**, set the permanent password, and stop when the QR code is on screen. Close the tab without entering a code.

Sign in again as that same user. The QR code must appear again. An unverified token is not a device, so the second visit has to offer setup. If the second sign-in is an error and there is no QR code, stop. Do not flip production. Delete that dev user and create another one, then repeat. That recreate path is the production recovery below. Only continue when both of these work: abandoning the QR page, and a brand new user getting a QR code while MFA is required.

Then enrol one dev user fully, create a second dev user, and enrol that one next. One at a time, which is how phase 2 will go.

Destroy dev when you are finished with it:

```bash
cd cdk && STAGE=dev npx cdk destroy FirstLight-Dev
```

Do not run `cdk destroy` without `STAGE=dev`. The default stage is production.

## Production diff

Use the same environment you will deploy with. For phase 1 that means MFA optional (or unset), Lambda runtime unset or `nodejs20.x`, the live domain names, the live certificate, the live Cognito prefix, and the existing runner token. Do not export a new allowed origin.

```bash
cd cdk && npx cdk diff FirstLight
```

Read the diff before approving anything. All of the following must be true:

- `AWS::Cognito::UserPoolDomain` (`AdminUserPoolDomain`) shows no change. The domain prefix is the same.
- `AWS::Cognito::UserPoolClient` shows no change. Callback URLs, logout URLs, and the client id stay as they are. If the diff adds or removes a URL, fix the environment variables above and run the diff again. Do not deploy a client change in phase 1.
- The DynamoDB table, site bucket, media bucket, audit-report bucket, and user pool are not replaced. A replacement shows the resource being destroyed and created again.
- With `FIRST_LIGHT_AUDIT_WORKER_IMAGE_TAG` unset, there is no `AuditWorkerFn`, no `SocialAuditSecret`, and no new bucket. AdminFn may show `AUDIT_MONTHLY_CAP_USD` as `0` (no portal cap, no per-run reservation) and `AUDIT_RUN_COST_ESTIMATE_USD` as `6` (used only if a later deploy sets the cap above 0). The existing table may gain `GSI1`. That is an in-place index update, not a new table and not a replacement. The table should not gain `TimeToLiveSpecification`. The presence lock does not use DynamoDB TTL.

Phase 1 may still change Lambda code, function URL auth, the distribution, headers, and alarms. Those are in place. Phase 2's diff should be the user pool MFA setting moving from optional to required, and nothing else.

## Phase 1

Off-hours. Niamh does not need an authenticator for this deploy. MFA stays optional, so this deploy does not lock her out.

```bash
unset FIRST_LIGHT_MFA FIRST_LIGHT_LAMBDA_RUNTIME
export FIRST_LIGHT_DOMAIN_NAMES="www.firstlightmarketing.co.uk,firstlightmarketing.co.uk"
export FIRST_LIGHT_CERTIFICATE_ARN="arn:aws:acm:us-east-1:ACCOUNT:certificate/certificate-id"
export FIRST_LIGHT_COGNITO_DOMAIN_PREFIX="the-prefix-already-on-the-live-pool"
export FIRST_LIGHT_AUDIT_RUNNER_TOKEN="the-existing-runner-token"
npm run deploy
```

`npm run deploy` is production (`STAGE` defaults to `production`, stack `FirstLight`). While CloudFront publishes, `/api/contact` and `/api/admin/...` can return 403 for a few minutes. Retry after the distribution status is Deployed. A direct function-URL call stays 403. A POST through the site domain with the hash header should then be JSON.

After it settles:

- marketing pages and a refresh on `/about` still load
- the contact form saves and emails `niamh@firstlightmarketing.co.uk` (SES sandbox is unchanged)
- `/admin` still signs in with the password and does not ask for a code
- run the POST with-hash and without-hash checks against the production site
- confirm the SNS alarm email. One subscription covers both Lambda error alarms. AWS will not deliver alarms until that link is confirmed
- activate the `FirstLightStage` cost-allocation tag (Billing → Cost allocation tags). The budget stays at £0 until the tag shows spend, which can take 24 hours. Then confirm the budget email

### Synology runner

Update the copy of `scripts/synology_report_runner.py` on the NAS after phase 1 is working, and not before. The old API only reads `Authorization`. The token value does not need to change. If `FIRST_LIGHT_AUDIT_RUNNER_TOKEN` was empty during the deploy, the runner endpoints return 503 until you deploy again with the existing token.

## Phase 2

Do this only after the dev enrolment test, including the abandoned QR code, succeeded. Both admins should be on a call. Deploy, then enrol one user before the other starts.

```bash
export FIRST_LIGHT_MFA=required
cd cdk && npx cdk diff FirstLight
npm run deploy
```

The diff should be the MFA setting and not a new user pool. Open `/admin` and sign in. With MFA required and no verified authenticator, sign-in should show a QR code. Scan it and enter the code before closing the page. Then the other admin does the same.

### If someone is locked out

Setting the pool back to optional does not fix enrolment. While MFA is optional the hosted UI never offers a QR code, so they can sign in and still have no device. The next required deploy locks them out again.

Recovery, which you should have already practised on dev:

1. Leave MFA required.
2. In the Cognito console for this pool, create a replacement user with the same email, mark the email verified, and set a temporary password. Do this before deleting the stuck user.
3. Sign in as the new user at `/admin`. The QR code has to appear. Complete it.
4. Disable or delete the stuck user once the new one has signed in with a code.
5. If a new user also gets no QR code, stop and do not keep redeploying. That means this hosted UI did not issue the setup challenge. The dev test is there to catch that before production.

Abandoning the QR page on production is the same case as on dev: sign in again, and the QR code should be back. If it is not, delete that user and create them again. Do not switch the pool to optional to "finish" enrolment.

## Node.js 24, as its own deploy

Phase 1 and phase 2 stay on Node.js 20, which is the runtime already in production. Node.js 24 is the current Lambda LTS and the handlers are already `async`, but it is a separate change.

Smoke-test it on dev first, on its own deploy, after the dev stack is up:

```bash
export FIRST_LIGHT_LAMBDA_RUNTIME=nodejs24.x
npm run deploy:dev
```

Sign in, submit the contact form, and call one admin API. If that fails, set the runtime back to `nodejs20.x` and deploy dev again. Production gets Node.js 24 only after that smoke test, in a deploy that does not also change MFA or the function URL auth:

```bash
export FIRST_LIGHT_LAMBDA_RUNTIME=nodejs24.x
cd cdk && npx cdk diff FirstLight
npm run deploy
```

The diff should be the Contact and Admin function runtimes, not a new function or a new table.

## What the security changes do

- Lambda function URLs use `AWS_IAM`. CloudFront Origin Access Control signs every origin request. The internet can call `/api/...` on the site domain. A direct call to the function URL is denied.
- POST and PUT through CloudFront must send `x-amz-content-sha256`. It is not forwarded through the origin request policy. CloudFront uses the viewer-supplied value when Origin Access Control signs the request to the Lambda function URL. The site and the Synology script send it. GET does not need it.
- The browser sends the Cognito access token in `X-First-Light-Authorization`, not `Authorization`.
- Admin passwords and the old signed-session secret are not stored on the Lambda.
- Extensionless site routes are rewritten to `/index.html` by a CloudFront Function on the site behavior. API 403 and 404 responses are no longer replaced with the homepage. The admin client rejects any API response that is not JSON.
- `OPTIONS` for `/api/...` is answered at the edge, with CORS headers on that generated response.
- CloudFront adds HSTS, nosniff, frame denial, a referrer policy, and a Content-Security-Policy. `script-src` and `style-src` allow `https://*.ttwstatic.com` for the TikTok embed. `style-src` also allows inline styles and `https://*.tiktokcdn.com`.

## CloudTrail

CloudTrail is not in the stack. The first management-event trail in an account is free, but the S3 log store still costs a small amount, and a second management trail is about $2 per 100,000 events. Data events cost more. Leaving it out avoids paying for a duplicate trail if the account already has one.

## Alarms and budgets

Two standard CloudWatch alarms per stack (Lambda errors, five-minute period). The first ten alarms in an account are free; after that each is about $0.10/month. SNS email to confirm the alarm is inside the free tier at this volume.

The first two AWS Budgets in an account are free. Each budget after that is about $0.02/day. Dev plus production is two budgets. This account only accepts USD, so production is $65/month and dev is $13/month (about £50 and £10), filtered to the `FirstLightStage` tag. Alerts fire on actual spend at 80% and 100%, and on the forecast at 100%. That email is how spend is watched. The Reports tab does not stop a run when the budget is crossed. The portal cap stays off unless `FIRST_LIGHT_AUDIT_MONTHLY_CAP_USD` is set above 0.

## Production resources this change must not replace

Stateful production resources keep their CloudFormation logical IDs: the DynamoDB table, the site bucket, the media bucket, the audit-report bucket, and the Cognito user pool. Phase 1 updates Lambdas, the function URL auth type, and the distribution in place. It does not create a second table, bucket, or user pool. With the default settings it also does not change MFA or the Node.js 20 runtime.

The site bucket was already set to delete with the stack. That is unchanged. The table, media bucket, audit-report bucket, and user pool stay `RETAIN` in production.
