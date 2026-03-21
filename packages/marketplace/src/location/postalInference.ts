import type { ZipPrefixRegion } from "./types";

type ZipPrefixRange = {
    start: number;
    end: number;
    stateCode: string;
    stateName: string;
    areaLabel?: string;
};

const ZIP_PREFIX_RANGES: ZipPrefixRange[] = [
    { start: 28, end: 29, stateCode: "RI", stateName: "Rhode Island", areaLabel: "Providence area" },
    { start: 30, end: 38, stateCode: "NH", stateName: "New Hampshire", areaLabel: "Manchester area" },
    { start: 39, end: 49, stateCode: "ME", stateName: "Maine", areaLabel: "Portland area" },
    { start: 50, end: 59, stateCode: "VT", stateName: "Vermont", areaLabel: "Burlington area" },
    { start: 60, end: 69, stateCode: "CT", stateName: "Connecticut", areaLabel: "Hartford area" },
    { start: 70, end: 89, stateCode: "NJ", stateName: "New Jersey", areaLabel: "Newark area" },
    { start: 100, end: 149, stateCode: "NY", stateName: "New York", areaLabel: "New York City area" },
    { start: 150, end: 196, stateCode: "PA", stateName: "Pennsylvania", areaLabel: "Pittsburgh area" },
    { start: 197, end: 199, stateCode: "DE", stateName: "Delaware", areaLabel: "Wilmington area" },
    { start: 201, end: 246, stateCode: "VA", stateName: "Virginia", areaLabel: "Richmond area" },
    { start: 247, end: 268, stateCode: "WV", stateName: "West Virginia", areaLabel: "Charleston area" },
    { start: 270, end: 289, stateCode: "NC", stateName: "North Carolina", areaLabel: "Charlotte area" },
    { start: 290, end: 299, stateCode: "SC", stateName: "South Carolina", areaLabel: "Columbia area" },
    { start: 300, end: 319, stateCode: "GA", stateName: "Georgia", areaLabel: "Atlanta area" },
    { start: 320, end: 349, stateCode: "FL", stateName: "Florida", areaLabel: "Florida region" },
    { start: 350, end: 369, stateCode: "AL", stateName: "Alabama", areaLabel: "Birmingham area" },
    { start: 370, end: 385, stateCode: "TN", stateName: "Tennessee", areaLabel: "Nashville area" },
    { start: 386, end: 397, stateCode: "MS", stateName: "Mississippi", areaLabel: "Mississippi region" },
    { start: 398, end: 399, stateCode: "GA", stateName: "Georgia", areaLabel: "Georgia region" },
    { start: 400, end: 427, stateCode: "KY", stateName: "Kentucky", areaLabel: "Louisville area" },
    { start: 430, end: 459, stateCode: "OH", stateName: "Ohio", areaLabel: "Mansfield area" },
    { start: 460, end: 479, stateCode: "IN", stateName: "Indiana", areaLabel: "Indianapolis area" },
    { start: 480, end: 499, stateCode: "MI", stateName: "Michigan", areaLabel: "Detroit area" },
    { start: 500, end: 528, stateCode: "IA", stateName: "Iowa", areaLabel: "Carroll area" },
    { start: 530, end: 549, stateCode: "WI", stateName: "Wisconsin", areaLabel: "Madison area" },
    { start: 550, end: 567, stateCode: "MN", stateName: "Minnesota", areaLabel: "Minneapolis area" },
    { start: 580, end: 588, stateCode: "ND", stateName: "North Dakota", areaLabel: "Fargo area" },
    { start: 590, end: 599, stateCode: "MT", stateName: "Montana", areaLabel: "Montana region" },
    { start: 600, end: 699, stateCode: "IL", stateName: "Illinois", areaLabel: "Illinois region" },
    { start: 700, end: 714, stateCode: "LA", stateName: "Louisiana", areaLabel: "New Orleans area" },
    { start: 716, end: 729, stateCode: "AR", stateName: "Arkansas", areaLabel: "Little Rock area" },
    { start: 730, end: 749, stateCode: "OK", stateName: "Oklahoma", areaLabel: "Oklahoma City area" },
    { start: 750, end: 799, stateCode: "TX", stateName: "Texas", areaLabel: "Dallas area" },
    { start: 800, end: 816, stateCode: "CO", stateName: "Colorado", areaLabel: "Denver area" },
    { start: 820, end: 831, stateCode: "WY", stateName: "Wyoming", areaLabel: "Cheyenne area" },
    { start: 832, end: 838, stateCode: "ID", stateName: "Idaho", areaLabel: "Boise area" },
    { start: 840, end: 847, stateCode: "UT", stateName: "Utah", areaLabel: "Salt Lake City area" },
    { start: 850, end: 869, stateCode: "AZ", stateName: "Arizona", areaLabel: "Phoenix area" },
    { start: 870, end: 884, stateCode: "NM", stateName: "New Mexico", areaLabel: "Albuquerque area" },
    { start: 889, end: 898, stateCode: "NV", stateName: "Nevada", areaLabel: "Las Vegas area" },
    { start: 900, end: 961, stateCode: "CA", stateName: "California", areaLabel: "California region" },
    { start: 967, end: 968, stateCode: "HI", stateName: "Hawaii", areaLabel: "Honolulu area" },
    { start: 970, end: 979, stateCode: "OR", stateName: "Oregon", areaLabel: "Portland area" },
    { start: 980, end: 994, stateCode: "WA", stateName: "Washington", areaLabel: "Seattle area" },
    { start: 995, end: 999, stateCode: "AK", stateName: "Alaska", areaLabel: "Anchorage area" },
];

export function isMaskedZipPrefix(value: string | null | undefined): boolean {
    if (!value) return false;
    return /^\d{3}\*\*$/.test(value.trim());
}

export function extractZipPrefix(value: string | null | undefined): string | null {
    if (!isMaskedZipPrefix(value)) return null;
    return (value ?? "").trim().slice(0, 3);
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