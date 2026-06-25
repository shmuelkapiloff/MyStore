import { Router } from "express";
import { AddressController } from "../controllers/address.controller";
import { requireAuth } from "../middlewares/auth.middleware";
import { validateAddressId } from "../middlewares/validateObjectId.middleware";

const router = Router();

// All address routes require authentication
router.use(requireAuth);

// GET /api/addresses
router.get("/", AddressController.getAddresses);

// GET /api/addresses/default
router.get("/default", AddressController.getDefaultAddress);

// GET /api/addresses/:addressId
router.get("/:addressId", validateAddressId, AddressController.getAddressById);

// POST /api/addresses
router.post("/", AddressController.createAddress);

// PUT /api/addresses/:addressId
router.put(
  "/:addressId",
  validateAddressId,
  AddressController.updateAddress,
);

// DELETE /api/addresses/:addressId
router.delete(
  "/:addressId",
  validateAddressId,
  AddressController.deleteAddress,
);

// POST /api/addresses/:addressId/set-default
router.post(
  "/:addressId/set-default",
  validateAddressId,
  AddressController.setDefaultAddress,
);

export default router;
