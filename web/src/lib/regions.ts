// The 13 Greek NUTS-2 regions, for the region filter. Codes and names from
// pipeline/src/ixnos_data_pipeline/reference/data/nuts_2024_el.csv (Eurostat NUTS 2024).
// A NUTS-2 filter also matches the prefectures (NUTS-3) inside it. English names are the
// conventional ones; Eurostat's English labels are transliterations ("Ipeiros").

export const REGIONS: ReadonlyArray<{ code: string; nameEl: string; nameEn: string }> = [
  { code: "EL30", nameEl: "Αττική", nameEn: "Attica" },
  { code: "EL41", nameEl: "Βόρειο Αιγαίο", nameEn: "North Aegean" },
  { code: "EL42", nameEl: "Νότιο Αιγαίο", nameEn: "South Aegean" },
  { code: "EL43", nameEl: "Κρήτη", nameEn: "Crete" },
  { code: "EL51", nameEl: "Ανατολική Μακεδονία, Θράκη", nameEn: "Eastern Macedonia and Thrace" },
  { code: "EL52", nameEl: "Κεντρική Μακεδονία", nameEn: "Central Macedonia" },
  { code: "EL53", nameEl: "Δυτική Μακεδονία", nameEn: "Western Macedonia" },
  { code: "EL54", nameEl: "Ήπειρος", nameEn: "Epirus" },
  { code: "EL61", nameEl: "Θεσσαλία", nameEn: "Thessaly" },
  { code: "EL62", nameEl: "Ιόνια Νησιά", nameEn: "Ionian Islands" },
  { code: "EL63", nameEl: "Δυτική Ελλάδα", nameEn: "Western Greece" },
  { code: "EL64", nameEl: "Στερεά Ελλάδα", nameEn: "Central Greece" },
  { code: "EL65", nameEl: "Πελοπόννησος", nameEn: "Peloponnese" },
];

export const KINDS = [
  "notice",
  "award",
  "contract",
  "payment",
  "request",
  "commitment",
  "spending_approval",
  "final_award",
] as const;
