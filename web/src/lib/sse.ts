/**
 * Minimal Server-Sent Events frame parser. Pure and incremental: feed it the
 * accumulated buffer and it returns the complete `data:` payloads plus any
 * trailing partial frame to carry over to the next chunk. Kept separate so it
 * can be unit tested without a network.
 */
export interface SseParseResult {
  data: string[];
  rest: string;
}

export function parseSseBuffer(buffer: string): SseParseResult {
  const frames = buffer.split("\n\n");
  const rest = frames.pop() ?? "";
  const data = frames
    .map((frame) =>
      frame
        .split("\n")
        .filter((line) => line.startsWith("data:"))
        .map((line) => line.slice(5).trim())
        .join(""),
    )
    .filter((payload) => payload.length > 0);
  return { data, rest };
}
