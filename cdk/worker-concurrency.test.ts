import assert from "node:assert/strict";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import * as cdk from "aws-cdk-lib";
import { Template } from "aws-cdk-lib/assertions";
import { WebsiteStack } from "./lib/stack-website";

const indexPath = path.join(process.cwd(), "dist", "index.html");
if (!existsSync(indexPath)) {
  mkdirSync(path.dirname(indexPath), { recursive: true });
  writeFileSync(indexPath, "<!doctype html><title>synth</title>");
}

const ENV_KEYS = [
  "FIRST_LIGHT_AUDIT_WORKER_IMAGE",
  "FIRST_LIGHT_AUDIT_WORKER_IMAGE_TAG",
  "FIRST_LIGHT_AUDIT_WORKER_IMAGE_REPO",
  "FIRST_LIGHT_AUDIT_WORKER_RESERVED_CONCURRENCY",
  "FIRST_LIGHT_AUDIT_WORKER_ALLOW_REAL",
  "FIRST_LIGHT_DOMAIN_NAMES",
  "FIRST_LIGHT_CERTIFICATE_ARN",
] as const;

describe("audit worker concurrency synth", () => {
  it("omits reserved concurrency by default and still sets the async invoke config", () => {
    const template = synthesize({ FIRST_LIGHT_AUDIT_WORKER_IMAGE_TAG: "dev" });
    const worker = workerFunction(template);
    assert.equal(worker.Properties.ReservedConcurrentExecutions, undefined);
    template.hasResourceProperties("AWS::Lambda::EventInvokeConfig", {
      MaximumRetryAttempts: 0,
      MaximumEventAgeInSeconds: 60,
    });
  });

  it("reserves one execution when FIRST_LIGHT_AUDIT_WORKER_RESERVED_CONCURRENCY is 1", () => {
    const template = synthesize({
      FIRST_LIGHT_AUDIT_WORKER_IMAGE_TAG: "dev",
      FIRST_LIGHT_AUDIT_WORKER_RESERVED_CONCURRENCY: "1",
    });
    const worker = workerFunction(template);
    assert.equal(worker.Properties.ReservedConcurrentExecutions, 1);
    template.hasResourceProperties("AWS::Lambda::EventInvokeConfig", {
      MaximumRetryAttempts: 0,
      MaximumEventAgeInSeconds: 60,
    });
  });
});

function synthesize(env: Record<string, string>) {
  const previous = new Map<string, string | undefined>();
  for (const key of ENV_KEYS) previous.set(key, process.env[key]);
  try {
    for (const key of ENV_KEYS) delete process.env[key];
    Object.assign(process.env, env);
    const app = new cdk.App();
    const stack = new WebsiteStack(app, "FirstLight-Dev", {
      stage: "dev",
      env: { account: "000000000000", region: "eu-west-1" },
    });
    return Template.fromStack(stack);
  } finally {
    for (const [key, value] of previous) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

function workerFunction(template: Template) {
  const resources = template.findResources("AWS::Lambda::Function");
  const worker = Object.values(resources).find((resource) => {
    const variables = resource.Properties?.Environment?.Variables as Record<string, unknown> | undefined;
    return Boolean(variables && "SOCIAL_AUDIT_SECRET_ID" in variables);
  });
  assert.ok(worker, "Audit worker function was not synthesized");
  return worker;
}
