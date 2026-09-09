export type CampusMapRecord = {
  key: "IGDTUW" | "IIIT_DELHI";
  name: string;
  shortName: string;
  address: string;
  nearestTransit: string;
  description: string;
  website: string;
  sourceUrl: string;
  color: string;
};

/** Public, non-sensitive campus metadata used by the map popups and reference layers. */
export const CAMPUS_MAP_DATA: Record<CampusMapRecord["key"], CampusMapRecord> = {
  IGDTUW: {
    key: "IGDTUW",
    name: "Indira Gandhi Delhi Technical University for Women",
    shortName: "IGDTUW",
    address: "James Church, New Church Road, Kashmere Gate, New Delhi 110006",
    nearestTransit: "Kashmere Gate Metro / ISBT area",
    description: "Delhi technical university for women at the Kashmere Gate campus.",
    website: "https://www.igdtuw.ac.in/",
    sourceUrl: "https://www.igdtuw.ac.in/",
    color: "#1e40af",
  },
  IIIT_DELHI: {
    key: "IIIT_DELHI",
    name: "Indraprastha Institute of Information Technology Delhi",
    shortName: "IIIT-Delhi",
    address: "Okhla Industrial Estate, Phase III, New Delhi 110020",
    nearestTransit: "Govind Puri Metro Station",
    description: "Delhi information-technology research and education institute in Okhla Phase III.",
    website: "https://www.iiitd.ac.in/",
    sourceUrl: "https://iiitd.ac.in/contact",
    color: "#047857",
  },
};

export const CAMPUS_REFERENCE_RADIUS_METERS = 180;

export function campusPopupHtml(campus: CampusMapRecord) {
  return `<div style="font:13px Arial,sans-serif;max-width:280px"><b>${campus.name}</b><br/><span>${campus.address}</span><br/><span>Nearest transit: ${campus.nearestTransit}</span><br/><em>Approximate campus reference point; not a surveyed boundary.</em><br/><a href="${campus.sourceUrl}" target="_blank" rel="noreferrer">Official source</a></div>`;
}

export function campusPopupText(campus: CampusMapRecord) {
  return `<strong>${campus.name}</strong><br/>${campus.address}<br/>Nearest transit: ${campus.nearestTransit}<br/><em>Approximate campus reference point; not a surveyed boundary.</em><br/><a href="${campus.sourceUrl}" target="_blank">Official source</a>`;
}

export const CAMPUS_MAP_SOURCES = [
  { campus: "IGDTUW", label: "IGDTUW official website", url: "https://www.igdtuw.ac.in/" },
  { campus: "IIIT-Delhi", label: "IIIT-Delhi official contact page", url: "https://iiitd.ac.in/contact" },
] as const;

export default CAMPUS_MAP_DATA;
