#!/usr/bin/env node
import * as cdk from "aws-cdk-lib";
import { WebsiteStack } from "../lib/stack-website";

const app = new cdk.App();
const stage = (process.env.STAGE || "production").trim().toLowerCase();

new WebsiteStack(app, stackIdForStage(stage), {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION || "eu-west-1",
  },
  stage,
  description:
    stage === "production"
      ? "First Light Marketing production site"
      : `First Light Marketing ${stage} site`,
});

function stackIdForStage(stageName: string) {
  if (stageName === "production") return "FirstLight";
  if (stageName === "dev") return "FirstLight-Dev";
  return `FirstLight-${stageName}`;
}
