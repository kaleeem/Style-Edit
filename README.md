# Style-Edit — Clothing E-Commerce POC Foundation

A minimal, scalable Next.js project foundation for a clothing e-commerce Proof of Concept (POC). This repository is prepared for testing Supabase PostgreSQL database connectivity, Supabase Storage image hosting, admin upload pipelines, and customer storefront delivery before building out the full application.

---

## Architecture Overview

The POC architecture separates product records from binary image assets:

```
[Admin Portal (/admin)] 
        │
        ├── Product Metadata ──────► [Supabase PostgreSQL (Database)]
        └── Image File Assets ─────► [Supabase Storage Bucket]
                                              │
[Customer Storefront (/)] ◄───────────────────┘ (Delivers ~500–600 catalog images)
```

1. **Supabase PostgreSQL**: Stores structured product records (SKU, title, category, price, asset references).
2. **Supabase Storage**: Stores clothing catalog images (isolated in a dedicated bucket, targeting ~500–600 images).
3. **Supabase Auth**: Planned to guard `/admin` route access and administrative mutations.

---

## Project Structure

```
Style-Edit/
├── .env.example             # Planned Supabase environment variable definitions
├── package.json             # Next.js 16, React 19, Tailwind CSS dependencies
├── tsconfig.json            # TypeScript configuration with @/* path alias
├── next.config.ts           # Next.js build and runtime configuration
├── src/
│   ├── app/
│   │   ├── layout.tsx       # Root layout with POC navigation header & footer
│   │   ├── page.tsx         # Customer storefront route (/)
│   │   ├── admin/
│   │   │   └── page.tsx     # Admin management portal route (/admin)
│   │   └── globals.css      # Tailwind CSS entrypoint
│   └── types/
│       ├── product.ts       # Domain schemas (Product, ProductImage, ProductWithImages)
│       └── index.ts         # Type exports
└── README.md
```

---

## Planned POC Routes

| Route | Role | Description |
| :--- | :--- | :--- |
| `/` | Customer Storefront | Displays product catalog and loads optimized images from storage |
| `/admin` | Admin Portal | Upload interface for catalog images and test product record creation |

---

## Setup Instructions

### 1. Prerequisites
- Node.js `v20+` (tested on Node `v24.x`)
- npm `v10+`

### 2. Installation
Install project dependencies:
```bash
npm install
```

### 3. Environment Variables
Create a local environment file from the template:
```bash
copy .env.example .env.local
```
*(Values will be populated when connecting the Supabase project).*

### 4. Running the Development Server
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) for the Storefront and [http://localhost:3000/admin](http://localhost:3000/admin) for the Admin interface.

---

## Next Integration Steps

When explicitly instructed to begin the integration phase:

1. **Install Supabase SDK**: Add `@supabase/supabase-js` and `@supabase/ssr`.
2. **Configure Supabase Clients**: Set up browser and server Supabase clients in `src/lib/supabase/`.
3. **Database Schema**: Execute SQL migrations to create the `products` and `product_images` tables with foreign keys and Row Level Security (RLS) policies.
4. **Storage Bucket**: Create the `product-images` bucket in Supabase Storage with public read access and authenticated write access.
5. **Admin Image Pipeline**: Implement image uploading from `/admin` to Supabase Storage and persist corresponding record references.
6. **Storefront Presentation**: Fetch and render product metadata and image URLs on `/`.
