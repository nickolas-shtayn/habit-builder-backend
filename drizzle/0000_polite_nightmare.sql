CREATE TYPE "public"."habit_stage" AS ENUM('cue', 'craving', 'response', 'reward');--> statement-breakpoint
CREATE TABLE "habit_completions" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "habit_completions_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"date" date NOT NULL,
	"habit_id" integer
);
--> statement-breakpoint
CREATE TABLE "habits" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "habits_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"habit_name" varchar NOT NULL,
	"icon_url" text,
	"fail_reflection_limit" integer NOT NULL,
	"cue" text NOT NULL,
	"craving" text NOT NULL,
	"response" text NOT NULL,
	"reward" text NOT NULL,
	"build" boolean DEFAULT true,
	"sort_order" integer DEFAULT 1 NOT NULL,
	"user_id" integer
);
--> statement-breakpoint
CREATE TABLE "password_resets" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "password_resets_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"user_id" integer NOT NULL,
	"reset_code" integer NOT NULL,
	"expires_at" timestamp NOT NULL,
	"used" boolean DEFAULT false
);
--> statement-breakpoint
CREATE TABLE "reflection_tactics" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "reflection_tactics_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"reflection_id" integer,
	"tactic_id" integer
);
--> statement-breakpoint
CREATE TABLE "reflections" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "reflections_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"experience" text NOT NULL,
	"reflection" text NOT NULL,
	"bottleneck" "habit_stage" NOT NULL,
	"experiment" text NOT NULL,
	"date" date NOT NULL,
	"habit_id" integer
);
--> statement-breakpoint
CREATE TABLE "tactics" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "tactics_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"name" varchar NOT NULL,
	"icon_url" text,
	"description" text,
	"part_of_habit" "habit_stage" NOT NULL,
	"build" boolean DEFAULT true
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "users_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"email" varchar NOT NULL,
	"password" text NOT NULL,
	"completed_onboarding" boolean DEFAULT false,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "habit_completions" ADD CONSTRAINT "habit_completions_habit_id_habits_id_fk" FOREIGN KEY ("habit_id") REFERENCES "public"."habits"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "habits" ADD CONSTRAINT "habits_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "password_resets" ADD CONSTRAINT "password_resets_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reflection_tactics" ADD CONSTRAINT "reflection_tactics_reflection_id_reflections_id_fk" FOREIGN KEY ("reflection_id") REFERENCES "public"."reflections"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reflection_tactics" ADD CONSTRAINT "reflection_tactics_tactic_id_tactics_id_fk" FOREIGN KEY ("tactic_id") REFERENCES "public"."tactics"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reflections" ADD CONSTRAINT "reflections_habit_id_habits_id_fk" FOREIGN KEY ("habit_id") REFERENCES "public"."habits"("id") ON DELETE no action ON UPDATE no action;