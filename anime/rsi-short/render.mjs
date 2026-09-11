#!/usr/bin/env node
// Render pipeline for "Damare, Roger" — 30s anime short.
//
//   node render.mjs keyframes   # Higgsfield Soul  : shot prompts -> build/keyNN.png
//   node render.mjs clips       # Higgsfield DoP   : keyframes    -> build/clipNN.mp4
//   node render.mjs vo          # TTS              : JP dialogue  -> build/voNN.mp3
//   node render.mjs animatic    # no API needed    : timed placeholder cards
//   node render.mjs assemble    # ffmpeg           : cut + mix + burn subs -> build/damare-roger.mp4
//
// Credentials (env): HF_API_KEY_ID, HF_API_KEY_SECRET
// Optional overrides: HF_T2I_PATH, HF_I2V_PATH, HF_BASE

import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import path from "node:path";

const HERE  = import.meta.dirname;
const BUILD = path.join(HERE, "build");
const SHOTS = JSON.parse(readFileSync(path.join(HERE, "shots.json"), "utf8"));
const PAD   = (n) => String(n).padStart(2, "0");

const HF_BASE = process.env.HF_BASE  ?? "https://api.higgsfield.ai";
const T2I     = process.env.HF_T2I_PATH ?? "/higgsfield-ai/soul/v2/standard";
const I2V     = process.env.HF_I2V_PATH ?? "/higgsfield-ai/dop/v2/standard";

const sh = (cmd, args) => execFileSync(cmd, args, { stdio: ["ignore", "pipe", "inherit"] });
const FONT = sh("fc-match", ["-f", "%{file}", "Noto Sans CJK JP"]).toString().trim();
const FONT_BOLD = sh("fc-match", ["-f", "%{file}", "Noto Serif CJK JP:bold"]).toString().trim();

function auth() {
  const id = process.env.HF_API_KEY_ID, secret = process.env.HF_API_KEY_SECRET;
  if (!id || !secret) {
    console.error("Missing HF_API_KEY_ID / HF_API_KEY_SECRET.\n" +
                  "Create a key at https://cloud.higgsfield.ai and export both before running this step.");
    process.exit(2);
  }
  return `Key ${id}:${secret}`;
}

// Submit a job, then poll status_url until it resolves to a media URL.
async function hfJob(endpoint, body) {
  const res = await fetch(HF_BASE + endpoint, {
    method: "POST",
    headers: { Authorization: auth(), "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${endpoint} -> ${res.status} ${await res.text()}`);
  const job = await res.json();
  const statusUrl = job.status_url ?? `${HF_BASE}/v1/requests/${job.request_id}`;

  for (let i = 0; i < 240; i++) {
    await new Promise((r) => setTimeout(r, 5000));
    const s = await fetch(statusUrl, { headers: { Authorization: auth() } });
    if (!s.ok) continue;
    const st = await s.json();
    const state = (st.status ?? "").toLowerCase();
    if (["completed", "succeeded", "success", "finished"].includes(state)) {
      const url = findUrl(st);
      if (!url) throw new Error("job completed but no media url:\n" + JSON.stringify(st, null, 2));
      return url;
    }
    if (["failed", "error", "canceled", "cancelled"].includes(state)) {
      throw new Error("job failed: " + JSON.stringify(st));
    }
    process.stdout.write(".");
  }
  throw new Error("timed out after 20 minutes");
}

// Providers nest the result differently; find the first media URL anywhere in the payload.
function findUrl(obj) {
  const seen = [];
  JSON.stringify(obj, (k, v) => {
    if (typeof v === "string" && /^https?:\/\/\S+\.(png|jpe?g|webp|mp4|mov|webm|mp3|wav)(\?|$)/i.test(v)) seen.push(v);
    return v;
  });
  return seen[0];
}

async function download(url, dest) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`download ${url} -> ${r.status}`);
  writeFileSync(dest, Buffer.from(await r.arrayBuffer()));
  console.log("  saved", path.relative(HERE, dest));
}

async function keyframes() {
  for (const shot of SHOTS.shots) {
    const dest = path.join(BUILD, `key${PAD(shot.id)}.png`);
    if (existsSync(dest)) { console.log(`shot ${shot.id}: keyframe exists, skipping`); continue; }
    console.log(`shot ${shot.id}: generating keyframe`);
    const url = await hfJob(T2I, {
      prompt: shot.image,
      width: SHOTS.size[0], height: SHOTS.size[1],
      enhance_prompt: false,           // our prompts are already tuned; let them through verbatim
      seed: 1000 + shot.id,            // stable seeds so re-runs reproduce the same cast
    });
    await download(url, dest);
  }
}

async function clips() {
  for (const shot of SHOTS.shots) {
    const key  = path.join(BUILD, `key${PAD(shot.id)}.png`);
    const dest = path.join(BUILD, `clip${PAD(shot.id)}.mp4`);
    if (!existsSync(key)) throw new Error(`missing ${key} — run 'keyframes' first`);
    if (existsSync(dest)) { console.log(`shot ${shot.id}: clip exists, skipping`); continue; }
    console.log(`shot ${shot.id}: animating`);
    const url = await hfJob(I2V, {
      prompt: shot.video,
      input_image: await toDataUri(key),
      duration: Math.ceil(shot.dur),
      seed: 2000 + shot.id,
    });
    await download(url, dest);
  }
}

async function toDataUri(file) {
  return "data:image/png;base64," + readFileSync(file).toString("base64");
}

// Placeholder animatic: proves timing, subtitle burn and CJK rendering with zero API calls.
function animatic() {
  const bg = ["0x1a1730", "0x101014", "0x2a1520", "0x1d2436", "0x0d0d10", "0x2b0f12"];
  for (const shot of SHOTS.shots) {
    const dest = path.join(BUILD, `clip${PAD(shot.id)}.mp4`);
    const jp   = SHOTS.lines[shot.id] ?? "";
    const esc  = (s) => s.replace(/[\\:']/g, (c) => "\\" + c);
    const draw = [
      `drawtext=fontfile=${FONT_BOLD}:text='${esc(jp)}':fontcolor=white:fontsize=64:x=(w-tw)/2:y=h/2-380:line_spacing=28`,
      `drawtext=fontfile=${FONT}:text='SHOT ${shot.id}  ${shot.dur.toFixed(1)}s':fontcolor=0x888888:fontsize=38:x=(w-tw)/2:y=220`,
      `drawtext=fontfile=${FONT}:text='${esc(shot.video.slice(0, 58))}':fontcolor=0x666666:fontsize=28:x=(w-tw)/2:y=h-260`,
    ].join(",");
    sh("ffmpeg", ["-y", "-f", "lavfi", "-i",
      `color=c=${bg[shot.id - 1]}:s=${SHOTS.size[0]}x${SHOTS.size[1]}:d=${shot.dur}:r=${SHOTS.fps}`,
      "-vf", draw, "-pix_fmt", "yuv420p", dest]);
    console.log(`shot ${shot.id}: animatic card -> ${path.relative(HERE, dest)}`);
  }
}

function assemble() {
  const clips = SHOTS.shots.map((s) => path.join(BUILD, `clip${PAD(s.id)}.mp4`));
  clips.forEach((c) => { if (!existsSync(c)) throw new Error(`missing ${c} — run 'clips' or 'animatic' first`); });

  const args = ["-y"];
  clips.forEach((c) => args.push("-i", c));

  // Each clip is normalised to 9:16, clamped to exactly its scripted duration
  // (held on the last frame if the generator returned a short clip), then concatenated.
  const parts = SHOTS.shots.map((s, i) =>
    `[${i}:v]scale=${SHOTS.size[0]}:${SHOTS.size[1]}:force_original_aspect_ratio=increase,` +
    `crop=${SHOTS.size[0]}:${SHOTS.size[1]},fps=${SHOTS.fps},` +
    `tpad=stop_mode=clone:stop_duration=${s.dur},trim=0:${s.dur},setpts=PTS-STARTPTS[v${i}]`);
  const concat = SHOTS.shots.map((_, i) => `[v${i}]`).join("") + `concat=n=${clips.length}:v=1:a=0[cat]`;

  // Japanese VO is laid onto the timeline at scripted offsets when present.
  const vos = SHOTS.shots
    .map((s) => ({ s, f: path.join(BUILD, `vo${PAD(s.id)}.mp3`) }))
    .filter((x) => existsSync(x.f));
  let audio = [], amap = [];
  if (vos.length) {
    vos.forEach((x, k) => {
      args.push("-i", x.f);
      const idx = clips.length + k;
      const off = Math.round(offsetOf(x.s.id) * 1000);
      audio.push(`[${idx}:a]adelay=${off}|${off},apad[a${k}]`);
      amap.push(`[a${k}]`);
    });
    audio.push(`${amap.join("")}amix=inputs=${vos.length}:normalize=0,atrim=0:${SHOTS.total}[aout]`);
  }

  const subs = path.join(HERE, "subs.en.srt");
  const style = "FontName=Noto Sans CJK JP,Fontsize=17,PrimaryColour=&H00FFFFFF," +
                "OutlineColour=&H00000000,BorderStyle=1,Outline=3,Shadow=1,Alignment=2,MarginV=70";
  const filter = [...parts, concat, `[cat]subtitles=${subs}:force_style='${style}'[vout]`, ...audio].join(";");

  args.push("-filter_complex", filter, "-map", "[vout]");
  if (vos.length) args.push("-map", "[aout]", "-c:a", "aac", "-b:a", "192k");
  args.push("-c:v", "libx264", "-preset", "slow", "-crf", "18", "-pix_fmt", "yuv420p",
            "-r", String(SHOTS.fps), "-movflags", "+faststart",
            path.join(BUILD, "damare-roger.mp4"));
  sh("ffmpeg", args);
  console.log("\n->", path.relative(HERE, path.join(BUILD, "damare-roger.mp4")));
}

function offsetOf(id) {
  let t = 0;
  for (const s of SHOTS.shots) { if (s.id === id) return t; t += s.dur; }
  return 0;
}

mkdirSync(BUILD, { recursive: true });
const cmd = process.argv[2] ?? "help";
const table = { keyframes, clips, animatic, assemble };
if (!table[cmd]) { console.error("usage: node render.mjs keyframes|clips|animatic|assemble"); process.exit(1); }
await table[cmd]();
