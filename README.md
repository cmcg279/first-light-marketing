# First Light Marketing

SPA marketing site for freelance marketing consultancy run by Niamh Donnelly.

## Quickstart

```bash
npm install
npm run dev        # → http://localhost:5173
```

## Deploy

```bash
aws configure                          # once, if this machine is not already authenticated
npx -w cdk cdk bootstrap               # once per AWS account/region
export FIRST_LIGHT_ADMIN_PASSWORD="use-a-strong-password"
export FIRST_LIGHT_ADMIN_SESSION_SECRET="use-a-long-random-secret"
export FIRST_LIGHT_AUDIT_RUNNER_TOKEN="use-a-long-random-runner-token"
export FIRST_LIGHT_DOMAIN_NAMES="www.firstlightmarketing.co.uk,firstlightmarketing.co.uk"
export FIRST_LIGHT_CERTIFICATE_ARN="arn:aws:acm:us-east-1:004947744329:certificate/your-certificate-id"
npm run deploy                         # builds for AWS, deploys S3 + CloudFront + Lambda + SES + DynamoDB
```

The deployed site posts the lead form to `/api/contact`, which CloudFront routes to the Lambda Function URL. No frontend `.env` value is needed for AWS hosting.

After the first deploy, AWS SES sends a verification email to `niamh@firstlightmarketing.co.uk`. The contact form will store leads in DynamoDB immediately, but email delivery will not work until that SES verification link has been clicked.

## Admin portal

The admin portal is available at `/admin` after deployment. It lets Niamh:

- view contact form submissions
- edit a homepage announcement block
- toggle that announcement live or hidden
- create, upload, download and delete audit report PDFs

The stack will not deploy unless `FIRST_LIGHT_ADMIN_PASSWORD` and `FIRST_LIGHT_ADMIN_SESSION_SECRET` are set in your shell. Set `FIRST_LIGHT_AUDIT_RUNNER_TOKEN` as well if the Synology report runner should be enabled.

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
| Contact form | CloudFront `/api/contact` → Lambda Function URL → DynamoDB + SES |
| Admin portal | CloudFront `/api/admin/*` → Lambda Function URL → DynamoDB |

## Adding images

Drop files into `public/logos/` and `public/images/`. The TrustedBy component has a `TODO` comment showing the `<img>` tag to uncomment.

## Domain wiring

After the CloudFront distribution is deployed, point your domain's DNS at it. If you add the domain manually in the AWS console, the next CDK deploy can remove it again. Keep `FIRST_LIGHT_DOMAIN_NAMES` and `FIRST_LIGHT_CERTIFICATE_ARN` set before every deploy so CloudFront keeps the custom domain aliases and certificate.

For a custom domain on CloudFront, the ACM certificate must be in `us-east-1`.
