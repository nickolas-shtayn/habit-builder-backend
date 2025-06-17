import express from "express";
import cors from "cors";
import { db } from "./db/index.js";
import bcrypt from "bcrypt";
import { users } from "./db/schema.js";
import { eq } from "drizzle-orm";
import jwt from "jsonwebtoken";
import { isValidEmail, isValidPassword } from "./helpers/validation.js";

const server = express();
const PORT = 3000;

server.use(cors());
server.use(express.json());

const extractUserFromToken = (req, res, next) => {
  const authHeader = req.headers.authorization;
  const token =
    authHeader && authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;

  if (!token) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  try {
    const decodedToken = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET);
    req.user = decodedToken;
    next();
  } catch (error) {
    if (error.name === "TokenExpiredError") {
      return res.status(401).json({ error: "Expired" });
    } else {
      return res.status(401).json({ error: "Invalid token" });
    }
  }
};

server.get("/auth/me", extractUserFromToken, async (req, res) => {
  const { sub, email } = req.user;
  res.status(200).json({ sub, email });
});

server.post("/users", async (req, res) => {
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

server.post("/auth/login", async (req, res) => {
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

server.patch("/users/onboarding", extractUserFromToken, async (req, res) => {
  try {
    const userId = req.user.sub;

    await db
      .update(users)
      .set({ completed_onboarding: true })
      .where(eq(users.id, userId));

    return res.status(200).json({
      message: "Onboarding completed successfully",
      completed_onboarding: true,
    });
  } catch (error) {
    return res.status(500).json({ error: "Internal server error" });
  }
});

server.listen(PORT, () => {
  console.log("listening on", PORT);
});
