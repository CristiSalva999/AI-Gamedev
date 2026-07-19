import { createApp } from "./app.js";
import { loadConfig } from "./config.js";
import { HybridBlenderAssetGenerator } from "./services/assetGenerator.js";
import { FileContextStore } from "./services/contextStore.js";
import { GamePackager } from "./services/gamePackager.js";
import { GitWorkspaceService } from "./services/gitWorkspace.js";
import { LMStudioClient } from "./services/llmClient.js";
import { ProjectStore } from "./services/projectStore.js";

/** Composition root: build concrete dependencies and start the HTTP server. */
async function main(): Promise<void> {
  const config = loadConfig();

  const llm = new LMStudioClient(config.llm);
  const contextStore = new FileContextStore(config.dataDir);
  const assetGenerator = new HybridBlenderAssetGenerator(llm, undefined, config.blenderBin);
  const git = new GitWorkspaceService(config.gamesDir);
  const packager = new GamePackager({ git, gamesRoot: config.gamesDir });
  const projectStore = new ProjectStore(config.dataDir);
  const blenderAvailable = await assetGenerator.blenderAvailable();

  // A small delay makes the streamed "sneak peeks" feel deliberate in the UI.
  const app = createApp({
    contextStore,
    llm,
    assetGenerator,
    packager,
    gamesDir: config.gamesDir,
    projectStore,
    pipelineOptions: { delayMs: 140 },
  });

  app.listen(config.port, () => {
    console.log(`[server] AI GameDev orchestrator listening on :${config.port}`);
    console.log(`[server] LLM endpoint: ${llm.baseUrl} (model: ${llm.model})`);
    console.log(
      `[server] Mock fallback: ${
        config.llm.allowMockFallback ? "enabled" : "disabled"
      }`,
    );
    console.log(
      `[server] Blender: ${blenderAvailable ? `available (${config.blenderBin})` : "procedural GLB fallback"}`,
    );
    console.log(`[server] Games dir: ${config.gamesDir}`);
  });
}

void main();
