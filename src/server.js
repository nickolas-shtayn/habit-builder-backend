import cors from "cors";
import { eq, inArray, and, gte, lte } from "drizzle-orm";
import express from "express";
import authRouter from "./authRouter.js";
import { db } from "./db/index.js";
import {
  habits,
  users,
  habitCompletions,
  reflections,
  tactics,
  reflectionTactics,
} from "./db/schema.js";
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
  const {
    name,
    iconUrl,
    failReflectionLimit,
    cue,
    craving,
    response,
    reward,
    build,
  } = req.body;

  try {
    const existingHabits = await db
      .select()
      .from(habits)
      .where(eq(habits.userId, userId));
    const nextSortOrder = existingHabits.length + 1; // make sure the order starts at 1 instead of 0

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
      build,
      sort_order: nextSortOrder,
      userId,
      date_created: new Date(),
    });
    return res.status(200).json({ message: `${name} has been created` });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Failed to create habit" });
  }
});

server.post("/habits/:id/complete", extractUserFromToken, async (req, res) => {
  const habitId = req.params.id;
  const { completionDate } = req.body;
  const userId = req.user.sub;

  if (!completionDate) {
    return res.status(404).json({ error: "No date provided" });
  }

  try {
    const userHabits = await db
      .select()
      .from(habits)
      .where(and(eq(habits.id, habitId), eq(habits.userId, userId)));

    if (userHabits.length === 0) {
      return res.status(404).json({ error: "No habit found" });
    }

    await db.insert(habitCompletions).values({
      habitId,
      date: new Date(completionDate),
    });

    return res.status(200).json({
      message: `Habit completed successfully for ${new Date(
        completionDate
      ).toLocaleDateString()}`,
      habitId,
      date: new Date(completionDate),
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Failed to complete habit" });
  }
});

server.delete(
  "/habits/:id/complete",
  extractUserFromToken,
  async (req, res) => {
    const habitId = req.params.id;
    const userId = req.user.sub;
    const { completionDate } = req.body;

    if (!completionDate) {
      return res.status(404).json({ error: "No date provided" });
    }

    const targetDate = new Date(completionDate);

    try {
      const userHabits = await db
        .select()
        .from(habits)
        .where(and(eq(habits.id, habitId), eq(habits.userId, userId)));

      if (userHabits.length === 0) {
        return res.status(401).json({ error: "No habit found" });
      }

      const startOfDay = new Date(targetDate);
      startOfDay.setHours(0, 0, 0, 0);

      const endOfDay = new Date(targetDate);
      endOfDay.setHours(23, 59, 59, 999);

      const completionOnTargetDate = await db
        .select()
        .from(habitCompletions)
        .where(
          and(
            eq(habitCompletions.habitId, habitId),
            gte(habitCompletions.date, startOfDay),
            lte(habitCompletions.date, endOfDay)
          )
        );

      if (completionOnTargetDate.length === 0) {
        return res
          .status(404)
          .json({ error: "No completion found for the requested date" });
      }

      // Delete the completion on the target date
      await db
        .delete(habitCompletions)
        .where(eq(habitCompletions.id, completionOnTargetDate[0].id));

      return res
        .status(200)
        .json({ message: "Habit completion deleted successfully" });
    } catch (error) {
      console.error(error);
      return res
        .status(500)
        .json({ error: "Failed to delete habit completion" });
    }
  }
);

server.get(
  "/habit/reflection/tactics",
  extractUserFromToken,
  async (req, res) => {
    const { habitId, bottleneck } = req.query;

    if (!["cue", "craving", "response", "reward"].includes(bottleneck)) {
      return res.status(400).json({ error: "Invalid bottleneck value" });
    }

    try {
      const habitBuildStatus = await db
        .select({ build: habits.build })
        .from(habits)
        .where(eq(habits.id, habitId));

      if (habitBuildStatus.length === 0) {
        return res.status(404).json({ error: "No habit found" });
      }

      const isBuild = habitBuildStatus[0].build;

      const matchingTactics = await db
        .select()
        .from(tactics)
        .where(
          and(eq(tactics.build, isBuild), eq(tactics.partOfHabit, bottleneck))
        );

      return res.status(200).json(matchingTactics);
    } catch (error) {
      console.log(error);
      return res.status(500).json({ error: "failed to fetch habits" });
    }
  }
);

server.get("/dashboard/:date", extractUserFromToken, async (req, res) => {
  const userId = req.user.sub;
  const requestedDate = req.params.date; // Get the date from URL parameter

  try {
    // Parse the ISO date string
    const targetDate = new Date(requestedDate);
    if (isNaN(targetDate.getTime())) {
      return res.status(400).json({ error: "Invalid date format" });
    }

    // Set the target date to the end of the day to include habits created on that day
    const endOfTargetDate = new Date(targetDate);
    endOfTargetDate.setHours(23, 59, 59, 999);

    // get all user habits that were created before or on the requested date
    const userHabits = await db
      .select()
      .from(habits)
      .where(
        and(
          eq(habits.userId, userId),
          lte(habits.date_created, endOfTargetDate)
        )
      )
      .orderBy(habits.sort_order);

    // Convert to local date string for comparison
    const targetDateStr = targetDate.toLocaleDateString("en-US", {
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    });

    // get all habit IDs that the user has
    const habitIds = userHabits.map((habit) => habit.id);

    // get all completions for those habits
    const allCompletions = await db
      .select()
      .from(habitCompletions)
      .where(inArray(habitCompletions.habitId, habitIds));

    // get all reflections for those habits
    const allReflections = await db
      .select()
      .from(reflections)
      .where(inArray(reflections.habitId, habitIds));

    const completedHabitIds = new Set(); // create a set to avoid duplicates

    // Filter completions for the requested date
    allCompletions.forEach((completion) => {
      const completionDateStr = new Date(completion.date).toLocaleDateString(
        "en-US",
        { timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone }
      );
      if (completionDateStr === targetDateStr) {
        completedHabitIds.add(completion.habitId);
      }
    });

    // Helper function to calculate days between dates
    const calculateDaysBetween = (date1, date2) => {
      const oneDay = 24 * 60 * 60 * 1000; // hours*minutes*seconds*milliseconds
      const diffTime = Math.abs(date2 - date1);
      return Math.round(diffTime / oneDay);
    };

    // Add completion status and requiredReflection to each habit
    const habitsWithCompletionStatus = userHabits.map((habit) => {
      const habitReflections = allReflections.filter(
        (reflection) => reflection.habitId === habit.id
      );

      const habitCompletions = allCompletions.filter(
        (completion) => completion.habitId === habit.id
      );

      let requiredReflection = false;

      // Check if there are any recent completions within the failReflectionLimit
      const hasRecentCompletions = habitCompletions.some((completion) => {
        const completionDate = new Date(completion.date);
        const daysSinceCompletion = calculateDaysBetween(
          completionDate,
          targetDate
        );
        return daysSinceCompletion <= habit.failReflectionLimit;
      });

      // If there are recent completions, no reflection is required
      if (hasRecentCompletions) {
        requiredReflection = false;
      } else if (habitReflections.length === 0) {
        // No reflections exist and no recent completions - check if days since creation exceeds failReflectionLimit
        const habitCreatedDate = new Date(habit.date_created);
        const daysSinceCreation = calculateDaysBetween(
          habitCreatedDate,
          targetDate
        );
        requiredReflection = daysSinceCreation > habit.failReflectionLimit;
      } else {
        // Reflections exist and no recent completions - check if days since last reflection exceeds failReflectionLimit
        const lastReflection = habitReflections.reduce((latest, current) =>
          new Date(current.date) > new Date(latest.date) ? current : latest
        );

        const lastReflectionDate = new Date(lastReflection.date);
        const daysSinceLastReflection = calculateDaysBetween(
          lastReflectionDate,
          targetDate
        );
        requiredReflection =
          daysSinceLastReflection > habit.failReflectionLimit;
      }

      return {
        ...habit,
        completedToday: completedHabitIds.has(habit.id),
        requiredReflection,
      };
    });

    return res.status(200).json(habitsWithCompletionStatus);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Failed to fetch habits" });
  }
});

server.post(
  "/habit/reflection/create",
  extractUserFromToken,
  async (req, res) => {
    const userId = req.user.sub;
    const {
      habitId,
      experience,
      reflection,
      bottleneck,
      experiment,
      tacticIds,
    } = req.body;

    try {
      const userHabit = await db
        .select()
        .from(habits)
        .where(and(eq(habits.id, habitId), eq(habits.userId, userId)));

      if (userHabit.length === 0) {
        return res.status(404).json({ error: "Habit not found" });
      }

      const [newReflection] = await db
        .insert(reflections)
        .values({
          experience,
          reflection,
          bottleneck,
          experiment,
          date: new Date(),
          habitId,
        })
        .returning({ id: reflections.id });

      const reflectionId = newReflection.id;

      // Insert each tactic into the junction table
      if (tacticIds && tacticIds.length > 0) {
        await Promise.all(
          tacticIds.map((tacticId) =>
            db.insert(reflectionTactics).values({
              reflectionId,
              tacticId,
            })
          )
        );
      }

      return res
        .status(200)
        .json({ message: "Reflection created successfully" });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: "Failed to create reflection" });
    }
  }
);

server.listen(PORT, () => {
  console.log("listening on", PORT);
});
