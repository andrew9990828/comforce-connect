// Published context for the atlas. Codex (GPT-6) verified the units, geography and periods against the linked primary sources.
const comforce = {
  publisher: 'Community Task Force MKE',
  url: 'https://www.comforcemilwaukee.com/',
  period: 'Reporting period unspecified',
}

export const reach = [
  { ...comforce, minimum: 10000, unit: 'residents served', geography: 'Milwaukee',
    definition: 'Residents ComForce reports serving across Milwaukee.' },
  { ...comforce, minimum: 300, unit: 'volunteers and partners', geography: 'ComForce MKE network',
    definition: 'Volunteers and partners in ComForce’s network, counted together.' },
]

const city = {
  publisher: 'Milwaukee Fire and Police Commission',
  geography: 'City of Milwaukee',
  unit: 'people reported missing to the Milwaukee Police Department',
  definition: 'Annual citywide count of people reported missing to MPD. A person can appear in multiple reports.',
}
export const history = [
  { ...city, period: '2002', value: 4618, page: 41,
    url: 'https://city.milwaukee.gov/ImageLibrary/Groups/cityFPC/Reports/2002PSAFETY.pdf#page=41' },
  { ...city, period: '2004', value: 4316, page: 26,
    url: 'https://city.milwaukee.gov/ImageLibrary/Groups/cityFPC/Reports/2004PSAFETY.pdf#page=26' },
]

export const familyProgram = {
  name: 'Missing Persons Network', publisher: 'Community Task Force MKE',
  geography: 'Milwaukee and surrounding communities', url: 'https://www.comforcemilwaukee.com/programs',
  description: 'When a loved one is missing, families can get help coordinating a search, contacting partners and arranging a follow-up conversation.',
}
