// Runtime validation for request/response boundaries. The TypeScript types in
// types.ts describe intent; these zod schemas enforce it on data crossing the
// wire (API route bodies, on-disk JSON), so a malformed payload fails with a
// clean 400 instead of flowing into a fetch as an unchecked cast.

import { z } from "zod";

export const chatMessageSchema = z.object({
  role: z.enum(["system", "user", "assistant"]),
  content: z.string(),
});

export const chatRequestSchema = z.object({
  providerId: z.string().min(1),
  model: z.string().min(1),
  messages: z.array(chatMessageSchema).min(1),
  temperature: z.number().min(0).max(2).optional(),
  maxTokens: z.number().int().positive().max(200_000).optional(),
});

export const providerTypeSchema = z.enum(["openai", "anthropic"]);

export const providerSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  type: providerTypeSchema,
  kind: z.enum(["direct", "gateway"]).optional(),
  baseUrl: z.string().url(),
  apiKey: z.string().optional(),
  models: z.array(z.string()).default([]),
  catalog: z.array(z.string()).optional(),
  catalogUpdatedAt: z.number().optional(),
  defaultModel: z.string().optional(),
  extraHeaders: z.record(z.string()).optional(),
  enabled: z.boolean().optional(),
  maxTokens: z.number().int().positive().optional(),
});

export const hermesAuthModeSchema = z.enum([
  "auto",
  "none",
  "bearer",
  "cookie",
  "session",
]);

/** PUT body for the Hermes connection — partial; merged over current config. */
export const hermesConnectionInputSchema = z.object({
  adminBaseUrl: z.string().url().optional(),
  authMode: hermesAuthModeSchema.optional(),
  token: z.string().optional(),
  // The Gateway also owns the inference (/v1) endpoint for chat. Blank chatKey
  // (like a blank token) means "keep the stored secret".
  chatBaseUrl: z.string().url().optional(),
  chatKey: z.string().optional(),
});

export const conversationSchema = z.object({
  id: z.string(),
  title: z.string(),
  providerId: z.string(),
  model: z.string(),
  messages: z.array(chatMessageSchema),
  createdAt: z.number(),
  updatedAt: z.number(),
  archived: z.boolean().optional(),
});

export const conversationsSchema = z.array(conversationSchema);

/** Format a ZodError into a short, human-readable message for a 400 response. */
export function formatZodError(err: z.ZodError): string {
  return err.issues
    .map((i) => {
      const path = i.path.join(".");
      return path ? `${path}: ${i.message}` : i.message;
    })
    .join("; ");
}
