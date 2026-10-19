import { getSupabaseClient } from "./client";
import type { User } from "@supabase/supabase-js";

export interface AdminVerificationResult {
  isAuthenticated: boolean;
  isAdmin: boolean;
  user: User | null;
  reason?: string;
}

/**
 * Verifies if the currently authenticated session belongs to an authorized administrator.
 * Checks both:
 * 1. Trusted app_metadata.role = 'admin' in JWT
 * 2. Membership in the public.app_admins table
 *
 * Fails safely and never grants or inserts administrative privileges from the client.
 */
export async function verifyAdminAuthorization(): Promise<AdminVerificationResult> {
  const client = getSupabaseClient();

  const { data, error } = await client.auth.getSession();

  if (error || !data.session?.user) {
    return {
      isAuthenticated: false,
      isAdmin: false,
      user: null,
      reason: "No active session.",
    };
  }

  const user = data.session.user;

  // Check 1: Trusted app_metadata claim (set by server/Supabase dashboard, tamper-proof in client)
  if (user.app_metadata && user.app_metadata.role === "admin") {
    return {
      isAuthenticated: true,
      isAdmin: true,
      user,
    };
  }

  // Check 2: Explicit entry in public.app_admins table
  try {
    const { data: adminRecord, error: queryError } = await client
      .from("app_admins")
      .select("user_id")
      .eq("user_id", user.id)
      .maybeSingle();

    if (!queryError && adminRecord?.user_id) {
      return {
        isAuthenticated: true,
        isAdmin: true,
        user,
      };
    }
  } catch {
    // Fail safe on unexpected errors
  }

  return {
    isAuthenticated: true,
    isAdmin: false,
    user,
    reason: "Your account is authenticated, but has not been authorized in the app_admins roster.",
  };
}
