import { LegalPage } from "../components/LegalPage";
import { Seo } from "../components/Seo";
import { CONTACT } from "../content/site";

export default function CookiePolicy() {
  return (
    <>
      <Seo
        title="Cookie Policy"
        description="Information about cookies and similar technologies used by the First Light Marketing website."
        path="/cookies"
      />
      <LegalPage
        eyebrow="Legal"
        title="Cookie Policy"
        description="How this website uses cookies, local storage and similar technologies."
      >
        <p>Last updated: 20 July 2026</p>

        <h2>Current cookie use</h2>
        <p>
          The public website does not currently use analytics, advertising
          pixels or non-essential tracking cookies.
        </p>

        <h2>Essential storage</h2>
        <p>
          The admin portal may use browser local storage to keep an admin session
          token after login. This is used only to keep the admin portal working
          and is not used for advertising or analytics.
        </p>

        <h2>Third-party content</h2>
        <p>
          If the website links to or embeds third-party services such as
          Substack, TikTok or other platforms, those services may use their own
          cookies or tracking technologies. Their own privacy and cookie policies
          apply when you interact with them.
        </p>

        <h2>Future analytics or advertising</h2>
        <p>
          If analytics, advertising pixels or other non-essential cookies are
          added later, this policy should be updated and visitors should be given
          appropriate cookie choices before those technologies are used.
        </p>

        <h2>Questions</h2>
        <p>
          For questions about cookies on this website, contact{" "}
          <a href={`mailto:${CONTACT.email}`}>{CONTACT.email}</a>.
        </p>
      </LegalPage>
    </>
  );
}
