import { ProductModel } from "../models/product.model";

export interface ProductFilters {
  category?: string;
  minPrice?: number;
  maxPrice?: number;
  search?: string;
  featured?: boolean;
  sort?:
    | "price_asc"
    | "price_desc"
    | "name_asc"
    | "name_desc"
    | "rating_desc"
    | "newest";
}

const DEFAULT_PRODUCT_IMAGE =
  "https://placehold.co/600x400/e2e8f0/64748b?text=Product+Image";

// 🔒 Security: Whitelist valid product categories to prevent NoSQL injection
const VALID_CATEGORIES = [
  "accessories",
  "audio",
  "displays",
  "laptops",
  "smart-home",
  "smartphones",
  "streaming",
  "tablets",
  "wearables",
  "electronics",
  "clothing",
  "books",
  "home",
  "sports",
  "toys",
  "beauty",
  "food",
  "other",
] as const;

export async function listProducts(filters: ProductFilters = {}) {
  const query: any = { isActive: true };

  // Category filter with whitelist validation
  // 🔒 Security: Only accept predefined categories to prevent injection
  if (filters.category) {
    const categoryLower = filters.category.toLowerCase().trim();
    if (VALID_CATEGORIES.includes(categoryLower as any)) {
      query.category = categoryLower;
    } else {
      // Silently ignore invalid categories rather than throwing
      // This prevents error-based enumeration attacks
    }
  }

  // Price range filter
  if (filters.minPrice !== undefined || filters.maxPrice !== undefined) {
    query.price = {};
    if (filters.minPrice !== undefined) {
      query.price.$gte = filters.minPrice;
    }
    if (filters.maxPrice !== undefined) {
      query.price.$lte = filters.maxPrice;
    }
  }

  // Featured filter
  if (filters.featured !== undefined) {
    query.featured = filters.featured;
  }

  // Search filter (name or description)
  // 🔒 Security: Validate search string to prevent ReDoS and injection
  if (filters.search) {
    // Limit search string length to prevent DoS
    const sanitizedSearch = filters.search.trim().slice(0, 100);

    // Only proceed if search has meaningful content
    if (sanitizedSearch.length >= 2) {
      // Escape special regex characters to prevent ReDoS attacks
      const escapedSearch = sanitizedSearch.replace(
        /[.*+?^${}()|[\]\\]/g,
        "\\$&",
      );

      query.$or = [
        { name: { $regex: escapedSearch, $options: "i" } },
        { description: { $regex: escapedSearch, $options: "i" } },
      ];
    }
  }

  // Build sort object
  let sort: any = { createdAt: -1 }; // default: newest first
  if (filters.sort) {
    switch (filters.sort) {
      case "price_asc":
        sort = { price: 1 };
        break;
      case "price_desc":
        sort = { price: -1 };
        break;
      case "name_asc":
        sort = { name: 1 };
        break;
      case "name_desc":
        sort = { name: -1 };
        break;
      case "rating_desc":
        sort = { rating: -1 };
        break;
      case "newest":
        sort = { createdAt: -1 };
        break;
    }
  }

  const products = await ProductModel.find(query).sort(sort).lean();

  // Ensure all products have valid images
  return products.map((product) => ({
    ...product,
    image:
      product.image && product.image.startsWith("http")
        ? product.image
        : DEFAULT_PRODUCT_IMAGE,
  }));
}

export async function getProductById(id: string) {
  const product = await ProductModel.findById(id).lean();
  if (product) {
    return {
      ...product,
      image:
        product.image && product.image.startsWith("http")
          ? product.image
          : DEFAULT_PRODUCT_IMAGE,
    };
  }
  return product;
}

export async function getCategories() {
  return ProductModel.distinct("category", { isActive: true });
}
