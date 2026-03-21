import { normalizeCountryToken, normalizeStateToken } from "./normalize";
import { lookupZipPrefixRegion } from "./postalInference";
import { normalizeForComparison, normalizeWhitespace } from "./strings";

export function extractLocationTokens(value: string): string[] {
    return normalizeForComparison(value)
        .split(" ")
        .filter(Boolean);
}

export function getExpandedLocationText(value: string | null | undefined): string {
    const raw = normalizeWhitespace(value ?? "");
    if (!raw) return "";

    const parts = [raw];

    const zipMatch = raw.match(/\b(\d{3})\*\*\b/);
    if (zipMatch) {
        const region = lookupZipPrefixRegion(`${zipMatch[1]}**`);
        if (region) {
            parts.push(region.stateName);
            parts.push(region.stateCode);
            if (region.areaLabel) {
                parts.push(region.areaLabel);
            }
        }
    }

    if (raw.toLowerCase().startsWith("approx.")) {
        const withoutApprox = raw.replace(/^approx\.\s*/i, "");
        parts.push(withoutApprox);
    }

    return normalizeWhitespace(parts.join(" "));
}

export function locationMatchScore(
    listingLocation: string | null | undefined,
    requestedLocation: string | null | undefined
): number {
    if (!listingLocation || !requestedLocation) return 0;

    const listingRaw = getExpandedLocationText(listingLocation);
    const requestedRaw = normalizeWhitespace(requestedLocation);

    const listing = normalizeForComparison(listingRaw);
    const requested = normalizeForComparison(requestedRaw);

    if (!listing || !requested) return 0;
    if (listing === requested) return 100;
    if (listing.includes(requested)) return 85;
    if (requested.includes(listing)) return 65;

    let score = 0;

    const listingTokens = extractLocationTokens(listingRaw);
    const requestedTokens = extractLocationTokens(requestedRaw);

    const listingStateCodes = new Set(
        listingTokens
            .map(normalizeStateToken)
            .filter((value): value is string => Boolean(value))
    );
    const requestedStateCodes = new Set(
        requestedTokens
            .map(normalizeStateToken)
            .filter((value): value is string => Boolean(value))
    );

    const listingCountryCodes = new Set(
        listingTokens
            .map(normalizeCountryToken)
            .filter((value): value is string => Boolean(value))
    );
    const requestedCountryCodes = new Set(
        requestedTokens
            .map(normalizeCountryToken)
            .filter((value): value is string => Boolean(value))
    );

    for (const stateCode of requestedStateCodes) {
        if (listingStateCodes.has(stateCode)) {
            score += 40;
        }
    }

    for (const countryCode of requestedCountryCodes) {
        if (listingCountryCodes.has(countryCode)) {
            score += 20;
        }
    }

    for (const token of requestedTokens) {
        if (token.length >= 3 && listing.includes(token)) {
            score += 8;
        }
    }

    return score;
}

export function rankListingsByLocation<T extends { location: string | null }>(
    listings: T[],
    requestedLocation?: string | null
): T[] {
    if (!requestedLocation || !normalizeWhitespace(requestedLocation)) {
        return listings;
    }

    return [...listings].sort((a, b) => {
        const scoreA = locationMatchScore(a.location, requestedLocation);
        const scoreB = locationMatchScore(b.location, requestedLocation);

        if (scoreA !== scoreB) {
            return scoreB - scoreA;
        }

        return 0;
    });
}