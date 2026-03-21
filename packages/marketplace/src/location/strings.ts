export function normalizeWhitespace(value: string): string {
    return value.replace(/\s+/g, " ").trim();
}

export function stripPunctuation(value: string): string {
    return value.replace(/[.,/#!$%^&*;:{}=_`~()"'?<>[\]\\|+-]+/g, " ");
}

export function normalizeForComparison(value: string): string {
    return normalizeWhitespace(stripPunctuation(value).toLowerCase());
}

export function dedupeParts(parts: Array<string | null | undefined>): string[] {
    const result: string[] = [];
    const seen = new Set<string>();

    for (const part of parts) {
        const value = normalizeWhitespace(part ?? "");
        if (!value) continue;

        const key = value.toLowerCase();
        if (seen.has(key)) continue;

        seen.add(key);
        result.push(value);
    }

    return result;
}