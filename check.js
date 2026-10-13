// functions/api/check.js  (Cloudflare Pages Function)
// Open  https://YOUR-SITE.pages.dev/api/check  in the browser to see what the server can use.
// It never prints the key itself.

async function testGemini(url, key) {
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify({ contents: [{ parts: [{ text: "Reply with the single word: ok" }] }] })
    });
    const data = await res.json().catch(() => ({}));
    return {
      ok: res.ok,
      status: res.status,
      message: res.ok
        ? "works"
        : String(data?.error?.message || data?.error?.status || "failed").slice(0, 200)
    };
  } catch (e) {
    return { ok: false, status: 0, message: String(e?.message || e).slice(0, 200) };
  }
}

async function testGeminiImage(model, key) {
  try {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify({
        contents: [{ parts: [{ text: "a small red apple on a white table" }] }],
        generationConfig: { responseModalities: ["IMAGE"] }
      })
    });
    const data = await res.json().catch(() => ({}));
    const hasImage = !!(data?.candidates?.[0]?.content?.parts || []).find((p) => p.inlineData?.data);
    return {
      ok: res.ok && hasImage,
      status: res.status,
      message: res.ok ? (hasImage ? "works" : "no image returned") : String(data?.error?.message || "failed").slice(0, 250)
    };
  } catch (e) {
    return { ok: false, status: 0, message: String(e?.message || e).slice(0, 200) };
  }
}

export async function onRequestGet({ env }) {
  const key = env.GEMINI_API_KEY || "";
  const out = {
    ai_binding: !!env.AI,
    gemini_key_present: !!key,
    gemini_key_looks_like: !key ? "missing" : key.startsWith("AIza") ? "AI Studio key (AIza...)" : key.startsWith("AQ.") ? "AQ. key (Vertex style)" : "other format",
    gemini_key_length: key.length
  };

  if (key) {
    const textModel = env.GEMINI_TEXT_MODEL || "gemini-3.5-flash-lite";
    out.gemini_text_model = textModel;
    out.gemini_text_test = await testGemini(
      `https://generativelanguage.googleapis.com/v1beta/models/${textModel}:generateContent`,
      key
    );
    const imageModel = env.GEMINI_IMAGE_MODEL || "gemini-2.5-flash-image";
    out.gemini_image_model = imageModel;
    out.gemini_image_test = await testGeminiImage(imageModel, key);
  }

  return new Response(JSON.stringify(out, null, 2), {
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }
  });
}
