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

const PRODUCTION_CLOUDFRONT = "https://d2w5467qfdqefq.cloudfront.net";
const APEX = "https://firstlightmarketing.co.uk";
const WWW = "https://www.firstlightmarketing.co.uk";
const ENV_KEYS = [
  "FIRST_LIGHT_DOMAIN_NAMES",
  "FIRST_LIGHT_CERTIFICATE_ARN",
  "FIRST_LIGHT_ALLOWED_ORIGINS",
  "FIRST_LIGHT_COGNITO_CALLBACK_URLS",
  "FIRST_LIGHT_COGNITO_LOGOUT_URLS",
] as const;

describe("production CORS origins", () => {
  it("adds the production CloudFront origin and not the apex when domain names are unset", () => {
    const template = synthesize("production", {});
    const origins = allowedOriginList(template);
    assert.ok(origins.includes(PRODUCTION_CLOUDFRONT));
    assert.ok(origins.includes("http://localhost:5173"));
    assert.equal(origins.includes(APEX), false);
    assert.equal(origins.includes(WWW), false);
    const preflight = preflightFunction(template);
    assert.match(preflight, /"https:\/\/d2w5467qfdqefq\.cloudfront\.net":true/);
    assert.equal(preflight.includes(APEX), false);
    assert.match(preflight, /access-control-allow-methods/);
    assert.match(preflight, /access-control-allow-headers/);
    assert.match(preflight, /access-control-max-age/);
    assert.match(preflight, /headers\["access-control-allow-origin"\] = \{ value: origin \}/);
  });

  it("echoes the apex on preflight when production domain names are set", () => {
    const template = synthesize("production", {
      FIRST_LIGHT_DOMAIN_NAMES: "www.firstlightmarketing.co.uk,firstlightmarketing.co.uk",
      FIRST_LIGHT_CERTIFICATE_ARN: "arn:aws:acm:us-east-1:000000000000:certificate/00000000-0000-0000-0000-000000000000",
    });
    const origins = allowedOriginList(template);
    assert.ok(origins.includes(APEX));
    assert.ok(origins.includes(WWW));
    assert.ok(origins.includes(PRODUCTION_CLOUDFRONT));
    const preflight = preflightFunction(template);
    assert.match(preflight, /"https:\/\/firstlightmarketing\.co\.uk":true/);
    assert.match(preflight, /"https:\/\/www\.firstlightmarketing\.co\.uk":true/);
    const policyOrigins = corsPolicyOrigins(template);
    assert.ok(policyOrigins.includes(APEX));
    assert.ok(policyOrigins.includes(WWW));
  });

  it("does not add the production CloudFront origin on the dev stack", () => {
    const template = synthesize("dev", {});
    const origins = allowedOriginList(template);
    assert.equal(origins.includes(PRODUCTION_CLOUDFRONT), false);
    assert.equal(origins.includes(APEX), false);
    assert.ok(origins.includes("http://localhost:5173"));
  });
});

function synthesize(stage: "production" | "dev", env: Record<string, string>) {
  const previous = new Map<string, string | undefined>();
  for (const key of ENV_KEYS) previous.set(key, process.env[key]);
  try {
    for (const key of ENV_KEYS) delete process.env[key];
    Object.assign(process.env, env);
    const app = new cdk.App();
    const stack = new WebsiteStack(app, stage === "production" ? "FirstLight" : "FirstLight-Dev", {
      stage,
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

function allowedOriginList(template: Template) {
  const functions = template.findResources("AWS::Lambda::Function");
  const lists = Object.values(functions)
    .map((resource) => {
      const variables = resource.Properties?.Environment?.Variables as Record<string, unknown> | undefined;
      return variables?.ALLOWED_ORIGINS;
    })
    .filter((value): value is string => typeof value === "string");
  assert.ok(lists.length >= 2);
  assert.equal(new Set(lists).size, 1);
  return lists[0].split(",");
}

function preflightFunction(template: Template) {
  const functions = template.findResources("AWS::CloudFront::Function");
  const preflight = Object.values(functions).find((resource) => {
    const code = resource.Properties?.FunctionCode;
    return typeof code === "string" && code.includes("access-control-allow-origin");
  });
  assert.ok(preflight);
  return String(preflight.Properties.FunctionCode);
}

function corsPolicyOrigins(template: Template) {
  const policies = template.findResources("AWS::CloudFront::ResponseHeadersPolicy");
  const cors = Object.values(policies).find((resource) => resource.Properties?.ResponseHeadersPolicyConfig?.CorsConfig);
  assert.ok(cors);
  const items = cors.Properties.ResponseHeadersPolicyConfig.CorsConfig.AccessControlAllowOrigins.Items as string[];
  return items;
}
