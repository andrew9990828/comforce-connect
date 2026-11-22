export const neighborhoodNames = [
  'Bay View', 'Harambee', 'Lincoln Park', 'Riverwest', 'Silver City', "Walker's Point",
] as const

export type Neighborhood = typeof neighborhoodNames[number]
export type NeighborhoodCounts = Record<Neighborhood, number>

export const monthlyIncidents: { month: string; label: string; counts: NeighborhoodCounts }[] = [
  { month: '2026-01', label: 'January 2026', counts: { 'Bay View': 54, Harambee: 79, 'Lincoln Park': 31, Riverwest: 38, 'Silver City': 20, "Walker's Point": 48 } },
  { month: '2026-02', label: 'February 2026', counts: { 'Bay View': 55, Harambee: 70, 'Lincoln Park': 16, Riverwest: 50, 'Silver City': 16, "Walker's Point": 68 } },
  { month: '2026-03', label: 'March 2026', counts: { 'Bay View': 51, Harambee: 75, 'Lincoln Park': 23, Riverwest: 51, 'Silver City': 15, "Walker's Point": 63 } },
  { month: '2026-04', label: 'April 2026', counts: { 'Bay View': 63, Harambee: 80, 'Lincoln Park': 29, Riverwest: 52, 'Silver City': 13, "Walker's Point": 68 } },
  { month: '2026-05', label: 'May 2026', counts: { 'Bay View': 49, Harambee: 89, 'Lincoln Park': 28, Riverwest: 58, 'Silver City': 8, "Walker's Point": 73 } },
  { month: '2026-06', label: 'June 2026', counts: { 'Bay View': 48, Harambee: 96, 'Lincoln Park': 45, Riverwest: 91, 'Silver City': 15, "Walker's Point": 78 } },
  { month: '2026-07', label: 'July 2026', counts: { 'Bay View': 71, Harambee: 107, 'Lincoln Park': 29, Riverwest: 65, 'Silver City': 31, "Walker's Point": 69 } },
  { month: '2026-08', label: 'August 2026', counts: { 'Bay View': 49, Harambee: 97, 'Lincoln Park': 29, Riverwest: 71, 'Silver City': 21, "Walker's Point": 75 } },
  { month: '2026-09', label: 'September 2026', counts: { 'Bay View': 40, Harambee: 83, 'Lincoln Park': 29, Riverwest: 80, 'Silver City': 16, "Walker's Point": 60 } },
  { month: '2026-10', label: 'October 2026', counts: { 'Bay View': 60, Harambee: 86, 'Lincoln Park': 30, Riverwest: 50, 'Silver City': 13, "Walker's Point": 49 } },
]

export const neighborhoodSummary = [
  { name: 'Bay View', incidents2026: 540, incidents2025: 625, change: -13.6, aggravatedAssault: 30, robbery: 9, burglary: 58, theft: 176, vehicleTheft: 83 },
  { name: 'Harambee', incidents2026: 862, incidents2025: 909, change: -5.2, aggravatedAssault: 149, robbery: 30, burglary: 38, theft: 124, vehicleTheft: 71 },
  { name: 'Lincoln Park', incidents2026: 289, incidents2025: 323, change: -10.5, aggravatedAssault: 32, robbery: 8, burglary: 12, theft: 30, vehicleTheft: 34 },
  { name: 'Riverwest', incidents2026: 606, incidents2025: 571, change: 6.1, aggravatedAssault: 54, robbery: 16, burglary: 48, theft: 195, vehicleTheft: 101 },
  { name: 'Silver City', incidents2026: 168, incidents2025: 191, change: -12.0, aggravatedAssault: 22, robbery: 7, burglary: 11, theft: 28, vehicleTheft: 30 },
  { name: "Walker's Point", incidents2026: 651, incidents2025: 750, change: -13.2, aggravatedAssault: 61, robbery: 16, burglary: 27, theft: 185, vehicleTheft: 101 },
] as const

export const crimeSources = {
  incidents: 'https://data.milwaukee.gov/dataset/e5feaad3-ee73-418c-b65d-ef810c199390/resource/87843297-a6fa-46d4-ba5d-cb342fb2d3bb/download/wibr.csv',
  neighborhoods: 'https://milwaukeemaps.milwaukee.gov/arcgis/rest/services/AGO/neighborhoods/MapServer/0',
  disclaimer: 'https://staticwebfiles.milwaukee.gov/main/compass/disclaimerQuery.html',
  calls: 'https://public.tableau.com/app/profile/omap/viz/CallsforService_17828297832160/CallsforService',
  codes: 'https://le.fbi.gov/file-repository/nibrs-user-manual-2025-0-062625.pdf',
}
