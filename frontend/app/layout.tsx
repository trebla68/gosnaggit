import "./globals.css";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import BrandMark from "../components/BrandMark";
import TopNav from "./topnav";

export const metadata: Metadata = {
  title: "GoSnaggit Beta",
  description: "Find hard-to-find items fast.",
  icons: {
    icon: "/favicon.svg",
  },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div className="shell">
          <header className="topbar">
            <div className="brand">
              <BrandMark className="logo" />
              <div className="brandText">
                <div className="name">GoSnaggit</div>
                <div className="tag">Find it first</div>
              </div>
            </div>

            <TopNav />
          </header>

          <main className="main">{children}</main>

          <footer className="footer">
            <a href="/about">About</a>
            <a href="/privacy">Privacy</a>
            <a href="/contact">Contact</a>
          </footer>
        </div>
      </body>
    </html>
  );
}
