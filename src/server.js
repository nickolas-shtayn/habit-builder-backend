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

server.use(express.json());

// Create account and send id, email, and onboarding in response
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

    // adds user to db then returns the db data to use for response
    const [newUser] = await db
      .insert(users)
      .values({ email, password: hashedPassword })
      .returning({
        id: users.id,
        email: users.email,
        completed_onboarding: users.completed_onboarding,
      });
    res.status(201).json(newUser);
  } catch (error) {
    // postgres duplicate email error
    if (error.cause.code === "23505") {
      res.status(409).json({ error: "Email already exists" });
    } else {
      res.status(500).json({ error: "Internal server error" });
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

    if (user.length > 0) {
      const hashedPass = user[0].password;
      const isMatch = await bcrypt.compare(password, hashedPass);

      if (isMatch) {
        const payload = {
          sub: user[0].id,
          email: user[0].email,
        };
        const expiresIn = rememberMe ? "30d" : "1h";
        const token = jwt.sign(payload, process.env.ACCESS_TOKEN_SECRET, {
          expiresIn,
        });
        res.status(200).json({
          token,
          expiresIn,
          user: {
            id: user[0].id,
            email: user[0].email,
            completed_onboarding: user[0].completed_onboarding,
          },
        });
      } else {
        res.status(401).json({ error: "Invalid credentials" });
      }
    } else {
      res.status(401).json({ error: "Invalid credentials" });
    }
  } catch (error) {
    res.status(500).json({ error: "Internal server error" });
  }
});

server.listen(PORT, () => {
  console.log("listening on", PORT);
});
