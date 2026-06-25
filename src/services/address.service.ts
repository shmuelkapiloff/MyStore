import {
  AddressModel,
  CreateAddressInput,
  UpdateAddressInput,
} from "../models/address.model";
import { CreateAddressDTO } from "../controllers/address.controller";
import { NotFoundError } from "../utils/asyncHandler";

export class AddressService {
  static async getAddresses(userId: string) {
    const addresses = await AddressModel.find({ user: userId }).sort({
      isDefault: -1,
      createdAt: -1,
    });
    return addresses;
  }

  static async getDefaultAddress(userId: string) {
    const address = await AddressModel.findOne({
      user: userId,
      isDefault: true,
    });
    if (!address) throw new NotFoundError("Default address");
    return address;
  }

  static async setDefaultAddress(userId: string, addressId: string) {
    // Unset previous default
    await AddressModel.updateMany(
      { user: userId, isDefault: true },
      { $set: { isDefault: false } },
    );
    // Set new default
    const address = await AddressModel.findOneAndUpdate(
      { _id: addressId, user: userId },
      { $set: { isDefault: true } },
      { new: true },
    );
    if (!address) throw new NotFoundError("Address");
    return address;
  }

  static async getAddressById(userId: string, addressId: string) {
    const address = await AddressModel.findOne({
      _id: addressId,
      user: userId,
    });
    if (!address) throw new NotFoundError("Address");
    return address;
  }

  static async createAddress(userId: string, data: CreateAddressDTO) {
    const existingAddresses = await AddressModel.countDocuments({
      user: userId,
    });
    const addressData = {
      user: userId,
      fullName: data.fullName,
      phone: data.phone,
      street: data.street,
      city: data.city,
      postalCode: data.postalCode,
      country: data.country,
      isDefault: existingAddresses === 0 ? true : data.isDefault || false,
    };
    const address = await AddressModel.create(addressData);
    return address;
  }

  static async updateAddress(
    userId: string,
    addressId: string,
    data: Partial<CreateAddressDTO>,
  ) {
    const address = await AddressModel.findOneAndUpdate(
      { _id: addressId, user: userId },
      { $set: data },
      { new: true },
    );
    if (!address) throw new NotFoundError("Address");
    return address;
  }

  static async deleteAddress(userId: string, addressId: string) {
    const result = await AddressModel.deleteOne({
      _id: addressId,
      user: userId,
    });
    if (result.deletedCount === 0) throw new NotFoundError("Address");
  }
}
