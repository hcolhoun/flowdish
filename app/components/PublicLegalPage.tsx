import Link from 'next/link'
import BrandLogo from '@/app/components/BrandLogo'

type LegalSection = {
  title: string
  paragraphs?: string[]
  items?: string[]
}

export default function PublicLegalPage({
  title,
  version,
  intro,
  sections,
}: {
  title: string
  version: string
  intro: string
  sections: LegalSection[]
}) {
  return (
    <main className="min-h-screen bg-slate-50 px-4 py-10 sm:px-6">
      <article className="mx-auto max-w-4xl">
        <div className="flex items-start justify-between gap-5 border-b border-slate-300 pb-6">
          <div>
            <BrandLogo className="h-12 w-[152px]" transparentLight />
            <p className="mt-5 text-sm text-slate-500">Version {version}</p>
            <h1 className="mt-2 text-3xl font-semibold text-slate-900">{title}</h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-700">{intro}</p>
          </div>
          <Link
            href="/signup"
            className="shrink-0 rounded-md border bg-white px-4 py-2 text-sm font-medium text-slate-800 hover:bg-slate-100"
          >
            Back to signup
          </Link>
        </div>

        <div className="divide-y divide-slate-200">
          {sections.map((section) => (
            <section key={section.title} className="py-6">
              <h2 className="text-lg font-semibold text-slate-900">{section.title}</h2>
              {section.paragraphs?.map((paragraph) => (
                <p key={paragraph} className="mt-3 text-sm leading-6 text-slate-700">
                  {paragraph}
                </p>
              ))}
              {section.items ? (
                <ul className="mt-3 space-y-2 text-sm leading-6 text-slate-700">
                  {section.items.map((item) => (
                    <li key={item}>- {item}</li>
                  ))}
                </ul>
              ) : null}
            </section>
          ))}
        </div>
      </article>
    </main>
  )
}
