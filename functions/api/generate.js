
export async function onRequestPost({ request, env }) {
  try {
    if (!env.AI) {
      return Response.json(
        { error: "AI binding missing. Check Cloudflare Settings > Bindings." },
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

    const styles = {
      "Realistic": "photorealistic, realistic lighting, highly detailed",
      "3D Animation": "high quality 3D animated movie style",
      "Cartoon": "colorful cartoon illustration",
      "Anime": "anime illustration",
      "Islamic Art": "beautiful Islamic geometric art and architecture",
      "Islamic Calligraphy": "ornamental Islamic calligraphy inspired artwork",
      "Cinematic": "cinematic composition, dramatic lighting",
      "Fantasy": "fantasy concept art, magical atmosphere",
      "Nature": "beautiful natural landscape",
      "Logo": "clean logo concept, centered design",
      "Product Photography": "professional product photography, studio lighting",
      "Digital Art": "high quality digital illustration",
      "Watercolor": "watercolor painting",
      "Oil Painting": "traditional oil painting",
      "Pixel Art": "detailed pixel art",
      "Cute 3D Character": "adorable stylized 3D character",
      "Architecture": "architectural visualization",
      "Comic Book": "comic book illustration, bold ink lines"
    };

    const sizeText = {
      square: "square composition",
      portrait: "vertical portrait composition",
      landscape: "horizontal landscape composition"
    };

    const styleText = styles[style] || styles["Digital Art"];
    const aspectText = sizeText[size] || sizeText.square;

    const result = await env.AI.run(
      "@cf/black-forest-labs/flux-1-schnell",
      {
        prompt: `${prompt.trim()}, ${styleText}, ${aspectText}`,
        steps: 4
      }
    );

    if (!result || !result.image) {
      throw new Error("The AI model returned no image.");
    }

    return Response.json({
      image: `data:image/jpeg;base64,${result.image}`
    });

  } catch (error) {
    console.error("Zvarik AI generation error:", error);

    return Response.json(
      {
        error: error?.message ||
          "Unknown error while generating image."
      },
      { status: 500 }
    );
  }
}
