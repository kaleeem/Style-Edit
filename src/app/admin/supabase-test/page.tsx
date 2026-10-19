"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getSupabaseClient } from "@/lib/supabase/client";

type TestState = {
  clientInitialized: boolean;
  status: "testing" | "reachable" | "failed";
  errorMessage: string | null;
};

export default function SupabaseTestPage() {
  const [testState, setTestState] = useState<TestState>({
    clientInitialized: false,
    status: "testing",
    errorMessage: null,
  });

  useEffect(() => {
    let isMounted = true;

    async function runTest() {
      try {
        // Step 1: Initialize client via existing getSupabaseClient()
        const client = getSupabaseClient();

        if (isMounted) {
          setTestState((prev) => ({
            ...prev,
            clientInitialized: true,
          }));
        }

        // Step 2: Ping Supabase Auth API
        const { error } = await client.auth.getSession();

        if (!isMounted) return;

        if (error) {
          // Provide safe, sanitized error without exposing internal tokens or URLs
          const safeMessage =
            error.message && typeof error.message === "string"
              ? error.message.replace(/https?:\/\/[^\s]+/g, "[REDACTED_URL]")
              : "Supabase Auth API returned an error response.";

          setTestState((prev) => ({
            ...prev,
            status: "failed",
            errorMessage: safeMessage,
          }));
        } else {
          setTestState((prev) => ({
            ...prev,
            status: "reachable",
            errorMessage: null,
          }));
        }
      } catch (err: unknown) {
        if (!isMounted) return;

        const safeMessage =
          err instanceof Error
            ? err.message.replace(/https?:\/\/[^\s]+/g, "[REDACTED_URL]")
            : "An unexpected error occurred while initializing the client.";

        setTestState({
          clientInitialized: false,
          status: "failed",
          errorMessage: safeMessage,
        });
      }
    }

    runTest();

    return () => {
      isMounted = false;
    };
  }, []);

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Header */}
      <div className="bg-white border border-neutral-200 rounded-xl p-6 shadow-xs space-y-2">
        <div className="inline-flex items-center gap-2 px-2.5 py-0.5 rounded-full bg-neutral-100 text-neutral-700 text-xs font-mono">
          Temporary Route: /admin/supabase-test
        </div>
        <h1 className="text-2xl font-bold tracking-tight text-neutral-900">
          Supabase Connectivity Test
        </h1>
        <p className="text-sm text-neutral-600">
          Temporary verification page to check Supabase client initialization and API reachability.
        </p>
      </div>

      {/* Test Results Card */}
      <div className="bg-white border border-neutral-200 rounded-xl p-6 space-y-4 shadow-xs">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-neutral-500">
          Verification Checks
        </h2>

        {/* Check 1: Client Initialization */}
        <div className="flex items-center justify-between p-3.5 rounded-lg border border-neutral-200 bg-neutral-50">
          <span className="text-sm font-medium text-neutral-800">
            Client Initialization
          </span>
          {testState.clientInitialized ? (
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded border border-emerald-200">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
              Supabase client initialized
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-neutral-600 bg-neutral-100 px-2.5 py-1 rounded border border-neutral-200">
              Initializing...
            </span>
          )}
        </div>

        {/* Check 2: API Reachability */}
        <div className="flex items-center justify-between p-3.5 rounded-lg border border-neutral-200 bg-neutral-50">
          <span className="text-sm font-medium text-neutral-800">
            API Reachability
          </span>
          {testState.status === "testing" && (
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-amber-700 bg-amber-50 px-2.5 py-1 rounded border border-amber-200">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
              Testing connection...
            </span>
          )}
          {testState.status === "reachable" && (
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded border border-emerald-200">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
              Supabase API reachable
            </span>
          )}
          {testState.status === "failed" && (
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-rose-700 bg-rose-50 px-2.5 py-1 rounded border border-rose-200">
              <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
              Connection failed
            </span>
          )}
        </div>

        {/* Sanitized Error Details (Only rendered if failed) */}
        {testState.status === "failed" && testState.errorMessage && (
          <div className="p-3.5 rounded-lg border border-rose-200 bg-rose-50 text-xs text-rose-800 space-y-1">
            <p className="font-semibold">Error Details (Sanitized):</p>
            <p className="font-mono break-words">{testState.errorMessage}</p>
          </div>
        )}
      </div>

      {/* Scope Disclaimer */}
      <div className="border border-neutral-200 rounded-xl bg-neutral-50 p-5 text-xs text-neutral-600 space-y-2">
        <p className="font-semibold text-neutral-800 uppercase tracking-wider">
          Scope Note
        </p>
        <p>
          This test verifies that the Supabase client can contact the Supabase Auth API
          endpoint using your configured public credentials.
        </p>
        <p className="text-neutral-500">
          <strong>Important:</strong> This tests the Supabase Auth API, not database table access
          or storage buckets. Database table queries and file storage permissions will be tested
          separately once database schemas and bucket policies are created.
        </p>
      </div>

      {/* Navigation */}
      <div className="flex items-center justify-between text-xs pt-2">
        <Link
          href="/admin"
          className="text-blue-600 hover:text-blue-800 underline font-medium"
        >
          ← Return to Admin Portal
        </Link>
        <span className="text-neutral-400">
          Temporary diagnostic route — safe to remove
        </span>
      </div>
    </div>
  );
}
