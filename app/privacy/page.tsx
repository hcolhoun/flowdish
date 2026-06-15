import Link from 'next/link'

const sections = [
  {
    title: 'Who We Are',
    body: [
      'Flowdish provides kitchen operations software for restaurants, including stock control, prep records, HACCP records, supplier product management, delivery records, sales imports, planning, waste logs, SOPs, cold storage records, and admin tools.',
      'For customer account information and platform operation, Flowdish is the data controller. For restaurant operational records entered by a restaurant, the restaurant is normally the controller and Flowdish acts as a processor providing the software service.',
    ],
  },
  {
    title: 'Data We Process',
    body: [
      'Account and login data: name, email address, restaurant account, role, staff PIN usernames, encrypted PIN hashes, login/session information, and security checks.',
      'Restaurant operational data: items, recipes, BOMs, supplier products, deliveries, inventory, prep records, HACCP checks, sales quantities, waste, SOPs, forecasts, cold storage monitors, and imported spreadsheet, PDF, image, or text content used to create reviewed records.',
      'Technical and usage data: device/browser information, timestamps, error logs, AI parsing feature usage, token usage metadata where available, and basic security/audit information.',
    ],
  },
  {
    title: 'Why We Use Data',
    body: [
      'To create and manage Flowdish accounts, authenticate users, provide staff PIN access, and control permissions.',
      'To run the kitchen management features requested by each restaurant, including inventory movement, HACCP record keeping, delivery review, sales import, forecasting, supplier price updates, and cold storage records.',
      'To protect the service, prevent abuse, troubleshoot errors, improve reliability, and maintain audit trails for operational records.',
    ],
  },
  {
    title: 'Legal Bases',
    body: [
      'Contract: to provide the Flowdish service to restaurants and account users.',
      'Legitimate interests: to keep the platform secure, diagnose issues, improve the service, and maintain appropriate operational audit records.',
      'Legal obligation: where records are needed to help customers comply with food safety, accounting, or data protection obligations.',
      'Consent: where a user chooses to upload or paste content for optional AI/OCR-assisted parsing, or where consent is otherwise required.',
    ],
  },
  {
    title: 'AI, OCR, and Imported Files',
    body: [
      'Flowdish may use OCR and AI parsing to convert delivery dockets, supplier price lists, sales Z-reads, or similar documents into reviewable rows.',
      'Where possible, raw files, OCR text, and raw AI JSON are not stored after processing. Reviewed operational records, supplier changes, import summaries, and AI usage metadata may be stored.',
      'Users should avoid uploading documents containing unnecessary personal data. Sensitive headers, addresses, account references, or contact details may pass through parsing tools if they are present in the uploaded document, but they should not be saved unless included in a reviewed operational record.',
    ],
  },
  {
    title: 'Sharing and Service Providers',
    body: [
      'Flowdish uses trusted service providers to host and run the platform, database, authentication, security checks, OCR/AI processing, and deployment infrastructure.',
      'These providers process data only as needed to provide their services to Flowdish. Flowdish does not sell restaurant data.',
      'Some providers may process data outside Ireland or the European Economic Area. Where that happens, Flowdish aims to use appropriate safeguards such as contractual protections and recognised transfer mechanisms.',
    ],
  },
  {
    title: 'Retention',
    body: [
      'Account data is kept while the account is active and for a reasonable period afterwards where needed for administration, security, legal, or accounting reasons.',
      'Restaurant operational records are kept for as long as the restaurant chooses to use Flowdish, unless deletion is requested and Flowdish is legally or operationally allowed to delete them.',
      'Temporary parsing content should not be retained longer than needed to process the import. Logs, audit records, backups, and security records may be retained for limited periods.',
    ],
  },
  {
    title: 'Security',
    body: [
      'Flowdish uses access controls, role-based permissions, encrypted staff PIN hashes, server-side checks, CAPTCHA/security checks on public login flows, and hosted database/application security measures.',
      'No system is perfectly secure. Customers should use strong passwords, limit admin access, remove staff PIN users who no longer need access, and avoid uploading unnecessary sensitive information.',
    ],
  },
  {
    title: 'Your Rights',
    body: [
      'Depending on the situation, individuals may have rights to access, correct, delete, restrict, object to, or receive a copy of their personal data.',
      'Restaurant staff should usually contact their restaurant administrator first, because the restaurant controls most operational records entered into its account.',
      'You may also contact Flowdish about privacy requests, security concerns, or questions about this statement.',
    ],
  },
]

export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-slate-50 px-6 py-10">
      <div className="mx-auto max-w-4xl">
        <div className="rounded-2xl border bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-sm font-medium text-slate-500">Last updated: 15 June 2026</p>
              <h1 className="mt-2 text-3xl font-semibold text-slate-900">
                Flowdish Privacy Statement
              </h1>
              <p className="mt-3 text-sm leading-6 text-slate-700">
                This statement explains how Flowdish handles personal data and restaurant
                operational data. It is a practical privacy notice for customers and users, and
                should be reviewed against the final legal company details before public launch.
              </p>
            </div>

            <Link
              href="/login"
              className="rounded-xl border px-4 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50"
            >
              Back to Login
            </Link>
          </div>
        </div>

        <div className="mt-6 space-y-4">
          {sections.map((section) => (
            <section key={section.title} className="rounded-2xl border bg-white p-6 shadow-sm">
              <h2 className="text-xl font-semibold text-slate-900">{section.title}</h2>
              <div className="mt-3 space-y-3 text-sm leading-6 text-slate-700">
                {section.body.map((paragraph) => (
                  <p key={paragraph}>{paragraph}</p>
                ))}
              </div>
            </section>
          ))}

          <section className="rounded-2xl border bg-white p-6 shadow-sm">
            <h2 className="text-xl font-semibold text-slate-900">Contact</h2>
            <p className="mt-3 text-sm leading-6 text-slate-700">
              Privacy contact:{' '}
              <a className="font-medium underline" href="mailto:privacy@flowdish.ie">
                privacy@flowdish.ie
              </a>
              . Replace this with the final company privacy contact if different.
            </p>
          </section>
        </div>
      </div>
    </main>
  )
}
