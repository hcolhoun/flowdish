import PublicLegalPage from '@/app/components/PublicLegalPage'
import { LEGAL_VERSIONS } from '@/lib/legal'

const sections = [
  {
    title: 'OpenAI Ireland Ltd.',
    paragraphs: [
      'Purpose: AI-assisted extraction and interpretation for Flowdish Enterprise features. Data: selected or filtered document content, prompts and generated structured results. OpenAI may use affiliated infrastructure and subprocessors under its published DPA and transfer safeguards.',
    ],
  },
  {
    title: 'Supabase, Inc.',
    paragraphs: [
      'Purpose: hosted database, authentication and account-session services. Data: account details, permissions and restaurant operational records.',
    ],
  },
  {
    title: 'Vercel Inc.',
    paragraphs: [
      'Purpose: application hosting, delivery, runtime logs and deployment infrastructure. Data: application requests, limited technical information and customer content processed through the application runtime.',
    ],
  },
  {
    title: 'Cloudflare, Inc.',
    paragraphs: [
      'Purpose: Turnstile bot and abuse protection on public authentication flows. Data: security and device/network signals used to validate the interaction.',
    ],
  },
  {
    title: 'Resend, Inc.',
    paragraphs: [
      'Purpose: transactional support-ticket and supplier-credit notification emails when configured. Data: recipient addresses and the content required for the selected notification.',
    ],
  },
  {
    title: 'Updates',
    paragraphs: [
      'Flowdish will update this page when a material subprocessor changes and will provide reasonable notice where required by the Data Processing Agreement. Questions or objections may be sent to privacy@flowdish.ie.',
    ],
  },
]

export default function SubprocessorsPage() {
  return (
    <PublicLegalPage
      title="Flowdish Subprocessors"
      version={LEGAL_VERSIONS.dpa}
      intro="Service providers that may process customer personal data while helping Flowdish deliver and secure the service."
      sections={sections}
    />
  )
}
