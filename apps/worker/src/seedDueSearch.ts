import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({
    path: path.resolve(__dirname, "../../../.env"),
});

function getArgValue(name: string): string | undefined {
    const prefix = `--${name}=`;
    const match = process.argv.find((arg) => arg.startsWith(prefix));
    return match ? match.slice(prefix.length) : undefined;
}

async function main() {
    console.log("[seed] starting due-search seed...");

    const { createSearch } = await import("@gosnaggit/core");

    const searchItem = getArgValue("searchItem") || "vintage omega";
    const location = getArgValue("location") ?? null;
    const category = getArgValue("category") ?? null;
    const maxPriceRaw = getArgValue("maxPrice");
    const marketplaceArg = (getArgValue("marketplace") || "ebay").trim().toLowerCase();

    const maxPrice =
        maxPriceRaw && maxPriceRaw.trim() !== "" ? Number(maxPriceRaw) : null;

    if (maxPriceRaw && Number.isNaN(maxPrice)) {
        throw new Error(`Invalid --maxPrice value: ${maxPriceRaw}`);
    }

    const marketplaces: Record<string, boolean> = {
        [marketplaceArg]: true,
    };

    const search = await createSearch({
        searchItem,
        location,
        category,
        maxPrice,
        marketplaces,
    });

    console.log("[seed] created due search:");
    console.log(search);
    console.log(
        "[seed] this search should be picked up by the worker on the next polling cycle."
    );
}

main().catch((err) => {
    console.error("[seed] error:", err);
    process.exit(1);
});