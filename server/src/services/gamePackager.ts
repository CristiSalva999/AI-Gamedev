import { mkdir, writeFile, readFile, readdir } from "node:fs/promises";
import path from "node:path";
import JSZip from "jszip";
import type { BuildManifest, GameBlueprint } from "@ai-gamedev/shared";
import type { GitWorkspaceService } from "./gitWorkspace.js";

export interface PackageResult {
  manifest: BuildManifest;
  zipPath: string;
}

export interface PackagerDeps {
  git: GitWorkspaceService;
  gamesRoot: string;
}

/**
 * Packages a finished blueprint into a real on-disk game project + downloadable
 * zip containing a double-clickable `play.html` runner (no install step).
 */
export class GamePackager {
  constructor(private readonly deps: PackagerDeps) {}

  async package(
    blueprint: GameBlueprint,
    options: { slug: string },
  ): Promise<PackageResult> {
    const { slug } = options;
    const gitResult = await this.deps.git.createGameBranch(slug, blueprint.gameTitle);
    const workspace = gitResult.workspacePath;

    // Persist blueprint + scripts into the workspace.
    await writeFile(
      path.join(workspace, "blueprint.json"),
      JSON.stringify(blueprint, null, 2),
      "utf8",
    );
    for (const [filename, source] of Object.entries(blueprint.scripts)) {
      await writeFile(path.join(workspace, "scripts", filename), source, "utf8");
    }
    await writeFile(
      path.join(workspace, "play.html"),
      buildPlayableHtml(blueprint),
      "utf8",
    );

    await this.deps.git.commitSnapshot(
      workspace,
      `feat: package ${blueprint.gameTitle}`,
    );

    const zipPath = path.join(this.deps.gamesRoot, `${slug}.zip`);
    await writeZip(workspace, zipPath, blueprint, slug);

    const zipStat = await readFile(zipPath);
    const animationCount =
      Object.keys(blueprint.animations).length +
      blueprint.entities.filter((e) => e.animation).length;

    const manifest: BuildManifest = {
      name: blueprint.gameTitle,
      slug,
      branch: gitResult.branch,
      branchCreated: gitResult.created,
      entityCount: blueprint.entities.length,
      assetCount: blueprint.entities.length,
      scriptCount: Object.keys(blueprint.scripts).length,
      animationCount,
      approxSizeKb: Math.round(zipStat.byteLength / 1024),
      downloadUrl: `/api/artifacts/${slug}/download`,
      installPath: workspace,
      packageFormat: "zip+html",
    };

    await writeFile(
      path.join(workspace, "manifest.json"),
      JSON.stringify(manifest, null, 2),
      "utf8",
    );

    return { manifest, zipPath };
  }
}

async function writeZip(
  workspace: string,
  zipPath: string,
  blueprint: GameBlueprint,
  slug: string,
): Promise<void> {
  const zip = new JSZip();
  const root = zip.folder(slug);
  if (!root) throw new Error("Failed to create zip root");

  root.file("blueprint.json", JSON.stringify(blueprint, null, 2));
  root.file("play.html", buildPlayableHtml(blueprint));
  root.file(
    "README.md",
    `# ${blueprint.gameTitle}\n\nOpen **play.html** in a browser to play.\n`,
  );

  const scripts = root.folder("scripts");
  for (const [filename, source] of Object.entries(blueprint.scripts)) {
    scripts?.file(filename, source);
  }

  // Bundle any .glb assets that were written beside the workspace.
  try {
    const assetDir = path.join(workspace, "assets");
    const files = await readdir(assetDir);
    const assetsFolder = root.folder("assets");
    for (const file of files) {
      if (!file.endsWith(".glb")) continue;
      const bytes = await readFile(path.join(assetDir, file));
      assetsFolder?.file(file, bytes);
    }
  } catch {
    // Assets folder may be empty early in the pipeline — that's fine.
  }

  const content = await zip.generateAsync({
    type: "nodebuffer",
    compression: "DEFLATE",
    compressionOptions: { level: 6 },
  });
  await mkdir(path.dirname(zipPath), { recursive: true });
  await writeFile(zipPath, content);
}

/**
 * Self-contained HTML5 playable export — no CDN, no install. Double-click to run.
 */
export function buildPlayableHtml(blueprint: GameBlueprint): string {
  const payload = JSON.stringify(blueprint);
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<title>${escapeHtml(blueprint.gameTitle)}</title>
<style>
  html,body{margin:0;height:100%;background:#0b0c10;color:#e8eaef;font-family:ui-sans-serif,system-ui,sans-serif}
  canvas{display:block;width:100vw;height:100vh}
  #hud{position:fixed;left:16px;bottom:16px;padding:8px 12px;background:rgba(0,0,0,.55);border-radius:8px;font-size:13px}
  #title{position:fixed;left:16px;top:16px;font-weight:700}
</style>
</head>
<body>
<div id="title">${escapeHtml(blueprint.gameTitle)}</div>
<canvas id="c"></canvas>
<div id="hud">WASD / arrows to move · Esc to reset</div>
<script>
const BP = ${payload};
const canvas = document.getElementById("c");
const ctx = canvas.getContext("2d");
let W=0,H=0,dpr=1;
function resize(){dpr=Math.min(devicePixelRatio||1,2);W=innerWidth;H=innerHeight;canvas.width=W*dpr;canvas.height=H*dpr;ctx.setTransform(dpr,0,0,dpr,0,0)}
addEventListener("resize",resize);resize();
const keys=new Set();
addEventListener("keydown",e=>{keys.add(e.code);if(e.code==="Escape"){player.x=BP.player.spawn.x;player.z=BP.player.spawn.z}});
addEventListener("keyup",e=>keys.delete(e.code));
const player={x:BP.player.spawn.x,z:BP.player.spawn.z,bob:0};
const SCALE=28;
function worldToScreen(x,z){return {x:W/2+x*SCALE,y:H/2+z*SCALE}}
function hex(c){return c}
let last=performance.now();
function frame(now){
  const dt=Math.min(0.05,(now-last)/1000);last=now;
  let dx=0,dz=0;
  if(keys.has("KeyW")||keys.has("ArrowUp"))dz-=1;
  if(keys.has("KeyS")||keys.has("ArrowDown"))dz+=1;
  if(keys.has("KeyA")||keys.has("ArrowLeft"))dx-=1;
  if(keys.has("KeyD")||keys.has("ArrowRight"))dx+=1;
  const moving=dx||dz;
  if(moving){const len=Math.hypot(dx,dz);player.x+=dx/len*BP.player.speed*dt;player.z+=dz/len*BP.player.speed*dt}
  player.bob=moving?Math.sin(now/120)*4:Math.sin(now/600)*2;
  ctx.fillStyle=BP.environment.skyColor;ctx.fillRect(0,0,W,H);
  // ground
  ctx.fillStyle=BP.environment.groundColor;
  const g=worldToScreen(0,0);ctx.beginPath();ctx.ellipse(g.x,g.y,11*SCALE,11*SCALE,0,0,Math.PI*2);ctx.fill();
  const t=now/1000;
  for(const e of BP.entities){
    let x=e.position.x,y=e.position.y,z=e.position.z,sy=1;
    const anim=e.animation;
    if(anim){
      const u=(t%anim.duration)/anim.duration;
      for(const track of anim.tracks){
        const v=sample(track,u*anim.duration);
        if(track.target==="position.x")x+=v;
        if(track.target==="position.y")y+=v;
        if(track.target==="scale.y")sy=v;
      }
    } else if(e.behavior==="bob"){y+=Math.sin(t*2)*0.35}
      else if(e.behavior==="patrol"){x+=Math.sin(t)*2}
      else if(e.behavior==="pulse"){sy=1+Math.sin(t*3)*0.12}
    const p=worldToScreen(x,z);
    const r=Math.max(8,e.spec.size.x*SCALE*0.45)*sy;
    ctx.fillStyle=hex(e.spec.color);
    ctx.beginPath();
    if(e.spec.shape==="sphere"||e.spec.shape==="torus")ctx.arc(p.x,p.y-y*SCALE*0.4,r,0,Math.PI*2);
    else if(e.spec.shape==="cone"){ctx.moveTo(p.x,p.y-r*1.4);ctx.lineTo(p.x-r,p.y+r*0.4);ctx.lineTo(p.x+r,p.y+r*0.4);ctx.closePath()}
    else if(e.spec.shape==="cylinder"){ctx.fillRect(p.x-r*0.6,p.y-r,r*1.2,r*2);continue}
    else ctx.fillRect(p.x-r,p.y-r,r*2,r*2);
    ctx.fill();
  }
  const pp=worldToScreen(player.x,player.z);
  ctx.fillStyle=BP.player.color;
  ctx.fillRect(pp.x-10,pp.y-14+player.bob,20,28);
  requestAnimationFrame(frame);
}
function sample(track,time){
  const times=track.times,values=track.values;
  if(time<=times[0])return values[0];
  if(time>=times[times.length-1])return values[values.length-1];
  for(let i=0;i<times.length-1;i++){
    if(time>=times[i]&&time<=times[i+1]){
      const u=(time-times[i])/(times[i+1]-times[i]||1);
      return values[i]+(values[i+1]-values[i])*u;
    }
  }
  return values[0];
}
requestAnimationFrame(frame);
</script>
</body>
</html>`;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
