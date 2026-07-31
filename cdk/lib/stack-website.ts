import * as cdk from "aws-cdk-lib";
import * as acm from "aws-cdk-lib/aws-certificatemanager";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as cloudfront from "aws-cdk-lib/aws-cloudfront";
import * as origins from "aws-cdk-lib/aws-cloudfront-origins";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as cognito from "aws-cdk-lib/aws-cognito";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as nodejs from "aws-cdk-lib/aws-lambda-nodejs";
import * as iam from "aws-cdk-lib/aws-iam";
import * as s3deploy from "aws-cdk-lib/aws-s3-deployment";
import * as ses from "aws-cdk-lib/aws-ses";
import * as secretsmanager from "aws-cdk-lib/aws-secretsmanager";
import * as path from "path";
import { Construct } from "constructs";

interface WebsiteStackProps extends cdk.StackProps {
  stage: string;
}

export class WebsiteStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: WebsiteStackProps) {
    super(scope, id, props);

    const domainNames = (process.env.FIRST_LIGHT_DOMAIN_NAMES || "")
      .split(",")
      .map((domainName) => domainName.trim())
      .filter(Boolean);
    const allowedOrigins = [
      ...domainNames.map((domainName) => `https://${domainName}`),
      "https://d2w5467qfdqefq.cloudfront.net",
      "http://localhost:5173",
      "http://localhost:5174",
      ...(process.env.FIRST_LIGHT_ALLOWED_ORIGINS || "")
        .split(",")
        .map((origin) => origin.trim())
        .filter(Boolean),
    ];
    const certificateArn = process.env.FIRST_LIGHT_CERTIFICATE_ARN?.trim();
    const adminCallbackUrls = [
      ...allowedOrigins.map((origin) => `${origin}/admin`),
      ...(process.env.FIRST_LIGHT_COGNITO_CALLBACK_URLS || "")
        .split(",")
        .map((url) => url.trim())
        .filter(Boolean),
    ];
    const adminLogoutUrls = [
      ...allowedOrigins.map((origin) => `${origin}/admin`),
      ...(process.env.FIRST_LIGHT_COGNITO_LOGOUT_URLS || "")
        .split(",")
        .map((url) => url.trim())
        .filter(Boolean),
    ];
    const preferredAdminOrigin =
      allowedOrigins.find((origin) => origin === "https://www.firstlightmarketing.co.uk") ||
      allowedOrigins.find((origin) => origin.startsWith("https://www.")) ||
      allowedOrigins[0];

    // ── DynamoDB: contacts table ──
    const table = new dynamodb.Table(this, "Table", {
      partitionKey: { name: "PK", type: dynamodb.AttributeType.STRING },
      sortKey: { name: "SK", type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      pointInTimeRecoverySpecification: {
        pointInTimeRecoveryEnabled: true,
      },
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    const senderEmail = "niamh@firstlightmarketing.co.uk";
    const senderIdentity = new ses.EmailIdentity(this, "SenderIdentity", {
      identity: ses.Identity.email(senderEmail),
    });

    // ── Contact form Lambda (Function URL, no API Gateway needed) ──
    const contactFn = new nodejs.NodejsFunction(this, "ContactFn", {
      runtime: lambda.Runtime.NODEJS_20_X,
      entry: path.join(__dirname, "..", "..", "api", "contact-form.ts"),
      handler: "handler",
      environment: {
        TABLE_NAME: table.tableName,
        RECIPIENT_EMAIL: senderEmail,
        ALLOWED_ORIGINS: allowedOrigins.join(","),
      },
      timeout: cdk.Duration.seconds(10),
      memorySize: 256,
    });
    table.grantReadWriteData(contactFn);
    contactFn.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ["ses:SendEmail", "ses:SendRawEmail"],
        resources: [senderIdentity.emailIdentityArn],
        conditions: { StringEquals: { "ses:FromAddress": senderEmail } },
      })
    );

    const fnUrl = contactFn.addFunctionUrl({
      authType: lambda.FunctionUrlAuthType.NONE,
      cors: {
        allowedMethods: [lambda.HttpMethod.POST],
        allowedOrigins,
        allowedHeaders: ["Content-Type", "Accept"],
      },
    });

    // ── Cognito: admin authentication ──
    const adminUserPool = new cognito.UserPool(this, "AdminUserPool", {
      selfSignUpEnabled: false,
      signInAliases: { email: true },
      accountRecovery: cognito.AccountRecovery.EMAIL_ONLY,
      mfa: cognito.Mfa.OPTIONAL,
      mfaSecondFactor: {
        sms: false,
        otp: true,
      },
      passwordPolicy: {
        minLength: 12,
        requireDigits: true,
        requireLowercase: true,
        requireSymbols: true,
        requireUppercase: true,
      },
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    const adminUserPoolClient = new cognito.UserPoolClient(this, "AdminUserPoolClient", {
      userPool: adminUserPool,
      generateSecret: false,
      authFlows: {
        userSrp: true,
      },
      oAuth: {
        flows: {
          authorizationCodeGrant: true,
        },
        scopes: [cognito.OAuthScope.OPENID, cognito.OAuthScope.EMAIL, cognito.OAuthScope.PROFILE],
        callbackUrls: adminCallbackUrls,
        logoutUrls: adminLogoutUrls,
      },
      accessTokenValidity: cdk.Duration.hours(1),
      idTokenValidity: cdk.Duration.hours(1),
      refreshTokenValidity: cdk.Duration.days(7),
      preventUserExistenceErrors: true,
      enableTokenRevocation: true,
    });

    const cognitoDomainPrefix =
      process.env.FIRST_LIGHT_COGNITO_DOMAIN_PREFIX ||
      `first-light-marketing-${process.env.CDK_DEFAULT_ACCOUNT || "dev"}-${props.stage}`
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, "-")
        .replace(/-+/g, "-")
        .replace(/^-|-$/g, "");
    const adminUserPoolDomain = adminUserPool.addDomain("AdminUserPoolDomain", {
      cognitoDomain: {
        domainPrefix: cognitoDomainPrefix,
      },
    });

    const adminRedirectUri = `${preferredAdminOrigin}/admin`;
    const adminLogoutUri = `${preferredAdminOrigin}/admin`;
    const adminPassword = process.env.FIRST_LIGHT_ADMIN_PASSWORD || "";
    const adminSessionSecret = process.env.FIRST_LIGHT_ADMIN_SESSION_SECRET || "";
    const auditRunnerToken = process.env.FIRST_LIGHT_AUDIT_RUNNER_TOKEN || "";
    const deepseekSecret = new secretsmanager.Secret(this, "DeepseekApiKeySecret", {
      secretName: `first-light/${props.stage}/deepseek-api-key`,
      description: "DeepSeek API key reserved for First Light audit report generation",
    });
    const instagramSessionSecret = new secretsmanager.Secret(this, "InstagramSessionSecret", {
      secretName: `first-light/${props.stage}/instagram-session`,
      description: "Instaloader session file reserved for First Light audit report generation",
    });

    const adminLoginStyles = new cognito.CfnUserPoolUICustomizationAttachment(this, "AdminLoginStyles", {
      userPoolId: adminUserPool.userPoolId,
      clientId: adminUserPoolClient.userPoolClientId,
      css: `
        .background-customizable {
          background-color: #f8eadf;
        }

        .banner-customizable {
          background-color: #f85d5f;
          padding: 26px 0;
        }

        .label-customizable {
          color: #2f2a26;
          font-family: Arial, sans-serif;
          font-size: 14px;
          font-weight: 700;
        }

        .inputField-customizable {
          border: 1px solid rgba(47, 42, 38, 0.18);
          border-radius: 8px;
          color: #2f2a26;
          font-size: 16px;
          min-height: 44px;
        }

        .submitButton-customizable {
          background-color: #f85d5f;
          border: 0;
          border-radius: 999px;
          color: #fffaf4;
          font-family: Arial, sans-serif;
          font-size: 13px;
          font-weight: 800;
          letter-spacing: 0.08em;
          min-height: 44px;
          text-transform: uppercase;
        }

      `,
    });
    adminLoginStyles.node.addDependency(adminUserPoolDomain);

    // ── Admin/content Lambda ──
    const adminFn = new nodejs.NodejsFunction(this, "AdminFn", {
      runtime: lambda.Runtime.NODEJS_20_X,
      entry: path.join(__dirname, "..", "..", "api", "admin.ts"),
      handler: "handler",
      environment: {
        TABLE_NAME: table.tableName,
        ADMIN_PASSWORD: adminPassword,
        ADMIN_SESSION_SECRET: adminSessionSecret,
        ALLOWED_ORIGINS: allowedOrigins.join(","),
        COGNITO_USER_POOL_ID: adminUserPool.userPoolId,
        COGNITO_CLIENT_ID: adminUserPoolClient.userPoolClientId,
        COGNITO_DOMAIN: adminUserPoolDomain.baseUrl(),
        COGNITO_REDIRECT_URI: adminRedirectUri,
        COGNITO_LOGOUT_URI: adminLogoutUri,
        AUDIT_RUNNER_TOKEN: auditRunnerToken,
      },
      timeout: cdk.Duration.seconds(10),
      memorySize: 256,
    });
    table.grantReadWriteData(adminFn);

    const adminFnUrl = adminFn.addFunctionUrl({
      authType: lambda.FunctionUrlAuthType.NONE,
      cors: {
        allowedMethods: [
          lambda.HttpMethod.GET,
          lambda.HttpMethod.POST,
          lambda.HttpMethod.PUT,
          lambda.HttpMethod.PATCH,
          lambda.HttpMethod.DELETE,
        ],
        allowedOrigins,
        allowedHeaders: ["Content-Type", "Authorization", "Accept"],
      },
    });

    // ── S3 bucket for CMS-uploaded media ──
    const mediaBucket = new s3.Bucket(this, "MediaBucket", {
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      cors: [
        {
          allowedMethods: [s3.HttpMethods.PUT],
          allowedOrigins,
          allowedHeaders: ["Content-Type"],
          exposedHeaders: ["ETag"],
          maxAge: 300,
        },
      ],
    });
    mediaBucket.grantPut(adminFn);
    adminFn.addEnvironment("MEDIA_BUCKET_NAME", mediaBucket.bucketName);

    const auditReportsBucket = new s3.Bucket(this, "AuditReportsBucket", {
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      cors: [
        {
          allowedMethods: [s3.HttpMethods.PUT],
          allowedOrigins,
          allowedHeaders: ["Content-Type", "x-amz-server-side-encryption"],
          exposedHeaders: ["ETag"],
          maxAge: 300,
        },
      ],
    });

    auditReportsBucket.grantReadWrite(adminFn);
    adminFn.addEnvironment("AUDIT_REPORTS_BUCKET_NAME", auditReportsBucket.bucketName);
    deepseekSecret.grantWrite(adminFn);
    adminFn.addEnvironment("DEEPSEEK_SECRET_ID", deepseekSecret.secretArn);
    instagramSessionSecret.grantRead(adminFn);
    instagramSessionSecret.grantWrite(adminFn);
    adminFn.addEnvironment("INSTAGRAM_SESSION_SECRET_ID", instagramSessionSecret.secretArn);

    // ── S3 bucket for the built SPA ──
    const siteBucket = new s3.Bucket(this, "SiteBucket", {
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
    });

    // ── CloudFront ──
    const adminCachePolicy = new cloudfront.CachePolicy(this, "AdminCachePolicy", {
      comment: "Forward Authorization to the admin Lambda Function URL with near-zero caching",
      minTtl: cdk.Duration.seconds(0),
      defaultTtl: cdk.Duration.seconds(0),
      maxTtl: cdk.Duration.seconds(1),
      headerBehavior: cloudfront.CacheHeaderBehavior.allowList("Authorization"),
      queryStringBehavior: cloudfront.CacheQueryStringBehavior.all(),
      cookieBehavior: cloudfront.CacheCookieBehavior.none(),
      enableAcceptEncodingBrotli: true,
      enableAcceptEncodingGzip: true,
    });

    const adminOriginRequestPolicy = new cloudfront.OriginRequestPolicy(this, "AdminOriginRequestPolicy", {
      comment: "Forward admin auth headers to the Lambda Function URL",
      headerBehavior: cloudfront.OriginRequestHeaderBehavior.allowList(
        "Content-Type",
        "Origin",
        "Access-Control-Request-Headers",
        "Access-Control-Request-Method",
      ),
      queryStringBehavior: cloudfront.OriginRequestQueryStringBehavior.all(),
      cookieBehavior: cloudfront.OriginRequestCookieBehavior.none(),
    });

    const securityHeadersPolicy = new cloudfront.ResponseHeadersPolicy(this, "SecurityHeadersPolicy", {
      comment: "Security headers for the First Light Marketing site",
      securityHeadersBehavior: {
        strictTransportSecurity: {
          accessControlMaxAge: cdk.Duration.days(365),
          includeSubdomains: true,
          preload: true,
          override: true,
        },
        contentTypeOptions: { override: true },
        frameOptions: {
          frameOption: cloudfront.HeadersFrameOption.DENY,
          override: true,
        },
        referrerPolicy: {
          referrerPolicy: cloudfront.HeadersReferrerPolicy.STRICT_ORIGIN_WHEN_CROSS_ORIGIN,
          override: true,
        },
        xssProtection: {
          protection: true,
          modeBlock: true,
          override: true,
        },
      },
    });

    const apiCorsResponseHeadersPolicy = new cloudfront.ResponseHeadersPolicy(this, "ApiCorsSecurityHeadersPolicy", {
      comment: "Restricted CORS and security headers for First Light API routes",
      corsBehavior: {
        accessControlAllowCredentials: false,
        accessControlAllowHeaders: ["Content-Type", "Authorization", "Accept"],
        accessControlAllowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
        accessControlAllowOrigins: allowedOrigins,
        accessControlMaxAge: cdk.Duration.minutes(10),
        originOverride: true,
      },
      securityHeadersBehavior: {
        strictTransportSecurity: {
          accessControlMaxAge: cdk.Duration.days(365),
          includeSubdomains: true,
          preload: true,
          override: true,
        },
        contentTypeOptions: { override: true },
        frameOptions: {
          frameOption: cloudfront.HeadersFrameOption.DENY,
          override: true,
        },
        referrerPolicy: {
          referrerPolicy: cloudfront.HeadersReferrerPolicy.STRICT_ORIGIN_WHEN_CROSS_ORIGIN,
          override: true,
        },
        xssProtection: {
          protection: true,
          modeBlock: true,
          override: true,
        },
      },
    });

    if (domainNames.length > 0 && !certificateArn) {
      throw new Error(
        "Set FIRST_LIGHT_CERTIFICATE_ARN when FIRST_LIGHT_DOMAIN_NAMES is set."
      );
    }

    const certificate = certificateArn
      ? acm.Certificate.fromCertificateArn(this, "SiteCertificate", certificateArn)
      : undefined;

    const distribution = new cloudfront.Distribution(this, "Distribution", {
      ...(domainNames.length > 0
        ? {
            domainNames,
            certificate,
          }
        : {}),
      defaultBehavior: {
        origin: origins.S3BucketOrigin.withOriginAccessControl(siteBucket),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
        responseHeadersPolicy: securityHeadersPolicy,
      },
      additionalBehaviors: {
        "api/contact": {
          origin: new origins.HttpOrigin(cdk.Fn.select(2, cdk.Fn.split("/", fnUrl.url))),
          allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
          cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
          viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
          originRequestPolicy: cloudfront.OriginRequestPolicy.CORS_CUSTOM_ORIGIN,
          responseHeadersPolicy: apiCorsResponseHeadersPolicy,
        },
        "api/admin/*": {
          origin: new origins.HttpOrigin(cdk.Fn.select(2, cdk.Fn.split("/", adminFnUrl.url))),
          allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
          cachePolicy: adminCachePolicy,
          viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
          originRequestPolicy: adminOriginRequestPolicy,
          responseHeadersPolicy: apiCorsResponseHeadersPolicy,
        },
        "api/runner/*": {
          origin: new origins.HttpOrigin(cdk.Fn.select(2, cdk.Fn.split("/", adminFnUrl.url))),
          allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
          cachePolicy: adminCachePolicy,
          viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
          originRequestPolicy: adminOriginRequestPolicy,
          responseHeadersPolicy: apiCorsResponseHeadersPolicy,
        },
        "api/auth/config": {
          origin: new origins.HttpOrigin(cdk.Fn.select(2, cdk.Fn.split("/", adminFnUrl.url))),
          allowedMethods: cloudfront.AllowedMethods.ALLOW_GET_HEAD_OPTIONS,
          cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
          viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
          originRequestPolicy: cloudfront.OriginRequestPolicy.CORS_CUSTOM_ORIGIN,
          responseHeadersPolicy: apiCorsResponseHeadersPolicy,
        },
        "api/content": {
          origin: new origins.HttpOrigin(cdk.Fn.select(2, cdk.Fn.split("/", adminFnUrl.url))),
          allowedMethods: cloudfront.AllowedMethods.ALLOW_GET_HEAD_OPTIONS,
          cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
          viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
          originRequestPolicy: cloudfront.OriginRequestPolicy.CORS_CUSTOM_ORIGIN,
          responseHeadersPolicy: apiCorsResponseHeadersPolicy,
        },
        "api/blog": {
          origin: new origins.HttpOrigin(cdk.Fn.select(2, cdk.Fn.split("/", adminFnUrl.url))),
          allowedMethods: cloudfront.AllowedMethods.ALLOW_GET_HEAD_OPTIONS,
          cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
          viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
          originRequestPolicy: cloudfront.OriginRequestPolicy.CORS_CUSTOM_ORIGIN,
          responseHeadersPolicy: apiCorsResponseHeadersPolicy,
        },
        "api/blog/*": {
          origin: new origins.HttpOrigin(cdk.Fn.select(2, cdk.Fn.split("/", adminFnUrl.url))),
          allowedMethods: cloudfront.AllowedMethods.ALLOW_GET_HEAD_OPTIONS,
          cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
          viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
          originRequestPolicy: cloudfront.OriginRequestPolicy.CORS_CUSTOM_ORIGIN,
          responseHeadersPolicy: apiCorsResponseHeadersPolicy,
        },
        "media/*": {
          origin: origins.S3BucketOrigin.withOriginAccessControl(mediaBucket),
          allowedMethods: cloudfront.AllowedMethods.ALLOW_GET_HEAD_OPTIONS,
          cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
          viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
          responseHeadersPolicy: securityHeadersPolicy,
        },
      },
      defaultRootObject: "index.html",
      errorResponses: [
        {
          httpStatus: 403,
          responseHttpStatus: 200,
          responsePagePath: "/index.html",
          ttl: cdk.Duration.minutes(5),
        },
        {
          httpStatus: 404,
          responseHttpStatus: 200,
          responsePagePath: "/index.html",
          ttl: cdk.Duration.minutes(5),
        },
      ],
      comment: `First Light Marketing — ${props.stage}`,
    });

    new s3deploy.BucketDeployment(this, "DeployWebsite", {
      sources: [s3deploy.Source.asset(path.join(__dirname, "..", "..", "dist"))],
      destinationBucket: siteBucket,
      distribution,
      distributionPaths: ["/*"],
    });

    // ── Outputs ──
    new cdk.CfnOutput(this, "SiteUrl", { value: `https://${distribution.distributionDomainName}` });
    new cdk.CfnOutput(this, "DistributionId", { value: distribution.distributionId });
    new cdk.CfnOutput(this, "ContactFnUrl", { value: fnUrl.url });
    new cdk.CfnOutput(this, "AdminFnUrl", { value: adminFnUrl.url });
    new cdk.CfnOutput(this, "AdminUserPoolId", { value: adminUserPool.userPoolId });
    new cdk.CfnOutput(this, "AdminUserPoolClientId", { value: adminUserPoolClient.userPoolClientId });
    new cdk.CfnOutput(this, "AdminCognitoDomain", { value: adminUserPoolDomain.baseUrl() });
    new cdk.CfnOutput(this, "BucketName", { value: siteBucket.bucketName });
    new cdk.CfnOutput(this, "MediaBucketName", { value: mediaBucket.bucketName });
    new cdk.CfnOutput(this, "AuditReportsBucketName", { value: auditReportsBucket.bucketName });
    new cdk.CfnOutput(this, "DeepseekSecretArn", { value: deepseekSecret.secretArn });
    new cdk.CfnOutput(this, "InstagramSessionSecretArn", { value: instagramSessionSecret.secretArn });
  }
}
