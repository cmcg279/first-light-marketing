import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  blankNewReportDraft,
  facebookFieldError,
  newReportDraftAfterCreate,
  newReportWillUseLine,
  presenceRunCostText,
  type NewReportDraft,
} from "../src/lib/presenceReport.ts";

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

describe("new report form", () => {
  const filled: NewReportDraft = {
    company: "Genoa Cafe",
    website: "https://genoa-cafe.square.site",
    instagram: "genoacafe",
    tiktok: "genoacafe",
    facebook: "GenoaCafe",
    legalName: "Genoa Cafe Ltd",
    area: "Cork",
    service: "gelato shop",
    googleMaps: "https://www.google.com/maps/place/Genoa",
    testMode: false,
  };

  it("clears every field after a successful create and keeps them when create fails", () => {
    assert.deepEqual(newReportDraftAfterCreate(filled, false, true), filled);
    const cleared = newReportDraftAfterCreate(filled, true, true);
    assert.deepEqual(cleared, blankNewReportDraft(true));
    assert.equal(cleared.company, "");
    assert.equal(cleared.website, "");
    assert.equal(cleared.googleMaps, "");
    assert.equal(cleared.area, "");
    assert.equal(cleared.service, "");
    assert.equal(cleared.instagram, "");
    assert.equal(cleared.tiktok, "");
    assert.equal(cleared.facebook, "");
    assert.equal(cleared.legalName, "");
    assert.equal(cleared.testMode, true);
    assert.equal(blankNewReportDraft(false).testMode, false);
    assert.equal(newReportDraftAfterCreate(filled, true, false).testMode, false);
  });

  it("states the website and Maps value the run will use", () => {
    assert.equal(
      newReportWillUseLine("  https://genoa-cafe.square.site  ", "   "),
      "Website: https://genoa-cafe.square.site. Maps: No Maps link.",
    );
    assert.equal(
      newReportWillUseLine("", "ChIJN1t_tDeuEmsRUsoyG83frY4"),
      "Website: No website. Maps: ChIJN1t_tDeuEmsRUsoyG83frY4.",
    );
    assert.equal(newReportWillUseLine(" \n ", "\t"), "Website: No website. Maps: No Maps link.");
    assert.equal(
      newReportWillUseLine("https://genoa-cafe.square.site", "", "  gelato shop  "),
      "Website: https://genoa-cafe.square.site. Maps: No Maps link. Type of business: gelato shop.",
    );
    assert.equal(newReportWillUseLine("", "https://maps.google.com/?cid=1", "   "), "Website: No website. Maps: https://maps.google.com/?cid=1.");
  });
});

describe("facebook field", () => {
  it("accepts a page URL or a URL name and rejects spaces", () => {
    assert.equal(facebookFieldError(""), null);
    assert.equal(facebookFieldError("   "), null);
    assert.equal(facebookFieldError("https://www.facebook.com/VPJebb"), null);
    assert.equal(facebookFieldError("VPJebb"), null);
    assert.equal(facebookFieldError("VPJebb "), null);
    assert.equal(facebookFieldError("VPJebb\n"), null);
    assert.equal(facebookFieldError("\tVPJebb"), null);
    assert.equal(facebookFieldError("\t https://www.facebook.com/VPJebb \n"), null);
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
