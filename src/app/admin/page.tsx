"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getSupabaseClient } from "@/lib/supabase/client";
import { verifyAdminAuthorization, type AdminVerificationResult } from "@/lib/supabase/auth";

export default function AdminPage() {
  const [authStatus, setAuthStatus] = useState<AdminVerificationResult>({
    isAuthenticated: false,
    isAdmin: false,
    user: null,
  });
  const [isChecking, setIsChecking] = useState<boolean>(true);
  const [isLoggingOut, setIsLoggingOut] = useState<boolean>(false);

  useEffect(() => {
    let isMounted = true;

    async function checkAuth() {
      try {
        const result = await verifyAdminAuthorization();
        if (isMounted) {
          setAuthStatus(result);
        }
      } finally {
        if (isMounted) {
          setIsChecking(false);
        }
      }
    }

    checkAuth();

    return () => {
      isMounted = false;
    };
  }, []);

  async function handleLogout() {
    setIsLoggingOut(true);
    try {
      const client = getSupabaseClient();
      await client.auth.signOut();
      setAuthStatus({
        isAuthenticated: false,
        isAdmin: false,
        user: null,
      });
    } finally {
      setIsLoggingOut(false);
    }
  }

  if (isChecking) {
    return (
      <div className="max-w-4xl mx-auto p-12 text-center text-xs text-neutral-500 font-mono">
        Verifying administrator authorization...
      </div>
    );
  }

  // Case 1: Unauthenticated or Unauthorized
  if (!authStatus.isAdmin) {
    return (
      <div className="max-w-2xl mx-auto space-y-6">
        <div className="bg-white border border-neutral-200 rounded-xl p-8 shadow-xs text-center space-y-4">
          <div className="w-12 h-12 rounded-full bg-amber-50 border border-amber-200 text-amber-700 flex items-center justify-center mx-auto">
            <svg
              className="w-6 h-6"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
              />
            </svg>
          </div>

          <div className="space-y-1">
            <h1 className="text-xl font-bold tracking-tight text-neutral-900">
              Administrator Access Required
            </h1>
            <p className="text-xs text-neutral-600 max-w-md mx-auto leading-relaxed">
              {authStatus.isAuthenticated
                ? "Your account is authenticated, but is not registered in the app_admins table or granted an admin role."
                : "You must be signed in with an authorized administrator account to access this management interface."}
            </p>
          </div>

          {authStatus.isAuthenticated && authStatus.user && (
            <div className="bg-neutral-50 border border-neutral-200 rounded-lg p-3 text-xs text-neutral-600 max-w-md mx-auto text-left space-y-1">
              <p>
                <strong>User ID:</strong>{" "}
                <code className="font-mono text-[11px] bg-white px-1.5 py-0.5 rounded border border-neutral-200">
                  {authStatus.user.id}
                </code>
              </p>
              <p>
                <strong>Email:</strong> {authStatus.user.email}
              </p>
              <p className="text-[11px] text-neutral-500 pt-1">
                To grant admin privileges, insert this User ID into <code className="font-mono">public.app_admins</code> in Supabase.
              </p>
            </div>
          )}

          <div className="flex items-center justify-center gap-3 pt-2">
            {!authStatus.isAuthenticated ? (
              <Link
                href="/admin/login"
                className="inline-flex items-center justify-center px-5 py-2.5 bg-neutral-900 text-white rounded-lg text-xs font-semibold hover:bg-neutral-800 transition-colors"
              >
                Sign In as Administrator →
              </Link>
            ) : (
              <button
                type="button"
                onClick={handleLogout}
                disabled={isLoggingOut}
                className="inline-flex items-center justify-center px-4 py-2 border border-rose-300 text-rose-700 rounded-lg text-xs font-semibold hover:bg-rose-50 transition-colors"
              >
                {isLoggingOut ? "Signing Out..." : "Sign Out Current Account"}
              </button>
            )}

            <Link
              href="/"
              className="inline-flex items-center justify-center px-4 py-2.5 border border-neutral-300 text-neutral-700 rounded-lg text-xs font-medium hover:bg-neutral-50 transition-colors"
            >
              ← Back to Storefront
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // Case 2: Authorized Administrator
  return (
    <div className="space-y-8">
      {/* Route Banner with Active Admin Status */}
      <section className="bg-white border border-neutral-200 rounded-xl p-6 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="max-w-2xl">
            <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-medium mb-3">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
              Authorized Administrator: {authStatus.user?.email || authStatus.user?.id}
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-neutral-900 sm:text-3xl">
              Admin Management Interface
            </h1>
            <p className="mt-2 text-sm text-neutral-600 leading-relaxed">
              Welcome to the administrator portal. Manage image assets, test catalog data,
              and verify database connectivity.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleLogout}
              disabled={isLoggingOut}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-neutral-300 text-neutral-700 rounded-lg text-xs font-medium hover:bg-neutral-100 transition-colors"
            >
              {isLoggingOut ? "Signing Out..." : "Sign Out"}
            </button>
          </div>
        </div>
      </section>

      {/* Admin Modules */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Module 1: Product Creation POC */}
        <section className="bg-white border border-neutral-200 rounded-lg p-6 space-y-4">
          <div className="flex items-center justify-between border-b border-neutral-100 pb-3">
            <h2 className="text-base font-semibold text-neutral-800">
              Product Creation
            </h2>
            <span className="text-xs bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5 rounded font-mono font-medium">
              Milestone Active
            </span>
          </div>
          <p className="text-xs text-neutral-600">
            Create products with categories, variants (size/color), and upload multiple image assets to Supabase Storage.
          </p>
          <div className="border border-neutral-200 rounded-lg p-6 flex flex-col items-center justify-center text-center gap-3 bg-neutral-50/50">
            <p className="text-xs text-neutral-700 font-medium">
              Product creation form:
            </p>
            <Link
              href="/admin/products/new"
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-neutral-900 text-white rounded-lg text-xs font-semibold hover:bg-neutral-800 transition-colors"
            >
              + Create New Product →
            </Link>
          </div>
        </section>

        {/* Module 2: Image Storage Upload POC */}
        <section className="bg-white border border-neutral-200 rounded-lg p-6 space-y-4">
          <div className="flex items-center justify-between border-b border-neutral-100 pb-3">
            <h2 className="text-base font-semibold text-neutral-800">
              Image Storage Test
            </h2>
            <span className="text-xs bg-neutral-100 text-neutral-600 px-2 py-0.5 rounded font-mono">
              POC Tool
            </span>
          </div>
          <p className="text-xs text-neutral-600">
            Upload single test image files into the dedicated Supabase Storage bucket (`product-images`).
          </p>
          <div className="border border-neutral-200 rounded-lg p-6 flex flex-col items-center justify-center text-center gap-3 bg-neutral-50/50">
            <p className="text-xs text-neutral-700 font-medium">
              Isolated single-image tester:
            </p>
            <Link
              href="/admin/image-test"
              className="inline-flex items-center gap-1.5 px-4 py-2 border border-neutral-300 text-neutral-700 rounded-lg text-xs font-medium hover:bg-neutral-100 transition-colors"
            >
              Open Image Tester →
            </Link>
          </div>
        </section>

        {/* Module 3: Connectivity & Diagnostics */}
        <section className="bg-white border border-neutral-200 rounded-lg p-6 space-y-4">
          <div className="flex items-center justify-between border-b border-neutral-100 pb-3">
            <h2 className="text-base font-semibold text-neutral-800">
              Supabase Diagnostics
            </h2>
            <span className="text-xs bg-neutral-100 text-neutral-600 px-2 py-0.5 rounded font-mono">
              Diagnostic
            </span>
          </div>
          <p className="text-xs text-neutral-600">
            Verify API reachability, Auth endpoints, and project health checks.
          </p>
          <div className="border border-neutral-200 rounded-lg p-6 flex flex-col items-center justify-center text-center gap-3 bg-neutral-50/50">
            <p className="text-xs text-neutral-700 font-medium">
              API connectivity verification:
            </p>
            <Link
              href="/admin/supabase-test"
              className="inline-flex items-center gap-1.5 px-4 py-2 border border-neutral-300 text-neutral-700 rounded-lg text-xs font-medium hover:bg-neutral-100 transition-colors"
            >
              Open Connectivity Test →
            </Link>
          </div>
        </section>
      </div>

      {/* Security Status Card */}
      <section className="border border-emerald-200 rounded-lg bg-emerald-50/50 p-5 text-xs text-emerald-900 space-y-2">
        <p className="font-semibold uppercase tracking-wider">
          Active Security Context
        </p>
        <p>
          You are authenticated with an authorized administrator session. API requests will pass
          your authorization token to Supabase, satisfying Row Level Security (RLS) policies for administrative operations.
        </p>
      </section>
    </div>
  );
}
