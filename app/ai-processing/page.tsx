import PublicLegalPage from '@/app/components/PublicLegalPage'
import { LEGAL_VERSIONS } from '@/lib/legal'

const sections = [
  {
    title: 'Where this applies',
    paragraphs: [
      'This notice applies to Flowdish Enterprise AI features, including delivery-docket reading, supplier price-list imports, POS or Z-read imports, voice-entry interpretation, prep-time estimates, dashboard briefings and AI-assisted SOP drafting or translation. HACCP Core and Kitchen Pro do not include these AI import features.',
    ],
  },
  {
    title: 'What is sent',
    paragraphs: [
      'Flowdish sends the minimum content needed for the selected task. For document photographs, the browser creates a flattened copy containing only the areas confirmed by the user; everything outside those areas is removed before transmission. Text documents are filtered before AI parsing where applicable.',
      'Users must not include unnecessary addresses, personal contact details, bank information, payment-card information, special-category data or information about children.',
    ],
  },
  {
    title: 'Provider and retention',
    paragraphs: [
      'Flowdish uses the OpenAI API under its business Data Processing Addendum. OpenAI Ireland Ltd. acts as the contracted provider for EEA customers. OpenAI states that API customer content is not used to train or improve its models unless the customer explicitly opts in.',
      'Flowdish sends stateless requests with storage disabled. OpenAI may retain API content in abuse-monitoring logs for up to 30 days under its standard API controls, unless a different approved retention control applies or longer retention is legally required.',
    ],
  },
  {
    title: 'Human review',
    paragraphs: [
      'AI output is always a draft. A user must review matches, quantities, prices, tax treatment and other extracted details before saving operational records. Flowdish does not use these AI features to make legal or similarly significant decisions about individuals.',
    ],
  },
  {
    title: 'Safeguards and contact',
    paragraphs: [
      'Flowdish uses data minimisation, access controls, tenant separation, short-lived processing, documented subprocessors and contractual transfer safeguards. Questions or privacy requests may be sent to privacy@flowdish.ie.',
    ],
  },
]

export default function AiProcessingPage() {
  return (
    <PublicLegalPage
      title="Flowdish AI Processing Notice"
      version={LEGAL_VERSIONS.aiNotice}
      intro="A concise explanation of how Enterprise AI features process selected kitchen documents and text."
      sections={sections}
    />
  )
}
