// functions/api/generate.js  (Cloudflare Pages Function)
// Upgrade: Urdu/Roman Urdu/Hindi prompt -> English detailed prompt (LLM),
// better image model with fallback, proper sizes, quality boosters.

const ENHANCER_MODEL = "@cf/meta/llama-3.1-8b-instruct";

// Pehle model best quality / prompt-following ke liye, baad wale fallback hain.
// Agar koi model aapke account me na chale to wo khud skip ho jayega.
const IMAGE_MODELS = [
  { id: "@cf/leonardo/phoenix-1.0", type: "sized", steps: 25, guidance: 5 },
  { id: "@cf/leonardo/lucid-origin", type: "sized", steps: 25, guidance: 5 },
  { id: "@cf/black-forest-labs/flux-1-schnell", type: "flux", steps: 8 }
];

const STYLES = {
  "Realistic": "photorealistic, shot on a full-frame camera, 85mm lens, natural realistic lighting, sharp focus, fine skin and material texture, high detail",
  "3D Animation": "high quality 3D animated movie style, Pixar-like rendering, soft global illumination, expressive characters, polished materials",
  "Cartoon": "colorful cartoon illustration, clean outlines, vibrant flat colors, playful shapes",
  "Anime": "high quality anime illustration, clean line art, detailed eyes, cel shading, vibrant colors, studio-grade background",
  "Islamic Art": "beautiful Islamic geometric art and architecture, intricate arabesque patterns, symmetrical, gold and deep blue palette, respectful and elegant",
  "Islamic Calligraphy": "ornamental Islamic calligraphy inspired artwork, flowing elegant strokes, gold ink on deep dark background, decorative frame, respectful and elegant",
  "Cinematic": "cinematic film still, dramatic lighting, anamorphic lens, shallow depth of field, rich color grading, volumetric light",
  "Fantasy": "epic fantasy concept art, magical atmosphere, intricate details, painterly, dramatic lighting",
  "Nature": "stunning natural landscape photography, golden hour light, rich colors, ultra detailed, atmospheric depth",
  "Logo": "clean modern vector logo design, centered, simple bold shapes, flat colors, plain solid background, professional branding",
  "Product Photography": "professional product photography, studio softbox lighting, clean seamless background, crisp focus, commercial advertising quality",
  "Digital Art": "high quality digital illustration, detailed, polished, trending on ArtStation",
  "Watercolor": "delicate watercolor painting, soft washes, paper texture, flowing pigments",
  "Oil Painting": "traditional oil painting, visible brush strokes, rich texture, museum quality",
  "Pixel Art": "detailed pixel art, crisp pixels, limited color palette, retro game style",
  "Cute 3D Character": "adorable stylized 3D character, big expressive eyes, soft rounded shapes, smooth materials, soft studio lighting",
  "Architecture": "architectural visualization, accurate perspective, realistic materials, natural daylight, ultra detailed render",
  "Comic Book": "comic book illustration, bold ink lines, halftone shading, dynamic composition, vivid colors"
};

const SIZES = {
  square:    { width: 1024, height: 1024, text: "square composition" },
  portrait:  { width: 768,  height: 1344, text: "vertical 9:16 portrait composition" },
  landscape: { width: 1344, height: 768,  text: "horizontal 16:9 wide landscape composition" }
};

const QUALITY_TAIL =
  "masterpiece, best quality, sharp focus, well-composed, correct anatomy, clean details, professional finish";

// Negative prompt (sirf un models ke liye jo support karte hain)
const NEGATIVE =
  "blurry, low quality, low resolution, deformed, distorted, bad anatomy, extra fingers, extra limbs, " +
  "malformed hands, cropped, out of frame, watermark, signature, jpeg artifacts, gibberish text, duplicate subject";

const ENHANCER_SYSTEM = `You are an expert prompt engineer for text-to-image models.
The user's idea may be written in English, Urdu, Hindi, Roman Urdu or Roman Hindi, possibly with spelling mistakes.
Understand the idea, then write ONE detailed English image prompt.

Rules:
- Keep EVERY subject, object, color, number, place and action the user mentioned. Never drop or change them.
- Do not add new main subjects the user did not ask for.
- Describe clearly: main subject, appearance, pose/action, setting, background, lighting, mood, camera angle, color palette.
- Write natural descriptive sentences/phrases, 60 to 110 words.
- Do NOT include any text, letters or words to be drawn in the image unless the user explicitly asked for text; if they did, put the exact text in quotes.
- Do NOT mention style names or aspect ratio (they are added separately).
- Output ONLY the final prompt. No quotes, no explanations, no labels.`;

function json(data, status = 200) {
  return Response.json(data, { status });
}

function bytesToBase64(bytes) {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

// Different Workers AI models return different shapes. Sab ko base64 me badal do.
async function extractBase64(result) {
  if (!result) return null;
  if (typeof result === "string") return result;
  if (typeof result.image === "string") return result.image;
  if (result instanceof ReadableStream) {
    const buf = await new Response(result).arrayBuffer();
    return bytesToBase64(new Uint8Array(buf));
  }
  if (result instanceof ArrayBuffer) return bytesToBase64(new Uint8Array(result));
  if (result instanceof Uint8Array) return bytesToBase64(result);
  if (result instanceof Response) {
    return bytesToBase64(new Uint8Array(await result.arrayBuffer()));
  }
  return null;
}

function mimeFromBase64(b64) {
  if (b64.startsWith("iVBOR")) return "image/png";
  if (b64.startsWith("UklGR")) return "image/webp";
  return "image/jpeg";
}

async function enhancePrompt(env, userPrompt) {
  try {
    const res = await Promise.race([
      env.AI.run(ENHANCER_MODEL, {
        messages: [
          { role: "system", content: ENHANCER_SYSTEM },
          { role: "user", content: userPrompt }
        ],
        max_tokens: 280,
        temperature: 0.4
      }),
      new Promise((_, rej) => setTimeout(() => rej(new Error("enhancer timeout")), 15000))
    ]);
    let text = (res && (res.response || res.result || "")).toString().trim();
    text = text.replace(/^["'`\s]+|["'`\s]+$/g, "");
    // Agar model ne extra label likh diya ho to hata do
    text = text.replace(/^(prompt|image prompt|final prompt)\s*:\s*/i, "");
    if (text.length < 15 || text.length > 1500) return userPrompt;
    return text;
  } catch (e) {
    console.warn("Prompt enhancer failed, using original prompt:", e?.message || e);
    return userPrompt;
  }
}

async function runModel(env, model, fullPrompt, size) {
  let input;
  if (model.type === "sized") {
    input = {
      prompt: fullPrompt,
      negative_prompt: NEGATIVE,
      width: size.width,
      height: size.height,
      num_steps: model.steps,
      guidance: model.guidance
    };
  } else {
    // flux-1-schnell: negative prompt/size support nahi, isliye composition text prompt me hai
    input = { prompt: fullPrompt.slice(0, 2000), steps: model.steps };
  }
  const result = await env.AI.run(model.id, input);
  const b64 = await extractBase64(result);
  if (!b64) throw new Error("Model returned no image.");
  return b64;
}

export async function onRequestPost({ request, env }) {
  try {
    if (!env.AI) {
      return json({ error: "AI binding missing. Check Cloudflare Settings > Bindings." }, 500);
    }

    const body = await request.json().catch(() => ({}));
    const userPrompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
    if (!userPrompt) return json({ error: "Please enter an image prompt." }, 400);
    if (userPrompt.length > 2000) return json({ error: "Prompt is too long (max 2000 characters)." }, 400);

    const styleText = STYLES[body.style] || STYLES["Digital Art"];
    const size = SIZES[body.size] || SIZES.square;

    // 1) Prompt ko English + detailed banao
    // Video Studio already sends a finished English prompt, so it can skip the enhancer.
    const enhanced = body.skipEnhance ? userPrompt : await enhancePrompt(env, userPrompt);

    // 2) Subject sab se pehle, phir style, composition, quality
    const fullPrompt = `${enhanced}. Style: ${styleText}. ${size.text}. ${QUALITY_TAIL}`;

    // 3) Models ko order me try karo
    let lastError = null;
    for (const model of IMAGE_MODELS) {
      try {
        const b64 = await runModel(env, model, fullPrompt, size);
        return json({
          image: `data:${mimeFromBase64(b64)};base64,${b64}`,
          model: model.id,
          enhancedPrompt: enhanced
        });
      } catch (err) {
        lastError = err;
        console.warn(`Model ${model.id} failed:`, err?.message || err);
      }
    }

    throw lastError || new Error("All image models failed.");
  } catch (error) {
    console.error("Zvarik AI generation error:", error);
    return json({ error: error?.message || "Unknown error while generating image." }, 500);
  }
}
