import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Validates and retrieves the required Supabase environment variables.
 * Error messages validate the presence of the variables without exposing
 * any actual credentials or key values.
 */
function getSupabaseConfig(): { url: string; key: string } {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || url.trim() === "") {
    throw new Error(
      "Missing environment variable: NEXT_PUBLIC_SUPABASE_URL is not configured."
    );
  }

  if (!key || key.trim() === "") {
    throw new Error(
      "Missing environment variable: NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY is not configured."
    );
  }

  return { url, key };
}

let clientInstance: SupabaseClient | null = null;

/**
 * Creates a fresh Supabase client instance using validated public credentials.
 */
export function createSupabaseClient(): SupabaseClient {
  const { url, key } = getSupabaseConfig();
  return createClient(url, key);
}

/**
 * Retrieves a reusable Supabase client instance.
 */
export function getSupabaseClient(): SupabaseClient {
  if (!clientInstance) {
    clientInstance = createSupabaseClient();
  }
  return clientInstance;
}
