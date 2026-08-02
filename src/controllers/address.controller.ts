import { Request, Response } from "express";
import { AddressService } from "../services/address.service";
import {
  addressSchema,
  updateAddressSchema,
} from "../validators/address.validator";
import { asyncHandler, UnauthorizedError } from "../utils/asyncHandler";

// DTO for address creation — full shipping card
export interface CreateAddressDTO {
  fullName: string;
  phone: string;
  street: string;
  city: string;
  postalCode: string;
  country: string;
  isDefault?: boolean;
}

// Handles all address operations: list, create, update, delete, and set default
export class AddressController {
  // Returns all saved addresses for the authenticated user
  static getAddresses = asyncHandler(async (req: Request, res: Response) => {
    const userId = req.user?._id;
    if (!userId) throw new UnauthorizedError();
    const addresses = await AddressService.getAddresses(userId);
    res.status(200).json({ success: true, data: addresses });
  });

  // Returns the user's default address
  static getDefaultAddress = asyncHandler(
    async (req: Request, res: Response) => {
      const userId = req.user?._id;
      if (!userId) throw new UnauthorizedError();
      const address = await AddressService.getDefaultAddress(userId);
      res.status(200).json({ success: true, data: address });
    },
  );

  // Marks an existing address as the user's new default
  static setDefaultAddress = asyncHandler(
    async (req: Request, res: Response) => {
      const userId = req.user?._id;
      const { addressId } = req.params;
      if (!userId) throw new UnauthorizedError();
      const address = await AddressService.setDefaultAddress(userId, addressId);
      res.status(200).json({
        success: true,
        data: address,
        message: "Default address set successfully",
      });
    },
  );

  // Returns a specific address by ID, scoped to the authenticated user
  static getAddressById = asyncHandler(async (req: Request, res: Response) => {
    const userId = req.user?._id;
    const { addressId } = req.params;
    if (!userId) throw new UnauthorizedError();
    const address = await AddressService.getAddressById(userId, addressId);
    res.status(200).json({ success: true, data: address });
  });

  // Creates a new address for the user after schema validation
  static createAddress = asyncHandler(async (req: Request, res: Response) => {
    const userId = req.user?._id;
    if (!userId) throw new UnauthorizedError();
    // Validate request body against the address schema
    const validated: CreateAddressDTO = addressSchema.parse(req.body);
    const address = await AddressService.createAddress(userId, validated);
    res.status(201).json({
      success: true,
      data: address,
      message: "Address created successfully",
    });
  });

  // Updates fields of an existing address belonging to the user
  static updateAddress = asyncHandler(async (req: Request, res: Response) => {
    const userId = req.user?._id;
    const { addressId } = req.params;
    if (!userId) throw new UnauthorizedError();
    const validated = updateAddressSchema.parse(req.body);
    const address = await AddressService.updateAddress(
      userId,
      addressId,
      validated,
    );
    res.status(200).json({
      success: true,
      data: address,
      message: "Address updated successfully",
    });
  });

  // Deletes an existing address belonging to the user
  static deleteAddress = asyncHandler(async (req: Request, res: Response) => {
    const userId = req.user?._id;
    const { addressId } = req.params;
    if (!userId) throw new UnauthorizedError();
    await AddressService.deleteAddress(userId, addressId);
    res.status(204).send();
  });
}
