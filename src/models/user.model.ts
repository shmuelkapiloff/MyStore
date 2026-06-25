import { Schema, model, Document } from "mongoose";
import bcrypt from "bcryptjs";

// Interface for User document
export interface IUser extends Document {
  _id: string;
  email: string;
  password?: string;
  name: string;
  role: "user" | "admin";

  createdAt: Date;
  updatedAt: Date;
  isActive: boolean;
  lastLogin?: Date;
  lastUpdated?: Date;

  // Password reset fields
  resetPasswordToken?: string;
  resetPasswordExpires?: Date;

  // Account lockout fields
  failedLoginAttempts: number;
  lockedUntil?: Date | null;

  // Token version for instant logout / invalidation
  tokenVersion: number;

  // Google OAuth
  googleId?: string | null;
  avatar?: string | null;

  // Instance methods
  comparePassword(candidatePassword: string): Promise<boolean>;
  toJSON(): any;
}

// User Schema
const UserSchema = new Schema<IUser>(
  {
    email: {
      type: String,
      required: [true, "Email is required"],
      unique: true,
      lowercase: true,
      trim: true,
      match: [
        /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
        "Please provide a valid email address",
      ],
    },

    password: {
      type: String,
      // Required only for non-Google users
      required: function (this: any) {
        return !this.googleId;
      },
      minlength: [6, "Password must be at least 6 characters long"],
      select: false, // Don't include password in queries by default
    },

    name: {
      type: String,
      required: [true, "Name is required"],
      trim: true,
      minlength: [2, "Name must be at least 2 characters long"],
      maxlength: [50, "Name cannot exceed 50 characters"],
    },

    role: {
      type: String,
      enum: ["user", "admin"],
      default: "user",
    },

    isActive: {
      type: Boolean,
      default: true,
    },

    lastLogin: {
      type: Date,
    },

    lastUpdated: {
      type: Date,
      default: Date.now,
    },

    // Password reset
    resetPasswordToken: {
      type: String,
      default: null,
      select: false, // Don't include in queries
    },

    resetPasswordExpires: {
      type: Date,
      default: null,
      select: false, // Don't include in queries
    },

    // Account lockout
    failedLoginAttempts: {
      type: Number,
      default: 0,
      min: 0,
    },

    lockedUntil: {
      type: Date,
      default: null,
      index: true, // For efficient querying of locked accounts
    },

    // Token version: incrementing invalidates all existing tokens instantly
    tokenVersion: {
      type: Number,
      default: 0,
    },

    // Google OAuth
    googleId: {
      type: String,
      default: null,
      index: true,
      sparse: true,
    },

    avatar: {
      type: String,
      default: null,
    },
  },
  {
    timestamps: true, // Automatically adds createdAt and updatedAt
    toJSON: {
      virtuals: true,
      transform: function (doc, ret) {
        delete (ret as any).password;
        delete (ret as any).resetPasswordToken;
        delete (ret as any).resetPasswordExpires;
        delete (ret as any).failedLoginAttempts;
        delete (ret as any).lockedUntil;
        delete (ret as any).__v;
        return ret;
      },
    },
  },
);

// Index for better query performance
// Email index is already created by unique: true in schema
UserSchema.index({ createdAt: -1 });
UserSchema.index({ resetPasswordToken: 1 });

// Pre-save middleware to hash password
UserSchema.pre("save", async function (next) {
  // Skip if password not modified or not set (Google OAuth users)
  if (!this.isModified("password") || !this.password) {
    return next();
  }

  try {
    // Hash password with salt rounds of 12
    const salt = await bcrypt.genSalt(12);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error as Error);
  }
});

// Instance method to compare passwords
UserSchema.methods.comparePassword = async function (
  candidatePassword: string,
): Promise<boolean> {
  if (!this.password) return false; // Google-only accounts have no password
  try {
    return await bcrypt.compare(candidatePassword, this.password);
  } catch (error) {
    throw new Error("Password comparison failed");
  }
};

// Static methods
UserSchema.statics.findByEmail = function (email: string) {
  return this.findOne({ email: email.toLowerCase(), isActive: true });
};

// Create and export the User model
export const UserModel = model<IUser>("User", UserSchema);

// Export types for use in other files
export type CreateUserInput = {
  email: string;
  password: string;
  name: string;
  phone?: string;
};

export type LoginInput = {
  email: string;
  password: string;
};

export type UserResponse = {
  _id: string;
  email: string;
  name: string;
  phone?: string;
  role: string;
  createdAt: Date;
  updatedAt: Date;
  lastLogin?: Date;
};

export type UpdateProfileInput = {
  name?: string;
  phone?: string;
};
