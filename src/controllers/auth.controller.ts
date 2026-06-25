import { Request, Response } from "express";
import { AuthService } from "../services/auth.service";
import { findOrCreateGoogleUser } from "../services/googleAuth.service";
import {
  registerSchema,
  loginSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  updateProfileSchema,
  changePasswordSchema,
} from "../validators/auth.validator";
import {
  asyncHandler,
  ValidationError,
  UnauthorizedError,
} from "../utils/asyncHandler";

// קונטרולר שמטפל בכל הפעולות הקשורות להזדהות ולחשבון המשתמש
export class AuthController {
  /** POST /api/auth/google */
  // התחברות או הרשמה אוטומטית באמצעות חשבון Google
  static googleLogin = asyncHandler(async (req: Request, res: Response) => {
    const { idToken } = req.body;
    if (!idToken) {
      return res
        .status(400)
        .json({ success: false, message: "Google idToken is required" });
    }
    // אימות וקישור/יצירת משתמש
    const user = await findOrCreateGoogleUser(idToken);
    // בדיקת משתמש חסום/לא פעיל
    if (!user || user.isActive === false) {
      return res
        .status(403)
        .json({ success: false, message: "User is blocked or inactive" });
    }
    // יצירת JWT פנימי
    const token = AuthService.createToken(user._id, user.tokenVersion);
    const refreshToken = AuthService.createRefreshToken(
      user._id,
      user.tokenVersion,
    );
    res.status(200).json({
      success: true,
      data: {
        user: AuthService.sanitizeUserPublic(user),
        token,
        refreshToken,
      },
      message: "Google login successful",
    });
  });
  /** POST /api/auth/register */
  // רישום משתמש חדש למערכת
  static register = asyncHandler(async (req: Request, res: Response) => {
    const validated = registerSchema.parse(req.body);
    const result = await AuthService.register(validated);
    res.status(201).json({
      success: true,
      data: result,
      message: "User registered successfully",
    });
  });

  /** POST /api/auth/login */
  // התחברות משתמש קיים וקבלת טוקנים (token + refreshToken)
  static login = asyncHandler(async (req: Request, res: Response) => {
    const validated = loginSchema.parse(req.body);
    const result = await AuthService.login(validated);
    res.status(200).json({
      success: true,
      data: result,
      message: "Login successful",
    });
  });

  /** POST /api/auth/forgot-password */
  // טיפול בבקשת "שכחתי סיסמה" - שולח למשתמש קישור או הוראות לאיפוס
  static forgotPassword = asyncHandler(async (req: Request, res: Response) => {
    const validated = forgotPasswordSchema.parse(req.body);
    const result = await AuthService.forgotPassword(validated.email);
    res.status(200).json({ success: true, message: result.message });
  });

  /** GET /api/auth/verify */
  // בודק שהטוקן שנשלח בכותרת הבקשה תקף, ומחזיר את פרטי המשתמש המשויך לו
  static verify = asyncHandler(async (req: Request, res: Response) => {
    const token = req.headers.authorization?.replace("Bearer ", "");
    if (!token) throw new UnauthorizedError("No token provided");
    const user = await AuthService.verifyToken(token);
    res.status(200).json({ success: true, data: { user } });
  });

  /** GET /api/auth/profile */
  // מחזיר את פרטי הפרופיל של המשתמש המחובר כרגע
  static getProfile = asyncHandler(async (req: Request, res: Response) => {
    const userId = req.userId;
    if (!userId) throw new UnauthorizedError();
    const user = await AuthService.getProfile(userId);
    res.status(200).json({ success: true, data: { user } });
  });

  /** PUT /api/auth/profile */
  // מעדכן את פרטי הפרופיל של המשתמש המחובר
  static updateProfile = asyncHandler(async (req: Request, res: Response) => {
    const userId = req.userId;
    const validated = updateProfileSchema.parse(req.body);
    if (!userId) throw new UnauthorizedError();
    const user = await AuthService.updateProfile(userId, validated);
    res.status(200).json({
      success: true,
      data: { user },
      message: "Profile updated successfully",
    });
  });

  /** POST /api/auth/reset-password/:token */
  // מאפס את הסיסמה של המשתמש בעזרת טוקן חד-פעמי שהתקבל (למשל במייל)
  static resetPassword = asyncHandler(async (req: Request, res: Response) => {
    const { token } = req.params;
    const validated = resetPasswordSchema.parse(req.body);
    if (!token) throw new ValidationError("Reset token is required");
    const result = await AuthService.resetPassword(token, validated.password);
    res.status(200).json({ success: true, message: result.message });
  });

  /** POST /api/auth/refresh */
  // מנפיק טוקן גישה (access token) חדש בעזרת refresh token, בלי לדרוש התחברות מחדש
  static refreshToken = asyncHandler(async (req: Request, res: Response) => {
    const { refreshToken } = req.body;
    if (!refreshToken) {
      return res.status(400).json({
        success: false,
        message: "Refresh token is required",
      });
    }
    const newAccessToken = await AuthService.refreshAccessToken(refreshToken);
    res.status(200).json({
      success: true,
      message: "Access token refreshed successfully",
      data: { token: newAccessToken, refreshToken },
    });
  });

  /** POST /api/auth/logout */
  // מתנתק מהמערכת ומבטל את הטוקן הנוכחי של המשתמש
  static logout = asyncHandler(async (req: Request, res: Response) => {
    const userId = req.userId;
    if (!userId) throw new UnauthorizedError();
    const result = await AuthService.logout(userId);
    res.status(200).json({ success: true, message: result.message });
  });

  /** POST /api/auth/change-password */
  // משנה את סיסמת המשתמש המחובר, לאחר אימות הסיסמה הנוכחית
  static changePassword = asyncHandler(async (req: Request, res: Response) => {
    const userId = req.userId;
    const validated = changePasswordSchema.parse(req.body);
    if (!userId) throw new UnauthorizedError();
    const result = await AuthService.changePassword(
      userId,
      validated.currentPassword,
      validated.newPassword,
    );
    res.status(200).json({ success: true, message: result.message });
  });
}
