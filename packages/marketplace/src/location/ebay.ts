import type { NormalizedLocation } from "./types";
import { formatApproximateLocationFromPostalCode } from "./postalInference";
import { dedupeParts, normalizeWhitespace } from "./strings";

export type EbayLocationInput = {
    itemLocation?: {
        city?: string;
        stateOrProvince?: string;
        country?: string;
        postalCode?: string;
    };
};

export function normalizeEbayLocation(item: EbayLocationInput): NormalizedLocation {
    const city = normalizeWhitespace(item.itemLocation?.city ?? "");
    const state = normalizeWhitespace(item.itemLocation?.stateOrProvince ?? "");
    const postalCode = normalizeWhitespace(item.itemLocation?.postalCode ?? "");
    const country = normalizeWhitespace(item.itemLocation?.country ?? "");

    const rawLocation = dedupeParts([city, state, postalCode, country]).join(", ") || null;

    if (city && state) {
        return {
            rawLocation,
            city,
            state,
            postalCode: postalCode || null,
            country: country || null,
            displayLocation: dedupeParts([city, state]).join(", "),
            locationConfidence: "exact",
            locationSource: "structured",
        };
    }

    if (city) {
        return {
            rawLocation,
            city,
            state: null,
            postalCode: postalCode || null,
            country: country || null,
            displayLocation:
                country && country !== "US"
                    ? dedupeParts([city, country]).join(", ")
                    : city,
            locationConfidence: "low",
            locationSource: "structured",
        };
    }

    if (state) {
        return {
            rawLocation,
            city: null,
            state,
            postalCode: postalCode || null,
            country: country || null,
            displayLocation:
                country && country !== "US"
                    ? dedupeParts([state, country]).join(", ")
                    : state,
            locationConfidence: "low",
            locationSource: "structured",
        };
    }

    const approx = formatApproximateLocationFromPostalCode(postalCode, country);
    if (approx) {
        return {
            rawLocation,
            city: null,
            state: null,
            postalCode: postalCode || null,
            country: country || null,
            displayLocation: approx,
            locationConfidence: "approximate",
            locationSource: "postal_inference",
        };
    }

    if (country) {
        return {
            rawLocation,
            city: null,
            state: null,
            postalCode: postalCode || null,
            country,
            displayLocation: country,
            locationConfidence: "low",
            locationSource: "country_only",
        };
    }

    return {
        rawLocation,
        city: null,
        state: null,
        postalCode: postalCode || null,
        country: null,
        displayLocation: null,
        locationConfidence: "unknown",
        locationSource: "none",
    };
}