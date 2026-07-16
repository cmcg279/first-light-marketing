# First Light Marketing

SPA marketing site for freelance marketing consultancy run by Niamh Donnelly.

## Quickstart

```bash
npm install
npm run dev        # → http://localhost:5173
```

## Deploy

```bash
npm run build                          # builds to dist/
npx -w cdk cdk bootstrap               # once per AWS account
npm run deploy                         # CDK deploys S3 + CloudFront + Lambda
```

Get the Lambda Function URL from the CDK output (`ContactFnUrl`), set it as `VITE_API_URL` in `.env`, rebuild, and re-upload `dist/` to S3.

## Stack

| Layer | Tech |
|-------|------|
| Frontend | Vite + React + TypeScript + Tailwind |
| Routing | React Router (HashRouter) |
| Hosting | S3 + CloudFront (static) |
| Contact form | Lambda Function URL → DynamoDB + SES |

## Adding images

Drop files into `public/logos/` and `public/images/`. The TrustedBy component has a `TODO` comment showing the `<img>` tag to uncomment.

## Domain wiring

After the CloudFront distribution is deployed, point your domain's DNS at it. Add an ACM certificate + Route 53 alias record.
