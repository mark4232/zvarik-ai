
export async function onRequestPost({ request, env }) {
  try {
    const { prompt, style, size } = await request.json();

    if (typeof prompt !== "string" || !prompt.trim()) {
      return Response.json(
        { error: "Please enter an image prompt." },
        { status: 400 }
      );
    }

    if (prompt.length > 1800) {
      return Response.json(
        { error: "Prompt is too long. Please shorten it." },
        { status: 400 }
      );
    }

    const styles = {
      "Realistic": "photorealistic, highly detailed",
      "3D Cartoon": "high-quality 3D cartoon style",
      "Anime": "beautiful anime illustration",
      "Islamic Art": "intricate Islamic geometric art",
      "Cinematic": "cinematic lighting, dramatic composition",
      "Fantasy": "fantasy art, magical atmosphere"
    };

    const styleText = styles[style] || "high-quality digital art";
const dimensions = {
  square: { width: 1024, height: 1024 },
  portrait: { width: 768, height: 1152 },
  landscape: { width: 1152, height: 768 }
};

const imageSize = dimensions[size] || dimensions.square;
    const result = await env.AI.run(
      "@cf/black-forest-labs/flux-1-schnell",
      {
        prompt: `${prompt.trim()}, ${styleText}`,
        steps: 4,
...imageSize
      }
    );

    if (!result || !result.image) {
      throw new Error("No image returned by the AI model.");
    }

    return Response.json({
      image: `data:image/jpeg;base64,${result.image}`
    });
  } catch (error) {
    return Response.json(
      {
        error: "Image generation failed. Check your AI binding, model availability, and usage limits."
      },
      { status: 500 }
    );
  }
}
