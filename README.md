# First Light Marketing

SPA marketing site for freelance marketing consultancy run by Niamh Donnelly.

## Quickstart

```bash
npm install
npm run dev        # → http://localhost:5173
```

## Deploy

Deploy the dev stack before production. The full sequence, MFA enrolment, and the environment variables are in [docs/DEPLOY.md](docs/DEPLOY.md).

```bash
aws login                              # once, if this machine is not already authenticated
npx -w cdk cdk bootstrap               # once per AWS account/region
npm run deploy:dev                     # FirstLight-Dev, cloudfront.net URL, no customer email
npm run deploy                         # production stack FirstLight
```

Admin sign-in is Cognito with MFA required. There is no shared admin password. Set `FIRST_LIGHT_AUDIT_RUNNER_TOKEN` as well if the Synology report runner should be enabled.

The deployed site posts the lead form to `/api/contact`, which CloudFront routes to the Lambda function URL. The function URL itself rejects unsigned calls. No frontend `.env` value is needed for AWS hosting.

After the first production deploy, AWS SES sends a verification email to `niamh@firstlightmarketing.co.uk` if that identity is new. The contact form stores leads in DynamoDB immediately, but email delivery waits until that SES verification link has been clicked. The dev stack does not send email.

## Admin portal

The admin portal is available at `/admin` after deployment. It lets Niamh:

- view contact form submissions
- edit a homepage announcement block
- toggle that announcement live or hidden
- create, upload, download and delete audit report PDFs

Sign-in uses the Cognito hosted UI and a TOTP authenticator. See [docs/DEPLOY.md](docs/DEPLOY.md) before deploying this to production, so the existing admin user is not locked out.

## Synology report runner

The admin portal can create audit report records, while Synology runs `audit.py` locally and uploads the finished PDFs to S3. Setup notes are in [docs/synology-report-runner.md](docs/synology-report-runner.md).

For local testing against the deployed AWS API through the Vite dev proxy, set:

```bash
VITE_DEV_API_ORIGIN=https://your-cloudfront-domain.cloudfront.net
```

Then run `npm run dev`.

## Stack

| Layer | Tech |
|-------|------|
| Frontend | Vite + React + TypeScript + Tailwind |
| Routing | React Router (BrowserRouter) |
| Hosting | S3 + CloudFront (static) |
| Contact form | CloudFront `/api/contact` → IAM-only Lambda function URL (OAC) → DynamoDB + SES |
| Admin portal | CloudFront `/api/admin/*` → IAM-only Lambda function URL (OAC) → Cognito + DynamoDB |

## Adding images

Drop files into `public/logos/` and `public/images/`. The TrustedBy component has a `TODO` comment showing the `<img>` tag to uncomment.

## Domain wiring

After the CloudFront distribution is deployed, point your domain's DNS at it. If you add the domain manually in the AWS console, the next CDK deploy can remove it again. Keep `FIRST_LIGHT_DOMAIN_NAMES` and `FIRST_LIGHT_CERTIFICATE_ARN` set before every deploy so CloudFront keeps the custom domain aliases and certificate.

For a custom domain on CloudFront, the ACM certificate must be in `us-east-1`.
