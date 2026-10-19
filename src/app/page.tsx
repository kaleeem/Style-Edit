"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import { getSupabaseClient } from "@/lib/supabase/client";
import type { Product, ProductImage } from "@/types/product";

const BUCKET_NAME = process.env.NEXT_PUBLIC_SUPABASE_STORAGE_BUCKET || "product-images";
const BATCH_SIZE = 40;

interface StorefrontProduct extends Product {
  primaryImage: {
    publicUrl: string;
    altText: string;
  } | null;
}

export default function StorefrontPage() {
  const [products, setProducts] = useState<StorefrontProduct[]>([]);
  const [totalCount, setTotalCount] = useState<number>(0);
  const [isLoadingInitial, setIsLoadingInitial] = useState<boolean>(true);
  const [isLoadingMore, setIsLoadingMore] = useState<boolean>(false);
  const [hasMore, setHasMore] = useState<boolean>(true);
  const [initialError, setInitialError] = useState<string | null>(null);
  const [appendError, setAppendError] = useState<string | null>(null);

  // Synchronization refs to prevent race conditions and duplicate calls
  const isFetchingRef = useRef<boolean>(false);
  const hasMoreRef = useRef<boolean>(true);
  const nextOffsetRef = useRef<number>(0);
  const observerTargetRef = useRef<HTMLDivElement | null>(null);

  // Fetch a batch of products from Supabase
  const fetchBatch = useCallback(
    async (offset: number, isInitial: boolean) => {
      if (isFetchingRef.current) return;
      isFetchingRef.current = true;

      if (isInitial) {
        setIsLoadingInitial(true);
        setInitialError(null);
      } else {
        setIsLoadingMore(true);
        setAppendError(null);
      }

      try {
        const client = getSupabaseClient();
        const from = offset;
        const to = from + BATCH_SIZE - 1;

        // Query published products with associated image records
        const { data, count, error } = await client
          .from("products")
          .select(
            `
            id,
            name,
            slug,
            description,
            price,
            sale_price,
            category,
            status,
            created_at,
            updated_at,
            product_images (
              id,
              storage_path,
              alt_text,
              display_order,
              is_primary,
              color
            )
          `,
            { count: "exact" }
          )
          .eq("status", "published")
          .order("created_at", { ascending: false })
          .range(from, to);

        if (error) {
          throw new Error(error.message || "Failed to retrieve published catalog.");
        }

        const total = count ?? 0;
        setTotalCount(total);

        // Derive public image URLs for primary assets
        const formatted: StorefrontProduct[] = (data || []).map((item) => {
          const rawImages = (item.product_images as unknown as ProductImage[]) || [];

          // Find designated primary image or fallback to lowest display_order
          const primary =
            rawImages.find((img) => img.is_primary) ||
            [...rawImages].sort((a, b) => a.display_order - b.display_order)[0] ||
            null;

          let primaryImage: { publicUrl: string; altText: string } | null = null;

          if (primary?.storage_path) {
            const { data: urlData } = client.storage
              .from(BUCKET_NAME)
              .getPublicUrl(primary.storage_path);

            primaryImage = {
              publicUrl: urlData.publicUrl,
              altText: primary.alt_text || item.name,
            };
          }

          return {
            id: item.id,
            name: item.name,
            slug: item.slug,
            description: item.description,
            price: Number(item.price),
            sale_price: item.sale_price !== null ? Number(item.sale_price) : null,
            category: item.category,
            status: item.status,
            created_at: item.created_at,
            updated_at: item.updated_at,
            primaryImage,
          };
        });

        // Append products without duplicates
        setProducts((prev) => {
          if (isInitial) return formatted;
          const existingIds = new Set(prev.map((p) => p.id));
          const uniqueNew = formatted.filter((p) => !existingIds.has(p.id));
          const updated = [...prev, ...uniqueNew];

          const moreAvailable = updated.length < total && formatted.length === BATCH_SIZE;
          hasMoreRef.current = moreAvailable;
          setHasMore(moreAvailable);

          return updated;
        });

        const moreAvailable = (isInitial ? formatted.length : offset + formatted.length) < total && formatted.length === BATCH_SIZE;
        hasMoreRef.current = moreAvailable;
        setHasMore(moreAvailable);

        nextOffsetRef.current = offset + formatted.length;
      } catch (err: unknown) {
        const msg =
          err instanceof Error ? err.message : "An unexpected error occurred while loading products.";
        if (isInitial) {
          setInitialError(msg);
        } else {
          setAppendError(msg);
        }
      } finally {
        setIsLoadingInitial(false);
        setIsLoadingMore(false);
        isFetchingRef.current = false;
      }
    },
    []
  );

  // Initial load
  useEffect(() => {
    nextOffsetRef.current = 0;
    hasMoreRef.current = true;
    fetchBatch(0, true);
  }, [fetchBatch]);

  // Load next batch function for observer or manual retry
  const loadNextBatch = useCallback(() => {
    if (!hasMoreRef.current || isFetchingRef.current) return;
    fetchBatch(nextOffsetRef.current, false);
  }, [fetchBatch]);

  // Continuous scroll using native IntersectionObserver
  useEffect(() => {
    const sentinel = observerTargetRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const [entry] = entries;
        if (entry.isIntersecting && hasMoreRef.current && !isFetchingRef.current) {
          loadNextBatch();
        }
      },
      {
        root: null,
        rootMargin: "350px", // Trigger fetch smoothly before user hits the bottom
        threshold: 0,
      }
    );

    observer.observe(sentinel);

    return () => {
      observer.disconnect();
    };
  }, [loadNextBatch]);

  return (
    <div className="space-y-10">
      {/* Editorial Collection Banner */}
      <section className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-neutral-900 via-neutral-800 to-neutral-900 text-white p-8 sm:p-12 shadow-sm">
        <div className="max-w-2xl space-y-3 relative z-10">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 backdrop-blur-md text-neutral-200 text-xs tracking-wider uppercase font-medium">
            Season Essentials
          </div>
          <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-white">
            Curated Clothing Collection
          </h1>
          <p className="text-sm sm:text-base text-neutral-300 leading-relaxed">
            Discover carefully crafted garments designed for everyday elegance. Built from live
            records and high-resolution assets stored in Supabase.
          </p>
        </div>

        {/* Subtle decorative geometric background shape */}
        <div className="absolute -right-16 -bottom-24 w-80 h-80 rounded-full bg-white/5 blur-2xl pointer-events-none" />
      </section>

      {/* Main Catalog Section */}
      <section className="space-y-6">
        {/* Section Header & Dynamic Count */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-neutral-200 pb-4">
          <div>
            <h2 className="text-xl font-bold tracking-tight text-neutral-900">
              Published Catalog
            </h2>
            <p className="text-xs text-neutral-500 mt-0.5">
              Continuous live catalog feed from Supabase PostgreSQL & Storage (40 items/batch)
            </p>
          </div>

          <div className="text-xs text-neutral-500 font-medium">
            {isLoadingInitial ? (
              <span>Loading catalog...</span>
            ) : totalCount > 0 ? (
              <span>
                Showing <strong>{products.length}</strong> of <strong>{totalCount}</strong> published items
              </span>
            ) : null}
          </div>
        </div>

        {/* Initial Error State */}
        {initialError && (
          <div className="bg-rose-50 border border-rose-200 rounded-xl p-6 text-center space-y-3">
            <div className="w-10 h-10 rounded-full bg-rose-100 text-rose-700 flex items-center justify-center mx-auto">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <div className="space-y-1">
              <h3 className="text-sm font-semibold text-rose-900">Unable to load published products</h3>
              <p className="text-xs text-rose-700 font-mono">{initialError}</p>
            </div>
            <button
              type="button"
              onClick={() => fetchBatch(0, true)}
              className="inline-flex items-center px-4 py-2 bg-neutral-900 text-white rounded-lg text-xs font-semibold hover:bg-neutral-800 transition-colors"
            >
              Retry Connection
            </button>
          </div>
        )}

        {/* Initial Loading Skeletons */}
        {isLoadingInitial && !initialError && (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
            {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => (
              <div
                key={n}
                className="bg-white border border-neutral-200 rounded-xl overflow-hidden shadow-2xs space-y-3 p-3 animate-pulse"
              >
                <div className="w-full aspect-3/4 bg-neutral-200 rounded-lg" />
                <div className="space-y-2 pt-1">
                  <div className="h-3 w-16 bg-neutral-200 rounded" />
                  <div className="h-4 w-3/4 bg-neutral-200 rounded" />
                  <div className="h-4 w-20 bg-neutral-200 rounded" />
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Empty Catalog State */}
        {!isLoadingInitial && !initialError && products.length === 0 && (
          <div className="bg-white border border-neutral-200 rounded-2xl p-12 text-center space-y-4 shadow-2xs">
            <div className="w-14 h-14 rounded-full bg-neutral-100 flex items-center justify-center mx-auto text-neutral-400">
              <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
              </svg>
            </div>
            <div className="space-y-1 max-w-sm mx-auto">
              <h3 className="text-base font-bold text-neutral-900">
                No Published Products Yet
              </h3>
              <p className="text-xs text-neutral-500 leading-relaxed">
                Items marked as draft will not appear here. Set products to published status in the admin portal to showcase them on the storefront.
              </p>
            </div>
            <div className="pt-2">
              <Link
                href="/admin/products/new"
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-neutral-900 text-white rounded-lg text-xs font-semibold hover:bg-neutral-800 transition-colors"
              >
                Go to Admin to Publish Products →
              </Link>
            </div>
          </div>
        )}

        {/* Responsive Product Cards Grid */}
        {products.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
            {products.map((product) => {
              const hasDiscount =
                product.sale_price !== null &&
                product.price > 0 &&
                product.sale_price < product.price;

              const discountPercentage = hasDiscount
                ? Math.round(((product.price - product.sale_price!) / product.price) * 100)
                : null;

              return (
                <article
                  key={product.id}
                  className="group bg-white border border-neutral-200 rounded-xl overflow-hidden shadow-2xs hover:shadow-md transition-all duration-300 flex flex-col"
                >
                  {/* Image Container with Badges */}
                  <div className="relative w-full aspect-3/4 bg-neutral-100 overflow-hidden flex items-center justify-center">
                    {product.primaryImage?.publicUrl ? (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img
                        src={product.primaryImage.publicUrl}
                        alt={product.primaryImage.altText}
                        loading="lazy"
                        decoding="async"
                        className="w-full h-full object-cover object-center group-hover:scale-105 transition-transform duration-500"
                      />
                    ) : (
                      /* Graceful Placeholder if no primary image exists */
                      <div className="flex flex-col items-center justify-center p-6 text-neutral-400 text-center gap-2">
                        <svg className="w-10 h-10 stroke-current" fill="none" viewBox="0 0 24 24">
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={1.2}
                            d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                          />
                        </svg>
                        <span className="text-[11px] font-medium text-neutral-400">
                          Image Pending
                        </span>
                      </div>
                    )}

                    {/* Sale Badge */}
                    {hasDiscount && discountPercentage && (
                      <div className="absolute top-3 left-3 bg-rose-600 text-white text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded shadow-xs">
                        Save {discountPercentage}%
                      </div>
                    )}

                    {/* Category Pill */}
                    <div className="absolute top-3 right-3 bg-white/90 backdrop-blur-xs text-neutral-800 text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded shadow-2xs border border-neutral-100">
                      {product.category}
                    </div>
                  </div>

                  {/* Card Content */}
                  <div className="p-4 flex-1 flex flex-col justify-between space-y-3">
                    <div>
                      <h3 className="text-sm font-semibold text-neutral-900 group-hover:text-neutral-700 transition-colors line-clamp-1">
                        {product.name}
                      </h3>
                      {product.description && (
                        <p className="text-xs text-neutral-500 mt-1 line-clamp-2 leading-relaxed">
                          {product.description}
                        </p>
                      )}
                    </div>

                    {/* Pricing Block */}
                    <div className="pt-2 border-t border-neutral-100 flex items-baseline justify-between">
                      {hasDiscount ? (
                        <div className="flex items-baseline gap-2">
                          <span className="text-base font-bold text-neutral-900">
                            ${product.sale_price!.toFixed(2)}
                          </span>
                          <span className="text-xs text-neutral-400 line-through">
                            ${product.price.toFixed(2)}
                          </span>
                        </div>
                      ) : (
                        <span className="text-base font-bold text-neutral-900">
                          ${product.price.toFixed(2)}
                        </span>
                      )}

                      <span className="text-[10px] uppercase tracking-wider text-emerald-700 font-semibold bg-emerald-50 px-1.5 py-0.5 rounded">
                        In Stock
                      </span>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}

        {/* Append Error Banner (When infinite scroll batch fails) */}
        {appendError && (
          <div className="bg-rose-50 border border-rose-200 rounded-xl p-4 text-center space-y-2 max-w-md mx-auto">
            <p className="text-xs text-rose-800 font-medium">
              Could not load additional products: {appendError}
            </p>
            <button
              type="button"
              onClick={loadNextBatch}
              className="inline-flex items-center px-3 py-1.5 bg-neutral-900 text-white rounded text-xs font-semibold hover:bg-neutral-800 transition-colors"
            >
              Retry Loading Next Batch
            </button>
          </div>
        )}

        {/* Subtle Loading Indicator for Subsequent Batches */}
        {isLoadingMore && (
          <div className="flex items-center justify-center gap-2 py-6 text-xs text-neutral-500 font-medium">
            <svg className="animate-spin h-4 w-4 text-neutral-600" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
            </svg>
            <span>Loading more garments...</span>
          </div>
        )}

        {/* End of Collection Notice */}
        {!hasMore && products.length > 0 && !isLoadingInitial && (
          <div className="text-center py-8 border-t border-neutral-200">
            <p className="text-xs text-neutral-500 font-medium">
              You have viewed all {products.length} products in our current collection.
            </p>
          </div>
        )}

        {/* Intersection Observer Sentinel Element */}
        <div ref={observerTargetRef} className="h-4 w-full pointer-events-none" aria-hidden="true" />
      </section>

      {/* Architecture Verification Footer Banner */}
      <section className="border border-neutral-200 rounded-xl bg-neutral-100/70 p-5 text-xs text-neutral-600 flex flex-col sm:flex-row items-center justify-between gap-4">
        <div>
          <p className="font-semibold text-neutral-800">
            Storefront Integration Active
          </p>
          <p className="text-neutral-500 text-[11px] mt-0.5">
            Serving real records from PostgreSQL with continuous image delivery from Supabase Storage bucket:{" "}
            <code className="font-mono text-[10px] bg-white px-1.5 py-0.5 rounded border border-neutral-200">
              {BUCKET_NAME}
            </code>
          </p>
        </div>
        <Link
          href="/admin"
          className="text-xs text-neutral-800 font-medium hover:underline shrink-0"
        >
          Manage Catalog in Admin →
        </Link>
      </section>
    </div>
  );
}
