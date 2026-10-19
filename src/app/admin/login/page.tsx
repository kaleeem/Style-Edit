"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { getSupabaseClient } from "@/lib/supabase/client";
import { verifyAdminAuthorization } from "@/lib/supabase/auth";

export default function AdminLoginPage() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [isLoading, setIsLoading] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);
  const [activeAdminEmail, setActiveAdminEmail] = useState<string | null>(null);

  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Check if an authorized admin is already logged in
  useEffect(() => {
    let isMounted = true;

    async function checkExistingAuth() {
      try {
        const result = await verifyAdminAuthorization();
        if (!isMounted) return;

        if (result.isAuthenticated && result.isAdmin && result.user) {
          setActiveAdminEmail(result.user.email || result.user.id);
        } else {
          setActiveAdminEmail(null);
        }
      } catch {
        if (isMounted) setActiveAdminEmail(null);
      } finally {
        if (isMounted) setCheckingSession(false);
      }
    }

    checkExistingAuth();

    return () => {
      isMounted = false;
    };
  }, []);

  async function handleLogin(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);

    if (!email.trim() || !password) {
      setErrorMessage("Please enter both email and password.");
      return;
    }

    setIsLoading(true);

    try {
      const client = getSupabaseClient();

      // 1. Authenticate with Supabase Auth
      const { data: authData, error: authError } =
        await client.auth.signInWithPassword({
          email: email.trim(),
          password,
        });

      if (authError || !authData.user) {
        setErrorMessage(
          authError?.message || "Invalid login credentials. Please check your email and password."
        );
        setIsLoading(false);
        return;
      }

      // 2. Explicitly verify administrator authorization
      const authCheck = await verifyAdminAuthorization();

      if (!authCheck.isAdmin) {
        // Enforce least privilege: Sign out unprivileged accounts immediately
        await client.auth.signOut();
        setErrorMessage(
          "Access Denied: Your account is authenticated, but is not authorized with administrator privileges in the database roster. You have been signed out."
        );
        setIsLoading(false);
        return;
      }

      // 3. Authorized admin confirmed
      setSuccessMessage("Administrator verified! Redirecting to admin portal...");
      setActiveAdminEmail(authData.user.email || authData.user.id);

      setTimeout(() => {
        router.push("/admin");
      }, 1000);
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : "An unexpected error occurred during login.";
      setErrorMessage(msg);
    } finally {
      setIsLoading(false);
    }
  }

  async function handleLogout() {
    setIsLoading(true);
    try {
      const client = getSupabaseClient();
      await client.auth.signOut();
      setActiveAdminEmail(null);
      setSuccessMessage("Signed out successfully.");
    } catch {
      setErrorMessage("Failed to sign out.");
    } finally {
      setIsLoading(false);
    }
  }

  if (checkingSession) {
    return (
      <div className="max-w-md mx-auto p-8 text-center text-xs text-neutral-500 font-mono">
        Checking authentication status...
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto space-y-6">
      {/* Route Banner */}
      <div className="bg-white border border-neutral-200 rounded-xl p-6 shadow-xs space-y-2">
        <div className="inline-flex items-center gap-2 px-2.5 py-0.5 rounded-full bg-neutral-100 text-neutral-700 text-xs font-mono">
          Route: /admin/login
        </div>
        <h1 className="text-2xl font-bold tracking-tight text-neutral-900">
          Administrator Sign In
        </h1>
        <p className="text-xs text-neutral-600 leading-relaxed">
          Authorized personnel only. Public sign-up is disabled. All admin accounts must be provisioned
          and granted role access by a database administrator.
        </p>
      </div>

      {/* If already signed in as Admin */}
      {activeAdminEmail ? (
        <div className="bg-white border border-emerald-200 rounded-xl p-6 shadow-xs space-y-4">
          <div className="flex items-center gap-2 text-emerald-800 text-xs font-semibold">
            <span className="w-2 h-2 rounded-full bg-emerald-600" />
            Active Administrator Session
          </div>
          <p className="text-xs text-neutral-700">
            Currently authenticated as:{" "}
            <code className="font-mono bg-neutral-100 px-2 py-0.5 rounded text-neutral-900">
              {activeAdminEmail}
            </code>
          </p>

          <div className="flex flex-col gap-2 pt-2">
            <Link
              href="/admin"
              className="inline-flex items-center justify-center px-4 py-2 bg-neutral-900 text-white rounded-lg text-xs font-semibold hover:bg-neutral-800 transition-colors"
            >
              Go to Admin Dashboard →
            </Link>
            <Link
              href="/admin/image-test"
              className="inline-flex items-center justify-center px-4 py-2 border border-neutral-300 text-neutral-700 rounded-lg text-xs font-medium hover:bg-neutral-50 transition-colors"
            >
              Go to Image Upload POC →
            </Link>
            <button
              type="button"
              onClick={handleLogout}
              disabled={isLoading}
              className="mt-2 text-xs text-rose-600 hover:text-rose-800 underline disabled:opacity-50"
            >
              Sign Out
            </button>
          </div>
        </div>
      ) : (
        /* Login Form */
        <div className="bg-white border border-neutral-200 rounded-xl p-6 shadow-xs space-y-4">
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label
                htmlFor="admin-email"
                className="block text-xs font-semibold text-neutral-800 mb-1"
              >
                Admin Email Address
              </label>
              <input
                id="admin-email"
                type="email"
                required
                autoComplete="email"
                disabled={isLoading}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="admin@example.com"
                className="w-full text-xs px-3 py-2 border border-neutral-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-neutral-900 bg-neutral-50"
              />
            </div>

            <div>
              <label
                htmlFor="admin-password"
                className="block text-xs font-semibold text-neutral-800 mb-1"
              >
                Password
              </label>
              <input
                id="admin-password"
                type="password"
                required
                autoComplete="current-password"
                disabled={isLoading}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••••••"
                className="w-full text-xs px-3 py-2 border border-neutral-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-neutral-900 bg-neutral-50"
              />
            </div>

            {/* Error Message */}
            {errorMessage && (
              <div className="p-3.5 rounded-lg border border-rose-200 bg-rose-50 text-xs text-rose-800 space-y-1">
                <span className="font-semibold block">Authentication Error</span>
                <p className="leading-relaxed">{errorMessage}</p>
              </div>
            )}

            {/* Success Message */}
            {successMessage && (
              <div className="p-3.5 rounded-lg border border-emerald-200 bg-emerald-50 text-xs text-emerald-800 font-medium">
                {successMessage}
              </div>
            )}

            <button
              type="submit"
              disabled={isLoading}
              className="w-full inline-flex items-center justify-center gap-2 px-4 py-2 bg-neutral-900 text-white rounded-lg text-xs font-semibold hover:bg-neutral-800 disabled:opacity-50 transition-colors"
            >
              {isLoading ? (
                <>
                  <svg
                    className="animate-spin h-3.5 w-3.5 text-white"
                    fill="none"
                    viewBox="0 0 24 24"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
                    />
                  </svg>
                  Verifying Credentials & Permissions...
                </>
              ) : (
                "Sign In as Administrator"
              )}
            </button>
          </form>

          {/* Security Notice */}
          <div className="pt-2 border-t border-neutral-100 text-[11px] text-neutral-500 leading-relaxed">
            <strong>Security policy:</strong> Authenticated users without an authorized record in
            <code className="bg-neutral-100 px-1 py-0.5 rounded text-neutral-700 font-mono text-[10px] ml-1">
              app_admins
            </code>{" "}
            are automatically rejected and signed out.
          </div>
        </div>
      )}

      {/* Footer Navigation */}
      <div className="flex items-center justify-between text-xs pt-1">
        <Link
          href="/"
          className="text-blue-600 hover:text-blue-800 underline font-medium"
        >
          ← Return to Storefront
        </Link>
        <Link
          href="/admin/image-test"
          className="text-neutral-600 hover:text-neutral-900 transition-colors"
        >
          Image Upload POC →
        </Link>
      </div>
    </div>
  );
}
