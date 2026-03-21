export type ZipPrefixRegion = {
    zipPrefix: string;
    stateCode: string;
    stateName: string;
    areaLabel: string | null;
};

type ZipPrefixRange = {
    start: number;
    end: number;
    stateCode: string;
    stateName: string;
    areaLabel?: string;
};

const ZIP_PREFIX_RANGES: ZipPrefixRange[] = [
    { start: 350, end: 369, stateCode: "AL", stateName: "Alabama", areaLabel: "Birmingham area" },
    { start: 995, end: 999, stateCode: "AK", stateName: "Alaska", areaLabel: "Anchorage area" },
    { start: 850, end: 869, stateCode: "AZ", stateName: "Arizona", areaLabel: "Phoenix area" },
    { start: 716, end: 729, stateCode: "AR", stateName: "Arkansas", areaLabel: "Little Rock area" },
    { start: 900, end: 961, stateCode: "CA", stateName: "California", areaLabel: "California region" },
    { start: 800, end: 816, stateCode: "CO", stateName: "Colorado", areaLabel: "Denver area" },
    { start: 600, end: 699, stateCode: "IL", stateName: "Illinois", areaLabel: "Illinois region" },
    { start: 460, end: 479, stateCode: "IN", stateName: "Indiana", areaLabel: "Indianapolis area" },
    { start: 500, end: 528, stateCode: "IA", stateName: "Iowa", areaLabel: "Carroll area" },
    { start: 660, end: 679, stateCode: "KS", stateName: "Kansas", areaLabel: "Wichita area" },
    { start: 400, end: 427, stateCode: "KY", stateName: "Kentucky", areaLabel: "Louisville area" },
    { start: 700, end: 714, stateCode: "LA", stateName: "Louisiana", areaLabel: "New Orleans area" },
    { start: 10, end: 27, stateCode: "MA", stateName: "Massachusetts", areaLabel: "Boston area" },
    { start: 480, end: 499, stateCode: "MI", stateName: "Michigan", areaLabel: "Detroit area" },
    { start: 550, end: 567, stateCode: "MN", stateName: "Minnesota", areaLabel: "Minneapolis area" },
    { start: 386, end: 397, stateCode: "MS", stateName: "Mississippi", areaLabel: "Mississippi region" },
    { start: 630, end: 658, stateCode: "MO", stateName: "Missouri", areaLabel: "St. Louis area" },
    { start: 590, end: 599, stateCode: "MT", stateName: "Montana", areaLabel: "Montana region" },
    { start: 270, end: 289, stateCode: "NC", stateName: "North Carolina", areaLabel: "Charlotte area" },
    { start: 580, end: 588, stateCode: "ND", stateName: "North Dakota", areaLabel: "Fargo area" },
    { start: 430, end: 459, stateCode: "OH", stateName: "Ohio", areaLabel: "Mansfield area" },
    { start: 730, end: 749, stateCode: "OK", stateName: "Oklahoma", areaLabel: "Oklahoma City area" },
    { start: 970, end: 979, stateCode: "OR", stateName: "Oregon", areaLabel: "Portland area" },
    { start: 150, end: 196, stateCode: "PA", stateName: "Pennsylvania", areaLabel: "Pittsburgh area" },
    { start: 370, end: 385, stateCode: "TN", stateName: "Tennessee", areaLabel: "Nashville area" },
    { start: 750, end: 799, stateCode: "TX", stateName: "Texas", areaLabel: "Dallas area" },
    { start: 840, end: 847, stateCode: "UT", stateName: "Utah", areaLabel: "Salt Lake City area" },
    { start: 201, end: 246, stateCode: "VA", stateName: "Virginia", areaLabel: "Richmond area" },
    { start: 980, end: 994, stateCode: "WA", stateName: "Washington", areaLabel: "Seattle area" },
    { start: 530, end: 549, stateCode: "WI", stateName: "Wisconsin", areaLabel: "Madison area" },
    { start: 820, end: 831, stateCode: "WY", stateName: "Wyoming", areaLabel: "Cheyenne area" },
];

export function isMaskedZipPrefix(value: string | null | undefined): boolean {
    if (!value) return false;
    return /^\d{3}\*\*$/.test(value.trim());
}

export function extractZipPrefix(value: string | null | undefined): string | null {
    if (!isMaskedZipPrefix(value)) return null;
    return value!.trim().slice(0, 3);
}

export function lookupZipPrefixRegion(
    value: string | null | undefined
): ZipPrefixRegion | null {
    const prefix = extractZipPrefix(value);
    if (!prefix) return null;

    const numeric = Number(prefix);
    if (!Number.isInteger(numeric)) return null;

    const match = ZIP_PREFIX_RANGES.find(
        (range) => numeric >= range.start && numeric <= range.end
    );

    if (!match) return null;

    return {
        zipPrefix: prefix,
        stateCode: match.stateCode,
        stateName: match.stateName,
        areaLabel: match.areaLabel ?? null,
    };
}

export function formatApproximateLocationFromPostalCode(
    postalCode: string | null | undefined,
    country: string | null | undefined
): string | null {
    const region = lookupZipPrefixRegion(postalCode);
    const normalizedCountry = (country ?? "").trim();

    if (region?.areaLabel) {
        if (normalizedCountry && normalizedCountry !== "US") {
            return `Approx. ${region.areaLabel}, ${region.stateCode}, ${normalizedCountry}`;
        }
        return `Approx. ${region.areaLabel}, ${region.stateCode}`;
    }

    if (region) {
        if (normalizedCountry && normalizedCountry !== "US") {
            return `Approx. ${region.stateName}, ${normalizedCountry}`;
        }
        return `Approx. ${region.stateName}`;
    }

    if (isMaskedZipPrefix(postalCode)) {
        return normalizedCountry
            ? `Approx. ${normalizedCountry} region`
            : "Approx. region";
    }

    return null;
}