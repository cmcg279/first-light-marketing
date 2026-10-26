import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { facebookFieldError, presenceRunCostText } from "../src/lib/presenceReport.ts";

describe("reports cost column", () => {
  it("shows an em dash while a run is queued or running, even when an estimate is held", () => {
    assert.equal(presenceRunCostText({ status: "queued", costUsd: undefined }), "—");
    assert.equal(presenceRunCostText({ status: "running", costUsd: 6 }), "—");
  });

  it("shows the recorded cost once the run has finished", () => {
    assert.equal(presenceRunCostText({ status: "succeeded", costUsd: 1.25 }), "$1.25");
    assert.equal(presenceRunCostText({ status: "needs_review", costUsd: 4 }), "$4.00");
    assert.equal(presenceRunCostText({ status: "failed", costUsd: 0 }), "$0.00");
  });

  it("shows an em dash for a finished run that has no recorded cost", () => {
    assert.equal(presenceRunCostText({ status: "failed" }), "—");
    assert.equal(presenceRunCostText({ status: "cancelled" }), "—");
    assert.equal(presenceRunCostText({ status: "succeeded" }), "—");
  });
});

describe("facebook field", () => {
  it("accepts a page URL or a URL name and rejects spaces", () => {
    assert.equal(facebookFieldError(""), null);
    assert.equal(facebookFieldError("   "), null);
    assert.equal(facebookFieldError("https://www.facebook.com/VPJebb"), null);
    assert.equal(facebookFieldError("VPJebb"), null);
    const spaced = facebookFieldError("Harbour Cafe");
    assert.match(spaced || "", /no spaces/);
    assert.match(spaced || "", /facebook\.com\/VPJebb/);
    assert.match(facebookFieldError("https://www.facebook.com/VP Jebb") || "", /no spaces/);
    assert.match(facebookFieldError("VP\u200bJebb") || "", /no spaces/);
    assert.match(facebookFieldError("\ufeffVPJebb") || "", /facebook\.com\/VPJebb/);
    assert.match(facebookFieldError("https://www.facebook.com/VPJebb\u200b") || "", /no spaces/);
    assert.match(facebookFieldError("VPJebb\ufeff") || "", /no spaces/);
  });
});
