import { Router } from "express";
import { AdminController } from "../controllers/admin.controller";
import { requireAdmin } from "../middlewares/auth.middleware";
import {
  validateProductId,
  validateObjectId,
} from "../middlewares/validateObjectId.middleware";
import { apiRateLimiter } from "../middlewares/rate-limiter.middleware";
import { autoLogAction } from "../middlewares/audit-logging.middleware";

const router = Router();

// All admin routes require auth + admin role + rate limiting
router.use(requireAdmin);
router.use(apiRateLimiter);

// Products
router.get("/products", AdminController.listProducts);
router.post(
  "/products",
  autoLogAction("ADMIN_CREATE_PRODUCT", "product"),
  AdminController.createProduct,
);
router.put(
  "/products/:id",
  validateProductId,
  autoLogAction("ADMIN_UPDATE_PRODUCT", "product"),
  AdminController.updateProduct,
);
router.delete(
  "/products/:id",
  validateProductId,
  autoLogAction("ADMIN_DELETE_PRODUCT", "product"),
  AdminController.deleteProduct,
);

// Users
router.get("/users", AdminController.listUsers);
router.put(
  "/users/:id/role",
  validateObjectId("id"),
  autoLogAction("ADMIN_UPDATE_USER_ROLE", "user"),
  AdminController.updateUserRole,
);

// Orders
router.get("/orders", AdminController.listOrders);
router.put(
  "/orders/:id/status",
  validateObjectId("id"),
  autoLogAction("ADMIN_UPDATE_ORDER_STATUS", "order"),
  AdminController.updateOrderStatus,
);

// Stats
router.get("/stats/summary", AdminController.getStats);

export default router;
