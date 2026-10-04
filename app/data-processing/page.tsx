import PublicLegalPage from '@/app/components/PublicLegalPage'
import { LEGAL_VERSIONS } from '@/lib/legal'

const sections = [
  {
    title: '1. Parties and scope',
    paragraphs: [
      'This Data Processing Agreement forms part of the Flowdish Terms of Service. The customer business is the Controller and Flowdish, operated by the supplier identified in the applicable order form, invoice or commercial proposal, is the Processor where Flowdish processes personal data in restaurant operational records on the customer’s behalf.',
      'Flowdish acts as an independent controller for its own account administration, billing, security, legal compliance and direct customer communications as described in the Privacy Statement.',
    ],
  },
  {
    title: '2. Processing details',
    items: [
      'Subject matter: hosting and operating the Flowdish kitchen-management service.',
      'Duration: the customer subscription plus the limited return, deletion, backup and legal-retention period described below.',
      'Nature and purpose: collecting, storing, organising, retrieving, securing, displaying, importing and assisting review of customer operational records.',
      'Data subjects: customer users, restaurant staff, supplier contacts and other people whose details may appear incidentally in customer documents.',
      'Data types: account identifiers, names, business contact information, roles, audit details and personal data appearing incidentally in operational records or uploaded documents.',
      'Sensitive data is not intended to be processed and must not be uploaded unless expressly agreed in writing.',
    ],
  },
  {
    title: '3. Documented instructions',
    paragraphs: [
      'Flowdish will process personal data only on the customer’s documented instructions, including these terms, account configuration and actions taken by authorised users, unless processing is required by law. Flowdish will inform the customer where an instruction appears to breach applicable data-protection law, unless prohibited from doing so.',
    ],
  },
  {
    title: '4. Confidentiality and security',
    paragraphs: [
      'Flowdish will restrict personal-data access to authorised persons subject to confidentiality obligations and maintain appropriate technical and organisational measures. These include tenant separation, authenticated access, role permissions, encrypted transport, hosted infrastructure controls, security logging, restricted production access and incident-response procedures.',
    ],
  },
  {
    title: '5. Subprocessors',
    paragraphs: [
      'The customer gives general written authorisation for Flowdish to use the subprocessors listed on the Flowdish Subprocessors page. Flowdish will require subprocessors to provide protections appropriate to the processing and will remain responsible for its processor obligations.',
      'Flowdish will provide reasonable advance notice of a material new subprocessor. The customer may object on reasonable data-protection grounds. If no practical alternative is available, either party may discontinue the affected feature or terminate the affected service.',
    ],
  },
  {
    title: '6. International transfers',
    paragraphs: [
      'Where personal data is transferred outside the EEA, Flowdish will use an adequacy decision, European Commission Standard Contractual Clauses or another lawful transfer mechanism and will assess whether supplementary safeguards are required. OpenAI processing is contracted through OpenAI Ireland Ltd.; onward transfers are governed by OpenAI’s DPA and transfer safeguards.',
    ],
  },
  {
    title: '7. Assistance and incidents',
    paragraphs: [
      'Taking account of the processing and information available, Flowdish will reasonably assist the customer with data-subject requests, security obligations, breach notifications, data-protection impact assessments and regulator consultations.',
      'Flowdish will notify the customer without undue delay after becoming aware of a personal-data breach affecting customer data and will provide available information reasonably needed for the customer’s response.',
    ],
  },
  {
    title: '8. Return, deletion and retention',
    paragraphs: [
      'At the end of the service, Flowdish will delete or return customer personal data on instruction unless retention is required by law. Temporary AI parsing content is not intentionally retained by Flowdish after processing. Limited encrypted backups, security logs and legal records may remain until their normal secure expiry.',
    ],
  },
  {
    title: '9. Demonstrating compliance',
    paragraphs: [
      'Flowdish will make available information reasonably necessary to demonstrate compliance with this Agreement. Where legally required and subject to confidentiality, reasonable scope and minimal disruption, Flowdish will support an audit by the customer or its independent auditor. Existing third-party reports may be provided instead where appropriate.',
    ],
  },
  {
    title: '10. Customer obligations and contact',
    paragraphs: [
      'The customer is responsible for its lawful basis, notices, user permissions, data accuracy, retention instructions and minimising uploaded personal data. Privacy and processor queries may be sent to privacy@flowdish.ie.',
    ],
  },
]

export default function DataProcessingPage() {
  return (
    <PublicLegalPage
      title="Flowdish Data Processing Agreement"
      version={LEGAL_VERSIONS.dpa}
      intro="The controller-processor terms that apply when Flowdish handles restaurant operational data for a customer."
      sections={sections}
    />
  )
}
