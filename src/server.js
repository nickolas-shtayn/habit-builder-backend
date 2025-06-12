import express from "express";
import cors from "cors";
import { db } from "./db/index.js";
import bcrypt from "bcrypt";
import { users } from "./db/schema.js";

const server = express();
const PORT = 3000;

server.use(express.json());

server.post("/users", async (req, res) => {
  try {
    const { email, password } = req.body;
    const hashedPassword = await bcrypt.hash(password, 13);

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
    if (error.cause.code === "23505") {
      res.status(409).json({ error: "Email already exists" });
    } else {
      res.status(500).json({ error: "Internal server error" });
    }
  }
});

server.listen(PORT, () => {
  console.log("listening on", PORT);
});
