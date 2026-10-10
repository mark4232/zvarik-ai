
export async function onRequestPost({ request, env }) {
  try {
    if (!env.AI) {
      return Response.json(
        { error: "AI binding is missing. Check Cloudflare Workers AI settings." },
        { status: 500 }
      );
    }

    const body = await request.json();
    const prompt = body.prompt;
    const style = body.style;
    const size = body.size;

    if (typeof prompt !== "string" || !prompt.trim()) {
      return Response.json(
        { error: "Please enter an image prompt." },
        { status: 400 }
      );
    }

    if (prompt.length > 1800) {
      return Response.json(
        { error: "Your prompt is too long. Please shorten it." },
        { status: 400 }
      );
    }

    const styles = {
      "Realistic": "photorealistic, realistic lighting, highly detailed",
      "3D Animation": "high quality 3D animated movie style, polished 3D render",
      "Cartoon": "colorful cartoon illustration",
      "Anime": "anime illustration, expressive characters",
      "Islamic Art": "beautiful Islamic geometric art, elegant architecture, respectful visual composition",
      "Islamic Calligraphy": "ornamental Islamic calligraphy inspired artwork, intricate decorative composition",
      "Cinematic": "cinematic composition, dramatic lighting, film still",
      "Fantasy": "fantasy concept art, magical atmosphere",
      "Nature": "beautiful natural landscape, detailed environment",
      "Logo": "clean logo concept, centered design, simple background",
      "Product Photography": "professional product photography, studio lighting",
      "Digital Art": "high quality digital illustration",
      "Watercolor": "watercolor painting, delicate brush textures",
      "Oil Painting": "traditional oil painting, rich brush strokes",
      "Pixel Art": "detailed pixel art, crisp pixel edges",
      "Cute 3D Character": "adorable stylized 3D character, expressive face",
      "Architecture": "architectural visualization, detailed building design",
      "Comic Book": "comic book illustration, bold ink lines"
    };

    const dimensions = {
      square: { width: 1024, height: 1024 },
      portrait: { width: 768, height: 1152 },
      landscape: { width: 1152, height: 768 }
    };

    const styleText = styles[style] || styles["Digital Art"];
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
      throw new Error("The model returned no image.");
    }

    return Response.json({
      image: `data:image/jpeg;base64,${result.image}`
    });

  } catch (error) {
    return Response.json(
      {
        error: "Image generation failed. Check your Cloudflare AI binding, model availability, image dimensions, and usage limits."
      },
      { status: 500 }
    );
  }
}
