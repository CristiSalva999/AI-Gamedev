import { createApp } from "./app.js";
import { loadConfig } from "./config.js";
import { MockBlenderAssetGenerator } from "./services/assetGenerator.js";
import { FileContextStore } from "./services/contextStore.js";
import { LMStudioClient } from "./services/llmClient.js";

/** Composition root: build concrete dependencies and start the HTTP server. */
function main(): void {
  const config = loadConfig();

  const llm = new LMStudioClient(config.llm);
  const contextStore = new FileContextStore(config.dataDir);
  const assetGenerator = new MockBlenderAssetGenerator(llm);

  // A small delay makes the streamed "sneak peeks" feel deliberate in the UI.
  const app = createApp({
    contextStore,
    llm,
    assetGenerator,
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
  });
}

main();
