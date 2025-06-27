import {
  integer,
  boolean,
  pgTable,
  text,
  varchar,
  pgEnum,
  timestamp,
} from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id: integer().primaryKey().generatedAlwaysAsIdentity(),
  email: varchar().notNull().unique(),
  password: text().notNull(),
  completed_onboarding: boolean().default(false),
});

export const passwordResets = pgTable("password_resets", {
  id: integer().primaryKey().generatedAlwaysAsIdentity(),
  userId: integer("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  resetCode: integer("reset_code").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  used: boolean("used").default(false),
});

export const habits = pgTable("habits", {
  id: integer().primaryKey().generatedAlwaysAsIdentity(),
  habit_name: varchar().notNull(),
  icon_url: text(),
  failReflectionLimit: integer("fail_reflection_limit").notNull(),
  cue: text().notNull(),
  craving: text().notNull(),
  response: text().notNull(),
  reward: text().notNull(),
  build: boolean().default(true),
  sort_order: integer().notNull().default(1),
  userId: integer("user_id").references(() => users.id),
});

export const habitCompletions = pgTable("habit_completions", {
  id: integer().primaryKey().generatedAlwaysAsIdentity(),
  date: timestamp().notNull(),
  habitId: integer("habit_id").references(() => habits.id),
});

export const habitStageEnum = pgEnum("habit_stage", [
  "cue",
  "craving",
  "response",
  "reward",
]);

export const reflections = pgTable("reflections", {
  id: integer().primaryKey().generatedAlwaysAsIdentity(),
  experience: text().notNull(),
  reflection: text().notNull(),
  bottleneck: habitStageEnum("bottleneck").notNull(),
  experiment: text().notNull(),
  date: timestamp().notNull(),
  habitId: integer("habit_id").references(() => habits.id),
});

export const tactics = pgTable("tactics", {
  id: integer().primaryKey().generatedAlwaysAsIdentity(),
  name: varchar().notNull(),
  icon_url: text(),
  description: text(),
  partOfHabit: habitStageEnum("part_of_habit").notNull(),
  build: boolean().default(true),
});

// junction table
export const reflectionTactics = pgTable("reflection_tactics", {
  id: integer().primaryKey().generatedAlwaysAsIdentity(),
  reflectionId: integer("reflection_id").references(() => reflections.id),
  tacticId: integer("tactic_id").references(() => tactics.id),
});
