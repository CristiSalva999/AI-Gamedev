import { createApp } from "./app.js";
import { loadConfig } from "./config.js";
import { loadEnvFiles } from "./loadEnv.js";
import { HybridBlenderAssetGenerator } from "./services/assetGenerator.js";
import { FileContextStore } from "./services/contextStore.js";
import { GamePackager } from "./services/gamePackager.js";
import { GitWorkspaceService } from "./services/gitWorkspace.js";
import { LMStudioClient } from "./services/llmClient.js";
import { ProjectStore } from "./services/projectStore.js";
import { formatStartupBanner } from "./startupBanner.js";

/** Composition root: build concrete dependencies and start the HTTP server. */
async function main(): Promise<void> {
  // Must run before loadConfig — otherwise server/.env (BLENDER_BIN, LLM_*) is ignored.
  const envFiles = loadEnvFiles();
  const config = loadConfig();

  const llm = new LMStudioClient(config.llm);
  const contextStore = new FileContextStore(config.dataDir);
  const assetGenerator = new HybridBlenderAssetGenerator(llm, undefined, config.blenderBin);
  const git = new GitWorkspaceService(config.gamesDir);
  const packager = new GamePackager({ git, gamesRoot: config.gamesDir });
  const projectStore = new ProjectStore(config.dataDir);

  const [llmReachable, blender] = await Promise.all([
    llm.ping(),
    assetGenerator.probeBlender(),
  ]);

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
    console.log(
      formatStartupBanner({
        config,
        llmReachable,
        blender,
        envFiles,
        webPort: 5173,
      }),
    );
  });
}

void main();
