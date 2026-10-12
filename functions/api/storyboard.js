// functions/api/storyboard.js  (Cloudflare Pages Function)
// Turns a short idea (Urdu / Hindi / Roman Urdu / English) into a full storyboard:
// characters, scenes, spoken lines, emotion, camera movement and camera angle.

// Note: @cf/meta/llama-3.1-8b-instruct was deprecated by Cloudflare (error 5028).
const MODELS = [
  "@cf/meta/llama-3.3-70b-instruct-fp8-fast",
  "@cf/meta/llama-4-scout-17b-16e-instruct",
  "@cf/mistral/mistral-small-3.1-24b-instruct"
];

const EMOTIONS = ["sad", "happy", "angry", "fear", "excited", "calm", "serious", "surprised", "loving", "neutral"];
const SHOTS = ["extreme_close_up", "close_up", "medium", "wide"];
const ANGLES = ["front", "side", "back", "over_shoulder", "low", "high"];
const CAMERAS = ["zoom_in", "zoom_out", "pan_left", "pan_right", "tilt_up", "tilt_down", "push_to_face", "pull_back", "static"];

const SYSTEM = `You are a master film director, cinematographer and screenwriter. You turn a short idea into a shot-by-shot storyboard for a short narrated video made of AI-generated still images with cinematic camera movement and emotional voice acting.

Understand the user's idea deeply. It may be written in Urdu, Hindi, Roman Urdu, Roman Hindi or English, with spelling mistakes. Where the idea is vague, decide the story, characters, setting, mood and emotional arc yourself, but never contradict what the user asked for.

Return ONLY valid JSON (no markdown, no comments, no text before or after) in exactly this shape:
{
  "title": "short title",
  "language": "ur" or "hi" or "en",
  "characters": [
    { "name": "name", "gender": "male" or "female" or "child", "look": "fixed English visual description: age, face, hair, clothes, colors" }
  ],
  "scenes": [
    {
      "speaker": "a character name, or Narrator",
      "line": "the words spoken in this scene",
      "emotion": "sad|happy|angry|fear|excited|calm|serious|surprised|loving|neutral",
      "shot": "extreme_close_up|close_up|medium|wide",
      "angle": "front|side|back|over_shoulder|low|high",
      "camera": "zoom_in|zoom_out|pan_left|pan_right|tilt_up|tilt_down|push_to_face|pull_back|static",
      "image_prompt": "English, 40 to 80 words, exactly what the camera sees"
    }
  ]
}

Rules:
1. Produce exactly the requested number of scenes, forming a clear story with beginning, middle and end, and an emotional arc.
2. "line" must be in the same language as the user's idea. Urdu must be written in Urdu script, Hindi in Devanagari script. Never write Urdu or Hindi in Roman letters. Lines are natural, emotional, 8 to 25 words, only spoken words (no stage directions, no emojis, no speaker names inside the line).
3. "emotion" must match the meaning of the line (sad words = sad, joyful words = happy, and so on) and should change along the story.
4. Camera movement must serve the drama: push_to_face or zoom_in for emotional, sad or intense moments; zoom_out or pull_back for reveals, loneliness and endings; pan_left or pan_right for journeys, walking and showing places; tilt_up for hope, greatness and power; tilt_down for sadness and defeat; static for calm moments. Do not use the same camera move more than twice in a row.
5. "angle" is where the camera stands relative to the character: front (face visible, best for speaking and emotion), side, back (character seen from behind, walking away or looking at the view), over_shoulder (conversations), low (power), high (small or vulnerable). Use variety, but a close-up of a speaking face should be front or side.
6. "image_prompt": begin with the shot type and angle in words, then the subject. Whenever a character appears, copy that character's "look" text word for word so the character stays consistent in every scene. Then describe action, facial expression matching the emotion, setting, lighting, time of day and mood. Never ask for text, letters, logos or watermarks in the image. Do not name an art style. Do not use quotation marks.
7. Keep the world, clothes and characters consistent across scenes.
8. Stay respectful of religion and culture. No graphic violence, no sexual content.`;

function pick(v, list, fallback) {
  const s = String(v || "").toLowerCase().trim().replace(/[\s-]+/g, "_");
  return list.includes(s) ? s : fallback;
}

function extractJSON(res) {
  let raw = res && (res.response ?? res.result ?? res.choices?.[0]?.message?.content ?? res.choices?.[0]?.text ?? "");
  if (raw && typeof raw === "object") return raw;
  raw = String(raw).replace(/```json|```/gi, "").trim();
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("No JSON in model output");
  return JSON.parse(raw.slice(start, end + 1));
}

function normalize(sb, n, langPref) {
  const scenes = (Array.isArray(sb.scenes) ? sb.scenes : [])
    .map((s) => ({
      speaker: String(s.speaker || "Narrator").trim() || "Narrator",
      line: String(s.line || "").trim(),
      emotion: pick(s.emotion, EMOTIONS, "neutral"),
      shot: pick(s.shot, SHOTS, "medium"),
      angle: pick(s.angle, ANGLES, "front"),
      camera: pick(s.camera, CAMERAS, "zoom_in"),
      image_prompt: String(s.image_prompt || "").trim()
    }))
    .filter((s) => s.line && s.image_prompt)
    .slice(0, n);
  if (scenes.length < 2) throw new Error("Storyboard was too short");

  const characters = (Array.isArray(sb.characters) ? sb.characters : [])
    .map((c) => ({
      name: String(c.name || "").trim(),
      gender: pick(c.gender, ["male", "female", "child"], "male"),
      look: String(c.look || "").trim()
    }))
    .filter((c) => c.name);

  const language = langPref && langPref !== "auto" ? langPref : pick(sb.language, ["ur", "hi", "en"], "en");
  return { title: String(sb.title || "My Video").trim(), language, characters, scenes };
}

export async function onRequestPost({ request, env }) {
  try {
    if (!env.AI) return Response.json({ error: "AI binding missing." }, { status: 500 });

    const body = await request.json().catch(() => ({}));
    const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
    if (!prompt) return Response.json({ error: "Please write your video idea." }, { status: 400 });
    if (prompt.length > 3000) return Response.json({ error: "Idea is too long (max 3000 characters)." }, { status: 400 });

    const n = Math.min(10, Math.max(3, parseInt(body.scenes, 10) || 6));
    const langPref = ["ur", "hi", "en"].includes(body.language) ? body.language : "auto";
    const langNote =
      langPref === "auto"
        ? "Detect the language of the idea and write the spoken lines in that language."
        : `Write all spoken lines in this language: ${langPref === "ur" ? "Urdu (Urdu script)" : langPref === "hi" ? "Hindi (Devanagari)" : "English"}.`;

    const userMsg = `Number of scenes: ${n}\n${langNote}\nVideo idea: ${prompt}`;

    const errors = [];
    for (const model of MODELS) {
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          const res = await env.AI.run(model, {
            messages: [
              { role: "system", content: SYSTEM },
              { role: "user", content: userMsg }
            ],
            max_tokens: 3500,
            temperature: attempt === 0 ? 0.7 : 0.4
          });
          const storyboard = normalize(extractJSON(res), n, langPref);
          return Response.json({ storyboard, model });
        } catch (err) {
          const msg = String(err?.message || err).slice(0, 160);
          errors.push(`${model.split("/").pop()}: ${msg}`);
          console.warn(`Storyboard ${model} attempt ${attempt + 1} failed:`, msg);
          // Model band/missing hai to dobara try karne ka faida nahi, agle model par jao
          if (/deprecat|not found|no such model|5028|5007/i.test(msg)) break;
        }
      }
    }
    // Asli wajah user ko dikhao taake debug ho sake
    throw new Error("Storyboard failed. " + errors.slice(-3).join(" | "));
  } catch (error) {
    console.error("Storyboard error:", error);
    return Response.json({ error: error?.message || "Storyboard failed." }, { status: 500 });
  }
}
