import { describe, expect, it } from "vitest";
import {
  createSessionState,
  formatSessionHud,
  sessionOnCheckpoint,
  sessionOnCollect,
  sessionOnEliminate,
  sessionOnFire,
  sessionOnReach,
  sessionOnReload,
  tickSession,
  type GameRuntimeSpec,
} from "@ai-gamedev/shared";
import { pickGenrePack } from "../src/pipeline/genrePacks.js";
import { buildScaffold } from "../src/pipeline/scaffold.js";

function explorationRuntime(): GameRuntimeSpec {
  const prompt = "Create a forest exploration game with ruins and collect 2 relics";
  const pack = pickGenrePack(prompt);
  const design = pack.design("Forest", prompt, "cinematic");
  return buildScaffold(prompt, pack, design).runtime;
}

function racingRuntime(): GameRuntimeSpec {
  const prompt = "arcade racing with 2 laps";
  const pack = pickGenrePack(prompt);
  const design = pack.design("Race", prompt, "cinematic");
  return buildScaffold(prompt, pack, design).runtime;
}

function shooterRuntime(): GameRuntimeSpec {
  const prompt = "fps shooter arena";
  const pack = pickGenrePack(prompt);
  const design = pack.design("Arena", prompt, "cinematic");
  return buildScaffold(prompt, pack, design).runtime;
}

describe("sessionLogic", () => {
  it("tickSession advances time and loses on time limit", () => {
    const base = explorationRuntime();
    const runtime: GameRuntimeSpec = {
      ...base,
      rules: {
        ...base.rules,
        timeLimitSec: 10,
      },
    };
    const state = createSessionState(runtime);
    const mid = tickSession(state, runtime, 5);
    expect(mid.elapsedSec).toBe(5);
    expect(mid.status).toBe("playing");
    const lost = tickSession(mid, runtime, 6);
    expect(lost.status).toBe("lost");
  });

  it("sessionOnCollect progresses collect objectives and can win with reach", () => {
    const runtime = explorationRuntime();
    let state = createSessionState(runtime);
    state = sessionOnCollect(state, runtime);
    expect(state.score).toBeGreaterThan(0);
    state = sessionOnCollect(state, runtime);
    expect(state.objectives.find((o) => o.type === "collect")?.progress).toBe(2);
    state = sessionOnReach(state, runtime);
    expect(state.status).toBe("won");
  });

  it("sessionOnReach bumps reach objectives", () => {
    const runtime = explorationRuntime();
    const state = sessionOnReach(createSessionState(runtime), runtime);
    const reach = state.objectives.find((o) => o.type === "reach");
    if (reach) expect(reach.progress).toBeGreaterThan(0);
    expect(state.message).toContain("Landmark");
  });

  it("sessionOnCheckpoint advances laps for racing", () => {
    const runtime = racingRuntime();
    expect(runtime.racing).toBeTruthy();
    let state = createSessionState(runtime);
    const perLap = runtime.racing!.checkpointsPerLap;
    for (let i = 0; i < perLap; i++) {
      state = sessionOnCheckpoint(state, runtime, `cp-${i}`);
    }
    expect(state.lap).toBe(1);
    expect(state.checkpointsThisLap).toBe(0);
  });

  it("sessionOnFire and sessionOnReload manage ammo", () => {
    const runtime = shooterRuntime();
    let state = createSessionState(runtime);
    if (!runtime.features.fire) return;
    const before = state.ammo;
    state = sessionOnFire(state, runtime);
    expect(state.ammo).toBe(before - 1);
    state = { ...state, ammo: 0 };
    state = sessionOnReload(state, runtime);
    expect(state.ammo).toBe(runtime.player.maxAmmo);
  });

  it("sessionOnEliminate scores kills and can win an archery hunt", () => {
    const prompt =
      'Create a shooter game called "dwarvy archery" set in dwarven archery grounds. Objective: Shoot 2 dwarfs.';
    const pack = pickGenrePack(prompt);
    const design = pack.design("dwarvy archery", prompt, "cinematic");
    const runtime = buildScaffold(prompt, pack, design).runtime;
    let state = createSessionState(runtime);
    const need = runtime.objectives.find((o) => o.type === "eliminate")!.target;
    for (let i = 0; i < need; i++) {
      state = sessionOnEliminate(state, runtime, "Dwarf down!");
    }
    expect(state.score).toBeGreaterThan(0);
    expect(state.status).toBe("won");
  });

  it("formatSessionHud includes genre cues", () => {
    const raceHud = formatSessionHud(createSessionState(racingRuntime()), racingRuntime());
    expect(raceHud).toMatch(/Lap|Score/);
    const exploreHud = formatSessionHud(
      createSessionState(explorationRuntime()),
      explorationRuntime(),
    );
    expect(exploreHud).toMatch(/HP|Score|Loot/);
  });
});
