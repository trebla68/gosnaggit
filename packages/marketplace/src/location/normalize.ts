import { normalizeForComparison } from "./strings";

const US_STATE_NAME_TO_CODE: Record<string, string> = {
    alabama: "AL",
    alaska: "AK",
    arizona: "AZ",
    arkansas: "AR",
    california: "CA",
    colorado: "CO",
    connecticut: "CT",
    delaware: "DE",
    florida: "FL",
    georgia: "GA",
    hawaii: "HI",
    idaho: "ID",
    illinois: "IL",
    indiana: "IN",
    iowa: "IA",
    kansas: "KS",
    kentucky: "KY",
    louisiana: "LA",
    maine: "ME",
    maryland: "MD",
    massachusetts: "MA",
    michigan: "MI",
    minnesota: "MN",
    mississippi: "MS",
    missouri: "MO",
    montana: "MT",
    nebraska: "NE",
    nevada: "NV",
    "new hampshire": "NH",
    "new jersey": "NJ",
    "new mexico": "NM",
    "new york": "NY",
    "north carolina": "NC",
    "north dakota": "ND",
    ohio: "OH",
    oklahoma: "OK",
    oregon: "OR",
    pennsylvania: "PA",
    "rhode island": "RI",
    "south carolina": "SC",
    "south dakota": "SD",
    tennessee: "TN",
    texas: "TX",
    utah: "UT",
    vermont: "VT",
    virginia: "VA",
    washington: "WA",
    "west virginia": "WV",
    wisconsin: "WI",
    wyoming: "WY",
    "district of columbia": "DC",
};

const US_STATE_CODE_TO_NAME: Record<string, string> = Object.fromEntries(
    Object.entries(US_STATE_NAME_TO_CODE).map(([name, code]) => [code, name])
);

const COUNTRY_ALIASES: Record<string, string[]> = {
    US: ["us", "usa", "u s a", "united states", "united states of america"],
    CA: ["ca", "canada"],
    GB: ["gb", "uk", "u k", "united kingdom", "great britain", "england"],
    AU: ["au", "australia"],
    DE: ["de", "germany"],
    FR: ["fr", "france"],
};

export function normalizeStateToken(value: string): string | null {
    const cleaned = normalizeForComparison(value);
    if (!cleaned) return null;

    if (cleaned.length === 2) {
        const upper = cleaned.toUpperCase();
        if (US_STATE_CODE_TO_NAME[upper]) return upper;
    }

    const stateCode = US_STATE_NAME_TO_CODE[cleaned];
    return stateCode ?? null;
}

export function normalizeCountryToken(value: string): string | null {
    const cleaned = normalizeForComparison(value);
    if (!cleaned) return null;

    for (const [countryCode, aliases] of Object.entries(COUNTRY_ALIASES)) {
        if (aliases.includes(cleaned) || cleaned === countryCode.toLowerCase()) {
            return countryCode;
        }
    }

    return cleaned.toUpperCase();
}