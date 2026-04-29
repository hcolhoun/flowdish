export function parseCaterway(text: string) {
  const lines = text.split('\n')

  const products = []

  for (const line of lines) {
    if (!line.includes('€')) continue

    const parts = line.trim().split(/\s+/)

    const priceIndex = parts.findIndex((p) => p.includes('€'))

    if (priceIndex < 2) continue

    const price = parseFloat(parts[priceIndex].replace('€', ''))

    const name = parts.slice(1, priceIndex).join(' ')

    const code = parts[parts.length - 1]

    products.push({
      supplier: 'Caterway',
      name,
      supplierSku: code,
      packPrice: price,
    })
  }

  return products
}