import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "Style-Edit | Clothing E-Commerce POC",
  description: "Minimal project foundation for clothing e-commerce Proof of Concept",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-neutral-50 text-neutral-900 antialiased flex flex-col font-sans">
        <header className="border-b border-neutral-200 bg-white">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="font-bold text-lg tracking-tight text-neutral-900">
                Style-Edit
              </span>
              <span className="text-xs uppercase tracking-wider font-semibold bg-neutral-100 text-neutral-600 px-2 py-0.5 rounded border border-neutral-200">
                POC Foundation
              </span>
            </div>
            <nav className="flex items-center gap-4 text-sm font-medium">
              <Link
                href="/"
                className="text-neutral-600 hover:text-neutral-900 transition-colors"
              >
                Storefront
              </Link>
              <Link
                href="/admin"
                className="text-neutral-600 hover:text-neutral-900 transition-colors"
              >
                Admin
              </Link>
            </nav>
          </div>
        </header>

        <main className="flex-1 max-w-6xl w-full mx-auto px-4 sm:px-6 py-8">
          {children}
        </main>

        <footer className="border-t border-neutral-200 bg-white text-xs text-neutral-500 py-6">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 flex flex-col sm:flex-row items-center justify-between gap-2">
            <p>Style-Edit POC Foundation — Architecture Ready for Supabase Integration</p>
            <p className="text-neutral-400">Target: 500–600 Catalog Images</p>
          </div>
        </footer>
      </body>
    </html>
  );
}
