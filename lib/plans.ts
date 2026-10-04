export const FLOWDISH_PLANS = [
  {
    id: 'HACCP_CORE',
    name: 'Flowdish HACCP Core',
    summary: 'The essential digital HACCP toolkit for a compliant kitchen.',
    monthlyPrice: 69,
    annualPrice: 690,
    setupPrice: 295,
    features: [
      'Prep and HACCP records',
      'Delivery intake and expiry records',
      'Inventory records for high-risk foods',
      'Cold storage records and monitoring',
      'Admin and staff management',
      'One free refrigeration temperature probe',
    ],
  },
  {
    id: 'KITCHEN_PRO',
    name: 'Flowdish Kitchen Pro',
    summary: 'Complete kitchen operations without AI file automation.',
    monthlyPrice: 149,
    annualPrice: 1490,
    setupPrice: 750,
    recommended: true,
    features: [
      'Everything in HACCP Core',
      'Recipes, costing, inventory and waste',
      'Suppliers, deliveries, sales and forecasting',
      'Manual entry and full kitchen planning',
    ],
  },
  {
    id: 'ENTERPRISE',
    name: 'Flowdish Enterprise',
    summary: 'Every Flowdish feature, including AI-powered automation.',
    monthlyPrice: 249,
    annualPrice: 2490,
    setupPrice: 1250,
    features: [
      'Everything in Kitchen Pro',
      'AI delivery docket scanning',
      'AI POS and Z-read imports',
      'AI supplier price-list imports',
      'AI-assisted prep-time estimates',
      'Voice-assisted waste and prep entry',
      'Interactive spoken SOPs with pause and continue voice controls',
    ],
  },
] as const

export type FlowdishPlanId = (typeof FLOWDISH_PLANS)[number]['id']
