"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { getSupabaseClient } from "@/lib/supabase/client";
import { verifyAdminAuthorization, type AdminVerificationResult } from "@/lib/supabase/auth";
import type { Product, ProductVariant, ProductImage } from "@/types/product";

const BUCKET_NAME = process.env.NEXT_PUBLIC_SUPABASE_STORAGE_BUCKET || "product-images";
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB
const ALLOWED_MIME_TYPES = ["image/jpeg", "image/png", "image/webp", "image/avif"];

interface VariantInput {
  id: string; // temporary key for list rendering
  size: string;
  color: string;
  sku: string;
  stock_quantity: number;
  is_available: boolean;
}

interface ImageInput {
  id: string;
  file: File;
  previewUrl: string;
  altText: string;
  color: string;
  isPrimary: boolean;
}

export default function NewProductPage() {
  const router = useRouter();

  // Auth State
  const [authStatus, setAuthStatus] = useState<AdminVerificationResult>({
    isAuthenticated: false,
    isAdmin: false,
    user: null,
  });
  const [checkingAuth, setCheckingAuth] = useState(true);

  // Form Fields
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [autoSlug, setAutoSlug] = useState(true);
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("");
  const [salePrice, setSalePrice] = useState("");
  const [category, setCategory] = useState("Men");
  const [status, setStatus] = useState<"draft" | "published" | "archived">("draft");

  // Variants
  const [variants, setVariants] = useState<VariantInput[]>([
    {
      id: "v-default-1",
      size: "M",
      color: "Black",
      sku: "",
      stock_quantity: 10,
      is_available: true,
    },
  ]);

  // Images
  const [selectedImages, setSelectedImages] = useState<ImageInput[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Submission / Progress State
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [progressStep, setProgressStep] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [createdProduct, setCreatedProduct] = useState<{
    product: Product;
    variants: ProductVariant[];
    images: ProductImage[];
  } | null>(null);

  // 1. Verify administrator authorization on mount
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

  // Cleanup object URLs on unmount
  useEffect(() => {
    return () => {
      selectedImages.forEach((img) => URL.revokeObjectURL(img.previewUrl));
    };
  }, [selectedImages]);

  // Auto-slug generation from name
  function handleNameChange(val: string) {
    setName(val);
    if (autoSlug) {
      const generated = val
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/(^-|-$)+/g, "");
      setSlug(generated);
    }
  }

  // Variant Helpers
  function addVariant() {
    setVariants((prev) => [
      ...prev,
      {
        id: `v-${Date.now()}-${Math.random()}`,
        size: "L",
        color: prev[prev.length - 1]?.color || "Black",
        sku: "",
        stock_quantity: 5,
        is_available: true,
      },
    ]);
  }

  function removeVariant(id: string) {
    if (variants.length <= 1) {
      alert("At least one product variant is required.");
      return;
    }
    setVariants((prev) => prev.filter((v) => v.id !== id));
  }

  function updateVariant(id: string, field: keyof VariantInput, value: unknown) {
    setVariants((prev) =>
      prev.map((v) => (v.id === id ? { ...v, [field]: value } : v))
    );
  }

  // Image Selection & Validation
  function handleFilesSelected(e: React.ChangeEvent<HTMLInputElement>) {
    setErrorMessage(null);
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const newImages: ImageInput[] = [];
    const errors: string[] = [];

    Array.from(files).forEach((file, index) => {
      if (!ALLOWED_MIME_TYPES.includes(file.type)) {
        errors.push(`${file.name}: Unsupported format (${file.type}). Only JPEG, PNG, WebP, AVIF accepted.`);
        return;
      }
      if (file.size > MAX_FILE_SIZE) {
        errors.push(`${file.name}: Exceeds 5 MB limit (${(file.size / (1024 * 1024)).toFixed(2)} MB).`);
        return;
      }

      const previewUrl = URL.createObjectURL(file);
      newImages.push({
        id: `img-${Date.now()}-${index}-${Math.random()}`,
        file,
        previewUrl,
        altText: "",
        color: "",
        isPrimary: selectedImages.length === 0 && index === 0,
      });
    });

    if (errors.length > 0) {
      setErrorMessage(errors.join(" | "));
    }

    if (newImages.length > 0) {
      setSelectedImages((prev) => {
        const combined = [...prev, ...newImages];
        // Ensure at least one image is primary
        if (!combined.some((img) => img.isPrimary) && combined.length > 0) {
          combined[0].isPrimary = true;
        }
        return combined;
      });
    }

    // Reset file input so user can pick more
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }

  function removeImage(id: string) {
    setSelectedImages((prev) => {
      const target = prev.find((img) => img.id === id);
      if (target) URL.revokeObjectURL(target.previewUrl);
      const remaining = prev.filter((img) => img.id !== id);
      if (target?.isPrimary && remaining.length > 0) {
        remaining[0].isPrimary = true;
      }
      return remaining;
    });
  }

  function setPrimaryImage(id: string) {
    setSelectedImages((prev) =>
      prev.map((img) => ({
        ...img,
        isPrimary: img.id === id,
      }))
    );
  }

  // Submit Handler
  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErrorMessage(null);

    // Form Validations
    if (!name.trim()) {
      setErrorMessage("Product name is required.");
      return;
    }
    if (!slug.trim()) {
      setErrorMessage("Product slug is required.");
      return;
    }
    const numPrice = parseFloat(price);
    if (isNaN(numPrice) || numPrice < 0) {
      setErrorMessage("Valid base price is required.");
      return;
    }
    let numSalePrice: number | null = null;
    if (salePrice.trim()) {
      numSalePrice = parseFloat(salePrice);
      if (isNaN(numSalePrice) || numSalePrice < 0) {
        setErrorMessage("Sale price must be a valid positive number.");
        return;
      }
      if (numSalePrice > numPrice) {
        setErrorMessage("Sale price cannot exceed regular price.");
        return;
      }
    }

    // Check variant duplicates
    const variantKeys = new Set<string>();
    for (const v of variants) {
      const key = `${v.size.trim().toUpperCase()}-${v.color.trim().toUpperCase()}`;
      if (variantKeys.has(key)) {
        setErrorMessage(`Duplicate variant found: ${v.size} / ${v.color}. Each size and color combination must be unique.`);
        return;
      }
      variantKeys.add(key);
    }

    setIsSubmitting(true);
    const client = getSupabaseClient();
    const uploadedPaths: string[] = [];
    let createdProductId: string | null = null;

    try {
      // Step 1: Insert Product into public.products
      setProgressStep("1/4 Creating product record in database...");
      const { data: prodData, error: prodError } = await client
        .from("products")
        .insert({
          name: name.trim(),
          slug: slug.trim(),
          description: description.trim() || null,
          price: numPrice,
          sale_price: numSalePrice,
          category,
          status,
        })
        .select()
        .single();

      if (prodError || !prodData) {
        throw new Error(`Database error creating product: ${prodError?.message || "Unknown error"}`);
      }

      createdProductId = prodData.id;
      const savedProduct: Product = prodData;

      // Step 2: Insert Variants into public.product_variants
      setProgressStep("2/4 Saving product variants...");
      const variantRows = variants.map((v) => ({
        product_id: savedProduct.id,
        size: v.size.trim(),
        color: v.color.trim(),
        sku: v.sku.trim() || null,
        stock_quantity: Math.max(0, parseInt(v.stock_quantity.toString(), 10) || 0),
        is_available: v.is_available,
      }));

      const { data: savedVariantsData, error: variantError } = await client
        .from("product_variants")
        .insert(variantRows)
        .select();

      if (variantError) {
        throw new Error(`Database error saving variants: ${variantError.message}`);
      }

      // Step 3: Upload Image Files to Supabase Storage
      const savedImages: ProductImage[] = [];

      if (selectedImages.length > 0) {
        setProgressStep(`3/4 Uploading ${selectedImages.length} image(s) to Storage...`);

        for (let i = 0; i < selectedImages.length; i++) {
          const imgInput = selectedImages[i];
          const ext = imgInput.file.name.split(".").pop()?.toLowerCase() || "jpg";
          const uniqueName = `${Date.now()}-${i}-${crypto.randomUUID()}.${ext}`;
          const storagePath = `products/${savedProduct.id}/${uniqueName}`;

          const { error: uploadError } = await client.storage
            .from(BUCKET_NAME)
            .upload(storagePath, imgInput.file, {
              cacheControl: "3600",
              upsert: false,
            });

          if (uploadError) {
            throw new Error(`Storage upload failed for ${imgInput.file.name}: ${uploadError.message}`);
          }

          uploadedPaths.push(storagePath);
        }

        // Step 4: Insert Image records into public.product_images
        setProgressStep("4/4 Saving image metadata records...");
        const imageRows = uploadedPaths.map((path, idx) => ({
          product_id: savedProduct.id,
          storage_path: path,
          alt_text: selectedImages[idx].altText.trim() || `${savedProduct.name} image ${idx + 1}`,
          display_order: idx,
          is_primary: selectedImages[idx].isPrimary,
          color: selectedImages[idx].color.trim() || null,
        }));

        const { data: savedImagesData, error: imgDbError } = await client
          .from("product_images")
          .insert(imageRows)
          .select();

        if (imgDbError) {
          throw new Error(`Failed to save image metadata: ${imgDbError.message}`);
        }

        // Resolve public URLs
        if (savedImagesData) {
          savedImagesData.forEach((row: ProductImage) => {
            const { data: urlData } = client.storage
              .from(BUCKET_NAME)
              .getPublicUrl(row.storage_path);
            savedImages.push({
              ...row,
              public_url: urlData.publicUrl,
            });
          });
        }
      }

      // Everything succeeded cleanly!
      setCreatedProduct({
        product: savedProduct,
        variants: savedVariantsData || [],
        images: savedImages,
      });
    } catch (err: unknown) {
      // Rollback cleanup on failure to avoid orphaned storage files and partial DB rows
      if (uploadedPaths.length > 0) {
        try {
          await client.storage.from(BUCKET_NAME).remove(uploadedPaths);
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

      const msg = err instanceof Error ? err.message : "Unexpected error during product creation.";
      setErrorMessage(msg);
    } finally {
      setIsSubmitting(false);
      setProgressStep(null);
    }
  }

  function handleResetForm() {
    setCreatedProduct(null);
    setName("");
    setSlug("");
    setAutoSlug(true);
    setDescription("");
    setPrice("");
    setSalePrice("");
    setCategory("Men");
    setStatus("draft");
    setVariants([
      {
        id: "v-default-1",
        size: "M",
        color: "Black",
        sku: "",
        stock_quantity: 10,
        is_available: true,
      },
    ]);
    setSelectedImages([]);
    setErrorMessage(null);
  }

  // Loading authorization
  if (checkingAuth) {
    return (
      <div className="max-w-3xl mx-auto p-12 text-center text-xs text-neutral-500 font-mono">
        Verifying administrator credentials...
      </div>
    );
  }

  // Access Denied if not admin
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
            You must be signed in with an authorized administrator account to create product records and upload catalog images.
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

  // Success State View
  if (createdProduct) {
    const { product, variants: savedVariants, images: savedImages } = createdProduct;
    return (
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Success Header */}
        <div className="bg-white border border-emerald-200 rounded-xl p-6 shadow-xs space-y-3">
          <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-medium">
            <span className="w-2 h-2 rounded-full bg-emerald-600 animate-pulse" />
            Product Created & Confirmed
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-neutral-900">
            {product.name}
          </h1>
          <p className="text-xs text-neutral-600">
            Database records for the product, {savedVariants.length} variant(s), and {savedImages.length} image(s) have been verified.
          </p>
          <div className="flex flex-wrap items-center gap-2 pt-1 text-xs">
            <span className="text-neutral-500 font-medium">Product ID:</span>
            <code className="font-mono bg-neutral-100 text-neutral-900 px-2 py-0.5 rounded border border-neutral-200">
              {product.id}
            </code>
            <span className="text-neutral-300">•</span>
            <span className="text-neutral-500 font-medium">Slug:</span>
            <code className="font-mono bg-neutral-100 text-neutral-900 px-2 py-0.5 rounded border border-neutral-200">
              {product.slug}
            </code>
          </div>
        </div>

        {/* Product Details Overview */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-white border border-neutral-200 rounded-xl p-5 shadow-xs space-y-1">
            <span className="text-xs font-semibold text-neutral-500 uppercase tracking-wider">Category & Status</span>
            <p className="text-sm font-medium text-neutral-900">{product.category}</p>
            <span className={`inline-block text-[11px] font-semibold px-2 py-0.5 rounded uppercase tracking-wider ${
              product.status === "published"
                ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                : "bg-neutral-100 text-neutral-700 border border-neutral-200"
            }`}>
              {product.status}
            </span>
          </div>

          <div className="bg-white border border-neutral-200 rounded-xl p-5 shadow-xs space-y-1">
            <span className="text-xs font-semibold text-neutral-500 uppercase tracking-wider">Pricing</span>
            <div className="flex items-baseline gap-2">
              <span className="text-lg font-bold text-neutral-900">
                ${product.price.toFixed(2)}
              </span>
              {product.sale_price !== null && (
                <span className="text-sm text-emerald-600 font-medium">
                  (Sale: ${product.sale_price.toFixed(2)})
                </span>
              )}
            </div>
          </div>

          <div className="bg-white border border-neutral-200 rounded-xl p-5 shadow-xs space-y-1">
            <span className="text-xs font-semibold text-neutral-500 uppercase tracking-wider">Inventory</span>
            <p className="text-sm font-medium text-neutral-900">
              {savedVariants.length} Variant(s) registered
            </p>
            <p className="text-xs text-neutral-500">
              Total Stock: {savedVariants.reduce((sum, v) => sum + v.stock_quantity, 0)} units
            </p>
          </div>
        </div>

        {/* Image Gallery */}
        <div className="bg-white border border-neutral-200 rounded-xl p-6 shadow-xs space-y-4">
          <div className="flex items-center justify-between border-b border-neutral-100 pb-3">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-neutral-800">
              Delivered Image Assets ({savedImages.length})
            </h2>
            <span className="text-xs text-neutral-500">
              Bucket: <code className="font-mono">{BUCKET_NAME}</code>
            </span>
          </div>

          {savedImages.length === 0 ? (
            <p className="text-xs text-neutral-500 italic">No images attached to this product.</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
              {savedImages.map((img) => (
                <div
                  key={img.id}
                  className="border border-neutral-200 rounded-lg p-3 bg-neutral-50/50 space-y-2 flex flex-col"
                >
                  <div className="w-full h-44 bg-white rounded-md overflow-hidden flex items-center justify-center border border-neutral-200">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={img.public_url || ""}
                      alt={img.alt_text || product.name}
                      className="max-h-full max-w-full object-contain"
                    />
                  </div>
                  <div className="text-[11px] space-y-1 flex-1">
                    <div className="flex items-center justify-between">
                      {img.is_primary ? (
                        <span className="text-[10px] font-semibold bg-emerald-100 text-emerald-800 px-1.5 py-0.5 rounded">
                          Primary
                        </span>
                      ) : (
                        <span className="text-[10px] text-neutral-500">Gallery</span>
                      )}
                      {img.color && (
                        <span className="text-[10px] bg-neutral-200 px-1.5 py-0.5 rounded text-neutral-700">
                          {img.color}
                        </span>
                      )}
                    </div>
                    <p className="font-mono text-[10px] text-neutral-500 truncate" title={img.storage_path}>
                      {img.storage_path}
                    </p>
                  </div>
                  {img.public_url && (
                    <a
                      href={img.public_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-600 hover:underline text-[11px] block truncate"
                    >
                      Open full image ↗
                    </a>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Variants Table */}
        <div className="bg-white border border-neutral-200 rounded-xl p-6 shadow-xs space-y-4">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-neutral-800">
            Registered Variants ({savedVariants.length})
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left border-collapse">
              <thead>
                <tr className="border-b border-neutral-200 text-neutral-500 font-semibold">
                  <th className="py-2 px-3">Size</th>
                  <th className="py-2 px-3">Color</th>
                  <th className="py-2 px-3">SKU</th>
                  <th className="py-2 px-3 text-right">Stock</th>
                  <th className="py-2 px-3 text-center">Status</th>
                </tr>
              </thead>
              <tbody>
                {savedVariants.map((v) => (
                  <tr key={v.id} className="border-b border-neutral-100 hover:bg-neutral-50">
                    <td className="py-2 px-3 font-semibold text-neutral-800">{v.size}</td>
                    <td className="py-2 px-3">{v.color}</td>
                    <td className="py-2 px-3 font-mono text-neutral-500">{v.sku || "—"}</td>
                    <td className="py-2 px-3 text-right font-medium">{v.stock_quantity}</td>
                    <td className="py-2 px-3 text-center">
                      <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-semibold ${
                        v.is_available ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"
                      }`}>
                        {v.is_available ? "Available" : "Unavailable"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-between pt-2">
          <button
            type="button"
            onClick={handleResetForm}
            className="px-4 py-2 bg-neutral-900 text-white rounded-lg text-xs font-semibold hover:bg-neutral-800 transition-colors"
          >
            + Create Another Product
          </button>
          <div className="flex items-center gap-3">
            <Link
              href={`/admin/products/${product.id}`}
              className="text-xs text-blue-600 hover:text-blue-800 font-semibold underline"
            >
              Inspect Product Details →
            </Link>
            <Link
              href="/admin"
              className="inline-flex items-center px-4 py-2 border border-neutral-300 text-neutral-700 rounded-lg text-xs font-medium hover:bg-neutral-50 transition-colors"
            >
              Return to Admin Portal →
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // Product Creation Form View
  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="bg-white border border-neutral-200 rounded-xl p-6 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-2 px-2.5 py-0.5 rounded-full bg-neutral-100 text-neutral-700 text-xs font-mono mb-2">
            Admin Route: /admin/products/new
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-neutral-900">
            Create New Product
          </h1>
          <p className="text-xs text-neutral-600">
            Add clothing product records, configure variants, and upload image assets directly to Supabase Storage.
          </p>
        </div>
        <div className="text-xs">
          <Link
            href="/admin"
            className="text-neutral-600 hover:text-neutral-900 underline"
          >
            ← Return to Admin
          </Link>
        </div>
      </div>

      {/* Error Alert */}
      {errorMessage && (
        <div className="p-4 rounded-lg border border-rose-200 bg-rose-50 text-xs text-rose-800 space-y-1">
          <span className="font-semibold block">Validation / Creation Error</span>
          <p className="leading-relaxed">{errorMessage}</p>
        </div>
      )}

      {/* Progress Alert */}
      {isSubmitting && progressStep && (
        <div className="p-4 rounded-lg border border-blue-200 bg-blue-50 text-xs text-blue-900 flex items-center gap-3">
          <svg className="animate-spin h-4 w-4 text-blue-700" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
          </svg>
          <span className="font-medium">{progressStep}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Section 1: General Product Details */}
        <section className="bg-white border border-neutral-200 rounded-xl p-6 shadow-xs space-y-4">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-neutral-800 border-b border-neutral-100 pb-2">
            1. General Information
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label htmlFor="prod-name" className="block text-xs font-semibold text-neutral-800 mb-1">
                Product Name <span className="text-rose-500">*</span>
              </label>
              <input
                id="prod-name"
                type="text"
                required
                disabled={isSubmitting}
                value={name}
                onChange={(e) => handleNameChange(e.target.value)}
                placeholder="e.g. Classic Oxford Cotton Shirt"
                className="w-full text-xs px-3 py-2 border border-neutral-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-neutral-900 bg-neutral-50"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label htmlFor="prod-slug" className="block text-xs font-semibold text-neutral-800">
                  Unique Slug <span className="text-rose-500">*</span>
                </label>
                <label className="text-[11px] text-neutral-500 flex items-center gap-1 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={autoSlug}
                    onChange={(e) => setAutoSlug(e.target.checked)}
                    className="rounded"
                  />
                  Auto-sync with name
                </label>
              </div>
              <input
                id="prod-slug"
                type="text"
                required
                disabled={isSubmitting}
                value={slug}
                onChange={(e) => {
                  setAutoSlug(false);
                  setSlug(e.target.value);
                }}
                placeholder="e.g. classic-oxford-cotton-shirt"
                className="w-full text-xs px-3 py-2 border border-neutral-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-neutral-900 bg-neutral-50 font-mono"
              />
            </div>
          </div>

          <div>
            <label htmlFor="prod-desc" className="block text-xs font-semibold text-neutral-800 mb-1">
              Description
            </label>
            <textarea
              id="prod-desc"
              rows={3}
              disabled={isSubmitting}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Provide a detailed description of fabric, fit, styling, and care instructions..."
              className="w-full text-xs px-3 py-2 border border-neutral-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-neutral-900 bg-neutral-50"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="prod-cat" className="block text-xs font-semibold text-neutral-800 mb-1">
                Category
              </label>
              <select
                id="prod-cat"
                disabled={isSubmitting}
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full text-xs px-3 py-2 border border-neutral-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-neutral-900 bg-neutral-50"
              >
                <option value="Men">Men</option>
                <option value="Women">Women</option>
                <option value="Kids">Kids</option>
                <option value="Unisex">Unisex</option>
              </select>
            </div>

            <div>
              <label htmlFor="prod-status" className="block text-xs font-semibold text-neutral-800 mb-1">
                Publication Status
              </label>
              <select
                id="prod-status"
                disabled={isSubmitting}
                value={status}
                onChange={(e) => setStatus(e.target.value as "draft" | "published" | "archived")}
                className="w-full text-xs px-3 py-2 border border-neutral-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-neutral-900 bg-neutral-50 font-medium"
              >
                <option value="draft">Draft (Visible to Admins only)</option>
                <option value="published">Published (Visible on Storefront)</option>
                <option value="archived">Archived</option>
              </select>
            </div>
          </div>
        </section>

        {/* Section 2: Pricing */}
        <section className="bg-white border border-neutral-200 rounded-xl p-6 shadow-xs space-y-4">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-neutral-800 border-b border-neutral-100 pb-2">
            2. Pricing
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="prod-price" className="block text-xs font-semibold text-neutral-800 mb-1">
                Base Price ($) <span className="text-rose-500">*</span>
              </label>
              <input
                id="prod-price"
                type="number"
                step="0.01"
                min="0"
                required
                disabled={isSubmitting}
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                placeholder="49.99"
                className="w-full text-xs px-3 py-2 border border-neutral-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-neutral-900 bg-neutral-50 font-mono"
              />
            </div>

            <div>
              <label htmlFor="prod-sale-price" className="block text-xs font-semibold text-neutral-800 mb-1">
                Sale Price ($) <span className="text-neutral-400 font-normal">(Optional)</span>
              </label>
              <input
                id="prod-sale-price"
                type="number"
                step="0.01"
                min="0"
                disabled={isSubmitting}
                value={salePrice}
                onChange={(e) => setSalePrice(e.target.value)}
                placeholder="39.99"
                className="w-full text-xs px-3 py-2 border border-neutral-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-neutral-900 bg-neutral-50 font-mono"
              />
            </div>
          </div>
        </section>

        {/* Section 3: Variants */}
        <section className="bg-white border border-neutral-200 rounded-xl p-6 shadow-xs space-y-4">
          <div className="flex items-center justify-between border-b border-neutral-100 pb-2">
            <div>
              <h2 className="text-sm font-semibold uppercase tracking-wider text-neutral-800">
                3. Product Variants (Size & Color)
              </h2>
              <p className="text-[11px] text-neutral-500">
                Define stock quantities and availability per size and color.
              </p>
            </div>
            <button
              type="button"
              onClick={addVariant}
              disabled={isSubmitting}
              className="px-3 py-1 bg-neutral-100 hover:bg-neutral-200 text-neutral-800 rounded text-xs font-semibold transition-colors"
            >
              + Add Variant
            </button>
          </div>

          <div className="space-y-3">
            {variants.map((v, idx) => (
              <div
                key={v.id}
                className="grid grid-cols-1 sm:grid-cols-12 gap-2 p-3 bg-neutral-50 border border-neutral-200 rounded-lg items-center text-xs"
              >
                <div className="sm:col-span-2">
                  <label className="block text-[10px] uppercase font-semibold text-neutral-500 mb-0.5">
                    Size
                  </label>
                  <input
                    type="text"
                    required
                    disabled={isSubmitting}
                    value={v.size}
                    onChange={(e) => updateVariant(v.id, "size", e.target.value)}
                    placeholder="S, M, L, XL"
                    className="w-full px-2 py-1.5 border border-neutral-300 rounded bg-white"
                  />
                </div>

                <div className="sm:col-span-3">
                  <label className="block text-[10px] uppercase font-semibold text-neutral-500 mb-0.5">
                    Color
                  </label>
                  <input
                    type="text"
                    required
                    disabled={isSubmitting}
                    value={v.color}
                    onChange={(e) => updateVariant(v.id, "color", e.target.value)}
                    placeholder="Black, Navy, White"
                    className="w-full px-2 py-1.5 border border-neutral-300 rounded bg-white"
                  />
                </div>

                <div className="sm:col-span-3">
                  <label className="block text-[10px] uppercase font-semibold text-neutral-500 mb-0.5">
                    SKU (Optional)
                  </label>
                  <input
                    type="text"
                    disabled={isSubmitting}
                    value={v.sku}
                    onChange={(e) => updateVariant(v.id, "sku", e.target.value)}
                    placeholder={`SKU-${idx + 1}`}
                    className="w-full px-2 py-1.5 border border-neutral-300 rounded bg-white font-mono text-[11px]"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-[10px] uppercase font-semibold text-neutral-500 mb-0.5">
                    Stock
                  </label>
                  <input
                    type="number"
                    min="0"
                    required
                    disabled={isSubmitting}
                    value={v.stock_quantity}
                    onChange={(e) =>
                      updateVariant(v.id, "stock_quantity", parseInt(e.target.value, 10) || 0)
                    }
                    className="w-full px-2 py-1.5 border border-neutral-300 rounded bg-white font-mono"
                  />
                </div>

                <div className="sm:col-span-2 flex items-center justify-between sm:justify-end gap-2 pt-2 sm:pt-4">
                  <label className="text-[11px] text-neutral-700 flex items-center gap-1 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={v.is_available}
                      disabled={isSubmitting}
                      onChange={(e) => updateVariant(v.id, "is_available", e.target.checked)}
                      className="rounded"
                    />
                    Active
                  </label>
                  {variants.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeVariant(v.id)}
                      disabled={isSubmitting}
                      className="text-rose-600 hover:text-rose-800 text-xs font-bold px-1"
                      title="Remove variant"
                    >
                      ✕
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Section 4: Image Assets */}
        <section className="bg-white border border-neutral-200 rounded-xl p-6 shadow-xs space-y-4">
          <div className="flex items-center justify-between border-b border-neutral-100 pb-2">
            <div>
              <h2 className="text-sm font-semibold uppercase tracking-wider text-neutral-800">
                4. Product Images (Multiple allowed)
              </h2>
              <p className="text-[11px] text-neutral-500">
                Max 5 MB per file. Accepted formats: JPEG, PNG, WebP, AVIF. Uploaded to bucket:{" "}
                <code className="font-mono text-[11px] bg-neutral-100 px-1 rounded">{BUCKET_NAME}</code>.
              </p>
            </div>
          </div>

          <div>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept="image/jpeg,image/png,image/webp,image/avif"
              disabled={isSubmitting}
              onChange={handleFilesSelected}
              className="block w-full text-xs text-neutral-600 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-xs file:font-semibold file:bg-neutral-900 file:text-white hover:file:bg-neutral-800 file:cursor-pointer cursor-pointer border border-neutral-300 rounded-lg p-2 bg-neutral-50"
            />
          </div>

          {selectedImages.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 pt-2">
              {selectedImages.map((img) => (
                <div
                  key={img.id}
                  className={`border rounded-lg p-3 bg-neutral-50 space-y-2 relative ${
                    img.isPrimary ? "border-emerald-500 ring-1 ring-emerald-500" : "border-neutral-200"
                  }`}
                >
                  <div className="w-full h-36 bg-white rounded overflow-hidden flex items-center justify-center border border-neutral-200">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={img.previewUrl}
                      alt="Thumbnail"
                      className="max-h-full max-w-full object-contain"
                    />
                  </div>

                  <div className="text-[11px] space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-[10px] text-neutral-500 truncate max-w-[140px]" title={img.file.name}>
                        {img.file.name}
                      </span>
                      <span className="text-[10px] text-neutral-400">
                        {(img.file.size / (1024 * 1024)).toFixed(2)} MB
                      </span>
                    </div>

                    <div className="flex items-center justify-between pt-1">
                      <label className="flex items-center gap-1.5 text-[11px] font-medium text-neutral-700 cursor-pointer">
                        <input
                          type="radio"
                          name="primary_image"
                          checked={img.isPrimary}
                          disabled={isSubmitting}
                          onChange={() => setPrimaryImage(img.id)}
                        />
                        Primary
                      </label>
                      <button
                        type="button"
                        onClick={() => removeImage(img.id)}
                        disabled={isSubmitting}
                        className="text-rose-600 hover:text-rose-800 text-[11px] font-medium underline"
                      >
                        Remove
                      </button>
                    </div>

                    <div>
                      <input
                        type="text"
                        disabled={isSubmitting}
                        value={img.altText}
                        onChange={(e) => {
                          const val = e.target.value;
                          setSelectedImages((prev) =>
                            prev.map((item) => (item.id === img.id ? { ...item, altText: val } : item))
                          );
                        }}
                        placeholder="Alt text / description"
                        className="w-full px-2 py-1 text-[11px] border border-neutral-300 rounded bg-white"
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Submit Actions */}
        <div className="bg-white border border-neutral-200 rounded-xl p-6 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="text-xs text-neutral-500">
            Records and images are validated and synced atomically to prevent orphaned data.
          </div>

          <div className="flex items-center gap-3">
            <Link
              href="/admin"
              className="px-4 py-2 border border-neutral-300 text-neutral-700 rounded-lg text-xs font-medium hover:bg-neutral-50 transition-colors"
            >
              Cancel
            </Link>
            <button
              type="submit"
              disabled={isSubmitting}
              className="inline-flex items-center justify-center gap-2 px-6 py-2 bg-neutral-900 text-white rounded-lg text-xs font-semibold hover:bg-neutral-800 disabled:opacity-50 transition-colors"
            >
              {isSubmitting ? (
                <>
                  <svg className="animate-spin h-3.5 w-3.5 text-white" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                  </svg>
                  Processing Product & Uploads...
                </>
              ) : (
                "Save Product & Upload Assets"
              )}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
