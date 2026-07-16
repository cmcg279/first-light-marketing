#!/usr/bin/env node
import * as cdk from "aws-cdk-lib";
import { WebsiteStack } from "../lib/stack-website";

const app = new cdk.App();
const stage = process.env.STAGE || "production";

new WebsiteStack(app, stage === "production" ? "FirstLight" : `FirstLight-${stage}`, {
  env: { account: process.env.CDK_DEFAULT_ACCOUNT, region: process.env.CDK_DEFAULT_REGION || "eu-west-1" },
  stage,
});
