import express from "express";
import { db } from "./db/index.js";
import bcrypt from "bcrypt";
import crypto from "crypto";
import { users, passwordResets, habits } from "./db/schema.js";
import { eq, and } from "drizzle-orm";
import jwt from "jsonwebtoken";
import { isValidEmail, isValidPassword } from "./utils/validation.js";
import { sendResetEmail } from "./utils/emailService.js";
import rateLimit from "express-rate-limit";
import extractUserFromToken from "./middleware/extractUserFromToken.js";

const authRouter = express.Router();

const ipLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5,
  message: { error: "Too many requests from this IP" },
});

const emailLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 3,
  keyGenerator: (req) => req.body.email,
  message: { error: "Too many reset requests from this email" },
});

authRouter.get("/me", extractUserFromToken, async (req, res) => {
  const { sub, email } = req.user;
  res.status(200).json({ sub, email });
});

authRouter.post("/register", async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: "Email and password are required" });
    }

    if (!isValidEmail(email) || !isValidPassword(password)) {
      return res
        .status(400)
        .json({ error: "Invalid email format or password too short" });
    }

    const hashedPassword = await bcrypt.hash(password, 12);

    const [newUser] = await db
      .insert(users)
      .values({ email, password: hashedPassword })
      .returning({
        id: users.id,
        email: users.email,
        completed_onboarding: users.completed_onboarding,
      });

    const payload = {
      sub: newUser.id,
      email: newUser.email,
    };

    const token = jwt.sign(payload, process.env.ACCESS_TOKEN_SECRET, {
      expiresIn: "1h",
    });

    return res.status(201).json({
      user: newUser,
      token,
      expiresIn: "1h",
    });
  } catch (error) {
    // postgres duplicate email error
    if (error.cause.code === "23505") {
      return res.status(409).json({ error: "Email already exists" });
    } else {
      return res.status(500).json({ error: "Internal server error" });
    }
  }
});

authRouter.post("/login", async (req, res) => {
  try {
    const { email, password, rememberMe } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: "Email and password are required" });
    }

    if (!isValidEmail(email) || !isValidPassword(password)) {
      return res
        .status(400)
        .json({ error: "Invalid email format or password too short" });
    }

    const user = await db.select().from(users).where(eq(users.email, email));

    if (user.length === 0) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const hashedPass = user[0].password;
    const isMatch = await bcrypt.compare(password, hashedPass);

    if (!isMatch) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const payload = {
      sub: user[0].id,
      email: user[0].email,
    };
    const expiresIn = rememberMe ? "30d" : "1h";
    const token = jwt.sign(payload, process.env.ACCESS_TOKEN_SECRET, {
      expiresIn,
    });

    return res.status(200).json({
      token,
      expiresIn,
      user: {
        id: user[0].id,
        email: user[0].email,
        completed_onboarding: user[0].completed_onboarding,
      },
    });
  } catch (error) {
    return res.status(500).json({ error: "Internal server error" });
  }
});

authRouter.post(
  "/reset-password",
  ipLimiter,
  emailLimiter,
  async (req, res) => {
    const { email } = req.body;

    const user = await db.select().from(users).where(eq(users.email, email));

    if (user.length === 0) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const resetCode = crypto.randomInt(1000, 10000);
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // expires in 10 min from now

    try {
      // delete previous code the user had
      await db
        .delete(passwordResets)
        .where(eq(passwordResets.userId, user[0].id));

      await db.insert(passwordResets).values({
        userId: user[0].id,
        resetCode,
        expiresAt,
        used: false,
      });

      await sendResetEmail(email, resetCode);

      return res.status(200).json({
        email,
        expiresAt,
        message: `reset code has been sent`,
      });
    } catch (error) {
      console.error("Email sending failed:", error);
      return res.status(500).json({ error: "Failed to send reset code" });
    }
  }
);

authRouter.post("/reset-password/verify", async (req, res) => {
  const { email, resetCode } = req.body;

  try {
    const user = await db.select().from(users).where(eq(users.email, email));

    if (user.length === 0) {
      return res.status(400).json({ error: "Invalid email" });
    }

    const resetRequest = await db
      .select()
      .from(passwordResets)
      .where(
        and(
          eq(passwordResets.userId, user[0].id),
          eq(passwordResets.resetCode, resetCode)
        )
      );

    if (resetRequest.length === 0) {
      return res.status(400).json({ error: "Invalid reset code" });
    }

    if (new Date() > new Date(resetRequest[0].expiresAt)) {
      return res.status(400).json({ error: "Reset code has expired" });
    }

    if (resetRequest[0].used) {
      return res.status(400).json({ error: "Reset code has been used" });
    }

    return res
      .status(200)
      .json({ resetCode, message: "verification code matched!" });
  } catch (error) {
    console.error("Database error:", error);
    return res.status(500).json({ error: "Failed to verify reset code" });
  }
});

authRouter.post("/reset-password/complete", async (req, res) => {
  const { email, password, resetCode } = req.body;

  try {
    const user = await db.select().from(users).where(eq(users.email, email));

    if (user.length === 0) {
      return res.status(400).json({ error: "Invalid email" });
    }

    const resetRequest = await db
      .select()
      .from(passwordResets)
      .where(
        and(
          eq(passwordResets.userId, user[0].id),
          eq(passwordResets.resetCode, resetCode)
        )
      );

    if (resetRequest.length === 0) {
      return res.status(400).json({ error: "Invalid reset code" });
    }

    if (new Date() > new Date(resetRequest[0].expiresAt)) {
      return res.status(400).json({ error: "Reset code has expired" });
    }

    if (resetRequest[0].used) {
      return res.status(400).json({ error: "Reset code has been used" });
    }

    if (!isValidPassword(password)) {
      return res.status(400).json({ error: "Invalid password format" });
    }

    await db
      .update(users)
      .set({ password: await bcrypt.hash(password, 12) })
      .where(eq(users.email, email));

    await db
      .update(passwordResets)
      .set({ used: true })
      .where(eq(passwordResets.id, resetRequest[0].id));

    return res
      .status(200)
      .json({ message: "Password updated successfully", email });
  } catch (error) {
    return res.status(500).json({ error: "Failed to update password" });
  }
});

export default authRouter;
