# Credits

The wall, roof, ground, and path textures in `src/assets/textures/` are
**hand-authored SVG placeholder patterns**, not AI-generated — the plan
originally called for AI-generated textures, but no image generation
provider was usable in the implementation session: the configured Gemini
API key had a 0 request/day quota on the free tier, and no OpenAI or xAI
key was configured. They are real, tileable, correctly-wired textures
(not flat colors), just not the AI-generated assets the design called for.

**Follow-up needed:** once an image generation provider with available
quota is set up, regenerate these six textures with the image-generation
skill and swap them in at the same file paths (update the `.svg`
extensions in `src/game/houses.ts` and `src/game/scene.ts` to `.png` to
match):
- `wood-wall`: weathered horizontal log-cabin wall, warm brown tones
- `roof-shingle-1` / `-2` / `-3`: wood-shingle roof, dark brown / mossy
  green-brown / warm red-brown
- `ground-moss`: mossy forest-floor, muted autumn-green
- `stone-path`: round river-stone path, grey-tan

If any future asset is sourced from a third-party CC0/CC-BY library
(e.g., Quaternius, Poly Pizza), it will be listed here with its license
and attribution requirement at the time it's added.
