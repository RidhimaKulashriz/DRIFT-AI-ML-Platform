export const CAMPUS_SITES = [
  {
    id: "iiit-delhi",
    shortName: "IIIT DELHI",
    name: "Indraprastha Institute of Information Technology Delhi",
    address: "Okhla Industrial Estate, Phase III, New Delhi 110020",
    latitude: 28.5458541,
    longitude: 77.2731762,
    sourceUrl: "https://iiitd.ac.in/contact",
  },
  {
    id: "igdtuw",
    shortName: "IGDTUW",
    name: "Indira Gandhi Delhi Technical University for Women",
    address: "New Church Road, Kashmere Gate, New Delhi 110006",
    latitude: 28.6655361,
    longitude: 77.2320079,
    sourceUrl: "https://www.igdtuw.ac.in/",
  },
] as const;

export type CampusSiteId = (typeof CAMPUS_SITES)[number]["id"];

