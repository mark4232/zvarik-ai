// functions/api/tts.js  (Cloudflare Pages Function)
// Emotional voice using Gemini TTS. Returns a WAV file.
// Needs a secret named GEMINI_API_KEY (Cloudflare Pages > Settings > Variables and Secrets).
// Optional: GEMINI_TTS_MODEL to override the model name.

const VOICES = ["Kore", "Aoede", "Zephyr", "Leda", "Charon", "Orus", "Puck", "Fenrir"];

const EMOTION_STYLE = {
  sad: "in a sad, soft, slow voice, with sorrow and a slight tremble",
  happy: "in a happy, bright, warm and smiling voice",
  angry: "in an angry, intense and forceful voice",
  fear: "in a scared, trembling, whispery voice",
  excited: "in an excited, energetic and lively voice",
  calm: "in a calm, gentle and peaceful voice",
  serious: "in a serious, firm and deep voice",
  surprised: "in a surprised, wide-eyed voice",
  loving: "in a loving, tender and caring voice",
  neutral: "in a natural, clear storytelling voice"
};

function b64ToBytes(b64) {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function pcmToWav(pcm, rate) {
  const header = new ArrayBuffer(44);
  const v = new DataView(header);
  const w = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  w(0, "RIFF"); v.setUint32(4, 36 + pcm.length, true); w(8, "WAVE");
  w(12, "fmt "); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, rate, true); v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  w(36, "data"); v.setUint32(40, pcm.length, true);
  const out = new Uint8Array(44 + pcm.length);
  out.set(new Uint8Array(header), 0);
  out.set(pcm, 44);
  return out;
}

function err(message, status = 500) {
  return Response.json({ error: message }, { status });
}

export async function onRequestPost({ request, env }) {
  try {
    if (!env.GEMINI_API_KEY) {
      return err("GEMINI_API_KEY is missing. Add it in Cloudflare Pages > Settings > Variables and Secrets, then redeploy.");
    }

    const body = await request.json().catch(() => ({}));
    const text = typeof body.text === "string" ? body.text.trim() : "";
    if (!text) return err("No text to speak.", 400);
    if (text.length > 700) return err("Line is too long (max 700 characters).", 400);

    const voice = VOICES.includes(body.voice) ? body.voice : "Charon";
    const style = EMOTION_STYLE[body.emotion] || EMOTION_STYLE.neutral;
    // Models are tried in order; if one is unavailable or rate limited, the next one is used.
    const models = [env.GEMINI_TTS_MODEL, "gemini-3.8-flash-tts", "gemini-3.8-flash-lite-tts", "gemini-2.5-flash-preview-tts"]
      .filter((m, i, a) => m && a.indexOf(m) === i);

    let data = null, lastStatus = 502, lastMsg = "", part = null;
    for (const model of models) {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-goog-api-key": env.GEMINI_API_KEY },
          body: JSON.stringify({
            contents: [{ parts: [{ text: `Say ${style}: ${text}` }] }],
            generationConfig: {
              responseModalities: ["AUDIO"],
              speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } } }
            }
          })
        }
      );
      data = await res.json().catch(() => ({}));
      if (!res.ok) {
        lastStatus = res.status === 429 ? 429 : 502;
        lastMsg = `${model}: ${data?.error?.message || res.status}`;
        continue;
      }
      part = data?.candidates?.[0]?.content?.parts?.find((p) => p.inlineData);
      if (part) break;
      lastStatus = 502; lastMsg = `${model}: no audio returned`;
    }
    if (!part) return err(`Gemini TTS failed. ${lastMsg}`.slice(0, 300), lastStatus);

    const rate = parseInt(/rate=(\d+)/.exec(part.inlineData.mimeType || "")?.[1] || "24000", 10);
    const wav = pcmToWav(b64ToBytes(part.inlineData.data), rate);

    return new Response(wav, { headers: { "Content-Type": "audio/wav", "Cache-Control": "no-store" } });
  } catch (e) {
    console.error("TTS error:", e);
    return err(e?.message || "Voice generation failed.");
  }
}
