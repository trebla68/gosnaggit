"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import AuthModal from "./components/AuthModal";
import { api } from "../lib/api";

function isActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(href + "/");
}

export default function TopNav() {
  const pathname = usePathname() || "/";
  const router = useRouter();

  const [me, setMe] = useState<any>(null);
  const [authOpen, setAuthOpen] = useState(false);
  const [authReason, setAuthReason] = useState<string | null>(null);

  async function refreshMe() {
    try {
      const r = await api.me();
      const next = r?.ok ? r.user : null;
      setMe(next);

      // Cache auth state client-side so pages can pre-emptively open the login modal
      // (instead of waiting for a backend 401).
      if (typeof window !== "undefined") {
        try {
          if (next) {
            window.localStorage.setItem("gs-authed", "1");
            window.localStorage.setItem("gs-is-admin", next?.is_admin ? "1" : "0");
          } else {
            window.localStorage.removeItem("gs-authed");
            window.localStorage.removeItem("gs-is-admin");
          }
        } catch {
          // ignore
        }
      }
    } catch {
      setMe(null);

      if (typeof window !== "undefined") {
        try {
          window.localStorage.removeItem("gs-authed");
          window.localStorage.removeItem("gs-is-admin");
        } catch {
          // ignore
        }
      }
    }
  }

  useEffect(() => {
    refreshMe();
    // Listen for "auth required" events fired by pages
    function onNeedAuth(e: any) {
      setAuthReason(e?.detail?.reason || "To run more searches or set up alerts, please log in.");
      setAuthOpen(true);
    }
    window.addEventListener("gs-auth-required", onNeedAuth as any);
    return () => window.removeEventListener("gs-auth-required", onNeedAuth as any);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function logout() {
    try {
      await api.logout();
      if (typeof window !== "undefined") {
        try {
          window.localStorage.removeItem("gs-authed");
          window.localStorage.removeItem("gs-is-admin");
          window.localStorage.removeItem("gs-free-used");
        } catch {
          // ignore
        }
      }
    } finally {
      setMe(null);
      router.push("/");
      router.refresh();
    }
  }

  const links = [
    { href: "/", label: "Home" },
    { href: "/new-search", label: "New search" },
    { href: "/saved-searches", label: "Saved searches" },
    { href: "/pricing", label: "Pricing" },
    { href: "/about", label: "About" },
    { href: "/privacy", label: "Privacy" },
  ];

  return (
    <>
      <nav className="nav" aria-label="Primary">
        {links.map((l) => (
          <a key={l.href} href={l.href} className={isActive(pathname, l.href) ? "active" : ""}>
            {l.label}
          </a>
        ))}

        <span style={{ marginLeft: "auto", display: "flex", gap: 8, alignItems: "center" }}>
          {me?.is_admin ? (
            <a href="/admin" className={isActive(pathname, "/admin") ? "active" : ""}>
              Admin
            </a>
          ) : null}

          {me ? (
            <>
              <span className="pill neutral" title={me.email}>
                {me.email}
              </span>
              <button className="btn" type="button" onClick={logout}>
                Log out
              </button>
            </>
          ) : (
            <button
              className="btn"
              type="button"
              onClick={() => {
                setAuthReason(null);
                setAuthOpen(true);
              }}
            >
              Log in
            </button>
          )}
        </span>
      </nav>

      <AuthModal
        open={authOpen}
        reason={authReason}
        onClose={() => setAuthOpen(false)}
        onAuthed={() => {
          refreshMe();
          router.refresh();
        }}
      />
    </>
  );
}
