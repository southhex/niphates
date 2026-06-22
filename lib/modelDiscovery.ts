// Pure helper: extract model ids from an OpenAI-compatible GET /models
// response. No "server-only" — shared by the test + discover routes and
// unit-testable. Hermes returns the same shape, where each id is a profile.

interface OpenAIModelsResponse {
  data?: Array<{ id?: string } | string>;
}

export function extractModelIds(json: unknown): string[] {
  const data = (json as OpenAIModelsResponse | null)?.data;
  if (!Array.isArray(data)) return [];
  return data
    .map((m) => (typeof m === "string" ? m : m?.id ?? ""))
    .filter((id): id is string => Boolean(id));
}
