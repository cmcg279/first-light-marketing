import * as cdk from "aws-cdk-lib";
import * as acm from "aws-cdk-lib/aws-certificatemanager";
import * as budgets from "aws-cdk-lib/aws-budgets";
import * as cloudfront from "aws-cdk-lib/aws-cloudfront";
import * as origins from "aws-cdk-lib/aws-cloudfront-origins";
import * as cloudwatch from "aws-cdk-lib/aws-cloudwatch";
import * as cwActions from "aws-cdk-lib/aws-cloudwatch-actions";
import * as cognito from "aws-cdk-lib/aws-cognito";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as iam from "aws-cdk-lib/aws-iam";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as nodejs from "aws-cdk-lib/aws-lambda-nodejs";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as s3deploy from "aws-cdk-lib/aws-s3-deployment";
import * as secretsmanager from "aws-cdk-lib/aws-secretsmanager";
import * as ses from "aws-cdk-lib/aws-ses";
import * as sns from "aws-cdk-lib/aws-sns";
import * as subscriptions from "aws-cdk-lib/aws-sns-subscriptions";
import * as ssm from "aws-cdk-lib/aws-ssm";
import * as path from "path";
import { Construct } from "constructs";

interface WebsiteStackProps extends cdk.StackProps {
  stage: string;
}

const lambdaRuntime = lambda.Runtime.NODEJS_24_X;
const localOrigins = ["http://localhost:5173", "http://localhost:5174"];
const productionCloudFrontOrigin = "https://d2w5467qfdqefq.cloudfront.net";
const senderEmail = "niamh@firstlightmarketing.co.uk";

const siteContentSecurityPolicy = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "form-action 'self'",
  "script-src 'self' https://www.tiktok.com https://*.tiktok.com",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  "connect-src 'self' https://*.amazoncognito.com https://*.s3.eu-west-1.amazonaws.com https://*.s3.amazonaws.com https://www.tiktok.com https://*.tiktok.com https://*.tiktokcdn.com https://*.tiktokcdn-us.com",
  "frame-src https://www.tiktok.com https://*.tiktok.com",
  "upgrade-insecure-requests",
].join("; ");

export class WebsiteStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: WebsiteStackProps) {
    super(scope, id, props);

    const isProduction = props.stage === "production";
    const isDev = props.stage === "dev";
    const removalPolicy = isDev ? cdk.RemovalPolicy.DESTROY : cdk.RemovalPolicy.RETAIN;
    cdk.Tags.of(this).add("FirstLightStage", props.stage);

    const alertEmail = alertEmailAddress(this);
    const extraOrigins = splitCsv(process.env.FIRST_LIGHT_ALLOWED_ORIGINS);
    // Dev never attaches the production aliases, even if those env vars are still exported.
    const domainNames = isProduction ? splitCsv(process.env.FIRST_LIGHT_DOMAIN_NAMES) : [];
    const allowedOrigins = [
      ...domainNames.map((domainName) => `https://${domainName}`),
      ...(isProduction ? [productionCloudFrontOrigin] : []),
      ...localOrigins,
      ...extraOrigins,
    ];
    const certificateArn = isProduction ? process.env.FIRST_LIGHT_CERTIFICATE_ARN?.trim() : "";
    const adminCallbackUrls = [
      ...allowedOrigins.map((origin) => `${origin}/admin`),
      ...(isProduction ? splitCsv(process.env.FIRST_LIGHT_COGNITO_CALLBACK_URLS) : []),
    ];
    const adminLogoutUrls = [
      ...allowedOrigins.map((origin) => `${origin}/admin`),
      ...(isProduction ? splitCsv(process.env.FIRST_LIGHT_COGNITO_LOGOUT_URLS) : []),
    ];
    const preferredAdminOrigin =
      allowedOrigins.find((origin) => origin === "https://www.firstlightmarketing.co.uk") ||
      allowedOrigins.find((origin) => origin.startsWith("https://www.")) ||
      allowedOrigins[0];

    const table = new dynamodb.Table(this, "Table", {
      partitionKey: { name: "PK", type: dynamodb.AttributeType.STRING },
      sortKey: { name: "SK", type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      pointInTimeRecoverySpecification: {
        pointInTimeRecoveryEnabled: !isDev,
      },
      removalPolicy,
    });

    const senderIdentity = isProduction
      ? new ses.EmailIdentity(this, "SenderIdentity", {
          identity: ses.Identity.email(senderEmail),
        })
      : undefined;

    const contactFn = new nodejs.NodejsFunction(this, "ContactFn", {
      runtime: lambdaRuntime,
      entry: path.join(__dirname, "..", "..", "api", "contact-form.ts"),
      handler: "handler",
      environment: {
        TABLE_NAME: table.tableName,
        ALLOWED_ORIGINS: allowedOrigins.join(","),
        EMAIL_ENABLED: isProduction ? "true" : "false",
        ...(isProduction ? { RECIPIENT_EMAIL: senderEmail } : {}),
      },
      timeout: cdk.Duration.seconds(10),
      memorySize: 256,
    });
    table.grantReadWriteData(contactFn);
    if (senderIdentity) {
      contactFn.addToRolePolicy(
        new iam.PolicyStatement({
          actions: ["ses:SendEmail", "ses:SendRawEmail"],
          resources: [senderIdentity.emailIdentityArn],
          conditions: { StringEquals: { "ses:FromAddress": senderEmail } },
        }),
      );
    }

    const contactFnUrl = contactFn.addFunctionUrl({
      authType: lambda.FunctionUrlAuthType.AWS_IAM,
    });

    const adminUserPool = new cognito.UserPool(this, "AdminUserPool", {
      selfSignUpEnabled: false,
      signInAliases: { email: true },
      accountRecovery: cognito.AccountRecovery.EMAIL_ONLY,
      mfa: cognito.Mfa.REQUIRED,
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
      removalPolicy,
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

    const defaultCognitoPrefix = `first-light-marketing-${process.env.CDK_DEFAULT_ACCOUNT || "dev"}-${props.stage}`
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "");
    // A shared prefix env var would collide with production. Non-production always gets its own prefix.
    const cognitoDomainPrefix = isProduction
      ? process.env.FIRST_LIGHT_COGNITO_DOMAIN_PREFIX || defaultCognitoPrefix
      : defaultCognitoPrefix;
    const adminUserPoolDomain = adminUserPool.addDomain("AdminUserPoolDomain", {
      cognitoDomain: {
        domainPrefix: cognitoDomainPrefix,
      },
    });

    const adminRedirectUri = `${preferredAdminOrigin}/admin`;
    const adminLogoutUri = `${preferredAdminOrigin}/admin`;
    const auditRunnerToken = process.env.FIRST_LIGHT_AUDIT_RUNNER_TOKEN || "";
    const cognitoClientIdParameterName = `/first-light/${props.stage}/cognito-client-id`;
    const deepseekSecret = new secretsmanager.Secret(this, "DeepseekApiKeySecret", {
      secretName: `first-light/${props.stage}/deepseek-api-key`,
      description: "DeepSeek API key reserved for First Light audit report generation",
      ...(isDev ? { removalPolicy: cdk.RemovalPolicy.DESTROY } : {}),
    });
    const instagramSessionSecret = new secretsmanager.Secret(this, "InstagramSessionSecret", {
      secretName: `first-light/${props.stage}/instagram-session`,
      description: "Instaloader session file reserved for First Light audit report generation",
      ...(isDev ? { removalPolicy: cdk.RemovalPolicy.DESTROY } : {}),
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

    if (!isProduction) {
      // The client id is published through SSM so the dev Lambda does not reference the
      // client resource. The client itself references the dev CloudFront domain below.
      new ssm.StringParameter(this, "CognitoClientIdParameter", {
        parameterName: cognitoClientIdParameterName,
        description: "Cognito app client id for the First Light admin portal",
        stringValue: adminUserPoolClient.userPoolClientId,
      });
    }

    const adminFn = new nodejs.NodejsFunction(this, "AdminFn", {
      runtime: lambdaRuntime,
      entry: path.join(__dirname, "..", "..", "api", "admin.ts"),
      handler: "handler",
      environment: {
        TABLE_NAME: table.tableName,
        ALLOWED_ORIGINS: allowedOrigins.join(","),
        COGNITO_USER_POOL_ID: adminUserPool.userPoolId,
        COGNITO_DOMAIN: adminUserPoolDomain.baseUrl(),
        COGNITO_REDIRECT_URI: adminRedirectUri,
        COGNITO_LOGOUT_URI: adminLogoutUri,
        ...(auditRunnerToken ? { AUDIT_RUNNER_TOKEN: auditRunnerToken } : {}),
        ...(isProduction
          ? { COGNITO_CLIENT_ID: adminUserPoolClient.userPoolClientId }
          : {
              COGNITO_CLIENT_ID_PARAMETER: cognitoClientIdParameterName,
              ALLOW_VIEWER_ORIGIN: "true",
            }),
      },
      timeout: cdk.Duration.seconds(10),
      memorySize: 256,
    });
    table.grantReadWriteData(adminFn);
    if (!isProduction) {
      adminFn.addToRolePolicy(
        new iam.PolicyStatement({
          actions: ["ssm:GetParameter"],
          resources: [
            `arn:${cdk.Aws.PARTITION}:ssm:${cdk.Aws.REGION}:${cdk.Aws.ACCOUNT_ID}:parameter${cognitoClientIdParameterName}`,
          ],
        }),
      );
    }

    const adminFnUrl = adminFn.addFunctionUrl({
      authType: lambda.FunctionUrlAuthType.AWS_IAM,
    });

    const mediaBucket = new s3.Bucket(this, "MediaBucket", {
      removalPolicy,
      ...(isDev ? { autoDeleteObjects: true } : {}),
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
      removalPolicy,
      ...(isDev ? { autoDeleteObjects: true } : {}),
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

    const siteBucket = new s3.Bucket(this, "SiteBucket", {
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
    });

    const alarmTopic = new sns.Topic(this, "AlarmTopic", {
      displayName: `First Light ${props.stage} alarms`,
    });
    alarmTopic.addSubscription(new subscriptions.EmailSubscription(alertEmail));
    addLambdaErrorAlarm(this, "ContactFnErrors", contactFn, alarmTopic);
    addLambdaErrorAlarm(this, "AdminFnErrors", adminFn, alarmTopic);
    addMonthlyBudget(this, props.stage, isProduction ? 50 : 10, alertEmail);

    // Authorization is intentionally absent. OAC overwrites that header with its
    // own SigV4 signature, so the app sends its bearer token in
    // X-First-Light-Authorization instead. CachingDisabled also omits it.
    const apiOriginRequestPolicy = new cloudfront.OriginRequestPolicy(this, "AdminOriginRequestPolicy", {
      comment: "Forward API headers except Authorization, which CloudFront OAC uses for SigV4",
      headerBehavior: cloudfront.OriginRequestHeaderBehavior.allowList(
        "Content-Type",
        "Accept",
        "Origin",
        "Access-Control-Request-Headers",
        "Access-Control-Request-Method",
        "X-First-Light-Authorization",
        "X-Viewer-Host",
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
        contentSecurityPolicy: {
          contentSecurityPolicy: siteContentSecurityPolicy,
          override: true,
        },
      },
      customHeadersBehavior: {
        customHeaders: [
          {
            header: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=(), payment=()",
            override: true,
          },
        ],
      },
    });

    const apiCorsResponseHeadersPolicy = new cloudfront.ResponseHeadersPolicy(this, "ApiCorsSecurityHeadersPolicy", {
      comment: "Restricted CORS and security headers for First Light API routes",
      corsBehavior: {
        accessControlAllowCredentials: false,
        accessControlAllowHeaders: [
          "Content-Type",
          "Accept",
          "X-First-Light-Authorization",
          "x-amz-content-sha256",
        ],
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

    const apiViewerRequest = new cloudfront.Function(this, "ApiViewerRequest", {
      runtime: cloudfront.FunctionRuntime.JS_2_0,
      comment: "Record the viewer host and answer API CORS preflight without calling Lambda",
      code: cloudfront.FunctionCode.fromInline(`function handler(event) {
  var request = event.request;
  var hostHeader = request.headers.host;
  if (hostHeader && hostHeader.value) {
    request.headers["x-viewer-host"] = { value: hostHeader.value };
  }
  if (request.method === "OPTIONS") {
    return {
      statusCode: 204,
      statusDescription: "No Content",
      headers: {
        "cache-control": { value: "no-store" }
      }
    };
  }
  return request;
}`),
    });

    if (domainNames.length > 0 && !certificateArn) {
      throw new Error("Set FIRST_LIGHT_CERTIFICATE_ARN when FIRST_LIGHT_DOMAIN_NAMES is set.");
    }

    const certificate = certificateArn
      ? acm.Certificate.fromCertificateArn(this, "SiteCertificate", certificateArn)
      : undefined;

    const lambdaOac = new cloudfront.FunctionUrlOriginAccessControl(this, "LambdaUrlOac", {
      description: "Sign CloudFront requests to First Light Lambda function URLs",
      signing: cloudfront.Signing.SIGV4_ALWAYS,
    });
    const contactOrigin = origins.FunctionUrlOrigin.withOriginAccessControl(contactFnUrl, {
      originAccessControl: lambdaOac,
    });
    const adminOrigin = origins.FunctionUrlOrigin.withOriginAccessControl(adminFnUrl, {
      originAccessControl: lambdaOac,
    });

    const lambdaBehavior = (
      origin: cloudfront.IOrigin,
      allowedMethods: cloudfront.AllowedMethods,
    ): cloudfront.BehaviorOptions => ({
      origin,
      allowedMethods,
      cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
      viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
      originRequestPolicy: apiOriginRequestPolicy,
      responseHeadersPolicy: apiCorsResponseHeadersPolicy,
      functionAssociations: [
        {
          function: apiViewerRequest,
          eventType: cloudfront.FunctionEventType.VIEWER_REQUEST,
        },
      ],
    });

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
        "api/contact": lambdaBehavior(contactOrigin, cloudfront.AllowedMethods.ALLOW_ALL),
        "api/admin/*": lambdaBehavior(adminOrigin, cloudfront.AllowedMethods.ALLOW_ALL),
        "api/runner/*": lambdaBehavior(adminOrigin, cloudfront.AllowedMethods.ALLOW_ALL),
        "api/auth/config": lambdaBehavior(adminOrigin, cloudfront.AllowedMethods.ALLOW_GET_HEAD_OPTIONS),
        "api/content": lambdaBehavior(adminOrigin, cloudfront.AllowedMethods.ALLOW_GET_HEAD_OPTIONS),
        "api/blog": lambdaBehavior(adminOrigin, cloudfront.AllowedMethods.ALLOW_GET_HEAD_OPTIONS),
        "api/blog/*": lambdaBehavior(adminOrigin, cloudfront.AllowedMethods.ALLOW_GET_HEAD_OPTIONS),
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

    if (!isProduction) {
      const devAdminUrl = `https://${distribution.distributionDomainName}/admin`;
      const devUrls = [...new Set([...adminCallbackUrls, devAdminUrl])];
      const cfnClient = adminUserPoolClient.node.defaultChild as cognito.CfnUserPoolClient;
      cfnClient.callbackUrLs = devUrls;
      cfnClient.logoutUrLs = devUrls;
    }

    const distributionArn = `arn:${cdk.Aws.PARTITION}:cloudfront::${cdk.Aws.ACCOUNT_ID}:distribution/${distribution.distributionId}`;
    for (const [permissionId, fn] of [
      ["ContactCloudFrontInvoke", contactFn],
      ["AdminCloudFrontInvoke", adminFn],
    ] as const) {
      fn.addPermission(permissionId, {
        principal: new iam.ServicePrincipal("cloudfront.amazonaws.com"),
        action: "lambda:InvokeFunction",
        sourceArn: distributionArn,
      });
    }

    new s3deploy.BucketDeployment(this, "DeployWebsite", {
      sources: [s3deploy.Source.asset(path.join(__dirname, "..", "..", "dist"))],
      destinationBucket: siteBucket,
      distribution,
      distributionPaths: ["/*"],
    });

    new cdk.CfnOutput(this, "SiteUrl", { value: `https://${distribution.distributionDomainName}` });
    new cdk.CfnOutput(this, "DistributionId", { value: distribution.distributionId });
    new cdk.CfnOutput(this, "ContactFnUrl", {
      value: contactFnUrl.url,
      description: "Not public. AWS_IAM via CloudFront OAC only; unsigned calls are denied.",
    });
    new cdk.CfnOutput(this, "AdminFnUrl", {
      value: adminFnUrl.url,
      description: "Not public. AWS_IAM via CloudFront OAC only; unsigned calls are denied.",
    });
    new cdk.CfnOutput(this, "AdminUserPoolId", { value: adminUserPool.userPoolId });
    new cdk.CfnOutput(this, "AdminUserPoolClientId", { value: adminUserPoolClient.userPoolClientId });
    new cdk.CfnOutput(this, "AdminCognitoDomain", { value: adminUserPoolDomain.baseUrl() });
    new cdk.CfnOutput(this, "BucketName", { value: siteBucket.bucketName });
    new cdk.CfnOutput(this, "MediaBucketName", { value: mediaBucket.bucketName });
    new cdk.CfnOutput(this, "AuditReportsBucketName", { value: auditReportsBucket.bucketName });
    new cdk.CfnOutput(this, "DeepseekSecretArn", { value: deepseekSecret.secretArn });
    new cdk.CfnOutput(this, "InstagramSessionSecretArn", { value: instagramSessionSecret.secretArn });
    new cdk.CfnOutput(this, "AlertEmail", { value: alertEmail });
  }
}

function splitCsv(value: string | undefined) {
  return (value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function alertEmailAddress(scope: Construct) {
  const fromEnv = process.env.FIRST_LIGHT_ALERT_EMAIL?.trim();
  if (fromEnv) return fromEnv;
  const fromContext = scope.node.tryGetContext("alertEmail");
  if (typeof fromContext === "string" && fromContext.trim()) return fromContext.trim();
  return senderEmail;
}

function addLambdaErrorAlarm(stack: cdk.Stack, id: string, fn: lambda.Function, topic: sns.ITopic) {
  const alarm = new cloudwatch.Alarm(stack, id, {
    alarmDescription: `${fn.node.id} reported at least one error in five minutes`,
    metric: fn.metricErrors({
      period: cdk.Duration.minutes(5),
      statistic: "Sum",
    }),
    threshold: 1,
    evaluationPeriods: 1,
    datapointsToAlarm: 1,
    comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
    treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
  });
  alarm.addAlarmAction(new cwActions.SnsAction(topic));
}

function addMonthlyBudget(stack: cdk.Stack, stage: string, amountGbp: number, alertEmail: string) {
  const subscribers = [{ subscriptionType: "EMAIL", address: alertEmail }];
  new budgets.CfnBudget(stack, "MonthlyBudget", {
    budget: {
      budgetName: `first-light-${stage}-monthly`,
      budgetType: "COST",
      timeUnit: "MONTHLY",
      budgetLimit: { amount: amountGbp, unit: "GBP" },
      costFilters: {
        TagKeyValue: [`user:FirstLightStage$${stage}`],
      },
    },
    notificationsWithSubscribers: [
      {
        notification: {
          notificationType: "ACTUAL",
          comparisonOperator: "GREATER_THAN",
          threshold: 100,
          thresholdType: "PERCENTAGE",
        },
        subscribers,
      },
      {
        notification: {
          notificationType: "FORECASTED",
          comparisonOperator: "GREATER_THAN",
          threshold: 100,
          thresholdType: "PERCENTAGE",
        },
        subscribers,
      },
    ],
  });
}
