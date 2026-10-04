import PublicLegalPage from '@/app/components/PublicLegalPage'
import { LEGAL_VERSIONS } from '@/lib/legal'

const sections = [
  {
    title: '1. Agreement and authority',
    paragraphs: [
      'These Terms govern the business use of Flowdish by the customer identified during signup, in an order form, invoice, or commercial proposal. Flowdish is operated by the supplier identified in those commercial documents.',
      'The person accepting these Terms confirms that they are authorised to bind the customer business. These Terms, the Data Processing Agreement, the selected subscription and any applicable order form form the agreement.',
    ],
  },
  {
    title: '2. The service',
    paragraphs: [
      'Flowdish provides kitchen operations, food-safety record keeping, inventory, costing, delivery, planning, waste, SOP, refrigeration and related tools according to the selected tier. Features may be improved or replaced where this does not materially reduce the subscribed service.',
      'Flowdish assists kitchen management but does not replace the customer chef, food-safety consultant, accountant, auditor or legal adviser. The customer remains responsible for checking records, temperatures, quantities, prices, allergens, food-safety actions and AI-generated drafts before relying on them.',
    ],
  },
  {
    title: '3. Accounts and authorised users',
    paragraphs: [
      'The customer is responsible for its users, passwords, staff PINs, permissions and all activity under its account. Access must be removed promptly when a person no longer requires it. Suspected unauthorised access must be reported to Flowdish without delay.',
    ],
  },
  {
    title: '4. Customer data',
    paragraphs: [
      'The customer retains its rights in customer data and instructs Flowdish to process it only to provide, secure and support the service. The customer must have a lawful basis for data it enters or uploads and must not upload unnecessary payment-card, banking, special-category or other sensitive personal data.',
      'The Data Processing Agreement applies where Flowdish processes personal data for the customer.',
    ],
  },
  {
    title: '5. AI-assisted features',
    paragraphs: [
      'AI features are available only in tiers that include them. AI results are drafts and may be incomplete or incorrect. Flowdish requires review before operational records are saved and does not guarantee perfect recognition of documents, speech, products, prices, tax treatment or quantities.',
    ],
  },
  {
    title: '6. Acceptable use',
    items: [
      'Do not use Flowdish unlawfully, to infringe another person’s rights, or to access another restaurant’s data.',
      'Do not interfere with security controls, probe the service, share API credentials or introduce malicious material.',
      'Do not upload content the customer is not entitled to process.',
    ],
  },
  {
    title: '7. Fees, suspension and termination',
    paragraphs: [
      'Fees, billing dates and any implementation charges are set out in the applicable order form, invoice or commercial proposal. Flowdish may suspend access for overdue payment, material misuse or a security risk after reasonable notice where practicable.',
      'On termination, the customer should export records it needs. Data return and deletion are handled in accordance with the Data Processing Agreement and applicable law.',
    ],
  },
  {
    title: '8. Availability and liability',
    paragraphs: [
      'Flowdish will use reasonable care in providing the service but uninterrupted or error-free operation is not guaranteed. Nothing in these Terms excludes liability that cannot legally be excluded. Any agreed liability limits or service commitments stated in an order form take precedence over this section.',
    ],
  },
  {
    title: '9. Changes and governing law',
    paragraphs: [
      'Material changes will be notified through the service or by email. Continued use may require fresh acceptance. The agreement is governed by Irish law and the Irish courts have jurisdiction, subject to any mandatory rights that apply.',
    ],
  },
  {
    title: '10. Contact',
    paragraphs: ['Service and legal queries may be sent to support@flowdish.ie.'],
  },
]

export default function TermsPage() {
  return (
    <PublicLegalPage
      title="Flowdish Terms of Service"
      version={LEGAL_VERSIONS.terms}
      intro="Business terms for restaurants and hospitality operators using Flowdish."
      sections={sections}
    />
  )
}
