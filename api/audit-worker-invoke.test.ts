import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import * as cdk from "aws-cdk-lib";
import { Template } from "aws-cdk-lib/assertions";
import * as ecr from "aws-cdk-lib/aws-ecr";
import * as lambda from "aws-cdk-lib/aws-lambda";

test("audit worker async invoke does not retry and discards a throttled event after one minute", () => {
  const source = readFileSync(new URL("../cdk/lib/stack-website.ts", import.meta.url), "utf8");
  assert.match(
    source,
    /const auditWorkerAsyncInvoke = \{\s*retryAttempts: 0,\s*maxEventAge: cdk\.Duration\.minutes\(1\),\s*\};/,
  );
  assert.match(source, /new lambda\.DockerImageFunction\(stack, "AuditWorkerFn"/);
  assert.match(source, /\.\.\.auditWorkerAsyncInvoke/);

  const app = new cdk.App();
  const stack = new cdk.Stack(app, "Probe");
  const repository = ecr.Repository.fromRepositoryName(stack, "Repo", "first-light-audit-worker");
  new lambda.DockerImageFunction(stack, "AuditWorkerFn", {
    code: lambda.DockerImageCode.fromEcr(repository, { tagOrDigest: "dev" }),
    retryAttempts: 0,
    maxEventAge: cdk.Duration.minutes(1),
  });

  Template.fromStack(stack).hasResourceProperties("AWS::Lambda::EventInvokeConfig", {
    MaximumRetryAttempts: 0,
    MaximumEventAgeInSeconds: 60,
  });
});

test("social audit secret is generated once instead of a fixed empty string", () => {
  const source = readFileSync(new URL("../cdk/lib/stack-website.ts", import.meta.url), "utf8");
  assert.match(source, /new secretsmanager\.Secret\(stack, "SocialAuditSecret"/);
  assert.match(source, /generateSecretString:\s*\{/);
  assert.match(source, /APIFY_TOKEN: ""/);
  assert.match(source, /GOOGLE_API_KEY: ""/);
  assert.match(source, /OPENAI_API_KEY: ""/);
  assert.match(source, /GEMINI_API_KEY: ""/);
  assert.match(source, /generateStringKey: "cdkGenerated"/);
  assert.doesNotMatch(source, /secretStringValue:/);
  assert.match(source, /removalPolicy: props\.isDev \? cdk\.RemovalPolicy\.DESTROY : cdk\.RemovalPolicy\.RETAIN/);
});
