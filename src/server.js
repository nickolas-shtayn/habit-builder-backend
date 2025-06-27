import cors from "cors";
import { eq, inArray } from "drizzle-orm";
import express from "express";
import authRouter from "./authRouter.js";
import { db } from "./db/index.js";
import { habits, users, habitCompletions } from "./db/schema.js";
import extractUserFromToken from "./middleware/extractUserFromToken.js";

const server = express();
const PORT = 3000;

server.use(cors());
server.use(express.json());
server.use("/auth", authRouter);

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

server.post("/habits/create", extractUserFromToken, async (req, res) => {
  const userId = req.user.sub;
  const { name, iconUrl, failReflectionLimit, cue, craving, response, reward } =
    req.body;

  try {
    const existingHabits = await db
      .select()
      .from(habits)
      .where(eq(habits.userId, userId));
    const nextSortOrder = existingHabits.length + 1; // make sure the order starts at 1

    if (nextSortOrder > 6) {
      return res
        .status(400)
        .json({ error: "You've reached the maximum number of habits (6)" });
    }

    await db.insert(habits).values({
      habit_name: name,
      icon_url: iconUrl,
      failReflectionLimit,
      cue,
      craving,
      response,
      reward,
      build: true,
      sort_order: nextSortOrder,
      userId,
    });
    return res.status(200).json({ message: `${name} has been created` });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Failed to create habit" });
  }
});

server.post("/habits/:id/complete", async (req, res) => {
  const habitId = req.params.id;
  const date = new Date();

  try {
    await db.insert(habitCompletions).values({
      habitId,
      date,
    });

    return res.status(200).json({
      message: "Habit completed successfully",
      habitId,
      date,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Failed to complete habit" });
  }
});

server.delete("/habits/:id/complete", async (req, res) => {
  const habitId = req.params.id;

  try {
    const [completion] = await db
      .select()
      .from(habitCompletions)
      .where(eq(habitCompletions.habitId, habitId));

    if (!completion) {
      return res
        .status(404)
        .json({ error: "No completion found for this habit" });
    }

    const today = new Date();
    const completionDate = new Date(completion.date);

    // Convert both dates to local timezone strings for comparison
    const todayStr = today.toLocaleDateString("en-US", {
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    });
    const completionStr = completionDate.toLocaleDateString("en-US", {
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    });

    if (todayStr !== completionStr) {
      return res
        .status(400)
        .json({ error: "Habit has not been completed today" });
    }

    await db
      .delete(habitCompletions)
      .where(eq(habitCompletions.habitId, habitId));
    return res
      .status(200)
      .json({ message: "Habit completion deleted successfully" });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Failed to delete habit completion" });
  }
});

server.get("/dashboard", extractUserFromToken, async (req, res) => {
  const userId = req.user.sub;
  try {
    // get all user habits
    const userHabits = await db
      .select()
      .from(habits)
      .where(eq(habits.userId, userId))
      .orderBy(habits.sort_order);

    // get today's date in user's timezone
    const today = new Date();
    const todayStr = today.toLocaleDateString("en-US", {
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    });
    // get all habit IDs that the user has
    const habitIds = userHabits.map((habit) => habit.id);

    // get all completions for those habits
    const allCompletions = await db
      .select()
      .from(habitCompletions)
      .where(inArray(habitCompletions.habitId, habitIds));

    const completedHabitIds = new Set(); // create a set to avoid duplicates

    // Filter completions for today
    allCompletions.forEach((completion) => {
      const completionDateStr = new Date(completion.date).toLocaleDateString(
        "en-US",
        { timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone }
      );
      if (completionDateStr === todayStr) {
        completedHabitIds.add(completion.habitId);
      }
    });

    // Add completion status to each habit
    const habitsWithCompletionStatus = userHabits.map((habit) => ({
      ...habit,
      completedToday: completedHabitIds.has(habit.id),
    }));

    return res.status(200).json(habitsWithCompletionStatus);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Failed to fetch habits" });
  }
});

server.listen(PORT, () => {
  console.log("listening on", PORT);
});
