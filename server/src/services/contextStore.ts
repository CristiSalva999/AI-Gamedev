import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import {
  createDefaultContext,
  createSampleNpc,
  type GameContext,
} from "@ai-gamedev/shared";

/**
 * Persistence boundary for the shared game context. Defined as an interface so
 * callers (routes) depend on the abstraction, not the file system, which keeps
 * them trivially testable with an in-memory fake.
 */
export interface ContextStore {
  load(): Promise<GameContext>;
  save(context: GameContext): Promise<GameContext>;
}

/** Stores the context as a single JSON document on disk. */
export class FileContextStore implements ContextStore {
  private readonly filePath: string;

  constructor(dataDir: string) {
    this.filePath = join(dataDir, "context.json");
  }

  async load(): Promise<GameContext> {
    try {
      const raw = await readFile(this.filePath, "utf8");
      return JSON.parse(raw) as GameContext;
    } catch (error) {
      // Missing file on first run is expected: seed a sensible default.
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        const seeded = this.seed();
        await this.save(seeded);
        return seeded;
      }
      throw error;
    }
  }

  async save(context: GameContext): Promise<GameContext> {
    await mkdir(dirname(this.filePath), { recursive: true });
    await writeFile(this.filePath, JSON.stringify(context, null, 2), "utf8");
    return context;
  }

  private seed(): GameContext {
    const npc = createSampleNpc();
    return createDefaultContext({
      gameTitle: "Hollowreach",
      currentMission: "Find the lost herbalist's greenhouse key",
      assets: { models: {}, materials: {}, characters: { [npc.id]: npc } },
    });
  }
}
