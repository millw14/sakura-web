# Damare, Roger — 30s anime short

See [SCRIPT.md](SCRIPT.md) for the storyboard, cast anchors and Japanese dialogue.

## Pipeline

```bash
export HF_API_KEY_ID=...      # from https://cloud.higgsfield.ai
export HF_API_KEY_SECRET=...

node render.mjs keyframes   # Soul  : 6 character-locked keyframes
node render.mjs clips       # DoP   : keyframe -> 5s clip, one per shot
node render.mjs vo          # TTS   : Japanese VO per line       (needs a TTS provider)
node render.mjs assemble    # ffmpeg: cut, mix, burn subs -> build/damare-roger.mp4
```

`node render.mjs animatic` needs no credentials — it renders timed placeholder cards
so the edit, subtitle burn and comic timing can be reviewed before spending any credits.
Each step skips work that already exists in `build/`, so a failed run resumes cheaply.

## Status

- [x] Script, shot list, Japanese dialogue, English subtitles
- [x] Assembly chain — verified end to end: exactly 30.000s, 1080×1920, 24fps,
      CJK glyphs and burned subtitles confirmed correct on extracted frames
- [x] Animatic (placeholder art) rendering from the real timeline
- [ ] Keyframes + clips — **blocked: no Higgsfield credentials in this environment**
- [ ] Japanese VO — **blocked: needs a TTS provider** (Higgsfield covers image and
      video; it does not supply the Japanese voice track)

Endpoint paths default to `/higgsfield-ai/soul/v2/standard` and
`/higgsfield-ai/dop/v2/standard` and are overridable with `HF_T2I_PATH` / `HF_I2V_PATH`,
since the published docs render client-side and could not be fully enumerated here.
