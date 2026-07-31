import { LegalPage } from "../components/LegalPage";
import { Seo } from "../components/Seo";
import { BRAND, CONTACT } from "../content/site";

export default function Terms() {
  return (
    <>
      <Seo
        title="Website Terms"
        description="Basic website terms for using the First Light Marketing website."
        path="/terms"
      />
      <LegalPage
        eyebrow="Legal"
        title="Website Terms"
        description="The basic terms for using this website and its content."
      >
        <p>Last updated: 20 July 2026</p>

        <h2>About these terms</h2>
        <p>
          These terms apply to your use of the {BRAND.name} website. By using
          this website, you agree to use it lawfully and respectfully.
        </p>

        <h2>Website content</h2>
        <p>
          The content on this website is provided for general information about
          First Light Marketing's services, work and approach. It is not a
          guarantee of specific marketing, sales or business results.
        </p>

        <h2>Intellectual property</h2>
        <p>
          Unless stated otherwise, website copy, branding, design, images and
          other content belong to First Light Marketing or are used with
          permission. You may not copy, reuse or republish website content without
          permission.
        </p>

        <h2>Enquiries and services</h2>
        <p>
          Sending an enquiry through the website does not create a client
          relationship or guarantee availability. Any paid work, scope, fees and
          timelines should be agreed separately in writing.
        </p>

        <h2>External links</h2>
        <p>
          This website may link to third-party platforms or websites. First Light
          Marketing is not responsible for the content, availability or privacy
          practices of third-party websites.
        </p>

        <h2>Changes to the website</h2>
        <p>
          We may update website content, services and these terms from time to
          time.
        </p>

        <h2>Contact</h2>
        <p>
          For questions about these terms, contact{" "}
          <a href={`mailto:${CONTACT.email}`}>{CONTACT.email}</a>.
        </p>
      </LegalPage>
    </>
  );
}
