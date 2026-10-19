"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { getSupabaseClient } from "@/lib/supabase/client";
import { verifyAdminAuthorization, type AdminVerificationResult } from "@/lib/supabase/auth";

const BUCKET_NAME = process.env.NEXT_PUBLIC_SUPABASE_STORAGE_BUCKET || "product-images";
const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB
const DEFAULT_BATCH_LIMIT = 10;
const MAX_CONCURRENCY = 5;

const ALLOWED_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/avif",
];

const ALLOWED_EXTENSIONS = ["jpg", "jpeg", "png", "webp", "avif"];

interface FileItem {
  id: string;
  file: File;
  previewUrl: string;
  isValid: boolean;
  validationError?: string;
  status: "pending" | "uploading" | "success" | "failed";
  productId?: string | null;
  productName?: string;
  storagePath?: string | null;
  publicUrl?: string | null;
  errorMessage?: string;
}

export default function BulkImageTestPage() {
  const [authStatus, setAuthStatus] = useState<AdminVerificationResult>({
    isAuthenticated: false,
    isAdmin: false,
    user: null,
  });
  const [checkingAuth, setCheckingAuth] = useState(true);

  const [files, setFiles] = useState<FileItem[]>([]);
  const [batchLimit, setBatchLimit] = useState<number>(DEFAULT_BATCH_LIMIT);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadFinished, setUploadFinished] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // 1. Verify administrator session on mount
  useEffect(() => {
    let isMounted = true;
    async function checkAuth() {
      try {
        const result = await verifyAdminAuthorization();
        if (isMounted) setAuthStatus(result);
      } finally {
        if (isMounted) setCheckingAuth(false);
      }
    }
    checkAuth();
    return () => {
      isMounted = false;
    };
  }, []);

  // Cleanup object URLs when component unmounts
  useEffect(() => {
    return () => {
      files.forEach((item) => URL.revokeObjectURL(item.previewUrl));
    };
  }, [files]);

  // 2. Handle File Selection
  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    if (!e.target.files) return;

    // Clean up previous preview URLs
    files.forEach((item) => URL.revokeObjectURL(item.previewUrl));

    const selectedList = Array.from(e.target.files);
    const newItems: FileItem[] = selectedList.map((file, idx) => {
      const ext = file.name.split(".").pop()?.toLowerCase() || "";
      const isMimeValid = ALLOWED_MIME_TYPES.includes(file.type);
      const isExtValid = ALLOWED_EXTENSIONS.includes(ext);
      const isSizeValid = file.size <= MAX_FILE_SIZE_BYTES;

      let validationError: string | undefined;
      if (!isMimeValid && !isExtValid) {
        validationError = `Unsupported format (${file.type || ext}). Allowed: JPEG, PNG, WebP, AVIF.`;
      } else if (!isSizeValid) {
        validationError = `File exceeds 5 MB limit (${(file.size / (1024 * 1024)).toFixed(2)} MB).`;
      }

      return {
        id: `bulk-${Date.now()}-${idx}-${Math.random().toString(36).substring(2, 7)}`,
        file,
        previewUrl: URL.createObjectURL(file),
        isValid: !validationError,
        validationError,
        status: "pending",
      };
    });

    setFiles(newItems);
    setUploadFinished(false);

    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }

  function handleClearFiles() {
    files.forEach((item) => URL.revokeObjectURL(item.previewUrl));
    setFiles([]);
    setUploadFinished(false);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }

  // 3. Process single image item: create product -> variant -> upload image -> image record
  async function processSingleItem(item: FileItem): Promise<{
    success: boolean;
    productId?: string | null;
    productName?: string;
    storagePath?: string | null;
    publicUrl?: string | null;
    errorMessage?: string;
  }> {
    const client = getSupabaseClient();
    const cleanBaseName = item.file.name
      .replace(/\.[^/.]+$/, "")
      .replace(/[-_]+/g, " ")
      .trim();

    const formattedName = cleanBaseName
      ? cleanBaseName.charAt(0).toUpperCase() + cleanBaseName.slice(1)
      : "Product";

    const uniqueTimestamp = `${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`;
    const productName = `Test ${formattedName} (${uniqueTimestamp})`;
    const slugBase = (cleanBaseName || "item")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)+/g, "");
    const productSlug = `test-${slugBase}-${uniqueTimestamp}`;

    let createdProductId: string | null = null;
    let uploadedStoragePath: string | null = null;

    try {
      // Step A: Insert published product record into public.products
      const { data: prodData, error: prodErr } = await client
        .from("products")
        .insert({
          name: productName,
          slug: productSlug,
          description: `Bulk test product generated for asset: ${item.file.name}`,
          price: 49.99,
          sale_price: null,
          category: "Unisex",
          status: "published",
        })
        .select("id")
        .single();

      if (prodErr || !prodData) {
        throw new Error(`Product insert failed: ${prodErr?.message || "Unknown database error"}`);
      }

      createdProductId = prodData.id;

      // Step B: Insert default variant into public.product_variants
      const { error: varErr } = await client.from("product_variants").insert({
        product_id: createdProductId,
        size: "M",
        color: "Standard",
        sku: `BULK-${uniqueTimestamp}`,
        stock_quantity: 10,
        is_available: true,
      });

      if (varErr) {
        throw new Error(`Variant insert failed: ${varErr.message}`);
      }

      // Step C: Upload image file to Supabase Storage bucket
      const ext = item.file.name.split(".").pop()?.toLowerCase() || "jpg";
      const storagePath = `products/${createdProductId}/${Date.now()}-${crypto.randomUUID()}.${ext}`;

      const { error: storageErr } = await client.storage
        .from(BUCKET_NAME)
        .upload(storagePath, item.file, {
          cacheControl: "3600",
          upsert: false,
        });

      if (storageErr) {
        throw new Error(`Storage upload failed: ${storageErr.message}`);
      }

      uploadedStoragePath = storagePath;

      // Step D: Insert primary image metadata into public.product_images
      const { error: imgErr } = await client.from("product_images").insert({
        product_id: createdProductId,
        storage_path: storagePath,
        alt_text: productName,
        display_order: 0,
        is_primary: true,
        color: null,
      });

      if (imgErr) {
        throw new Error(`Image metadata record failed: ${imgErr.message}`);
      }

      // Step E: Derive public delivery URL
      const { data: urlData } = client.storage
        .from(BUCKET_NAME)
        .getPublicUrl(storagePath);

      return {
        success: true,
        productId: createdProductId,
        productName,
        storagePath,
        publicUrl: urlData.publicUrl,
      };
    } catch (err: unknown) {
      // Safe cleanup of partially created resources for this failed item
      if (uploadedStoragePath) {
        try {
          await client.storage.from(BUCKET_NAME).remove([uploadedStoragePath]);
        } catch {
          // Ignore secondary cleanup error
        }
      }
      if (createdProductId) {
        try {
          await client.from("products").delete().eq("id", createdProductId);
        } catch {
          // Ignore secondary cleanup error
        }
      }

      const msg = err instanceof Error ? err.message : "Unexpected upload error";
      return {
        success: false,
        errorMessage: msg,
      };
    }
  }

  // 4. Batch Execution with Controlled Concurrency (Max 5 simultaneous)
  async function handleStartBatchUpload() {
    const validItems = files.filter((f) => f.isValid && f.status !== "success");
    const itemsToProcess = validItems.slice(0, batchLimit);

    if (itemsToProcess.length === 0) return;

    setIsUploading(true);
    setUploadFinished(false);

    // Set initial status to 'uploading' for this batch
    setFiles((prev) =>
      prev.map((item) =>
        itemsToProcess.some((p) => p.id === item.id)
          ? { ...item, status: "uploading", errorMessage: undefined }
          : item
      )
    );

    // Worker pool for maximum 5 concurrent operations
    const queue = [...itemsToProcess];
    const runWorker = async () => {
      while (queue.length > 0) {
        const item = queue.shift();
        if (!item) break;

        const result = await processSingleItem(item);

        // Update item status in real time
        setFiles((prev) =>
          prev.map((f) =>
            f.id === item.id
              ? {
                  ...f,
                  status: result.success ? "success" : "failed",
                  productId: result.productId,
                  productName: result.productName,
                  storagePath: result.storagePath,
                  publicUrl: result.publicUrl,
                  errorMessage: result.errorMessage,
                }
              : f
          )
        );
      }
    };

    const workerCount = Math.min(MAX_CONCURRENCY, itemsToProcess.length);
    const workers = Array.from({ length: workerCount }, () => runWorker());

    await Promise.all(workers);

    setIsUploading(false);
    setUploadFinished(true);
  }

  // Auth Checking View
  if (checkingAuth) {
    return (
      <div className="max-w-4xl mx-auto p-12 text-center text-xs text-neutral-500 font-mono">
        Verifying administrator credentials...
      </div>
    );
  }

  // Access Denied View
  if (!authStatus.isAdmin) {
    return (
      <div className="max-w-xl mx-auto space-y-6">
        <div className="bg-white border border-neutral-200 rounded-xl p-8 shadow-xs text-center space-y-4">
          <div className="w-12 h-12 rounded-full bg-amber-50 border border-amber-200 text-amber-700 flex items-center justify-center mx-auto">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
          </div>
          <h1 className="text-xl font-bold tracking-tight text-neutral-900">
            Administrator Access Required
          </h1>
          <p className="text-xs text-neutral-600 max-w-sm mx-auto">
            You must be signed in with an authorized administrator account to access the bulk upload testing tool.
          </p>
          <div className="flex items-center justify-center gap-3 pt-2">
            <Link
              href="/admin/login"
              className="inline-flex items-center px-4 py-2 bg-neutral-900 text-white rounded-lg text-xs font-semibold hover:bg-neutral-800 transition-colors"
            >
              Sign In as Administrator →
            </Link>
            <Link
              href="/admin"
              className="inline-flex items-center px-4 py-2 border border-neutral-300 text-neutral-700 rounded-lg text-xs font-medium hover:bg-neutral-50 transition-colors"
            >
              ← Back to Admin
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // Counters
  const validFiles = files.filter((f) => f.isValid);
  const invalidFiles = files.filter((f) => !f.isValid);
  const batchFiles = validFiles.slice(0, batchLimit);
  const successCount = files.filter((f) => f.status === "success").length;
  const failureCount = files.filter((f) => f.status === "failed").length;
  const inProgressCount = files.filter((f) => f.status === "uploading").length;

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Route Header */}
      <div className="bg-white border border-neutral-200 rounded-xl p-6 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-2 px-2.5 py-0.5 rounded-full bg-neutral-100 text-neutral-700 text-xs font-mono mb-2">
            POC Tool: /admin/bulk-image-test
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-neutral-900">
            Bulk Image Upload POC
          </h1>
          <p className="text-xs text-neutral-600">
            Upload multiple catalog images with controlled concurrency (max 5) and auto-create corresponding published test products.
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs">
          <Link
            href="/admin"
            className="px-3 py-1.5 border border-neutral-300 text-neutral-700 rounded-lg font-medium hover:bg-neutral-50 transition-colors"
          >
            ← Admin Portal
          </Link>
          <Link
            href="/"
            target="_blank"
            className="px-3 py-1.5 bg-neutral-900 text-white rounded-lg font-semibold hover:bg-neutral-800 transition-colors"
          >
            Storefront ↗
          </Link>
        </div>
      </div>

      {/* Prominent Warning Banner */}
      <div className="border border-amber-300 bg-amber-50 rounded-xl p-5 text-xs text-amber-900 space-y-2 shadow-2xs">
        <div className="flex items-center gap-2 font-bold text-amber-950">
          <svg className="w-5 h-5 text-amber-600 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <span>Important Notice: Live Published Records</span>
        </div>
        <p className="leading-relaxed">
          Each uploaded image automatically creates a <strong>published test product</strong> in <code className="font-mono bg-amber-100/80 px-1 py-0.5 rounded">public.products</code> and uploads to <code className="font-mono bg-amber-100/80 px-1 py-0.5 rounded">{BUCKET_NAME}</code>.
          These products will <strong>immediately appear on the customer storefront (/)</strong>.
        </p>
      </div>

      {/* Control Card: File Picker & Batch Configuration */}
      <div className="bg-white border border-neutral-200 rounded-xl p-6 shadow-xs space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
          <div className="md:col-span-2 space-y-1">
            <label htmlFor="bulk-file-input" className="block text-xs font-semibold text-neutral-800">
              Select Local Images
            </label>
            <p className="text-[11px] text-neutral-500">
              Accepted: JPEG, PNG, WebP, AVIF. Max 5 MB per image. Multiple selection enabled.
            </p>
            <input
              id="bulk-file-input"
              ref={fileInputRef}
              type="file"
              multiple
              accept="image/jpeg,image/png,image/webp,image/avif,.jpg,.jpeg,.png,.webp,.avif"
              disabled={isUploading}
              onChange={handleFileSelect}
              className="block w-full text-xs text-neutral-600 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-xs file:font-semibold file:bg-neutral-900 file:text-white hover:file:bg-neutral-800 file:cursor-pointer cursor-pointer border border-neutral-300 rounded-lg p-2 bg-neutral-50"
            />
          </div>

          <div className="space-y-1">
            <label htmlFor="batch-limit-input" className="block text-xs font-semibold text-neutral-800">
              Max Upload Batch Limit
            </label>
            <div className="flex items-center gap-2">
              <input
                id="batch-limit-input"
                type="number"
                min={1}
                max={50}
                disabled={isUploading}
                value={batchLimit}
                onChange={(e) => setBatchLimit(Math.max(1, parseInt(e.target.value, 10) || DEFAULT_BATCH_LIMIT))}
                className="w-full text-xs px-3 py-2 border border-neutral-300 rounded-lg bg-neutral-50 font-mono"
              />
              <span className="text-[11px] text-neutral-400 whitespace-nowrap">Default: 10</span>
            </div>
          </div>
        </div>

        {/* Selected Summary & Action Bar */}
        {files.length > 0 && (
          <div className="border-t border-neutral-100 pt-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-3">
              <span className="font-medium text-neutral-800">
                Total Selected: <strong>{files.length}</strong>
              </span>
              <span className="text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                Valid: {validFiles.length}
              </span>
              {invalidFiles.length > 0 && (
                <span className="text-rose-700 bg-rose-50 px-2 py-0.5 rounded border border-rose-200">
                  Invalid: {invalidFiles.length}
                </span>
              )}
              {validFiles.length > batchLimit && (
                <span className="text-amber-800 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                  Processing first {batchLimit} of {validFiles.length}
                </span>
              )}
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleClearFiles}
                disabled={isUploading}
                className="px-3 py-1.5 border border-neutral-300 text-neutral-700 rounded-lg text-xs hover:bg-neutral-50 disabled:opacity-50"
              >
                Clear
              </button>

              <button
                type="button"
                onClick={handleStartBatchUpload}
                disabled={isUploading || validFiles.length === 0}
                className="inline-flex items-center justify-center gap-2 px-5 py-2 bg-neutral-900 text-white rounded-lg text-xs font-semibold hover:bg-neutral-800 disabled:opacity-50 transition-colors shadow-xs"
              >
                {isUploading ? (
                  <>
                    <svg className="animate-spin h-3.5 w-3.5 text-white" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                    </svg>
                    Uploading ({inProgressCount} active, concurrency max 5)...
                  </>
                ) : (
                  `Upload Batch (${Math.min(validFiles.length, batchLimit)} images)`
                )}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Progress & Results Dashboard */}
      {(isUploading || uploadFinished) && (
        <div className="bg-white border border-neutral-200 rounded-xl p-6 shadow-xs space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-neutral-100 pb-3">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-neutral-800">
              Batch Progress & Status
            </h2>
            <div className="flex items-center gap-3 text-xs font-medium">
              <span className="text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded border border-emerald-200">
                ✓ Success: {successCount}
              </span>
              <span className="text-rose-700 bg-rose-50 px-2.5 py-1 rounded border border-rose-200">
                ✕ Failed: {failureCount}
              </span>
              {isUploading && (
                <span className="text-blue-700 bg-blue-50 px-2.5 py-1 rounded border border-blue-200">
                  ⟳ In Progress: {inProgressCount}
                </span>
              )}
            </div>
          </div>

          {/* Progress Bar */}
          <div className="w-full bg-neutral-100 rounded-full h-2.5 overflow-hidden">
            <div
              className={`h-2.5 transition-all duration-300 ${
                failureCount > 0 && successCount === 0
                  ? "bg-rose-500"
                  : failureCount > 0
                  ? "bg-amber-500"
                  : "bg-emerald-600"
              }`}
              style={{
                width: `${
                  batchFiles.length > 0
                    ? ((successCount + failureCount) / batchFiles.length) * 100
                    : 0
                }%`,
              }}
            />
          </div>

          {uploadFinished && (
            <div className="text-xs pt-1 flex items-center justify-between">
              <span className="text-neutral-600">
                Batch complete: {successCount} published products created in database & storage.
              </span>
              <Link
                href="/"
                target="_blank"
                className="text-blue-600 hover:text-blue-800 font-semibold underline"
              >
                Inspect on Storefront →
              </Link>
            </div>
          )}
        </div>
      )}

      {/* Selected Images Grid & Live Status */}
      {files.length > 0 && (
        <div className="bg-white border border-neutral-200 rounded-xl p-6 shadow-xs space-y-4">
          <div className="flex items-center justify-between border-b border-neutral-100 pb-2">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-neutral-800">
              Selected Image Queue ({files.length})
            </h2>
            <span className="text-xs text-neutral-400">
              Queue limited to {batchLimit} per batch
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
            {files.map((item, index) => {
              const inActiveBatch = index < batchLimit;

              return (
                <div
                  key={item.id}
                  className={`border rounded-lg p-2.5 bg-neutral-50/50 space-y-2 flex flex-col relative text-xs ${
                    item.status === "success"
                      ? "border-emerald-300 bg-emerald-50/30"
                      : item.status === "failed"
                      ? "border-rose-300 bg-rose-50/30"
                      : item.status === "uploading"
                      ? "border-blue-400 ring-1 ring-blue-300"
                      : inActiveBatch && item.isValid
                      ? "border-neutral-200"
                      : "border-neutral-200 opacity-60"
                  }`}
                >
                  {/* Thumbnail */}
                  <div className="w-full aspect-square bg-white rounded overflow-hidden flex items-center justify-center border border-neutral-200 relative">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={item.previewUrl}
                      alt={item.file.name}
                      className="max-h-full max-w-full object-contain"
                    />

                    {/* Status Badge Over Image */}
                    {item.status === "uploading" && (
                      <div className="absolute inset-0 bg-black/40 backdrop-blur-2xs flex items-center justify-center text-white text-[10px] font-semibold gap-1">
                        <svg className="animate-spin h-3.5 w-3.5 text-white" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                        </svg>
                        Uploading
                      </div>
                    )}

                    {item.status === "success" && (
                      <div className="absolute top-1 right-1 bg-emerald-600 text-white rounded-full p-0.5">
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                        </svg>
                      </div>
                    )}

                    {item.status === "failed" && (
                      <div className="absolute top-1 right-1 bg-rose-600 text-white rounded-full p-0.5">
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </div>
                    )}
                  </div>

                  {/* Metadata */}
                  <div className="space-y-1 flex-1">
                    <p className="font-medium text-neutral-800 truncate text-[11px]" title={item.file.name}>
                      {item.file.name}
                    </p>
                    <p className="text-[10px] text-neutral-400 font-mono">
                      {(item.file.size / (1024 * 1024)).toFixed(2)} MB
                    </p>

                    {/* Validation Warning */}
                    {item.validationError && (
                      <p className="text-[10px] text-rose-700 bg-rose-50 p-1 rounded font-medium">
                        {item.validationError}
                      </p>
                    )}

                    {/* Batch Capped Notice */}
                    {!inActiveBatch && item.isValid && item.status === "pending" && (
                      <p className="text-[10px] text-neutral-400 italic">
                        Queued for next batch
                      </p>
                    )}

                    {/* Success Outcome */}
                    {item.status === "success" && (
                      <div className="pt-1 space-y-0.5 text-[10px]">
                        <p className="text-emerald-800 font-semibold truncate" title={item.productName}>
                          {item.productName}
                        </p>
                        {item.productId && (
                          <Link
                            href={`/admin/products/${item.productId}`}
                            target="_blank"
                            className="text-blue-600 hover:underline block truncate"
                          >
                            Inspect Product ↗
                          </Link>
                        )}
                      </div>
                    )}

                    {/* Error Outcome */}
                    {item.status === "failed" && item.errorMessage && (
                      <div className="pt-1 text-[10px] text-rose-700 bg-rose-50 p-1 rounded font-mono break-words leading-tight">
                        {item.errorMessage}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
