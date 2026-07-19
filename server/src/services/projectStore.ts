import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  createDefaultContext,
  type GameContext,
  type GameSetupAnswers,
  type ProjectMeta,
} from "@ai-gamedev/shared";
import { slugify } from "../pipeline/heuristics.js";

export interface ProjectRecord {
  meta: ProjectMeta;
  context: GameContext;
}

/**
 * Multi-project registry. Each project is a workspace directory containing its
 * own `project.json` (metadata) and `context.json` (chat + blueprint), so
 * projects are fully isolated — switching projects in the UI never mixes chat
 * history or blueprints. This is the "grouped games, like Cursor" backbone.
 */
export class ProjectStore {
  private readonly root: string;
  private metas = new Map<string, ProjectMeta>();
  private ready: Promise<void> | undefined;

  constructor(dataDir: string) {
    this.root = join(dataDir, "projects");
  }

  private async init(): Promise<void> {
    if (!this.ready) this.ready = this.load();
    return this.ready;
  }

  private async load(): Promise<void> {
    await mkdir(this.root, { recursive: true });
    const entries = await readdir(this.root, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const metaPath = join(this.root, entry.name, "project.json");
      if (!existsSync(metaPath)) continue;
      try {
        const meta = JSON.parse(await readFile(metaPath, "utf8")) as ProjectMeta;
        this.metas.set(meta.id, meta);
      } catch {
        // Ignore corrupt metadata rather than failing startup.
      }
    }
  }

  private dir(id: string): string {
    return join(this.root, id);
  }

  private async uniqueSlug(title: string): Promise<string> {
    const base = slugify(title) || "game";
    const taken = new Set([...this.metas.values()].map((m) => m.slug));
    if (!taken.has(base)) return base;
    let n = 2;
    while (taken.has(`${base}-${n}`)) n++;
    return `${base}-${n}`;
  }

  async list(): Promise<ProjectMeta[]> {
    await this.init();
    return [...this.metas.values()].sort((a, b) => b.updatedAt - a.updatedAt);
  }

  async get(id: string): Promise<ProjectRecord | undefined> {
    await this.init();
    const meta = this.metas.get(id);
    if (!meta) return undefined;
    const contextPath = join(this.dir(id), "context.json");
    let context: GameContext;
    try {
      context = JSON.parse(await readFile(contextPath, "utf8")) as GameContext;
    } catch {
      context = createDefaultContext({ gameTitle: meta.title, gameGenre: meta.genre });
    }
    return { meta, context };
  }

  async create(answers: GameSetupAnswers): Promise<ProjectRecord> {
    await this.init();
    const id = randomUUID();
    const now = Date.now();
    const slug = await this.uniqueSlug(answers.title);
    const meta: ProjectMeta = {
      id,
      slug,
      title: answers.title.trim() || "Untitled Game",
      genre: answers.genre,
      setup: answers,
      createdAt: now,
      updatedAt: now,
      hasBuild: false,
    };
    const context = createDefaultContext({ gameTitle: meta.title, gameGenre: meta.genre });
    await mkdir(this.dir(id), { recursive: true });
    await this.writeMeta(meta);
    await this.writeContext(id, context);
    this.metas.set(id, meta);
    return { meta, context };
  }

  /**
   * Edit a project's scope (setup answers). Updates metadata and keeps the
   * stored context's title/genre in sync so a subsequent build uses the new
   * scope. Returns the updated metadata, or undefined if the project is gone.
   */
  async update(id: string, patch: Partial<GameSetupAnswers>): Promise<ProjectMeta | undefined> {
    await this.init();
    const meta = this.metas.get(id);
    if (!meta) return undefined;

    const setup = { ...meta.setup } as Record<string, unknown>;
    for (const [key, value] of Object.entries(patch)) {
      if (value !== undefined) setup[key] = value;
    }
    const nextSetup = setup as unknown as GameSetupAnswers;

    const updated: ProjectMeta = {
      ...meta,
      setup: nextSetup,
      title: nextSetup.title?.trim() || meta.title,
      genre: nextSetup.genre || meta.genre,
      updatedAt: Date.now(),
    };

    // Keep the persisted context aligned with the new scope.
    const record = await this.get(id);
    if (record) {
      record.context.gameTitle = updated.title;
      record.context.gameGenre = updated.genre;
      await this.writeContext(id, record.context);
    }
    await this.writeMeta(updated);
    this.metas.set(id, updated);
    return updated;
  }

  /** Delete a project and its entire workspace directory. */
  async remove(id: string): Promise<boolean> {
    await this.init();
    if (!this.metas.has(id)) return false;
    this.metas.delete(id);
    await rm(this.dir(id), { recursive: true, force: true });
    return true;
  }

  /** Persist a project's context and refresh derived metadata. */
  async saveContext(id: string, context: GameContext): Promise<ProjectMeta | undefined> {
    await this.init();
    const meta = this.metas.get(id);
    if (!meta) return undefined;
    const updated: ProjectMeta = {
      ...meta,
      updatedAt: Date.now(),
      hasBuild: Boolean(context.blueprint),
      title: context.gameTitle || meta.title,
    };
    await this.writeContext(id, context);
    await this.writeMeta(updated);
    this.metas.set(id, updated);
    return updated;
  }

  /** Filesystem slug used by the packager for this project's builds. */
  slugFor(id: string): string | undefined {
    return this.metas.get(id)?.slug;
  }

  private async writeMeta(meta: ProjectMeta): Promise<void> {
    await mkdir(this.dir(meta.id), { recursive: true });
    await writeFile(join(this.dir(meta.id), "project.json"), JSON.stringify(meta, null, 2));
  }

  private async writeContext(id: string, context: GameContext): Promise<void> {
    await mkdir(this.dir(id), { recursive: true });
    await writeFile(join(this.dir(id), "context.json"), JSON.stringify(context, null, 2));
  }
}
