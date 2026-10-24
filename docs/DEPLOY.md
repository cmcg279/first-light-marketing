# Deploying First Light

Deploy the dev stack first, test it on its `cloudfront.net` address, then deploy production. Do not put secrets in git. `.env` is gitignored. Pass tokens only as shell environment variables for the command that runs `cdk deploy`.

The CDK app is in `cdk/`. Production is the stack `FirstLight` in `eu-west-1`. Dev is a second stack, `FirstLight-Dev`, in the same account and region. Each stack has its own Cognito pool, DynamoDB table, buckets, and CloudFront distribution.

## One-time setup

```bash
aws login   # or your usual AWS SSO / credential flow
npx -w cdk cdk bootstrap aws://ACCOUNT_ID/eu-west-1
```

Bootstrap once per account and region. No AWS credentials are required to run `cdk synth`.

## Environment

Production domain settings, when you use the custom domain:

```bash
export FIRST_LIGHT_DOMAIN_NAMES="www.firstlightmarketing.co.uk,firstlightmarketing.co.uk"
export FIRST_LIGHT_CERTIFICATE_ARN="arn:aws:acm:us-east-1:ACCOUNT:certificate/certificate-id"
```

The certificate must be in `us-east-1`. Keep both variables set for every production deploy so CloudFront does not drop the aliases.

Optional:

```bash
export FIRST_LIGHT_ALERT_EMAIL="niamh@firstlightmarketing.co.uk"   # default is cdk.json context alertEmail
export FIRST_LIGHT_COGNITO_DOMAIN_PREFIX="existing-production-prefix"  # production only
export FIRST_LIGHT_AUDIT_RUNNER_TOKEN="$(openssl rand -hex 32)"    # only if the Synology runner is used
```

`FIRST_LIGHT_ADMIN_PASSWORD` and `FIRST_LIGHT_ADMIN_SESSION_SECRET` are no longer read. Admin sign-in is Cognito only.

Dev ignores `FIRST_LIGHT_DOMAIN_NAMES`, `FIRST_LIGHT_CERTIFICATE_ARN`, and `FIRST_LIGHT_COGNITO_DOMAIN_PREFIX`, so a shell that still has the production values cannot attach the live domain or reuse the production Cognito prefix.

## Dev first

```bash
npm ci
npm run deploy:dev
```

That builds the site and deploys `FirstLight-Dev`. The stack output `SiteUrl` is the `https://….cloudfront.net` address. There is no custom domain.

Dev is safe to throw away:

- removal policy `DESTROY` on the table, media bucket, audit-report bucket, user pool, and secrets
- the site bucket also deletes its objects
- no SES identity is created, and the contact Lambda has `EMAIL_ENABLED=false`, so a form submission is stored and does not email anyone
- its own Cognito pool, with MFA required

Create the dev admin user in the Cognito console (self sign-up is off). Use an email address you control, mark the email verified, and set a temporary password. Open `https://….cloudfront.net/admin`, choose **Sign in securely**, set a permanent password, and enrol an authenticator app when Cognito asks. Confirm:

- the marketing pages load
- the contact form returns success and a row appears in the dev table
- no email arrives
- `/admin` works with the authenticator code
- a direct call to the `ContactFnUrl` or `AdminFnUrl` output, without AWS SigV4, returns 403

Destroy dev when you are finished with it:

```bash
cd cdk && STAGE=dev npx cdk destroy FirstLight-Dev
```

Do not run `cdk destroy` without `STAGE=dev`. The default stage is production.

## Production

Deploy production only after the dev checks above, and only when Niamh can complete MFA enrolment in the same sitting.

```bash
export FIRST_LIGHT_DOMAIN_NAMES="www.firstlightmarketing.co.uk,firstlightmarketing.co.uk"
export FIRST_LIGHT_CERTIFICATE_ARN="arn:aws:acm:us-east-1:ACCOUNT:certificate/certificate-id"
export FIRST_LIGHT_AUDIT_RUNNER_TOKEN="the-existing-runner-token"
npm run deploy
```

`npm run deploy` is production (`STAGE` defaults to `production`, stack `FirstLight`). Review `cd cdk && npx cdk diff` first.

### Before this production deploy

1. Confirm the current site still signs Niamh in through **Sign in securely** (Cognito), not a shared password. The password API is removed by this deploy.
2. Have an authenticator app ready (the one she will keep).
3. Deploy, then open `/admin` and sign in. The pool now requires TOTP. Managed login should show a QR code on the first sign-in if a device is not enrolled yet. Scan it and enter the code before closing the page.
4. If sign-in fails with an error that software token MFA is not set up, and no QR code is shown: in the Cognito console, set that user pool's MFA back to **Optional**, sign in, enrol the authenticator, then set MFA to **Required** again. The next `cdk deploy` also sets MFA to required, so enrol before that deploy.
5. Confirm a contact-form submission still saves and emails `niamh@firstlightmarketing.co.uk`. SES stays in sandbox until the account is moved out of it. The existing verified sender is unchanged.
6. Confirm the SNS alarm email (one subscription covers both Lambda error alarms) and, after the cost-allocation tag is active, the budget emails. AWS will not deliver them until the subscription links in those emails are confirmed.

### Synology runner

CloudFront signs requests to the Lambdas and replaces the `Authorization` header. The runner must send the token in `X-First-Light-Authorization` and, on any request with a body, `x-amz-content-sha256` set to the hex SHA-256 of the exact body bytes. `scripts/synology_report_runner.py` does this.

Update the copy on the NAS **after** the production deploy. Updating it earlier makes the old API reject the runner, because the old API only reads `Authorization`. The token value itself does not need to change.

### Budget tag

Each stack's budget (£50/month production, £10/month dev) counts only resources tagged `FirstLightStage`. In Billing → Cost allocation tags, activate `FirstLightStage`. Tags can take up to 24 hours to show spend. Until then the filtered budget stays at £0 and will not alert.

## What the security changes do

- Lambda function URLs use `AWS_IAM`. CloudFront Origin Access Control signs every origin request. The internet can call `/api/...` on the site domain. A direct call to the function URL is denied.
- POST, PUT, PATCH, and DELETE through CloudFront must send `x-amz-content-sha256` (the SHA-256 of the body). The site and the Synology script do this. GET does not need it.
- The browser sends the Cognito access token in `X-First-Light-Authorization`, not `Authorization`.
- Admin passwords and the old signed-session secret are not stored on the Lambda.
- Lambdas run Node.js 24, the current Lambda LTS. Handlers are already `async`.
- CloudFront adds HSTS, nosniff, frame denial, a referrer policy, and a Content-Security-Policy that allows the site, Cognito, S3 uploads, and the TikTok embed. `style-src` allows inline styles because the page and the TikTok embed use them. Scripts are limited to this site and TikTok.

## CloudTrail

CloudTrail is not in the stack. The first management-event trail in an account is free, but the S3 log store still costs a small amount, and a second management trail is about $2 per 100,000 events. Data events cost more. Leaving it out avoids paying for a duplicate trail if the account already has one.

## Alarms and budgets

Two standard CloudWatch alarms per stack (Lambda errors, five-minute period). The first ten alarms in an account are free; after that each is about $0.10/month. SNS email to confirm the alarm is inside the free tier at this volume.

The first two AWS Budgets in an account are free. Each budget after that is about $0.02/day. Dev plus production is two budgets.

## Production resources this change must not replace

Stateful production resources keep their CloudFormation logical IDs: the DynamoDB table, the site bucket, the media bucket, the audit-report bucket, and the Cognito user pool. A normal production deploy updates Lambdas, the function URL auth type, the distribution, and the user pool MFA setting in place. It does not create a second table, bucket, or user pool.

The site bucket was already set to delete with the stack. That is unchanged. The table, media bucket, audit-report bucket, and user pool stay `RETAIN` in production.
