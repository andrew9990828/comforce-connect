// Service identifiers shared by intake and casework. Codex (GPT-6) defined the resident-facing labels.
export const serviceLabels = {
  food: 'Food', transportation: 'Transportation', family_support: 'Missing person / family support',
  shelter: 'Shelter', youth: 'Youth support', other: 'Other',
}
export type Service = keyof typeof serviceLabels
