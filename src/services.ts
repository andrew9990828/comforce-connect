// Service identifiers shared by intake and casework. Codex (GPT-6) defined the resident-facing labels.
export const serviceLabels = {
  food: 'Food', transportation: 'Transportation', family_support: 'Missing person / family support',
  shelter: 'Shelter', youth: 'Youth support', other: 'Other',
}
export type Service = keyof typeof serviceLabels

// Everyday wording for residents. Staff screens keep the shorter casework labels above.
export const residentLabels: Record<Service, string> = {
  food: 'Food', transportation: 'A ride', shelter: 'A place to stay',
  family_support: 'Someone is missing', youth: 'Help for kids or teens', other: 'Something else',
}
// The order residents see needs in, on the home page and the request form.
export const serviceOrder: Service[] = ['food', 'transportation', 'shelter', 'family_support', 'youth', 'other']
