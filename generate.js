// functions/api/generate.js  (Cloudflare Pages Function)
// Images: Gemini pehle (Cloudflare neurons use nahi hote), phir Cloudflare fallback.

const ENHANCER_MODELS = [
  "@cf/meta/llama-3.1-8b-instruct-fp8",
  "@cf/meta/llama-3.3-70b-instruct-fp8-fast"
];

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

const GEMINI_RATIOS = { square: "1:1", portrait: "9:16", landscape: "16:9" };

const QUALITY_TAIL =
  "masterpiece, best quality, sharp focus, well-composed, correct anatomy, clean details, professional finish";

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

function readText(res) {
  if (!res) return "";
  const t = res.response ?? res.result ?? res.choices?.[0]?.message?.content ?? res.choices?.[0]?.text ?? "";
  return (typeof t === "string" ? t : JSON.stringify(t)).trim();
}

function cleanEnhanced(text) {
  text = String(text || "").trim().replace(/^["'`\s]+|["'`\s]+$/g, "");
  text = text.replace(/^(prompt|image prompt|final prompt)\s*:\s*/i, "");
  return text.length >= 15 && text.length <= 1500 ? text : null;
}

async function enhanceWithGemini(env, userPrompt) {
  const models = [env.GEMINI_TEXT_MODEL, "gemini-3.5-flash-lite"].filter(Boolean);
  for (const m of models) {
    try {
      const res = await Promise.race([
        fetch(`https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-goog-api-key": env.GEMINI_API_KEY },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: ENHANCER_SYSTEM }] },
            contents: [{ role: "user", parts: [{ text: userPrompt }] }],
            generationConfig: { temperature: 0.4, maxOutputTokens: 1000 }
          })
        }),
        new Promise((_, rej) => setTimeout(() => rej(new Error("gemini timeout")), 20000))
      ]);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error?.message || `HTTP ${res.status}`);
      const text = cleanEnhanced((data?.candidates?.[0]?.content?.parts || []).map((p) => p.text || "").join(""));
      if (text) return text;
    } catch (e) {
      console.warn(`Gemini enhancer ${m} failed:`, e?.message || e);
    }
  }
  return null;
}

async function enhancePrompt(env, userPrompt) {
  if (env.GEMINI_API_KEY) {
    const g = await enhanceWithGemini(env, userPrompt);
    if (g) return g;
  }
  if (!env.AI) return userPrompt;
  for (const model of ENHANCER_MODELS) {
    try {
      const res = await Promise.race([
        env.AI.run(model, {
          messages: [
            { role: "system", content: ENHANCER_SYSTEM },
            { role: "user", content: userPrompt }
          ],
          max_tokens: 280,
          temperature: 0.4
        }),
        new Promise((_, rej) => setTimeout(() => rej(new Error("enhancer timeout")), 20000))
      ]);
      const text = cleanEnhanced(readText(res));
      if (text) return text;
    } catch (e) {
      console.warn(`Prompt enhancer ${model} failed:`, e?.message || e);
    }
  }
  return userPrompt;
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
    input = { prompt: fullPrompt.slice(0, 2000), steps: model.steps };
  }
  const result = await env.AI.run(model.id, input);
  const b64 = await extractBase64(result);
  if (!b64) throw new Error("Model returned no image.");
  return b64;
}

// ---- Gemini image generation (Cloudflare neurons use nahi karta) ----
async function generateWithGemini(env, fullPrompt, sizeKey) {
  const models = [env.GEMINI_IMAGE_MODEL, "gemini-2.5-flash-image"]
    .filter((m, i, a) => m && a.indexOf(m) === i);
  let lastErr = null;
  for (const model of models) {
    try {
      const res = await Promise.race([
        fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-goog-api-key": env.GEMINI_API_KEY },
          body: JSON.stringify({
            contents: [{ role: "user", parts: [{ text: fullPrompt }] }],
            generationConfig: {
              responseModalities: ["IMAGE"],
              imageConfig: { aspectRatio: GEMINI_RATIOS[sizeKey] || "1:1" }
            }
          })
        }),
        new Promise((_, rej) => setTimeout(() => rej(new Error("gemini image timeout")), 60000))
      ]);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(`${model}: ${data?.error?.message || "HTTP " + res.status}`);
      const part = (data?.candidates?.[0]?.content?.parts || []).find((p) => p.inlineData?.data);
      if (!part) throw new Error(`${model}: image nahi mili (safety filter ya quota)`);
      const mime = part.inlineData.mimeType || "image/png";
      return { image: `data:${mime};base64,${part.inlineData.data}`, model };
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr || new Error("Gemini image failed");
}

export async function onRequestPost({ request, env }) {
  try {
    if (!env.AI && !env.GEMINI_API_KEY) {
      return json({ error: "Na AI binding hai na GEMINI_API_KEY. Settings check karein." }, 500);
    }

    const body = await request.json().catch(() => ({}));
    const userPrompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
    if (!userPrompt) return json({ error: "Please enter an image prompt." }, 400);
    if (userPrompt.length > 2000) return json({ error: "Prompt is too long (max 2000 characters)." }, 400);

    const styleText = STYLES[body.style] || STYLES["Digital Art"];
    const sizeKey = SIZES[body.size] ? body.size : "square";
    const size = SIZES[sizeKey];

    const enhanced = body.skipEnhance ? userPrompt : await enhancePrompt(env, userPrompt);
    const fullPrompt = `${enhanced}. Style: ${styleText}. ${size.text}. ${QUALITY_TAIL}`;

    const errors = [];

    // 1) Pehle Gemini
    if (env.GEMINI_API_KEY) {
      try {
        const g = await generateWithGemini(env, fullPrompt, sizeKey);
        return json({ image: g.image, model: g.model, enhancedPrompt: enhanced });
      } catch (err) {
        errors.push("Gemini " + (err?.message || err));
        console.warn("Gemini image failed:", err?.message || err);
      }
    }

    // 2) Phir Cloudflare
    if (env.AI) {
      const high = body.quality === "high";
      const models = high ? IMAGE_MODELS : IMAGE_MODELS.filter((m) => m.type === "flux");
      for (const model of models) {
        try {
          const b64 = await runModel(env, model, fullPrompt, size);
          return json({
            image: `data:${mimeFromBase64(b64)};base64,${b64}`,
            model: model.id,
            enhancedPrompt: enhanced
          });
        } catch (err) {
          errors.push("Cloudflare " + (err?.message || err));
          console.warn(`Model ${model.id} failed:`, err?.message || err);
        }
      }
    }

    throw new Error(errors.join(" || ") || "All image models failed.");
  } catch (error) {
    console.error("Zvarik AI generation error:", error);
    let message = error?.message || "Unknown error while generating image.";
    if (/4006|daily free allocation/i.test(message)) {
      message = "Cloudflare ki free limit khatam hai (subah 5 baje reset). " + message.slice(0, 300);
    }
    return json({ error: message.slice(0, 600) }, 500);
  }
}
