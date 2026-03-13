import {
    pgTable,
    serial,
    text,
    timestamp,
    numeric,
    boolean,
    integer,
    jsonb,
    uniqueIndex,
} from "drizzle-orm/pg-core";

export const users = pgTable("users", {
    id: serial("id").primaryKey(),
    email: text("email").notNull().unique(),
    name: text("name"),
    passwordHash: text("password_hash"),
    isAdmin: boolean("is_admin").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const searches = pgTable("searches", {
    id: serial("id").primaryKey(),
    userId: integer("user_id").references(() => users.id),
    searchItem: text("search_item").notNull(),
    location: text("location"),
    category: text("category"),
    maxPrice: numeric("max_price", { precision: 12, scale: 2 }),
    status: text("status").default("active"),
    planTier: text("plan_tier").default("free"),
    marketplaces: jsonb("marketplaces"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    nextRefreshAt: timestamp("next_refresh_at", { withTimezone: true }),
    lastFoundAt: timestamp("last_found_at", { withTimezone: true }),
});

export const results = pgTable("results", {
    id: serial("id").primaryKey(),
    searchId: integer("search_id")
        .notNull()
        .references(() => searches.id, { onDelete: "cascade" }),
    marketplace: text("marketplace"),
    externalId: text("external_id"),
    title: text("title"),
    price: text("price"),
    currency: text("currency"),
    priceNum: numeric("price_num", { precision: 12, scale: 2 }),
    shippingNum: numeric("shipping_num", { precision: 12, scale: 2 }),
    totalPrice: numeric("total_price", { precision: 12, scale: 2 }),
    listingUrl: text("listing_url"),
    imageUrl: text("image_url"),
    location: text("location"),
    condition: text("condition"),
    sellerUsername: text("seller_username"),
    foundAt: timestamp("found_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const listings = pgTable(
    "listings",
    {
        id: serial("id").primaryKey(),
        marketplace: text("marketplace").notNull(),
        externalId: text("external_id").notNull(),
        title: text("title"),
        price: text("price"),
        currency: text("currency"),
        priceNum: numeric("price_num", { precision: 12, scale: 2 }),
        shippingNum: numeric("shipping_num", { precision: 12, scale: 2 }),
        totalPrice: numeric("total_price", { precision: 12, scale: 2 }),
        listingUrl: text("listing_url"),
        imageUrl: text("image_url"),
        location: text("location"),
        condition: text("condition"),
        sellerUsername: text("seller_username"),
        firstSeenAt: timestamp("first_seen_at", { withTimezone: true }).defaultNow().notNull(),
        lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).defaultNow().notNull(),
        createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    },
    (table) => ({
        marketplaceExternalIdUnique: uniqueIndex("listings_marketplace_external_id_idx").on(
            table.marketplace,
            table.externalId
        ),
    })
);

export const searchResults = pgTable(
    "search_results",
    {
        id: serial("id").primaryKey(),
        searchId: integer("search_id")
            .notNull()
            .references(() => searches.id, { onDelete: "cascade" }),
        listingId: integer("listing_id")
            .notNull()
            .references(() => listings.id, { onDelete: "cascade" }),
        foundAt: timestamp("found_at", { withTimezone: true }).defaultNow().notNull(),
        createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    },
    (table) => ({
        searchListingUnique: uniqueIndex("search_results_search_listing_idx").on(
            table.searchId,
            table.listingId
        ),
    })
);

export const alerts = pgTable("alerts", {
    id: serial("id").primaryKey(),
    searchId: integer("search_id")
        .notNull()
        .references(() => searches.id, { onDelete: "cascade" }),
    searchResultId: integer("search_result_id").references(() => searchResults.id, {
        onDelete: "set null",
    }),
    status: text("status").notNull().default("pending"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const notificationSettings = pgTable("notification_settings", {
    id: serial("id").primaryKey(),
    searchId: integer("search_id")
        .notNull()
        .references(() => searches.id, { onDelete: "cascade" }),
    channel: text("channel").notNull(),
    destination: text("destination"),
    isEnabled: boolean("is_enabled").notNull().default(true),
});