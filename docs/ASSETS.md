# Asset pipeline

`public/orig/` is generated from the original SWF (not hand-edited):

1. Export sprites at a zoom with JPEXS FFDec (`-zoom 3` for `hd`, `-zoom 2` for `sd`):
   `java -Djava.awt.headless=true -jar ffdec.jar -zoom 3 -format sprite:png -export sprite OUT game.swf`
2. `AOW_SCALE=3 AOW_HI=OUT AOW_ATLAS=4096 AOW_Q=82 node tools/swf/build-assets.mjs /tmp/hd` (and the same with scale 2 → `/tmp/sd`);
   copy `*.webp` + `manifest.json` into `public/orig/hd|sd/` and `ui.json`/`fonts.json` into `public/orig/`.
3. `node tools/swf/build-data.mjs public/orig` for `data.json` and sounds.

The game picks `sd` (2×) on phones/low-memory devices, `hd` (3×) on full-HD desktops and `uhd` (4.5×, export with `-zoom 4.5`, `AOW_SCALE=4.5`) on retina/4K desktops with ≥8 GB (`?q=uhd|hd|sd` overrides).
