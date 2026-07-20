#!/usr/bin/env node
/**
 * Download Kenney CC0 packs (via OpenGameArt mirrors), convert a curated
 * subset to GLB with Blender, and refresh server/asset-kit/.
 *
 * Requires: curl, unzip, blender on PATH.
 */
import { spawnSync } from "node:child_process";
import { copyFileSync, mkdirSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const kitRoot = path.join(root, "server/asset-kit");
const tmp = path.join(root, ".tmp-asset-kit");
const packs = [
  {
    name: "nature",
    url: "https://opengameart.org/sites/default/files/Nature%20Kit%20%282.1%29.zip",
  },
  {
    name: "castle",
    url: "https://opengameart.org/sites/default/files/kenney_castle-kit.zip",
  },
  {
    name: "fantasy",
    url: "https://opengameart.org/sites/default/files/kenney_fantasy-town-kit_2.0.zip",
  },
];

const selections = [
  ["tree_oak", "nature/Models/OBJ format/tree_oak.obj"],
  ["tree_pine", "nature/Models/OBJ format/tree_pineDefaultA.obj"],
  ["tree_default", "nature/Models/OBJ format/tree_default.obj"],
  ["tree_detailed", "nature/Models/OBJ format/tree_detailed.obj"],
  ["rock_large", "nature/Models/OBJ format/rock_largeA.obj"],
  ["rock_small", "nature/Models/OBJ format/rock_smallA.obj"],
  ["bush", "nature/Models/OBJ format/plant_bushLarge.obj"],
  ["bush_detailed", "nature/Models/OBJ format/plant_bushDetailed.obj"],
  ["statue_column", "nature/Models/OBJ format/statue_column.obj"],
  ["statue_column_damaged", "nature/Models/OBJ format/statue_columnDamaged.obj"],
  ["statue_head", "nature/Models/OBJ format/statue_head.obj"],
  ["campfire", "nature/Models/OBJ format/campfire_stones.obj"],
  ["log_stack", "nature/Models/OBJ format/log_stack.obj"],
  ["path_stone", "nature/Models/OBJ format/path_stone.obj"],
  ["cliff_block", "nature/Models/OBJ format/cliff_block_stone.obj"],
  ["flower", "nature/Models/OBJ format/flower_yellowA.obj"],
  ["castle_wall", "castle/Models/OBJ format/wall.obj"],
  ["castle_wall_broken", "castle/Models/OBJ format/wall-half.obj"],
  ["castle_gate", "castle/Models/OBJ format/gate.obj"],
  ["castle_door", "castle/Models/OBJ format/door.obj"],
  ["castle_tower", "castle/Models/OBJ format/tower-square-base.obj"],
  ["castle_arch", "castle/Models/OBJ format/tower-square-arch.obj"],
  ["castle_stairs", "castle/Models/OBJ format/stairs-stone.obj"],
  ["metal_gate", "castle/Models/OBJ format/metal-gate.obj"],
  ["flag_banner", "castle/Models/OBJ format/flag-banner-short.obj"],
  ["pillar_stone", "fantasy/Models/OBJ format/pillar-stone.obj"],
  ["pillar_wood", "fantasy/Models/OBJ format/pillar-wood.obj"],
  ["wall_arch", "fantasy/Models/OBJ format/wall-arch.obj"],
  ["wall_broken", "fantasy/Models/OBJ format/wall-broken.obj"],
  ["rock_wide", "fantasy/Models/OBJ format/rock-wide.obj"],
  ["lantern", "fantasy/Models/OBJ format/lantern.obj"],
  ["cart", "fantasy/Models/OBJ format/cart.obj"],
  ["fence", "fantasy/Models/OBJ format/fence.obj"],
  ["stall", "fantasy/Models/OBJ format/stall.obj"],
  ["fountain", "fantasy/Models/OBJ format/fountain-round.obj"],
  ["hedge", "fantasy/Models/OBJ format/hedge-large.obj"],
  ["banner_red", "fantasy/Models/OBJ format/banner-red.obj"],
  ["planks", "fantasy/Models/OBJ format/planks.obj"],
  ["poles", "fantasy/Models/OBJ format/poles.obj"],
];

function run(cmd, args, opts = {}) {
  const res = spawnSync(cmd, args, { stdio: "inherit", ...opts });
  if (res.status !== 0) throw new Error(`${cmd} failed`);
}

rmSync(tmp, { recursive: true, force: true });
mkdirSync(path.join(tmp, "convert"), { recursive: true });
mkdirSync(path.join(kitRoot, "glb"), { recursive: true });

for (const pack of packs) {
  const zip = path.join(tmp, `${pack.name}.zip`);
  console.log(`Downloading ${pack.name}…`);
  run("curl", ["-sL", "-o", zip, pack.url]);
  run("unzip", ["-q", "-o", zip, "-d", path.join(tmp, pack.name)]);
}

const convertList = [];
for (const [id, rel] of selections) {
  const src = path.join(tmp, rel);
  const dest = path.join(tmp, "convert", `${id}.obj`);
  copyFileSync(src, dest);
  const mtl = src.replace(/\.obj$/i, ".mtl");
  try {
    copyFileSync(mtl, path.join(tmp, "convert", `${id}.mtl`));
  } catch {
    // optional
  }
  convertList.push({ id, obj: dest });
}
writeFileSync(path.join(tmp, "convert_list.json"), JSON.stringify(convertList, null, 2));

const py = `
import bpy, json
from pathlib import Path
out_dir = Path(${JSON.stringify(path.join(kitRoot, "glb"))})
out_dir.mkdir(parents=True, exist_ok=True)
items = json.loads(Path(${JSON.stringify(path.join(tmp, "convert_list.json"))}).read_text())
for item in items:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    try:
        bpy.ops.wm.obj_import(filepath=item["obj"])
    except Exception:
        bpy.ops.import_scene.obj(filepath=item["obj"])
    out = out_dir / f'{item["id"]}.glb'
    bpy.ops.export_scene.gltf(filepath=str(out), export_format='GLB', use_selection=False)
    print("OK", item["id"], out.stat().st_size)
`;
writeFileSync(path.join(tmp, "convert_batch.py"), py);
console.log("Converting with Blender…");
run("blender", ["--background", "--python", path.join(tmp, "convert_batch.py")]);

const manifest = JSON.parse(readFileSync(path.join(kitRoot, "manifest.json"), "utf8"));
console.log(`Done. Kit entries in manifest: ${manifest.entries.length}`);
console.log(`GLBs at ${path.join(kitRoot, "glb")}`);
