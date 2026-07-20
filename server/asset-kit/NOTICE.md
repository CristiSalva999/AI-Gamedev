# Third-party CC0 asset kit

This folder vendors a **curated subset** of free public-domain (CC0) 3D models
used as bases when the pipeline matches a natural-language asset brief.

## Sources

| Pack | Author | License | Obtained via |
|------|--------|---------|--------------|
| Nature Kit | [Kenney](https://kenney.nl/assets/nature-kit) | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) | OpenGameArt mirror |
| Castle Kit | [Kenney](https://kenney.nl/assets/castle-kit) | CC0 1.0 | OpenGameArt mirror |
| Fantasy Town Kit | [Kenney](https://kenney.nl/assets/fantasy-town-kit) | CC0 1.0 | OpenGameArt mirror |

Attribution is **not required** under CC0, but credit to Kenney.nl is appreciated.

OBJ sources were converted to `.glb` with Blender 4.0 (`scripts/sync-asset-kit.mjs`).

## Re-sync

From the repo root (requires `curl`, `unzip`, and `blender` on PATH):

```bash
npm run assets:sync
```
