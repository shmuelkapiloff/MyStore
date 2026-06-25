import {
  UserModel,
  CreateUserInput,
  LoginInput,
  UpdateProfileInput,
} from "../models/user.model";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import nodemailer from "nodemailer";
import { logger } from "../utils/logger";
import {
  JWT_EXPIRATION,
  JWT_REFRESH_EXPIRATION,
  PASSWORD_RESET_EXPIRATION,
} from "../config/constants";
import { env } from "../config/env";
import { ApiError, UnauthorizedError } from "../utils/asyncHandler";

// Use centralized env config — single source of truth for secrets
const JWT_SECRET = env.JWT_SECRET;
const JWT_REFRESH_SECRET =
  process.env.JWT_REFRESH_SECRET || env.JWT_SECRET + "-refresh";
const JWT_EXPIRE = process.env.JWT_EXPIRE || JWT_EXPIRATION;
const JWT_REFRESH_EXPIRE =
  process.env.JWT_REFRESH_EXPIRE || JWT_REFRESH_EXPIRATION;

// ── Google OAuth helpers (used by googleAuth.service.ts) ──────────────────
export async function getUserByEmail(email: string) {
  return UserModel.findOne({ email: email.toLowerCase() });
}

export async function createUser(
  data: Partial<
    CreateUserInput & { googleId?: string; avatar?: string; name?: string }
  >,
) {
  const user = await UserModel.create({
    ...data,
    email: data.email?.toLowerCase(),
    isActive: true,
  });
  return user;
}

export async function updateUserGoogleId(userId: string, googleId: string) {
  return UserModel.findByIdAndUpdate(userId, { googleId }, { new: true });
}

export class AuthService {
  // ── Google OAuth: public wrappers for private token/sanitize methods ────
  static createToken(userId: string, tokenVersion: number = 0): string {
    return this.generateToken(userId, tokenVersion);
  }

  static createRefreshToken(userId: string, tokenVersion: number = 0): string {
    return this.generateRefreshToken(userId, tokenVersion);
  }

  static sanitizeUserPublic(user: any) {
    return this.sanitizeUser(user);
  }

  /**
   * ==========================================
   * 🔓 PUBLIC METHODS (No auth required)
   * ==========================================
   */

  /**
   * Register a new user
   */
  static async register(userData: CreateUserInput) {
    // Check if user already exists
    const existingUser = await UserModel.findOne({
      email: userData.email.toLowerCase(),
    });

    if (existingUser) {
      throw new ApiError(
        409,
        "User with this email already exists",
        undefined,
        "CONFLICT",
      );
    }

    // Create new user
    const user = await UserModel.create({
      ...userData,
      email: userData.email.toLowerCase(),
    });

    // Generate access token (7d) + refresh token (7d)
    const token = this.generateToken(user._id, user.tokenVersion);
    const refreshToken = this.generateRefreshToken(user._id, user.tokenVersion);

    // Update last login
    user.lastLogin = new Date();
    await user.save();

    return {
      user: this.sanitizeUser(user),
      token,
      refreshToken,
    };
  }

  /**
   * Login user
   */
  static async login(credentials: LoginInput) {
    // Find user with password field (and failure tracking fields)
    const user = await UserModel.findOne({
      email: credentials.email.toLowerCase(),
      isActive: true,
    }).select("+password +failedLoginAttempts +lockedUntil");

    if (!user) {
      throw new UnauthorizedError("Invalid email or password");
    }

    // 🔒 Check if account is locked
    if (user.lockedUntil && new Date() < user.lockedUntil) {
      const remainingMinutes = Math.ceil(
        (user.lockedUntil.getTime() - Date.now()) / 60000,
      );
      logger.warn(
        {
          email: user.email,
          lockedUntil: user.lockedUntil,
          remainingMinutes,
        },
        "🔒 Account locked - login attempt blocked",
      );
      throw new ApiError(
        423,
        `Account is locked due to too many failed login attempts. Please try again in ${remainingMinutes} minutes.`,
        undefined,
        "ACCOUNT_LOCKED",
      );
    }

    // Verify password
    const isPasswordValid = await user.comparePassword(credentials.password);
    if (!isPasswordValid) {
      // ❌ Increment failed login attempts
      user.failedLoginAttempts = (user.failedLoginAttempts || 0) + 1;

      // 🔓 Check if we should lock the account (5 failed attempts)
      if (user.failedLoginAttempts >= 5) {
        // Lock account for 15 minutes
        user.lockedUntil = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes
        await user.save();

        logger.error(
          {
            email: user.email,
            failedLoginAttempts: user.failedLoginAttempts,
            lockedUntil: user.lockedUntil,
          },
          "🔒 Account locked - too many failed login attempts",
        );

        throw new ApiError(
          423,
          "Account has been locked due to too many failed login attempts. Please try again in 15 minutes.",
          undefined,
          "ACCOUNT_LOCKED",
        );
      }

      await user.save();

      const remainingAttempts = 5 - user.failedLoginAttempts;
      logger.warn(
        {
          email: user.email,
          failedLoginAttempts: user.failedLoginAttempts,
          remainingAttempts,
        },
        "⚠️ Failed login attempt",
      );

      throw new UnauthorizedError(
        `Invalid email or password. ${remainingAttempts} attempts remaining before account lockout.`,
      );
    }

    // ✅ Login successful - reset failed attempts
    user.failedLoginAttempts = 0;
    user.lockedUntil = null;

    // Generate access token (7d) + refresh token (7d)
    const token = this.generateToken(user._id, user.tokenVersion);
    const refreshToken = this.generateRefreshToken(user._id, user.tokenVersion);

    // Update last login
    user.lastLogin = new Date();
    await user.save();

    logger.info(
      {
        email: user.email,
        userId: user._id,
      },
      "✅ User login successful",
    );

    return {
      user: this.sanitizeUser(user),
      token,
      refreshToken, // ⚠️ Long-lived refresh token (7 days)
    };
  }

  /**
   * Send password reset email
   */
  static async forgotPassword(email: string) {
    const user = await UserModel.findOne({
      email: email.toLowerCase(),
      isActive: true,
    });

    if (!user) {
      // Don't reveal if user exists for security
      return {
        message: "If this email exists, a password reset link has been sent",
      };
    }

    const includeTokenInResponse = process.env.NODE_ENV !== "production";

    // Generate reset token
    const resetToken = crypto.randomBytes(32).toString("hex");
    const resetTokenHash = crypto
      .createHash("sha256")
      .update(resetToken)
      .digest("hex");

    // Save hashed token and expiry (from constants)
    user.resetPasswordToken = resetTokenHash;
    user.resetPasswordExpires = new Date(
      Date.now() + PASSWORD_RESET_EXPIRATION,
    );
    await user.save();

    // Send email
    const resetUrl = `${
      process.env.CLIENT_URL || "http://localhost:3000"
    }/reset-password/${resetToken}`;

    try {
      await this.sendResetEmail(user.email, resetUrl, user.name);
    } catch (error) {
      // Remove reset token if email fails
      user.resetPasswordToken = undefined;
      user.resetPasswordExpires = undefined;
      await user.save();
      // Do NOT fail the request: return generic success to avoid 500s and user enumeration
      // This is especially helpful in local/dev when SMTP creds are not valid
      logger.warn(
        { error },
        "Failed to send reset email, returning generic success",
      );
      return {
        message: "If this email exists, a password reset link has been sent",
        ...(includeTokenInResponse ? { resetToken } : {}),
      };
    }

    return {
      message: "Password reset link has been sent to your email",
      ...(includeTokenInResponse ? { resetToken } : {}),
    };
  }

  /**
   * Reset password with token
   */
  static async resetPassword(resetToken: string, newPassword: string) {
    // Hash the token from URL
    const resetTokenHash = crypto
      .createHash("sha256")
      .update(resetToken)
      .digest("hex");

    // Find user with valid token
    const user = await UserModel.findOne({
      resetPasswordToken: resetTokenHash,
      resetPasswordExpires: { $gt: new Date() },
      isActive: true,
    }).select("+resetPasswordToken +resetPasswordExpires");

    if (!user) {
      throw new Error("Invalid or expired reset token");
    }

    // Validate new password
    if (newPassword.length < 6) {
      throw new Error("Password must be at least 6 characters long");
    }

    // Update password (will be hashed by pre-save middleware)
    user.password = newPassword;
    user.resetPasswordToken = undefined;
    user.resetPasswordExpires = undefined;
    user.lastUpdated = new Date();
    await user.save();

    return {
      message: "Password has been reset successfully",
    };
  }

  /**
   * Update user profile
   */
  static async updateProfile(userId: string, data: UpdateProfileInput) {
    const user = await UserModel.findById(userId);

    if (!user) {
      throw new Error("User not found");
    }

    // Update fields
    if (data.name !== undefined) user.name = data.name;
    user.lastUpdated = new Date();

    await user.save();

    return this.sanitizeUser(user);
  }

  /**
   * Change password (authenticated user)
   */
  static async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
  ) {
    // Get user with password field
    const user = await UserModel.findById(userId).select("+password");

    if (!user) {
      throw new Error("User not found");
    }

    // Verify current password
    const isPasswordValid = await user.comparePassword(currentPassword);
    if (!isPasswordValid) {
      throw new Error("Current password is incorrect");
    }

    // Update password (will be hashed by pre-save middleware)
    user.password = newPassword;
    user.lastUpdated = new Date();
    // ✨ Increment tokenVersion: all existing sessions are revoked on password change
    user.tokenVersion = (user.tokenVersion || 0) + 1;
    await user.save();

    return {
      message: "Password changed successfully",
    };
  }

  /**
   * Logout user - increment tokenVersion to invalidate ALL existing tokens instantly
   * This works because every token contains the tokenVersion at time of creation.
   * When version increments, all old tokens fail the version check in verifyToken().
   */
  static async logout(userId: string) {
    const user = await UserModel.findById(userId);
    if (!user) {
      throw new Error("User not found");
    }

    // ✨ Increment version = all existing tokens (access + refresh) are instantly invalid
    user.tokenVersion = (user.tokenVersion || 0) + 1;
    await user.save();

    logger.info(
      { userId, tokenVersion: user.tokenVersion },
      "🚪 User logged out - all tokens revoked",
    );

    return { message: "Logged out successfully - all sessions revoked" };
  }

  /**
   * ==========================================
   * � PROTECTED METHODS (Auth required)
   * ==========================================
   */

  /**
   * Verify JWT token
   */
  static async verifyToken(token: string) {
    try {
      const decoded = jwt.verify(token, JWT_SECRET) as {
        userId: string;
        tokenVersion?: number;
      };
      const user = await UserModel.findById(decoded.userId);

      if (!user || !user.isActive) {
        throw new Error("Invalid token");
      }

      // ✨ Token Version check: if user logged out, version incremented and old tokens are invalid
      if (
        decoded.tokenVersion !== undefined &&
        decoded.tokenVersion !== user.tokenVersion
      ) {
        throw new Error("Token revoked");
      }

      return this.sanitizeUser(user);
    } catch (error) {
      throw new Error("Invalid token");
    }
  }

  /**
   * Get user profile
   */
  static async getProfile(userId: string) {
    const user = await UserModel.findById(userId);

    if (!user) {
      throw new Error("User not found");
    }

    return this.sanitizeUser(user);
  }

  /**
   * ==========================================
   * �🛠️ HELPER METHODS
   * ==========================================
   */

  /**
   * Send password reset email
   */
  private static async sendResetEmail(
    to: string,
    resetUrl: string,
    name: string,
  ) {
    /**
     * Dev-friendly fallback: if SMTP credentials are not configured, skip sending the email.
     * - Useful locally to avoid 500 errors when EMAIL_USER/PASSWORD are not set
     * - In production, prefer providing proper SMTP env vars and failing fast on startup if missing
     */
    // If SMTP credentials are not configured, skip sending and log for local/dev
    if (!process.env.EMAIL_USER || !process.env.EMAIL_PASSWORD) {
      logger.info("⚠️ EMAIL_USER/EMAIL_PASSWORD not set - skipping email send");
      logger.info(`Reset URL for ${to}: ${resetUrl}`);
      return;
    }

    // Configure email transporter
    const transporter = nodemailer.createTransport({
      host: process.env.EMAIL_HOST || "smtp.gmail.com",
      port: parseInt(process.env.EMAIL_PORT || "587"),
      secure: false, // true for 465, false for other ports
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASSWORD,
      },
    });

    // Email HTML template
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .button { 
            display: inline-block; 
            padding: 12px 24px; 
            background: #007bff; 
            color: white; 
            text-decoration: none; 
            border-radius: 5px; 
            margin: 20px 0;
          }
          .footer { margin-top: 30px; font-size: 12px; color: #666; }
        </style>
      </head>
      <body>
        <div class="container">
          <h2>🔐 Password Reset Request</h2>
          <p>Hi ${name},</p>
          <p>You requested to reset your password. Click the button below to reset it:</p>
          <a href="${resetUrl}" class="button">Reset Password</a>
          <p>Or copy this link: <br><code>${resetUrl}</code></p>
          <p><strong>This link will expire in 1 hour.</strong></p>
          <p>If you didn't request this, please ignore this email.</p>
          <div class="footer">
            <p>Simple Shop Team</p>
          </div>
        </div>
      </body>
      </html>
    `;

    // Send email
    await transporter.sendMail({
      from: `"Simple Shop" <${process.env.EMAIL_USER}>`,
      to,
      subject: "Password Reset Request - Simple Shop",
      html,
    });
  }

  /**
   * Generate JWT access token
   * @param userId MongoDB user ID
   * @param tokenVersion Current token version for instant revocation
   * @returns JWT token (valid for JWT_EXPIRATION, default 7d)
   */
  private static generateToken(
    userId: string,
    tokenVersion: number = 0,
  ): string {
    return jwt.sign({ userId, tokenVersion }, JWT_SECRET, {
      expiresIn: JWT_EXPIRE,
    } as jwt.SignOptions);
  }

  /**
   * Generate JWT refresh token (long-lived)
   * @param userId MongoDB user ID
   * @param tokenVersion Current token version for instant revocation
   * @returns Refresh token (valid for 7 days)
   */
  private static generateRefreshToken(
    userId: string,
    tokenVersion: number = 0,
  ): string {
    return jwt.sign({ userId, tokenVersion }, JWT_REFRESH_SECRET, {
      expiresIn: JWT_REFRESH_EXPIRE,
    } as jwt.SignOptions);
  }

  /**
   * Verify and exchange refresh token for new access token
   * @param refreshToken The refresh token from client
   * @returns New access token (7d validity)
   */
  static async refreshAccessToken(refreshToken: string): Promise<string> {
    try {
      const decoded = jwt.verify(refreshToken, JWT_REFRESH_SECRET) as {
        userId: string;
        tokenVersion?: number;
      };

      // Verify user still exists and is active
      const user = await UserModel.findById(decoded.userId);
      if (!user || !user.isActive) {
        throw new UnauthorizedError("User not found or inactive");
      }

      // ✨ Token Version check: reject refresh if user logged out
      if (
        decoded.tokenVersion !== undefined &&
        decoded.tokenVersion !== user.tokenVersion
      ) {
        throw new UnauthorizedError("Refresh token revoked");
      }
      // Generate new access token with current version
      return this.generateToken(user._id, user.tokenVersion);
    } catch (error: any) {
      throw new UnauthorizedError("Invalid or expired refresh token");
    }
  }

  /**
   * Remove sensitive data from user object
   */
  private static sanitizeUser(user: any) {
    const userObject = user.toJSON();
    delete userObject.password;
    delete userObject.resetPasswordToken;
    delete userObject.resetPasswordExpires;
    return userObject;
  }
}
