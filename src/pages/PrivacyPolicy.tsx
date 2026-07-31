import { LegalPage } from "../components/LegalPage";
import { Seo } from "../components/Seo";
import { CONTACT } from "../content/site";

export default function PrivacyPolicy() {
  return (
    <>
      <Seo
        title="Privacy Policy"
        description="How First Light Marketing collects, uses and protects personal information submitted through the website."
        path="/privacy"
      />
      <LegalPage
        eyebrow="Legal"
        title="Privacy Policy"
        description="How First Light Marketing handles personal information shared through this website."
      >
        <p>Last updated: 20 July 2026</p>

        <h2>Who we are</h2>
        <p>
          First Light Marketing is a marketing consultancy run by Niamh Donnelly.
          For privacy questions or data requests, contact{" "}
          <a href={`mailto:${CONTACT.email}`}>{CONTACT.email}</a>.
        </p>

        <h2>What information we collect</h2>
        <p>
          When you submit an enquiry form, we may collect your name, email
          address, phone number, business name, selected services, budget range,
          marketing challenge and any message you choose to send.
        </p>
        <p>
          If you contact us by email or social media, we collect the information
          you choose to provide in that message.
        </p>

        <h2>How we use your information</h2>
        <p>We use your information to:</p>
        <ul>
          <li>respond to your enquiry;</li>
          <li>understand what marketing support you may need;</li>
          <li>manage follow-up conversations and potential client work;</li>
          <li>keep a record of enquiries for business administration.</li>
        </ul>

        <h2>Our lawful basis</h2>
        <p>
          We process enquiry information because it is necessary to respond to
          your request before entering into a contract, and because First Light
          Marketing has a legitimate interest in managing business enquiries.
        </p>

        <h2>Where your information is stored</h2>
        <p>
          Website enquiries are stored in AWS DynamoDB and may be sent to Niamh
          by email using AWS Simple Email Service. Access is limited to people
          who need it to respond to enquiries and manage the business.
        </p>

        <h2>Sharing your information</h2>
        <p>
          We do not sell personal information. We may share information with
          service providers that help run the website, email and hosting, such as
          AWS. We may also share information where required by law.
        </p>

        <h2>How long we keep information</h2>
        <p>
          Enquiry details are kept for as long as needed to respond, manage a
          potential client relationship and maintain reasonable business records.
          If you want your enquiry deleted, contact{" "}
          <a href={`mailto:${CONTACT.email}`}>{CONTACT.email}</a>.
        </p>

        <h2>Your rights</h2>
        <p>
          Depending on the circumstances, you may have the right to access,
          correct, delete, restrict or object to how your personal information is
          used. You can make a request by emailing{" "}
          <a href={`mailto:${CONTACT.email}`}>{CONTACT.email}</a>.
        </p>

        <h2>Email updates</h2>
        <p>
          We will not add enquiry form submissions to a newsletter list unless
          you have clearly agreed to receive marketing emails. If email updates
          are added later, unsubscribe instructions will be included.
        </p>

        <h2>Complaints</h2>
        <p>
          If you are unhappy with how your information is handled, please contact
          us first. You also have the right to complain to the UK Information
          Commissioner's Office.
        </p>
      </LegalPage>
    </>
  );
}
