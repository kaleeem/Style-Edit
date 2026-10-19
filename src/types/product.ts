/**
 * Core product record schema matching public.products table
 */
export interface Product {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  price: number;
  sale_price: number | null;
  category: string;
  status: "draft" | "published" | "archived";
  created_at: string;
  updated_at: string;
}

/**
 * Product variant record matching public.product_variants table
 */
export interface ProductVariant {
  id: string;
  product_id: string;
  size: string;
  color: string;
  sku: string | null;
  stock_quantity: number;
  is_available: boolean;
  created_at: string;
  updated_at: string;
}

/**
 * Product image asset reference matching public.product_images table
 */
export interface ProductImage {
  id: string;
  product_id: string;
  storage_path: string; // Object path within Supabase Storage bucket
  alt_text: string | null;
  display_order: number;
  is_primary: boolean;
  color: string | null;
  public_url?: string; // Derived dynamically from storage_path
  created_at: string;
  updated_at: string;
}

/**
 * Composite product entity with its variants and image assets
 */
export interface ProductComplete extends Product {
  variants: ProductVariant[];
  images: ProductImage[];
}
