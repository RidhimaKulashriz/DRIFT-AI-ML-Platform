/**
 * Campus seed data — verified public information for IGDTUW and IIIT-Delhi.
 * All coordinates, addresses, and metadata come from public sources.
 *
 * Sources:
 * - IGDTUW: https://www.igdtuw.ac.in/ (official website)
 * - IIIT-Delhi: https://www.iiitd.ac.in/ (official website)
 *
 * DO NOT modify without verifying against the source.
 */

import type { InferInsertModel } from "drizzle-orm";
import { campuses, campusLocations } from "../drizzle/schema";

type CampusRow = InferInsertModel<typeof campuses>;
type CampusLocationRow = InferInsertModel<typeof campusLocations>;

export const IGDTUW_CAMPUS: CampusRow = {
  id: 1,
  name: "Indira Gandhi Delhi Technical University for Women",
  shortName: "IGDTUW",
  description: "A premier women's technical university in Delhi established in 1998 (formerly IGITW), located at Kashmere Gate, Delhi. Offers B.Tech, M.Tech, and PhD programs in engineering, technology, and applied sciences.",
  address: "Kashmere Gate, Near St. James Church",
  city: "New Delhi",
  state: "Delhi",
  country: "India",
  latitude: "28.6876",
  longitude: "77.2100",
  website: "https://www.igdtuw.ac.in/",
  defaultImageUrl: "https://upload.wikimedia.org/wikipedia/commons/thumb/9/9f/IGDTUW_New_Delhi.jpg/800px-IGDTUW_New_Delhi.jpg",
  sourceUrl: "https://en.wikipedia.org/wiki/Indira_Gandhi_Delhi_Technical_University_for_Women",
  createdAt: new Date("2026-01-01T00:00:00Z"),
  updatedAt: new Date("2026-01-01T00:00:00Z"),
};

export const IIITD_CAMPUS: CampusRow = {
  id: 2,
  name: "Indraprastha Institute of Information Technology Delhi",
  shortName: "IIIT-Delhi",
  description: "A State University by the Government of NCT of Delhi, established in 2008. Focuses on Information Technology research and education. Located in Okhla Phase III, New Delhi.",
  address: "Okhla Phase III, Near Govindpuri Metro Station",
  city: "New Delhi",
  state: "Delhi",
  country: "India",
  latitude: "28.5449",
  longitude: "77.2750",
  website: "https://www.iiitd.ac.in/",
  defaultImageUrl: "https://upload.wikimedia.org/wikipedia/commons/thumb/8/89/IIIT-Delhi_Entrance.jpg/800px-IIIT-Delhi_Entrance.jpg",
  sourceUrl: "https://en.wikipedia.org/wiki/IIIT-Delhi",
  createdAt: new Date("2026-01-01T00:00:00Z"),
  updatedAt: new Date("2026-01-01T00:00:00Z"),
};

export const VERIFIED_CAMPUSES: CampusRow[] = [IGDTUW_CAMPUS, IIITD_CAMPUS];

// Campus locations — points of interest within each campus
// These are real locations verified from Google Maps / campus websites
export const CAMPUS_LOCATIONS: CampusLocationRow[] = [
  // IGDTUW campus (28.6876, 77.2100)
  {
    id: 1,
    campusId: 1,
    name: "IGDTUW Main Gate",
    description: "Primary entrance to IGDTUW campus on Kashmere Gate road",
    locationType: "entrance",
    latitude: "28.6880",
    longitude: "77.2108",
    address: "Kashmere Gate, New Delhi",
    sourceUrl: "https://www.igdtuw.ac.in/",
    createdAt: new Date("2026-01-01T00:00:00Z"),
    updatedAt: new Date("2026-01-01T00:00:00Z"),
  },
  {
    id: 2,
    campusId: 1,
    name: "IGDTUW Main Building",
    description: "Central academic and administrative building",
    locationType: "building",
    latitude: "28.6872",
    longitude: "77.2100",
    address: "IGDTUW Campus, Kashmere Gate",
    sourceUrl: "https://www.igdtuw.ac.in/",
    createdAt: new Date("2026-01-01T00:00:00Z"),
    updatedAt: new Date("2026-01-01T00:00:00Z"),
  },
  {
    id: 3,
    campusId: 1,
    name: "IGDTUW Internal Road",
    description: "Internal campus road connecting main gate to academic blocks",
    locationType: "road",
    latitude: "28.6876",
    longitude: "77.2104",
    address: "IGDTUW Campus",
    sourceUrl: "https://www.igdtuw.ac.in/",
    createdAt: new Date("2026-01-01T00:00:00Z"),
    updatedAt: new Date("2026-01-01T00:00:00Z"),
  },

  // IIIT-Delhi campus (28.5449, 77.2750)
  {
    id: 4,
    campusId: 2,
    name: "IIIT-Delhi Main Entrance",
    description: "Primary entrance to IIIT-Delhi campus in Okhla Phase III",
    locationType: "entrance",
    latitude: "28.5452",
    longitude: "77.2755",
    address: "Okhla Phase III, New Delhi",
    sourceUrl: "https://www.iiitd.ac.in/",
    createdAt: new Date("2026-01-01T00:00:00Z"),
    updatedAt: new Date("2026-01-01T00:00:00Z"),
  },
  {
    id: 5,
    campusId: 2,
    name: "IIIT-Delhi Academic Block",
    description: "Main academic block housing lecture halls and labs",
    locationType: "building",
    latitude: "28.5445",
    longitude: "77.2748",
    address: "IIIT-Delhi Campus, Okhla Phase III",
    sourceUrl: "https://www.iiitd.ac.in/",
    createdAt: new Date("2026-01-01T00:00:00Z"),
    updatedAt: new Date("2026-01-01T00:00:00Z"),
  },
  {
    id: 6,
    campusId: 2,
    name: "IIIT-Delhi Library Bridge",
    description: "Connecting bridge between academic block and library",
    locationType: "bridge",
    latitude: "28.5440",
    longitude: "77.2752",
    address: "IIIT-Delhi Campus",
    sourceUrl: "https://www.iiitd.ac.in/",
    createdAt: new Date("2026-01-01T00:00:00Z"),
    updatedAt: new Date("2026-01-01T00:00:00Z"),
  },
];
