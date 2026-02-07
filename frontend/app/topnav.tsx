"use client";

import { usePathname } from "next/navigation";

function isActive(pathname: string, href: string) {
    // Home: only exact "/"
    if (href === "/") return pathname === "/";

    // Other pages: match exact or subroutes (e.g. /saved-searches/157)
    return pathname === href || pathname.startsWith(href + "/");
}

export default function TopNav() {
    const pathname = usePathname() || "/";

    const links = [
        { href: "/", label: "Home" },
        { href: "/new-search", label: "New search" },
        { href: "/saved-searches", label: "Saved searches" },
        { href: "/deleted", label: "Deleted" },
    ];

    return (
        <nav className="nav" aria-label="Primary">
            {links.map((l) => (
                <a key={l.href} href={l.href} className={isActive(pathname, l.href) ? "active" : ""}>
                    {l.label}
                </a>
            ))}
        </nav>
    );
}
