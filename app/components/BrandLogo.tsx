import Image from 'next/image'

type BrandLogoProps = {
  className: string
  priority?: boolean
  transparentLight?: boolean
}

export default function BrandLogo({
  className,
  priority = false,
  transparentLight = false,
}: BrandLogoProps) {
  return (
    <span className={`fd-brand-logo inline-grid shrink-0 ${className}`}>
      <Image
        src="/flowdish-banner-logo.png"
        alt="Flowdish"
        width={757}
        height={221}
        priority={priority}
        className={`fd-brand-logo-light col-start-1 row-start-1 h-full w-full object-contain ${
          transparentLight ? 'mix-blend-multiply' : ''
        }`}
      />
      <Image
        src="/flowdish-banner-logo-dark.png"
        alt="Flowdish"
        width={2176}
        height={723}
        priority={priority}
        className="fd-brand-logo-dark col-start-1 row-start-1 h-full w-full object-contain"
      />
    </span>
  )
}
