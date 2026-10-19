"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { getSupabaseClient } from "@/lib/supabase/client";
import { verifyAdminAuthorization, type AdminVerificationResult } from "@/lib/supabase/auth";

const BUCKET_NAME = process.env.NEXT_PUBLIC_SUPABASE_STORAGE_BUCKET || "product-images";
const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB
const ALLOWED_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/avif",
];

export default function ImageUploadTestPage() {
  const [authStatus, setAuthStatus] = useState<AdminVerificationResult>({
    isAuthenticated: false,
    isAdmin: false,
    user: null,
  });
  const [checkingAuth, setCheckingAuth] = useState<boolean>(true);
  const [isLoggingOut, setIsLoggingOut] = useState<boolean>(false);

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [localPreviewUrl, setLocalPreviewUrl] = useState<string | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);

  const [isUploading, setIsUploading] = useState<boolean>(false);
  const [uploadSuccess, setUploadSuccess] = useState<boolean>(false);
  const [uploadedStoragePath, setUploadedStoragePath] = useState<string | null>(null);
  const [uploadedPublicUrl, setUploadedPublicUrl] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [isAuthPolicyError, setIsAuthPolicyError] = useState<boolean>(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // 1. Verify administrator authorization on mount
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
          setCheckingAuth(false);
        }
      }
    }

    checkAuth();

    return () => {
      isMounted = false;
    };
  }, []);

  // Clean up object URL when component unmounts or file changes
  useEffect(() => {
    return () => {
      if (localPreviewUrl) {
        URL.revokeObjectURL(localPreviewUrl);
      }
    };
  }, [localPreviewUrl]);

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

  // 2. Validate file on selection
  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    setValidationError(null);
    setUploadError(null);
    setIsAuthPolicyError(false);
    setUploadSuccess(false);
    setUploadedStoragePath(null);
    setUploadedPublicUrl(null);

    const files = e.target.files;
    if (!files || files.length === 0) {
      setSelectedFile(null);
      setLocalPreviewUrl(null);
      return;
    }

    const file = files[0];

    // Validate MIME type
    if (!ALLOWED_MIME_TYPES.includes(file.type)) {
      setValidationError(
        `Invalid file type (${file.type || "unknown"}). Only JPEG, PNG, WebP, and AVIF images are permitted.`
      );
      setSelectedFile(null);
      setLocalPreviewUrl(null);
      return;
    }

    // Validate size (max 5 MB)
    if (file.size > MAX_FILE_SIZE_BYTES) {
      const sizeMb = (file.size / (1024 * 1024)).toFixed(2);
      setValidationError(
        `File size exceeds 5 MB limit. Selected file is ${sizeMb} MB.`
      );
      setSelectedFile(null);
      setLocalPreviewUrl(null);
      return;
    }

    setSelectedFile(file);
    const objectUrl = URL.createObjectURL(file);
    setLocalPreviewUrl(objectUrl);
  }

  // 3. Perform upload to Supabase Storage
  async function handleUpload() {
    if (!selectedFile) return;

    setIsUploading(true);
    setUploadError(null);
    setIsAuthPolicyError(false);
    setUploadSuccess(false);

    try {
      const client = getSupabaseClient();

      // Generate a collision-resistant unique filename
      const fileExt = selectedFile.name.split(".").pop()?.toLowerCase() || "jpg";
      const uniqueFileName = `${Date.now()}-${crypto.randomUUID()}.${fileExt}`;
      const storagePath = `test-uploads/${uniqueFileName}`;

      const { data, error } = await client.storage
        .from(BUCKET_NAME)
        .upload(storagePath, selectedFile, {
          cacheControl: "3600",
          upsert: false,
        });

      if (error) {
        // Sanitize error message and check for RLS / auth failure
        const rawMessage = error.message || "Upload request failed.";
        const isPermission =
          rawMessage.toLowerCase().includes("row-level security") ||
          rawMessage.toLowerCase().includes("security policy") ||
          rawMessage.toLowerCase().includes("unauthorized") ||
          rawMessage.toLowerCase().includes("permission denied") ||
          rawMessage.toLowerCase().includes("access denied") ||
          rawMessage.toLowerCase().includes("not allowed");

        setIsAuthPolicyError(isPermission);
        setUploadError(rawMessage);
        return;
      }

      // Retrieve public URL for display
      const { data: urlData } = client.storage
        .from(BUCKET_NAME)
        .getPublicUrl(data.path);

      setUploadedStoragePath(data.path);
      setUploadedPublicUrl(urlData.publicUrl);
      setUploadSuccess(true);
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Unexpected upload error occurred.";
      setUploadError(message);
    } finally {
      setIsUploading(false);
    }
  }

  function handleReset() {
    setSelectedFile(null);
    if (localPreviewUrl) {
      URL.revokeObjectURL(localPreviewUrl);
      setLocalPreviewUrl(null);
    }
    setValidationError(null);
    setUploadError(null);
    setIsAuthPolicyError(false);
    setUploadSuccess(false);
    setUploadedStoragePath(null);
    setUploadedPublicUrl(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Header */}
      <div className="bg-white border border-neutral-200 rounded-xl p-6 shadow-xs space-y-2">
        <div className="inline-flex items-center gap-2 px-2.5 py-0.5 rounded-full bg-neutral-100 text-neutral-700 text-xs font-mono">
          POC Route: /admin/image-test
        </div>
        <h1 className="text-2xl font-bold tracking-tight text-neutral-900">
          Product Image Upload POC
        </h1>
        <p className="text-sm text-neutral-600">
          Upload single image files to the Supabase Storage bucket:{" "}
          <code className="bg-neutral-100 px-1.5 py-0.5 rounded text-neutral-800 font-mono text-xs">
            {BUCKET_NAME}
          </code>.
        </p>
      </div>

      {/* Admin Session Security Status Card */}
      <div className="border border-neutral-200 rounded-xl bg-neutral-50 p-5 space-y-3 text-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <span className="font-semibold text-neutral-800 uppercase tracking-wider">
            Authentication & Permission Status
          </span>

          {checkingAuth ? (
            <span className="text-neutral-500 font-mono">Verifying session...</span>
          ) : authStatus.isAdmin ? (
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-emerald-50 text-emerald-700 border border-emerald-200 font-medium">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                Authorized Admin ({authStatus.user?.email || authStatus.user?.id})
              </span>
              <button
                type="button"
                onClick={handleLogout}
                disabled={isLoggingOut}
                className="text-neutral-600 hover:text-neutral-900 underline text-xs disabled:opacity-50"
              >
                {isLoggingOut ? "..." : "Sign Out"}
              </button>
            </div>
          ) : authStatus.isAuthenticated ? (
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-rose-50 text-rose-700 border border-rose-200 font-medium">
                <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
                Unprivileged User ({authStatus.user?.email})
              </span>
              <button
                type="button"
                onClick={handleLogout}
                disabled={isLoggingOut}
                className="text-neutral-600 hover:text-neutral-900 underline text-xs disabled:opacity-50"
              >
                Sign Out
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-amber-50 text-amber-700 border border-amber-200 font-medium">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                No Active Admin Session
              </span>
              <Link
                href="/admin/login"
                className="text-blue-600 hover:text-blue-800 font-medium underline"
              >
                Sign In →
              </Link>
            </div>
          )}
        </div>

        {/* Security context message */}
        {!authStatus.isAdmin && !checkingAuth && (
          <div className="text-neutral-600 leading-relaxed border-t border-neutral-200 pt-2 space-y-1">
            <p>
              <strong>Security Notice:</strong> Supabase Storage Row Level Security (RLS) protects the bucket.
              Uploads will be rejected by Supabase until an authorized administrator signs in.
            </p>
            <p>
              <Link
                href="/admin/login"
                className="text-blue-600 hover:text-blue-800 underline font-medium"
              >
                Go to Admin Login Page
              </Link>{" "}
              to authenticate with an authorized account.
            </p>
          </div>
        )}
      </div>

      {/* Upload Form Card */}
      <div className="bg-white border border-neutral-200 rounded-xl p-6 shadow-xs space-y-6">
        <div>
          <label
            htmlFor="image-upload-input"
            className="block text-sm font-semibold text-neutral-800 mb-1"
          >
            Select Product Image (Single file)
          </label>
          <p className="text-xs text-neutral-500 mb-3">
            Accepted formats: JPEG, PNG, WebP, AVIF. Maximum size: 5 MB.
          </p>

          <input
            id="image-upload-input"
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/avif"
            multiple={false}
            disabled={isUploading}
            onChange={handleFileChange}
            className="block w-full text-xs text-neutral-600 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-xs file:font-semibold file:bg-neutral-900 file:text-white hover:file:bg-neutral-800 file:cursor-pointer cursor-pointer border border-neutral-300 rounded-lg p-2 bg-neutral-50"
          />
        </div>

        {/* Validation Error */}
        {validationError && (
          <div className="p-3.5 rounded-lg border border-rose-200 bg-rose-50 text-xs text-rose-800">
            <strong>Validation Error:</strong> {validationError}
          </div>
        )}

        {/* Selected File Local Preview */}
        {selectedFile && localPreviewUrl && !uploadSuccess && (
          <div className="space-y-3 border-t border-neutral-100 pt-4">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-neutral-700">Selected File Preview</span>
              <span className="text-neutral-500 font-mono">
                {selectedFile.name} ({(selectedFile.size / (1024 * 1024)).toFixed(2)} MB)
              </span>
            </div>

            <div className="w-full h-56 bg-neutral-100 rounded-lg overflow-hidden flex items-center justify-center border border-neutral-200">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={localPreviewUrl}
                alt="Selected preview"
                className="max-h-full max-w-full object-contain"
              />
            </div>

            <div className="flex items-center gap-3 pt-2">
              <button
                type="button"
                onClick={handleUpload}
                disabled={isUploading}
                className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2 bg-neutral-900 text-white rounded-lg text-xs font-semibold hover:bg-neutral-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {isUploading ? (
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
                    Uploading to Storage...
                  </>
                ) : (
                  "Upload to Supabase Storage"
                )}
              </button>

              <button
                type="button"
                onClick={handleReset}
                disabled={isUploading}
                className="px-4 py-2 border border-neutral-300 text-neutral-700 rounded-lg text-xs font-medium hover:bg-neutral-100 disabled:opacity-50 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Upload Failure Message */}
        {uploadError && (
          <div className="p-4 rounded-lg border border-rose-200 bg-rose-50 space-y-2 text-xs">
            <div className="flex items-center gap-2 text-rose-800 font-semibold">
              <span className="w-2 h-2 rounded-full bg-rose-600" />
              Upload Failed
            </div>
            <p className="text-rose-700 font-mono break-words">{uploadError}</p>
            {isAuthPolicyError && (
              <p className="text-rose-900 bg-rose-100/70 p-2.5 rounded border border-rose-200 leading-relaxed">
                <strong>Access Denied by Security Policy:</strong> Supabase Storage rejected the upload because
                an authorized administrator session is required. If you recently logged in, ensure your user ID
                is registered in the <code className="font-mono text-[11px]">app_admins</code> table.
              </p>
            )}
          </div>
        )}

        {/* Upload Success State */}
        {uploadSuccess && uploadedPublicUrl && uploadedStoragePath && (
          <div className="p-5 rounded-lg border border-emerald-200 bg-emerald-50/50 space-y-4 text-xs">
            <div className="flex items-center gap-2 text-emerald-800 font-semibold text-sm">
              <span className="w-2 h-2 rounded-full bg-emerald-600" />
              Image Successfully Uploaded
            </div>

            <div className="space-y-1.5 text-neutral-700">
              <p>
                <strong className="text-neutral-900">Storage Path:</strong>{" "}
                <code className="font-mono bg-white px-2 py-0.5 rounded border border-emerald-200 text-emerald-900">
                  {uploadedStoragePath}
                </code>
              </p>
              <p className="break-all">
                <strong className="text-neutral-900">Public URL:</strong>{" "}
                <a
                  href={uploadedPublicUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 hover:underline font-mono"
                >
                  {uploadedPublicUrl}
                </a>
              </p>
            </div>

            {/* Uploaded Image Preview */}
            <div className="space-y-2">
              <span className="font-semibold text-neutral-800">Delivered Image Preview:</span>
              <div className="w-full h-64 bg-white rounded-lg overflow-hidden flex items-center justify-center border border-emerald-200 p-2">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={uploadedPublicUrl}
                  alt="Uploaded product preview"
                  className="max-h-full max-w-full object-contain"
                />
              </div>
            </div>

            <button
              type="button"
              onClick={handleReset}
              className="mt-2 px-4 py-2 bg-neutral-900 text-white rounded-lg text-xs font-semibold hover:bg-neutral-800 transition-colors"
            >
              Upload Another Image
            </button>
          </div>
        )}
      </div>

      {/* Navigation */}
      <div className="flex items-center justify-between text-xs pt-2">
        <Link
          href="/admin"
          className="text-blue-600 hover:text-blue-800 underline font-medium"
        >
          ← Return to Admin Portal
        </Link>
        <Link
          href="/admin/login"
          className="text-neutral-600 hover:text-neutral-900 transition-colors"
        >
          Admin Login →
        </Link>
      </div>
    </div>
  );
}
