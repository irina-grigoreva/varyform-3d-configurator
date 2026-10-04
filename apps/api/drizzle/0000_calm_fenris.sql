CREATE TABLE "projects" (
	"id" serial PRIMARY KEY NOT NULL,
	"public_id" varchar(40) NOT NULL,
	"configuration" jsonb NOT NULL,
	"calculated_price" integer NOT NULL,
	"schema_version" integer DEFAULT 1 NOT NULL,
	"project_name" varchar(100),
	"edit_token_hash" varchar(64) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "projects_public_id_unique" UNIQUE("public_id")
);
