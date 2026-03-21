export type LocationConfidence = "exact" | "approximate" | "low" | "unknown";

export type LocationSource =
    | "structured"
    | "postal_inference"
    | "text_parse"
    | "country_only"
    | "none";

export type NormalizedLocation = {
    rawLocation: string | null;
    city: string | null;
    state: string | null;
    postalCode: string | null;
    country: string | null;
    displayLocation: string | null;
    locationConfidence: LocationConfidence;
    locationSource: LocationSource;
};

export type ZipPrefixRegion = {
    zipPrefix: string;
    stateCode: string;
    stateName: string;
    areaLabel: string | null;
};