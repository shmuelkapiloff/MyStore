/**
 * OpenAPI / Swagger Configuration for Simple Shop Backend
 *
 * This file defines the FULL OpenAPI 3.0 specification inline
 * (no reliance on JSDoc scanning).
 *
 * Endpoints documented: ~47
 * Last audited: 2026-02-23
 */

import swaggerJsdoc from "swagger-jsdoc";

/* ───────────────────────────────────────────────────────────────
   REUSABLE RESPONSE HELPERS
   ─────────────────────────────────────────────────────────────── */
const successEnvelope = (
  dataSchema: object,
  description = "Successful response",
) => ({
  description,
  content: {
    "application/json": {
      schema: {
        type: "object" as const,
        properties: {
          success: { type: "boolean" as const, example: true },
          data: dataSchema,
          message: { type: "string" as const },
        },
      },
    },
  },
});

const errorResponse = (status: number, description: string) => ({
  [status]: {
    description,
    content: {
      "application/json": {
        schema: { $ref: "#/components/schemas/Error" },
      },
    },
  },
});

const auth401 = errorResponse(401, "Unauthorized – missing or invalid token");
const auth403 = errorResponse(403, "Forbidden – admin access required");
const notFound404 = errorResponse(404, "Resource not found");
const badRequest400 = errorResponse(400, "Bad request / validation error");

/* ───────────────────────────────────────────────────────────────
   OPENAPI DEFINITION
   ─────────────────────────────────────────────────────────────── */
const definition = {
  openapi: "3.0.0",
  info: {
    title: "Simple Shop Backend API",
    description:
      "Production-ready e-commerce backend with Stripe payment processing, MongoDB transactions, and Redis caching.",
    version: "1.0.0",
    contact: {
      name: "Simple Shop Team",
      url: "https://github.com/simple-shop",
    },
  },
  servers: [
    {
      url: process.env.API_URL || "http://localhost:4001",
      description: "API Server",
    },
  ],

  /* ═══════════════════════════  TAGS  ════════════════════════ */
  tags: [
    { name: "Health", description: "Server health & readiness checks" },
    {
      name: "Authentication",
      description: "Register, login, password management",
    },
    { name: "Products", description: "Product catalog (public)" },
    { name: "Cart", description: "Shopping cart (requires auth)" },
    { name: "Orders", description: "Order lifecycle (requires auth)" },
    { name: "Payments", description: "Stripe payment processing" },
    { name: "Addresses", description: "User address book (requires auth)" },
    { name: "Admin", description: "Admin management (requires admin role)" },
    {
      name: "Metrics",
      description: "Payment & webhook metrics (requires auth)",
    },
  ],

  /* ═══════════════════════════  COMPONENTS  ═══════════════════ */
  components: {
    securitySchemes: {
      BearerAuth: {
        type: "http",
        scheme: "bearer",
        bearerFormat: "JWT",
        description: "JWT token obtained from POST /api/auth/login",
      },
    },
    schemas: {
      /* ── User ──────────────────────────────── */
      User: {
        type: "object",
        properties: {
          _id: { type: "string", description: "MongoDB ObjectId" },
          email: { type: "string", format: "email" },
          name: { type: "string" },
          phone: { type: "string" },
          role: { type: "string", enum: ["user", "admin"] },
          isActive: { type: "boolean" },
          googleId: {
            type: "string",
            nullable: true,
            description:
              "Google OAuth user ID (present for Google-linked accounts)",
          },
          avatar: {
            type: "string",
            nullable: true,
            description: "Profile picture URL (from Google OAuth)",
          },
          lastLogin: {
            type: "string",
            format: "date-time",
            nullable: true,
          },
          createdAt: { type: "string", format: "date-time" },
          updatedAt: { type: "string", format: "date-time" },
        },
      },

      /* ── Product ───────────────────────────── */
      Product: {
        type: "object",
        properties: {
          _id: { type: "string" },
          sku: { type: "string", description: "Unique product SKU" },
          name: { type: "string" },
          description: { type: "string" },
          price: { type: "number", minimum: 0 },
          stock: { type: "integer", minimum: 0 },
          category: { type: "string" },
          image: { type: "string", format: "uri" },
          featured: { type: "boolean" },
          rating: { type: "number" },
          isActive: { type: "boolean" },
          createdAt: { type: "string", format: "date-time" },
          updatedAt: { type: "string", format: "date-time" },
        },
      },

      /* ── Cart ──────────────────────────────── */
      CartItem: {
        type: "object",
        properties: {
          product: {
            oneOf: [
              { type: "string" },
              { $ref: "#/components/schemas/Product" },
            ],
          },
          quantity: { type: "integer", minimum: 1 },
          lockedPrice: { type: "number", nullable: true },
        },
      },
      Cart: {
        type: "object",
        properties: {
          _id: { type: "string" },
          userId: { type: "string" },
          items: {
            type: "array",
            items: { $ref: "#/components/schemas/CartItem" },
          },
          total: { type: "number" },
          createdAt: { type: "string", format: "date-time" },
          updatedAt: { type: "string", format: "date-time" },
        },
      },

      /* ── Address ───────────────────────────── */
      Address: {
        type: "object",
        properties: {
          _id: { type: "string" },
          user: { type: "string" },
          street: { type: "string" },
          city: { type: "string" },
          postalCode: { type: "string" },
          country: { type: "string" },
          isDefault: { type: "boolean" },
          createdAt: { type: "string", format: "date-time" },
          updatedAt: { type: "string", format: "date-time" },
        },
      },

      /* ── ShippingAddress (embedded) ────────── */
      ShippingAddress: {
        type: "object",
        required: ["street", "city", "postalCode", "country"],
        properties: {
          street: { type: "string" },
          city: { type: "string" },
          state: { type: "string" },
          postalCode: { type: "string" },
          country: { type: "string" },
        },
      },

      /* ── Order ─────────────────────────────── */
      OrderItem: {
        type: "object",
        properties: {
          product: { type: "string" },
          name: { type: "string" },
          price: { type: "number" },
          quantity: { type: "integer" },
          image: { type: "string" },
        },
      },
      Order: {
        type: "object",
        properties: {
          _id: { type: "string" },
          orderNumber: { type: "string" },
          user: { type: "string" },
          items: {
            type: "array",
            items: { $ref: "#/components/schemas/OrderItem" },
          },
          totalAmount: { type: "number" },
          status: {
            type: "string",
            enum: [
              "pending",
              "pending_payment",
              "confirmed",
              "processing",
              "shipped",
              "delivered",
              "cancelled",
            ],
          },
          paymentStatus: {
            type: "string",
            enum: ["pending", "paid", "failed", "refunded"],
          },
          paymentMethod: { type: "string" },
          paymentProvider: { type: "string", enum: ["stripe", "paypal"] },
          paymentIntentId: { type: "string" },
          shippingAddress: { $ref: "#/components/schemas/ShippingAddress" },
          billingAddress: { $ref: "#/components/schemas/ShippingAddress" },
          trackingHistory: {
            type: "array",
            items: {
              type: "object",
              properties: {
                status: { type: "string" },
                timestamp: { type: "string", format: "date-time" },
                message: { type: "string" },
              },
            },
          },
          estimatedDelivery: {
            type: "string",
            format: "date-time",
            nullable: true,
          },
          notes: { type: "string" },
          fulfilled: { type: "boolean" },
          fulfilledAt: {
            type: "string",
            format: "date-time",
            nullable: true,
          },
          createdAt: { type: "string", format: "date-time" },
          updatedAt: { type: "string", format: "date-time" },
        },
      },

      /* ── Payment ───────────────────────────── */
      Payment: {
        type: "object",
        properties: {
          _id: { type: "string" },
          order: { type: "string" },
          user: { type: "string" },
          amount: { type: "number" },
          currency: { type: "string", example: "ILS" },
          status: {
            type: "string",
            enum: [
              "pending",
              "requires_action",
              "succeeded",
              "failed",
              "refunded",
              "canceled",
            ],
          },
          provider: { type: "string" },
          providerPaymentId: { type: "string" },
          paymentIntentId: { type: "string" },
          clientSecret: { type: "string" },
          checkoutUrl: { type: "string", format: "uri" },
          createdAt: { type: "string", format: "date-time" },
          updatedAt: { type: "string", format: "date-time" },
        },
      },

      /* ── Error ─────────────────────────────── */
      Error: {
        type: "object",
        properties: {
          success: { type: "boolean", example: false },
          message: { type: "string" },
          errors: { type: "array", items: { type: "object" } },
        },
      },
    },
  },

  security: [{ BearerAuth: [] }],

  /* ══════════════════════════  PATHS  ════════════════════════ */
  paths: {
    /* ─────────────────────────────────────────────────────────
       HEALTH
       ───────────────────────────────────────────────────────── */
    "/api/health": {
      get: {
        tags: ["Health"],
        summary: "Full health check",
        description: "Returns MongoDB, Redis, and webhook health status.",
        security: [],
        responses: {
          200: successEnvelope({
            type: "object",
            properties: {
              status: {
                type: "string",
                enum: ["healthy", "degraded"],
              },
              warning: { type: "boolean" },
              mongodb: { type: "string" },
              redis: { type: "string" },
              webhooks: { type: "object" },
              uptime: { type: "number" },
            },
          }),
        },
      },
    },
    "/api/health/ping": {
      get: {
        tags: ["Health"],
        summary: "Simple ping / pong",
        security: [],
        responses: {
          200: {
            description: "pong",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    success: { type: "boolean", example: true },
                    message: { type: "string", example: "pong" },
                    data: {
                      type: "object",
                      properties: { time: { type: "number" } },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },

    /* ─────────────────────────────────────────────────────────
       AUTH
       ───────────────────────────────────────────────────────── */
    "/api/auth/register": {
      post: {
        tags: ["Authentication"],
        summary: "Register a new user",
        security: [],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["name", "email", "password"],
                properties: {
                  name: { type: "string", minLength: 2 },
                  email: { type: "string", format: "email" },
                  password: { type: "string", minLength: 6 },
                },
              },
            },
          },
        },
        responses: {
          201: successEnvelope(
            {
              type: "object",
              properties: {
                user: { $ref: "#/components/schemas/User" },
                token: {
                  type: "string",
                  description:
                    "JWT access token (7 days, contains tokenVersion)",
                },
                refreshToken: {
                  type: "string",
                  description:
                    "JWT refresh token (7 days, contains tokenVersion)",
                },
              },
            },
            "User registered successfully",
          ),
          ...badRequest400,
          ...errorResponse(409, "Email already exists"),
        },
      },
    },

    "/api/auth/google": {
      post: {
        tags: ["Authentication"],
        summary: "Login or link account with Google OAuth 2.0",
        description:
          "Authenticate user using Google ID token. If a user with the same email exists, link the Google account. If not, create a new user. Blocked/inactive users cannot log in.",
        security: [],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["idToken"],
                properties: {
                  idToken: {
                    type: "string",
                    description: "Google ID token from client",
                  },
                },
              },
            },
          },
        },
        responses: {
          200: successEnvelope(
            {
              type: "object",
              properties: {
                user: {
                  allOf: [
                    { $ref: "#/components/schemas/User" },
                    {
                      type: "object",
                      properties: {
                        googleId: {
                          type: "string",
                          description: "Google user ID",
                        },
                        avatar: {
                          type: "string",
                          description: "Google profile picture URL",
                        },
                      },
                    },
                  ],
                },
                token: { type: "string", description: "JWT access token" },
                refreshToken: {
                  type: "string",
                  description: "JWT refresh token",
                },
              },
            },
            "Google login successful",
          ),
          ...errorResponse(400, "Google idToken is required or invalid"),
          ...errorResponse(403, "User is blocked or inactive"),
          ...errorResponse(429, "Too Many Requests"),
        },
      },
    },
    "/api/auth/login": {
      post: {
        tags: ["Authentication"],
        summary: "Login with email and password",
        security: [],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["email", "password"],
                properties: {
                  email: { type: "string", format: "email" },
                  password: { type: "string" },
                },
              },
            },
          },
        },
        responses: {
          200: successEnvelope(
            {
              type: "object",
              properties: {
                user: { $ref: "#/components/schemas/User" },
                token: {
                  type: "string",
                  description:
                    "JWT access token (7 days, contains tokenVersion)",
                },
                refreshToken: {
                  type: "string",
                  description:
                    "JWT refresh token (7 days, contains tokenVersion)",
                },
              },
            },
            "Login successful",
          ),
          ...auth401,
          ...errorResponse(
            423,
            "Account locked due to too many failed attempts",
          ),
        },
      },
    },

    "/api/auth/forgot-password": {
      post: {
        tags: ["Authentication"],
        summary: "Request a password reset email",
        security: [],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["email"],
                properties: {
                  email: { type: "string", format: "email" },
                },
              },
            },
          },
        },
        responses: {
          200: {
            description:
              "Always returns 200 for security (prevents email enumeration)",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    success: { type: "boolean", example: true },
                    message: { type: "string" },
                  },
                },
              },
            },
          },
        },
      },
    },

    "/api/auth/reset-password/{token}": {
      post: {
        tags: ["Authentication"],
        summary: "Reset password using token from email",
        security: [],
        parameters: [
          {
            in: "path",
            name: "token",
            required: true,
            schema: { type: "string" },
            description: "Password reset token received via email",
          },
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["password", "confirmPassword"],
                properties: {
                  password: { type: "string", minLength: 6 },
                  confirmPassword: { type: "string", minLength: 6 },
                },
              },
            },
          },
        },
        responses: {
          200: {
            description: "Password reset successfully",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    success: { type: "boolean", example: true },
                    message: { type: "string" },
                  },
                },
              },
            },
          },
          ...badRequest400,
        },
      },
    },

    "/api/auth/verify": {
      get: {
        tags: ["Authentication"],
        summary: "Verify JWT token validity",
        responses: {
          200: successEnvelope({
            type: "object",
            properties: {
              user: { $ref: "#/components/schemas/User" },
            },
          }),
          ...auth401,
        },
      },
    },

    "/api/auth/profile": {
      get: {
        tags: ["Authentication"],
        summary: "Get current user profile",
        responses: {
          200: successEnvelope({
            type: "object",
            properties: {
              user: { $ref: "#/components/schemas/User" },
            },
          }),
          ...auth401,
        },
      },
      put: {
        tags: ["Authentication"],
        summary: "Update user profile",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                description: "At least one field must be provided",
                properties: {
                  name: { type: "string", minLength: 2 },
                  email: { type: "string", format: "email" },
                },
              },
            },
          },
        },
        responses: {
          200: successEnvelope(
            {
              type: "object",
              properties: {
                user: { $ref: "#/components/schemas/User" },
              },
            },
            "Profile updated successfully",
          ),
          ...auth401,
          ...badRequest400,
        },
      },
    },

    "/api/auth/change-password": {
      post: {
        tags: ["Authentication"],
        summary: "Change password (authenticated)",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["currentPassword", "newPassword", "confirmPassword"],
                properties: {
                  currentPassword: { type: "string" },
                  newPassword: { type: "string", minLength: 6 },
                  confirmPassword: { type: "string", minLength: 6 },
                },
              },
            },
          },
        },
        responses: {
          200: {
            description: "Password changed successfully",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    success: { type: "boolean", example: true },
                    message: { type: "string" },
                  },
                },
              },
            },
          },
          ...auth401,
          ...badRequest400,
        },
      },
    },

    "/api/auth/refresh": {
      post: {
        tags: ["Authentication"],
        summary: "Refresh access token using refresh token",
        description:
          "Exchange a valid refresh token for a new access token. Both tokens contain tokenVersion for instant revocation on logout.",
        security: [],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["refreshToken"],
                properties: {
                  refreshToken: {
                    type: "string",
                    description: "JWT refresh token (7 days validity)",
                  },
                },
              },
            },
          },
        },
        responses: {
          200: successEnvelope(
            {
              type: "object",
              properties: {
                token: {
                  type: "string",
                  description: "New JWT access token (7 days validity)",
                },
                refreshToken: {
                  type: "string",
                  description: "Same refresh token (can be reused)",
                },
              },
            },
            "Access token refreshed successfully",
          ),
          ...auth401,
          ...badRequest400,
        },
      },
    },

    "/api/auth/logout": {
      post: {
        tags: ["Authentication"],
        summary: "Logout current user (invalidates all tokens)",
        description:
          "Increments user's tokenVersion to instantly invalidate ALL existing tokens (access + refresh). This provides true logout security - tokens become invalid immediately even if stored by attacker.",
        responses: {
          200: {
            description: "Logged out successfully",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    success: { type: "boolean", example: true },
                    message: {
                      type: "string",
                      example: "Logged out successfully",
                    },
                  },
                },
              },
            },
          },
          ...auth401,
        },
      },
    },

    /* ─────────────────────────────────────────────────────────
       PRODUCTS
       ───────────────────────────────────────────────────────── */
    "/api/products": {
      get: {
        tags: ["Products"],
        summary: "Get all products (with filters & sort)",
        security: [],
        parameters: [
          {
            in: "query",
            name: "category",
            schema: { type: "string" },
            description: "Filter by category",
          },
          {
            in: "query",
            name: "minPrice",
            schema: { type: "number" },
            description: "Minimum price",
          },
          {
            in: "query",
            name: "maxPrice",
            schema: { type: "number" },
            description: "Maximum price",
          },
          {
            in: "query",
            name: "search",
            schema: { type: "string" },
            description: "Search by product name",
          },
          {
            in: "query",
            name: "featured",
            schema: { type: "boolean" },
            description: "Filter featured products only",
          },
          {
            in: "query",
            name: "sort",
            schema: {
              type: "string",
              enum: [
                "price_asc",
                "price_desc",
                "name_asc",
                "name_desc",
                "rating_desc",
                "newest",
              ],
            },
            description: "Sort order (default: newest)",
          },
        ],
        responses: {
          200: successEnvelope(
            {
              type: "array",
              items: { $ref: "#/components/schemas/Product" },
            },
            "List of products",
          ),
        },
      },
    },

    "/api/products/categories/list": {
      get: {
        tags: ["Products"],
        summary: "Get all available categories",
        security: [],
        responses: {
          200: successEnvelope(
            {
              type: "array",
              items: { type: "string" },
            },
            "List of category names",
          ),
        },
      },
    },

    "/api/products/{id}": {
      get: {
        tags: ["Products"],
        summary: "Get product by ID",
        security: [],
        parameters: [
          {
            in: "path",
            name: "id",
            required: true,
            schema: { type: "string" },
            description: "Product ID (MongoDB ObjectId)",
          },
        ],
        responses: {
          200: successEnvelope({ $ref: "#/components/schemas/Product" }),
          ...notFound404,
        },
      },
    },

    /* ─────────────────────────────────────────────────────────
       CART
       ───────────────────────────────────────────────────────── */
    "/api/cart": {
      get: {
        tags: ["Cart"],
        summary: "Get current user's cart",
        responses: {
          200: successEnvelope({ $ref: "#/components/schemas/Cart" }),
          ...auth401,
        },
      },
    },

    "/api/cart/count": {
      get: {
        tags: ["Cart"],
        summary: "Get item count in cart",
        responses: {
          200: successEnvelope({
            type: "object",
            properties: { count: { type: "integer" } },
          }),
          ...auth401,
        },
      },
    },

    "/api/cart/add": {
      post: {
        tags: ["Cart"],
        summary: "Add item to cart",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["productId", "quantity"],
                properties: {
                  productId: {
                    type: "string",
                    description: "Product ObjectId",
                  },
                  quantity: { type: "integer", minimum: 1 },
                },
              },
            },
          },
        },
        responses: {
          200: successEnvelope(
            { $ref: "#/components/schemas/Cart" },
            "Item added to cart",
          ),
          ...badRequest400,
          ...auth401,
        },
      },
    },

    "/api/cart/update": {
      put: {
        tags: ["Cart"],
        summary: "Update item quantity in cart",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["productId", "quantity"],
                properties: {
                  productId: { type: "string" },
                  quantity: {
                    type: "integer",
                    minimum: 0,
                    description: "Set to 0 to remove",
                  },
                },
              },
            },
          },
        },
        responses: {
          200: successEnvelope(
            { $ref: "#/components/schemas/Cart" },
            "Quantity updated",
          ),
          ...notFound404,
          ...auth401,
        },
      },
    },

    "/api/cart/remove": {
      delete: {
        tags: ["Cart"],
        summary: "Remove item from cart",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["productId"],
                properties: {
                  productId: { type: "string" },
                },
              },
            },
          },
        },
        responses: {
          200: successEnvelope(
            { $ref: "#/components/schemas/Cart" },
            "Item removed from cart",
          ),
          ...notFound404,
          ...auth401,
        },
      },
    },

    "/api/cart/clear": {
      delete: {
        tags: ["Cart"],
        summary: "Clear entire cart",
        responses: {
          200: successEnvelope(
            {
              type: "object",
              properties: {
                userId: { type: "string" },
                items: { type: "array", items: {}, example: [] },
                total: { type: "number", example: 0 },
              },
            },
            "Cart cleared",
          ),
          ...auth401,
        },
      },
    },

    /* ─────────────────────────────────────────────────────────
       ORDERS
       ───────────────────────────────────────────────────────── */
    "/api/orders": {
      post: {
        tags: ["Orders"],
        summary: "Create new order from cart",
        description:
          "Creates order with status pending_payment, creates Stripe payment intent, and returns clientSecret for the frontend to complete payment.",
        parameters: [
          {
            in: "header",
            name: "Idempotency-Key",
            required: true,
            schema: { type: "string" },
            description: "Unique key to prevent duplicate orders (e.g. UUID)",
          },
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["shippingAddress"],
                properties: {
                  shippingAddress: {
                    $ref: "#/components/schemas/ShippingAddress",
                  },
                  billingAddress: {
                    $ref: "#/components/schemas/ShippingAddress",
                  },
                  paymentMethod: {
                    type: "string",
                    enum: ["stripe"],
                    default: "stripe",
                  },
                  notes: { type: "string" },
                },
              },
            },
          },
        },
        responses: {
          201: successEnvelope(
            {
              type: "object",
              properties: {
                order: { $ref: "#/components/schemas/Order" },
                payment: {
                  type: "object",
                  properties: {
                    clientSecret: { type: "string" },
                    checkoutUrl: { type: "string", format: "uri" },
                    status: { type: "string" },
                  },
                },
              },
            },
            "Order created. Complete payment to confirm.",
          ),
          ...badRequest400,
          ...auth401,
        },
      },
      get: {
        tags: ["Orders"],
        summary: "Get current user's orders",
        parameters: [
          {
            in: "query",
            name: "status",
            schema: {
              type: "string",
              enum: [
                "pending",
                "pending_payment",
                "confirmed",
                "processing",
                "shipped",
                "delivered",
                "cancelled",
              ],
            },
            description: "Filter by order status",
          },
        ],
        responses: {
          200: successEnvelope({
            type: "object",
            properties: {
              orders: {
                type: "array",
                items: { $ref: "#/components/schemas/Order" },
              },
            },
          }),
          ...auth401,
        },
      },
    },

    "/api/orders/track/{orderId}": {
      get: {
        tags: ["Orders"],
        summary: "Track an order (public – no auth required)",
        security: [],
        parameters: [
          {
            in: "path",
            name: "orderId",
            required: true,
            schema: { type: "string" },
            description: "Order ID (MongoDB ObjectId)",
          },
        ],
        responses: {
          200: successEnvelope({
            type: "object",
            description: "Order tracking information",
          }),
          ...notFound404,
        },
      },
    },

    "/api/orders/{orderId}": {
      get: {
        tags: ["Orders"],
        summary: "Get order by ID",
        parameters: [
          {
            in: "path",
            name: "orderId",
            required: true,
            schema: { type: "string" },
          },
        ],
        responses: {
          200: successEnvelope({
            type: "object",
            properties: {
              order: { $ref: "#/components/schemas/Order" },
            },
          }),
          ...notFound404,
          ...auth401,
        },
      },
    },

    "/api/orders/{orderId}/cancel": {
      post: {
        tags: ["Orders"],
        summary: "Cancel an order",
        parameters: [
          {
            in: "path",
            name: "orderId",
            required: true,
            schema: { type: "string" },
          },
        ],
        responses: {
          200: successEnvelope(
            {
              type: "object",
              properties: {
                order: { $ref: "#/components/schemas/Order" },
              },
            },
            "Order cancelled successfully",
          ),
          ...badRequest400,
          ...notFound404,
          ...auth401,
        },
      },
    },

    /* ─────────────────────────────────────────────────────────
       PAYMENTS
       ───────────────────────────────────────────────────────── */
    "/api/payments/create-intent": {
      post: {
        tags: ["Payments"],
        summary: "Create a Stripe payment intent for an order",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["orderId"],
                properties: {
                  orderId: {
                    type: "string",
                    description: "Order ID",
                  },
                },
              },
            },
          },
        },
        responses: {
          200: successEnvelope({
            type: "object",
            properties: {
              payment: { $ref: "#/components/schemas/Payment" },
              status: { type: "string" },
              clientSecret: { type: "string" },
              checkoutUrl: { type: "string", format: "uri" },
            },
          }),
          ...badRequest400,
          ...auth401,
        },
      },
    },

    "/api/payments/checkout": {
      post: {
        tags: ["Payments"],
        summary: "Alias for create-intent",
        description:
          "Same as POST /api/payments/create-intent – provided for convenience.",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["orderId"],
                properties: {
                  orderId: { type: "string" },
                },
              },
            },
          },
        },
        responses: {
          200: successEnvelope({
            type: "object",
            properties: {
              payment: { $ref: "#/components/schemas/Payment" },
              status: { type: "string" },
              clientSecret: { type: "string" },
              checkoutUrl: { type: "string", format: "uri" },
            },
          }),
          ...badRequest400,
          ...auth401,
        },
      },
    },

    "/api/payments/{orderId}/status": {
      get: {
        tags: ["Payments"],
        summary: "Get payment status for an order",
        parameters: [
          {
            in: "path",
            name: "orderId",
            required: true,
            schema: { type: "string" },
          },
        ],
        responses: {
          200: successEnvelope({
            type: "object",
            description: "Payment status information",
          }),
          ...auth401,
          ...notFound404,
        },
      },
    },

    "/api/payments/webhook": {
      post: {
        tags: ["Payments"],
        summary: "Stripe webhook (called by Stripe servers only)",
        description:
          "⚠️ Do NOT call from client. Stripe sends payment events here.\n\nEvents handled:\n- checkout.session.completed\n- payment_intent.succeeded\n- payment_intent.payment_failed\n\nRequires raw body for signature verification.",
        security: [],
        parameters: [
          {
            in: "header",
            name: "stripe-signature",
            required: true,
            schema: { type: "string" },
            description:
              "Stripe webhook signature for HMAC-SHA256 verification",
          },
        ],
        requestBody: {
          description: "Raw Stripe event payload (must NOT be JSON-parsed)",
          required: true,
          content: {
            "application/json": {
              schema: { type: "object" },
            },
          },
        },
        responses: {
          200: {
            description: "Webhook received and processed",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    received: { type: "boolean", example: true },
                  },
                },
              },
            },
          },
          ...badRequest400,
        },
      },
    },

    /* ─────────────────────────────────────────────────────────
       ADDRESSES
       ───────────────────────────────────────────────────────── */
    "/api/addresses": {
      get: {
        tags: ["Addresses"],
        summary: "Get all addresses for the current user",
        responses: {
          200: successEnvelope({
            type: "array",
            items: { $ref: "#/components/schemas/Address" },
          }),
          ...auth401,
        },
      },
      post: {
        tags: ["Addresses"],
        summary: "Create a new address",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["street", "city", "postalCode", "country"],
                properties: {
                  street: { type: "string" },
                  city: { type: "string" },
                  state: { type: "string" },
                  postalCode: { type: "string" },
                  country: { type: "string" },
                  isDefault: { type: "boolean" },
                },
              },
            },
          },
        },
        responses: {
          201: successEnvelope(
            { $ref: "#/components/schemas/Address" },
            "Address created successfully",
          ),
          ...badRequest400,
          ...auth401,
        },
      },
    },

    "/api/addresses/default": {
      get: {
        tags: ["Addresses"],
        summary: "Get the default address",
        responses: {
          200: successEnvelope({ $ref: "#/components/schemas/Address" }),
          ...auth401,
          ...notFound404,
        },
      },
    },

    "/api/addresses/{addressId}": {
      get: {
        tags: ["Addresses"],
        summary: "Get address by ID",
        parameters: [
          {
            in: "path",
            name: "addressId",
            required: true,
            schema: { type: "string" },
          },
        ],
        responses: {
          200: successEnvelope({ $ref: "#/components/schemas/Address" }),
          ...auth401,
          ...notFound404,
        },
      },
      put: {
        tags: ["Addresses"],
        summary: "Update an address",
        parameters: [
          {
            in: "path",
            name: "addressId",
            required: true,
            schema: { type: "string" },
          },
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  street: { type: "string" },
                  city: { type: "string" },
                  state: { type: "string" },
                  postalCode: { type: "string" },
                  country: { type: "string" },
                  isDefault: { type: "boolean" },
                },
              },
            },
          },
        },
        responses: {
          200: successEnvelope(
            { $ref: "#/components/schemas/Address" },
            "Address updated successfully",
          ),
          ...badRequest400,
          ...auth401,
          ...notFound404,
        },
      },
      delete: {
        tags: ["Addresses"],
        summary: "Delete an address",
        parameters: [
          {
            in: "path",
            name: "addressId",
            required: true,
            schema: { type: "string" },
          },
        ],
        responses: {
          204: { description: "Address deleted (no content)" },
          ...auth401,
          ...notFound404,
        },
      },
    },

    "/api/addresses/{addressId}/set-default": {
      post: {
        tags: ["Addresses"],
        summary: "Set an address as default",
        parameters: [
          {
            in: "path",
            name: "addressId",
            required: true,
            schema: { type: "string" },
          },
        ],
        responses: {
          200: successEnvelope(
            { $ref: "#/components/schemas/Address" },
            "Default address set successfully",
          ),
          ...auth401,
          ...notFound404,
        },
      },
    },

    /* ─────────────────────────────────────────────────────────
       ADMIN
       ───────────────────────────────────────────────────────── */
    "/api/admin/products": {
      get: {
        tags: ["Admin"],
        summary: "List all products (including inactive)",
        parameters: [
          {
            in: "query",
            name: "includeInactive",
            schema: { type: "boolean", default: true },
            description: "Include inactive products (default: true)",
          },
        ],
        responses: {
          200: successEnvelope({
            type: "object",
            properties: {
              products: {
                type: "array",
                items: { $ref: "#/components/schemas/Product" },
              },
            },
          }),
          ...auth401,
          ...auth403,
        },
      },
      post: {
        tags: ["Admin"],
        summary: "Create a new product",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: [
                  "sku",
                  "name",
                  "description",
                  "price",
                  "category",
                  "image",
                ],
                properties: {
                  sku: { type: "string" },
                  name: { type: "string" },
                  description: { type: "string" },
                  price: { type: "number", minimum: 0 },
                  category: { type: "string" },
                  image: { type: "string", format: "uri" },
                  stock: { type: "integer", default: 0 },
                  featured: { type: "boolean", default: false },
                  rating: { type: "number", default: 0 },
                  isActive: { type: "boolean", default: true },
                },
              },
            },
          },
        },
        responses: {
          201: successEnvelope({
            type: "object",
            properties: {
              product: { $ref: "#/components/schemas/Product" },
            },
          }),
          ...badRequest400,
          ...auth401,
          ...auth403,
        },
      },
    },

    "/api/admin/products/{id}": {
      put: {
        tags: ["Admin"],
        summary: "Update a product",
        parameters: [
          {
            in: "path",
            name: "id",
            required: true,
            schema: { type: "string" },
          },
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  name: { type: "string" },
                  description: { type: "string" },
                  price: { type: "number" },
                  stock: { type: "integer" },
                  category: { type: "string" },
                  image: { type: "string" },
                  featured: { type: "boolean" },
                  isActive: { type: "boolean" },
                },
              },
            },
          },
        },
        responses: {
          200: successEnvelope({
            type: "object",
            properties: {
              product: { $ref: "#/components/schemas/Product" },
            },
          }),
          ...badRequest400,
          ...auth401,
          ...auth403,
          ...notFound404,
        },
      },
      delete: {
        tags: ["Admin"],
        summary: "Delete (soft-disable) a product",
        parameters: [
          {
            in: "path",
            name: "id",
            required: true,
            schema: { type: "string" },
          },
        ],
        responses: {
          200: successEnvelope(
            {
              type: "object",
              properties: {
                product: { $ref: "#/components/schemas/Product" },
              },
            },
            "Product disabled (soft delete)",
          ),
          ...auth401,
          ...auth403,
          ...notFound404,
        },
      },
    },

    "/api/admin/users": {
      get: {
        tags: ["Admin"],
        summary: "List all users (paginated)",
        parameters: [
          {
            in: "query",
            name: "page",
            schema: { type: "integer", default: 1 },
          },
          {
            in: "query",
            name: "limit",
            schema: { type: "integer", default: 20 },
          },
        ],
        responses: {
          200: successEnvelope({
            type: "object",
            description: "Paginated user list",
          }),
          ...auth401,
          ...auth403,
        },
      },
    },

    "/api/admin/users/{id}/role": {
      put: {
        tags: ["Admin"],
        summary: "Update a user's role",
        parameters: [
          {
            in: "path",
            name: "id",
            required: true,
            schema: { type: "string" },
          },
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["role"],
                properties: {
                  role: {
                    type: "string",
                    enum: ["user", "admin"],
                  },
                },
              },
            },
          },
        },
        responses: {
          200: successEnvelope({
            type: "object",
            properties: {
              user: { $ref: "#/components/schemas/User" },
            },
          }),
          ...badRequest400,
          ...auth401,
          ...auth403,
        },
      },
    },

    "/api/admin/orders": {
      get: {
        tags: ["Admin"],
        summary: "List all orders (with optional filters)",
        parameters: [
          {
            in: "query",
            name: "status",
            schema: { type: "string" },
            description: "Filter by order status",
          },
          {
            in: "query",
            name: "userId",
            schema: { type: "string" },
            description: "Filter by user ID",
          },
        ],
        responses: {
          200: successEnvelope({
            type: "object",
            properties: {
              orders: {
                type: "array",
                items: { $ref: "#/components/schemas/Order" },
              },
            },
          }),
          ...auth401,
          ...auth403,
        },
      },
    },

    "/api/admin/orders/{id}/status": {
      put: {
        tags: ["Admin"],
        summary: "Update order status",
        parameters: [
          {
            in: "path",
            name: "id",
            required: true,
            schema: { type: "string" },
          },
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["status"],
                properties: {
                  status: {
                    type: "string",
                    enum: [
                      "pending",
                      "pending_payment",
                      "confirmed",
                      "processing",
                      "shipped",
                      "delivered",
                      "cancelled",
                    ],
                  },
                  message: {
                    type: "string",
                    description: "Optional tracking message",
                  },
                },
              },
            },
          },
        },
        responses: {
          200: successEnvelope({
            type: "object",
            properties: {
              order: { $ref: "#/components/schemas/Order" },
            },
          }),
          ...badRequest400,
          ...auth401,
          ...auth403,
          ...notFound404,
        },
      },
    },

    "/api/admin/stats/summary": {
      get: {
        tags: ["Admin"],
        summary: "Get dashboard statistics summary",
        responses: {
          200: successEnvelope({
            type: "object",
            properties: {
              stats: {
                type: "object",
                description: "Summary statistics",
              },
            },
          }),
          ...auth401,
          ...auth403,
        },
      },
    },

    /* ─────────────────────────────────────────────────────────
       METRICS
       ───────────────────────────────────────────────────────── */
    "/api/metrics/payment": {
      get: {
        tags: ["Metrics"],
        summary: "Get payment metrics summary",
        parameters: [
          {
            in: "query",
            name: "lastN",
            schema: { type: "integer", default: 100 },
            description: "Number of recent payments to analyze",
          },
        ],
        responses: {
          200: successEnvelope({
            type: "object",
            description: "Payment metrics",
          }),
          ...auth401,
        },
      },
    },

    "/api/metrics/webhook": {
      get: {
        tags: ["Metrics"],
        summary: "Get webhook metrics",
        parameters: [
          {
            in: "query",
            name: "lastN",
            schema: { type: "integer", default: 100 },
            description: "Number of recent webhooks to analyze",
          },
        ],
        responses: {
          200: successEnvelope({
            type: "object",
            description: "Webhook metrics",
          }),
          ...auth401,
        },
      },
    },

    "/api/metrics/all": {
      get: {
        tags: ["Metrics"],
        summary: "Export all metrics",
        responses: {
          200: successEnvelope({
            type: "object",
            description: "All exported metrics",
          }),
          ...auth401,
        },
      },
    },
  },
};

/* ─────────────────────────────────────────────────────────────
   EXPORT
   ───────────────────────────────────────────────────────────── */
const options = {
  definition,
  apis: [], // All paths defined inline — no JSDoc scanning needed
};

export const specs = swaggerJsdoc(options);
