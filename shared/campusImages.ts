/**
 * Real campus imagery and sample defect images for IGDTUW and IIIT-Delhi.
 * These URLs are stable GitHub raw image links and public dataset references.
 */

export const CAMPUS_IMAGES = {
  igdtuw: {
    campusPhoto: "https://upload.wikimedia.org/wikipedia/commons/thumb/9/9f/IGDTUW_New_Delhi.jpg/800px-IGDTUW_New_Delhi.jpg",
    campusPhotoCredit: "IGDTUW campus via Wikimedia Commons",
    defectImages: {
      crack: "https://raw.githubusercontent.com/biankatpas/Cracks-and-Potholes-in-Road-Images-Dataset/master/PreviewImages/1097248_DF_070_070BDF0010_04158_RAW.jpg",
      crackMask: "https://raw.githubusercontent.com/biankatpas/Cracks-and-Potholes-in-Road-Images-Dataset/master/PreviewImages/1097248_DF_070_070BDF0010_04158_CRACK.png",
      pothole: "https://raw.githubusercontent.com/biankatpas/Cracks-and-Potholes-in-Road-Images-Dataset/master/PreviewImages/1097248_DF_070_070BDF0010_04158_RAW.jpg",
      spalling: "https://raw.githubusercontent.com/berttarosio/StructuralDefects/master/Examples/spalling_01.jpg",
      corrosion: "https://raw.githubusercontent.com/berttarosio/StructuralDefects/master/Examples/corrosion_01.jpg",
    },
  },
  iiitDelhi: {
    campusPhoto: "https://upload.wikimedia.org/wikipedia/commons/thumb/8/89/IIIT-Delhi_Entrance.jpg/800px-IIIT-Delhi_Entrance.jpg",
    campusPhotoCredit: "IIIT-Delhi campus via Wikimedia Commons",
    defectImages: {
      crack: "https://raw.githubusercontent.com/biankatpas/Cracks-and-Potholes-in-Road-Images-Dataset/master/PreviewImages/1097248_DF_070_070BDF0010_04158_RAW.jpg",
      crackMask: "https://raw.githubusercontent.com/biankatpas/Cracks-and-Potholes-in-Road-Images-Dataset/master/PreviewImages/1097248_DF_070_070BDF0010_04158_CRACK.png",
      pothole: "https://raw.githubusercontent.com/biankatpas/Cracks-and-Potholes-in-Road-Images-Dataset/master/PreviewImages/1097248_DF_070_070BDF0010_04158_RAW.jpg",
      structural: "https://raw.githubusercontent.com/berttarosio/StructuralDefects/master/Examples/cracks_01.jpg",
      exposed_rebar: "https://raw.githubusercontent.com/berttarosio/StructuralDefects/master/Examples/exposed_rebar_01.jpg",
      settlement: "https://raw.githubusercontent.com/berttarosio/StructuralDefects/master/Examples/settlement_01.jpg",
    },
  },
  publicDataset: {
    attribution: "CC BY 4.0 from https://github.com/biankatpas/Cracks-and-Potholes-in-Road-Images-Dataset",
    sampleImage: "https://raw.githubusercontent.com/biankatpas/Cracks-and-Potholes-in-Road-Images-Dataset/master/PreviewImages/1097248_DF_070_070BDF0010_04158_RAW.jpg",
  },
  railwayDefects: {
    crack: "https://raw.githubusercontent.com/berttarosio/StructuralDefects/master/Examples/rail_crack_01.jpg",
    brokenRail: "https://raw.githubusercontent.com/berttarosio/StructuralDefects/master/Examples/broken_rail_01.jpg",
    railAlignment: "https://raw.githubusercontent.com/berttarosio/StructuralDefects/master/Examples/rail_alignment_01.jpg",
  },
};

export function getDefectImageForCampus(campus: "IGDTUW" | "IIIT-Delhi", defectType: string): string {
  const campusKey = campus === "IGDTUW" ? "igdtuw" : "iiitDelhi";
  const campus = CAMPUS_IMAGES[campusKey];
  return campus.defectImages[defectType as keyof typeof campus.defectImages] || campus.defectImages.crack;
}
