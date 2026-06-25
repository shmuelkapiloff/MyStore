# Simple Shop Backend - Complete Documentation

## Quick Links

- **Setup & Configuration:** [DEPLOYMENT_GUIDE.md](./docs/technical/DEPLOYMENT_GUIDE.md)
- **Architecture Overview:** [ARCHITECTURE_NARRATIVE.md](./docs/technical/ARCHITECTURE_NARRATIVE.md)
- **Payment System:** [PAYMENT_SYSTEM_DESIGN.md](./docs/technical/PAYMENT_SYSTEM_DESIGN.md)
- **Security:** [SECURITY_DESIGN_DECISIONS.md](./docs/security/SECURITY_DESIGN_DECISIONS.md)
- **API Reference:** [API_REFERENCE.md](./docs/technical/API_REFERENCE.md)
- **Postman Collection:** [postman/Simple-Shop-Complete-Collection.json](./postman/Simple-Shop-Complete-Collection.json)

---

## Project Overview

**Simple Shop** is a production-ready e-commerce backend built with Express.js, MongoDB, and Stripe payment processing. Designed for security, observability, and scalability.

**Key Features:**
- 🔒 Secure payment processing with Stripe webhook verification
- 🔄 Atomic stock management (prevent overselling with transactions)
- 📊 Observable by default (structured logging + metrics)
- ⚡ Two-tier caching (Redis + MongoDB)
- 🧪 Comprehensive test coverage (auth, payments, race conditions)
- 📈 Production-ready deployment strategies

---

## Core Architecture

### Technology Stack

| Component | Technology | Version | Purpose |
|-----------|-----------|---------|---------|
| **Runtime** | Node.js | 18+ | Server runtime |
| **Framework** | Express.js | 4.19+ | HTTP server |
| **Language** | TypeScript | 5.0+ | Type safety |
| **Primary Database** | MongoDB | 8.6+ | Orders, products, users |
| **Cache Layer** | Redis | 5.4+ | Session, cart caching |
| **Payment Provider** | Stripe | 20.1+ | Payment processing |
| **Authentication** | JWT | jsonwebtoken 9.0+ | Token-based auth |
| **Logging** | Pino | 9.4+ | Structured JSON logging |
| **Metrics** | Prometheus | prom-client 15.1+ | System observability |
| **Testing** | Jest | 29.7+ | Test framework |

### Architecture Diagram

```
┌─────────────┐
│   Client    │ (React + Redux)
│   (Vite)    │
└──────┬──────┘
       │ HTTP/HTTPS
       ↓
┌─────────────────────────────────────┐
│  Load Balancer / Reverse Proxy      │
│  (nginx, Render, AWS ALB)           │
└──────┬──────────────────────────────┘
       │
┌──────┴──────────────────────────────┐
│  API Server (Clustered)             │
│  ┌─────────────────────────────────┐│
│  │ Express.js Application          ││
│  │  - Controllers                  ││
│  │  - Route Handlers               ││
│  │  - Middleware Pipeline          ││
│  └─────────────────────────────────┘│
└──────┬──────────────────────────────┘
       │
       ├─────────────────┬─────────────────┬──────────────────┐
       │                 │                 │                  │
       ↓                 ↓                 ↓                  ↓
┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌────────────┐
│   MongoDB    │  │    Redis     │  │   Stripe     │  │  External  │
│  (Primary)   │  │   (Cache)    │  │   API        │  │  Email Svc │
└──────────────┘  └──────────────┘  └──────────────┘  └────────────┘
     ↑
     │ Webhooks
     │
┌──────────────────────────────┐
│  Stripe Webhook Processing   │
│  (Automatic on POST /webhook)│
└──────────────────────────────┘
```

### Database Schema

**Collections:**
- `users` - Authentication, profiles
- `products` - Catalog with pricing, stock
- `orders` - Orders including embedded order line items snapshot
- `carts` - Shopping cart state per user
- `addresses` - User shipping addresses
- `payments` - Payment records with provider reference
- `webhook-events` - Processed webhook IDs (idempotency)
- `failed-webhooks` - Retry queue for failed webhooks
- `idempotency-keys` - Cached responses for idempotent order creation
- `sequences` - Atomic counters (order number generation)
- `audit-logs` - Admin/security activity trail

**Auth Token Model:**
- Access token + refresh token are JWTs.
- Refresh token revocation is handled via `tokenVersion` on user documents (no separate `refresh-tokens` collection).

**See Also:** [Database Schema](./docs/technical/DATABASE_SCHEMA_COMPLETE.md)

---

## Quick Start

### Prerequisites

- Node.js 18+ with npm
- MongoDB 8.6+ (cloud: [MongoDB Atlas](https://www.mongodb.com/cloud/atlas) free tier works)
- Redis 5.4+ (cloud: [Redis Cloud](https://redis.com/try-free/) free tier works)
- Stripe account (free [test mode](https://dashboard.stripe.com/test/apikeys))

### Local Development

**1. Clone & Install**
```bash
cd server
npm install
```

**2. Configure Environment**
```bash
cp .env.example .env
```

Edit `.env`:
```env
# Database
MONGO_URI=mongodb+srv://username:password@cluster.mongodb.net/simple-shop

# Cache
REDIS_URL=redis://default:password@host:port

# Stripe
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_test_...

# JWT
JWT_SECRET=your-super-secret-key-change-in-production
JWT_REFRESH_SECRET=your-refresh-secret-change-in-production

# Server
NODE_ENV=development
PORT=4001
CLIENT_URL=http://localhost:3000

# Logging
LOG_LEVEL=debug
```

**3. Start Server**
```bash
# With auto-reload (development)
npm run dev

# Production build
npm run build
npm run start

# Run tests
npm run test

# Run specific test file
npm run test -- payment-webhook.test.ts

# Watch mode (auto-rerun on changes)
npm run test:watch
```

**4. Verify Health**
```bash
curl http://localhost:4001/health
# Response: { "status": "ok", "timestamp": "2024-01-28T..." }
```

### Deployment

See [DEPLOYMENT_GUIDE.md](./docs/technical/DEPLOYMENT_GUIDE.md) for:
- Docker containerization
- Render.com deployment
- AWS EC2 deployment
- Environment configuration
- Health checks & monitoring
- Production checklist

---

## API Overview

### Authentication Endpoints

```
POST   /api/auth/register     - Create account
POST   /api/auth/login        - Get JWT token
POST   /api/auth/logout       - Clear session
POST   /api/auth/refresh      - Get new token
POST   /api/auth/forgot-password - Password reset flow
POST   /api/auth/reset-password/:token - Confirm reset with token
```

### Product Endpoints

```
GET    /api/products          - List all products (paginated)
GET    /api/products/:id      - Get product details
GET    /api/products/categories/list - List available categories
```

### Cart Endpoints (Authenticated)

```
GET    /api/cart              - Get current user's cart
POST   /api/cart/add          - Add item to cart
PUT    /api/cart/update       - Update item quantity
DELETE /api/cart/remove       - Remove item from cart
DELETE /api/cart/clear        - Clear entire cart
```

### Order Endpoints (Authenticated)

```
POST   /api/orders            - Create new order
GET    /api/orders            - List user's orders
GET    /api/orders/:id        - Get order details
POST   /api/orders/:id/cancel - Cancel order
```

### Payment Endpoints

```
POST   /api/payments/create-intent  - Create Stripe checkout session
GET    /api/payments/:orderId/status - Verify payment status
POST   /api/payments/webhook        - Receive Stripe webhooks (⚠️ Signed)
```

### Admin Endpoints (Requires Admin Role)

```
GET    /api/admin/users       - List all users
GET    /api/admin/orders      - List all orders
POST   /api/admin/products    - Create product
PUT    /api/admin/products/:id - Update product
DELETE /api/admin/products/:id - Delete product
```

**Full API Reference:** [API_REFERENCE.md](./docs/technical/API_REFERENCE.md)

---

## Payment Flow

### High-Level Flow

```
1. Customer adds items to cart
2. Checkout button → creates payment intent
3. Server calls Stripe API → creates Checkout Session
4. Customer redirected to Stripe-hosted payment page
5. Customer enters card details → Stripe processes
6. Stripe redirects to success/cancel URL
7. Stripe sends webhook to our server (async)
8. Webhook triggers order fulfillment
9. Email confirmation sent to customer
```

### Security Implementation

- ✅ Webhook signature verification (HMAC-SHA256)
- ✅ Idempotency tracking (prevent duplicate charges)
- ✅ Amount verification (database vs. webhook)
- ✅ MongoDB transactions (atomic stock reduction)
- ✅ Retry logic with exponential backoff

**See Also:** [PAYMENT_SYSTEM_DESIGN.md](./docs/technical/PAYMENT_SYSTEM_DESIGN.md)

---

## Key Design Decisions

### Why MongoDB?

- Flexible schema (product attributes vary)
- Built-in TTL indexes (webhook event cleanup)
- ACID transactions (stock management)
- Horizontal scaling via sharding

### Why Redis?

- Sub-millisecond caching for hot data
- Per-key TTL expiration
- Data structure support (hashes, lists for cart items)
- Session storage

### Why Transactions?

- Prevents overselling (stock never goes negative)
- Atomic: All operations succeed or all rollback
- Handles concurrent purchase requests safely
- Database-level locking (works with multiple servers)

### Why Two-Tier Caching?

- Redis: Fast (5ms) for 95% of reads
- MongoDB: Durable fallback if Redis crashes
- Trade-off: Accept +5ms latency for durability guarantee

---

## Observability

### Logs

**Structured JSON format with:**
- Request ID (traceability across services)
- User ID (identify which user caused the event)
- Service name (which component)
- Timestamp (when it happened)
- Context fields (orderId, amount, etc.)

**Viewing logs:**
```bash
# All logs
docker-compose logs -f api

# Filter by error
docker-compose logs -f api | grep ERROR

# Follow real-time
docker-compose logs -f api
```

**Log Aggregation (Production):**
- Send to ELK Stack (Elasticsearch, Logstash, Kibana)
- Or: CloudWatch (AWS), Datadog, Papertrail
- Query: All failed payments in last hour
- Alert: Error rate > 1%

### Metrics

**Prometheus metrics exposed at:**
```
GET /metrics
```

**Key Metrics:**
- `http_request_duration_seconds` - API latency
- `http_request_total` - Request count by method/route
- `payments_total` - Total payment attempts
- `payments_success` - Successful payments
- `orders_created` - New orders
- `stock_remaining` - Product inventory

**Grafana Dashboard:**
- Requests per second by endpoint
- Error rate trend
- Payment success rate
- API latency histogram
- Database query time

### Health Checks

```bash
# Basic health
GET /health

# API health (dependencies)
GET /api/health

# Fast ping
GET /api/health/ping
```

Returns:
```json
{
  "status": "healthy",
  "checks": {
    "database": "ok",
    "redis": "ok",
    "stripe": "ok"
  },
  "uptime": 3600,
  "timestamp": "2024-01-28T..."
}
```

---

## Testing

### Test Coverage

| Component | Coverage | Type |
|-----------|----------|------|
| Authentication | 85% | Unit + Integration |
| Payment Webhook | 90% | Unit + Security |
| Order Management | 80% | Unit + Integration |
| Product Catalog | 75% | Unit |
| Cart Operations | 70% | Unit |
| **Overall** | **80%** | Mixed |

### Running Tests

```bash
# All tests
npm run test

# Watch mode (auto-rerun on file change)
npm run test:watch

# Specific test file
npm run test -- auth.test.ts

# With coverage report
npm run test -- --coverage

# Only failed tests
npm run test -- --onlyChanged
```

### Test Categories

**Unit Tests** - Individual functions
```bash
npm run test -- --testNamePattern="should hash password correctly"
```

**Integration Tests** - Across services
```bash
npm run test -- integration.test.ts
```

**Security Tests** - Attack scenarios
```bash
npm run test -- payment-webhook.test.ts --testNamePattern="signature"
```

**Performance Tests** - Load testing
```bash
npm run test -- performance.test.ts
```

---

## Common Tasks

### Add New Product

```bash
curl -X POST http://localhost:4001/api/admin/products \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Laptop",
    "price": 999.99,
    "category": "Electronics",
    "stock": 10,
    "description": "High-performance laptop"
  }'
```

### Create Admin User

Update user role directly in MongoDB (the `make-admin` script was removed):

```javascript
db.users.updateOne(
  { email: "user@example.com" },
  { $set: { role: "admin" } }
)
```

### Seed Database

```bash
npm run seed
```

### Check Stripe Webhooks (Local Testing)

**Using Stripe CLI:**
```bash
# Install Stripe CLI
brew install stripe/stripe-cli/stripe

# Login to Stripe
stripe login

# Start webhook listener
stripe listen --forward-to localhost:4001/api/payments/webhook

# Trigger test webhook
stripe trigger payment_intent.succeeded
```

### Monitor Performance

```bash
# CPU & Memory usage
node --prof app.ts
node --prof-process isolate-*.log > output.txt
```

---

## Troubleshooting

### MongoDB Connection Error

**Error:** `MongoServerError: Authentication failed`

**Solution:**
1. Check connection string in `.env`
2. Verify username/password in MongoDB Atlas
3. Whitelist your IP in MongoDB Atlas
4. Ensure replica set enabled (for transactions)

### Redis Connection Error

**Error:** `Error: Redis connection failed`

**Solution:**
1. Check Redis is running: `redis-cli ping`
2. Verify `REDIS_URL` in `.env`
3. Check Redis authentication credentials
4. If no Redis: Set `REDIS_ENABLED=false` (uses fallback)

### Webhook Signature Verification Fails

**Error:** `Error: Signature verification failed`

**Solution:**
1. Check `STRIPE_WEBHOOK_SECRET` is correct (from Stripe dashboard)
2. Check raw body is passed to `constructEvent()` (not parsed JSON)
3. Check middleware order: raw body capture must come first
4. Check timestamp is recent (Stripe rejects old webhooks)

### Stock Still Reduces on Failed Payment

**Scenario:** Payment fails but stock was reduced

**Cause:** Webhook arrived before payment status was confirmed

**Solution:** Check `payment_status` in webhook (should be `paid`, not `unpaid`)

### Memory Leak After Deployment

**Error:** Server gradually uses more memory

**Cause:** Cache not being cleared, or connection pools growing

**Solution:**
1. Check Redis TTL configured (should auto-expire old data)
2. Verify database connection pooling: `MONGODB_MAX_CONNECTIONS=10`
3. Monitor with: `node --max-old-space-size=2048 app.ts`

---

## Performance Characteristics

### Stress Test Results

**Concurrent Users: 50**
- Average latency: 145ms
- P95 latency: 320ms
- Success rate: >99%
- DB connection pool: 5/10

**Concurrent Users: 100**
- Average latency: 287ms
- P95 latency: 650ms
- Success rate: 98%
- DB connection pool: 10/10 (exhausted)

**Recommendation:** Scale to 2-3 API instances at 100 concurrent users

### Database Indexes

Critical indexes for performance:
```javascript
// Products: By category (search)
db.products.createIndex({ category: 1 })

// Orders: By user (my orders)
db.orders.createIndex({ userId: 1, createdAt: -1 })

// Carts: By user (get cart)
db.carts.createIndex({ userId: 1 }, { unique: true })

// Webhook Events: By ID (idempotency)
db.webhookEvents.createIndex({ eventId: 1 }, { unique: true })

// Webhook Events: Auto-delete after 30 days
db.webhookEvents.createIndex({ createdAt: 1 }, { expireAfterSeconds: 2592000 })
```

---

## Security

### Security Checklist

- [x] All secrets in environment variables
- [x] HTTPS enforced in production
- [x] CORS whitelist configured
- [x] Rate limiting on public endpoints
- [x] Input validation with Zod
- [x] Webhook signature verification
- [x] Amount verification
- [x] MongoDB transactions for atomicity
- [x] JWT token expiry (15 minutes)
- [x] Refresh token rotation
- [x] Structured logging for audit
- [ ] WAF deployed (infrastructure level)
- [ ] DDoS protection configured (infrastructure level)

**Full Details:** [SECURITY_DESIGN_DECISIONS.md](./docs/security/SECURITY_DESIGN_DECISIONS.md)

---

## Interview Talking Points

### System Design

> "The architecture is designed for three things: reliability, observability, and scalability. We use MongoDB transactions to prevent race conditions in payment processing, two-tier caching (Redis + MongoDB) for performance without sacrificing durability, and Pino structured logging so every request is traceable end-to-end."

### Payment Processing

> "Payment security has five layers: webhook signature verification (HMAC-SHA256), idempotency tracking (event ID deduplication), amount verification (database vs. webhook), atomic transactions (all-or-nothing stock reduction), and retry logic with exponential backoff. If any layer fails, subsequent layers catch it."

### Scaling

> "At 10-100 users, single MongoDB instance works. At 100-1000 users, we add read replicas and scale API servers horizontally. At 1000+ users, we consider CQRS (separate read/write databases) and message queues for async operations. The architecture today supports scale without architectural changes."

### Testing

> "We focus on security-critical paths: webhook verification (signature spoofing), idempotency (duplicate webhooks), race conditions (concurrent purchases), and permission boundaries (one user accessing another's data). We have 80% coverage on critical paths, with comprehensive security tests."

---

## Contributing

### Code Style

- TypeScript strict mode
- Consistent code style and clear commit conventions
- Formatting follows project conventions

### Making Changes

1. Create feature branch: `git checkout -b feature/my-feature`
2. Write tests for your change
3. Ensure all tests pass: `npm run test`
4. Build the project: `npm run build`
5. Commit with clear message: `git commit -m "feat: add new feature"`
6. Push and create PR

### Before Deployment

```bash
npm run test      # Run all tests
npm run build     # Verify build succeeds
npm run start     # Test production start
```

---

## Support & Resources

### Documentation
- [API Reference](./docs/technical/API_REFERENCE.md)
- [Database Schema](./docs/technical/DATABASE_SCHEMA_COMPLETE.md)
- [Deployment Guide](./docs/technical/DEPLOYMENT_GUIDE.md)
- [Architecture Narrative](./docs/technical/ARCHITECTURE_NARRATIVE.md)

### External Resources
- [Stripe Documentation](https://stripe.com/docs)
- [MongoDB Documentation](https://docs.mongodb.com/)
- [Express.js Guide](https://expressjs.com/)
- [JWT Best Practices](https://tools.ietf.org/html/rfc7519)

### Getting Help

1. Check logs: `npm run dev` and look for error messages
2. Run tests: `npm run test` to verify system state
3. Check Stripe dashboard: Verify webhooks are being received
4. Review PR #XX for similar issues
5. Open GitHub issue with: error message + steps to reproduce

---

## License

MIT License - See LICENSE file

---

**Last Updated:** 2024-01-28
**Maintained By:** [Your Team]
**Next Review:** 2024-02-28
