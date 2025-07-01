/* eslint-disable node/no-process-env */

import { config } from "dotenv";
import { expand } from "dotenv-expand";
import path from "node:path";
import { z } from "zod";

expand(config({
  path: path.resolve(
    process.cwd(),
    ".env",
  ),
}));

const EnvSchema = z.object({
  NODE_ENV: z.string().default("development"),
  DATABASE_URL: z.string().url(),
  NO_PLEX: z.string().optional(),
  SYNC_CONCURRENCY: z.string().transform((val) => parseInt(val, 10)).pipe(z.number().min(1).max(16)).default("4"),
  CRON_TIMEZONE: z.string().default("UTC"),
  AUTH_USERNAME: z.string().optional(),
  AUTH_PASSWORD: z.string().optional(),
}).superRefine((input, ctx) => {
  if (input.NODE_ENV === "production") {
    if (!input.DATABASE_URL) {
      ctx.addIssue({
        code: z.ZodIssueCode.invalid_type,
        expected: "string",
        received: "undefined",
        path: ["DATABASE_URL"],
        message: "Must be set when NODE_ENV is 'production'",
      });
    }
  }
  else if (!input.DATABASE_URL) {
    input.DATABASE_URL = "file:dev.db";
  }
  
  // Validate that if one auth credential is set, both must be set
  if ((input.AUTH_USERNAME && !input.AUTH_PASSWORD) || (!input.AUTH_USERNAME && input.AUTH_PASSWORD)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["AUTH_USERNAME"],
      message: "Both AUTH_USERNAME and AUTH_PASSWORD must be set together, or neither",
    });
  }
});

type env = z.infer<typeof EnvSchema>;

// eslint-disable-next-line ts/no-redeclare
const { data: env, error } = EnvSchema.safeParse(process.env);

if (error) {
  console.error("❌ Invalid env:");
  console.error(JSON.stringify(error.flatten().fieldErrors, null, 2));
  process.exit(1);
}

export default env!;
