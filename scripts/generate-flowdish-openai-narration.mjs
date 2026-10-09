import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import OpenAI from "openai";

const apiKey = process.env.FLOWDISHVID4;

if (!apiKey) {
  throw new Error("FLOWDISHVID4 is not set in this terminal.");
}

const client = new OpenAI({ apiKey });
const voice = process.env.FLOWDISH_TTS_VOICE || "marin";
const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDir, "..");
const outputDir = path.join(
  projectRoot,
  "artifacts",
  "flowdish-promo",
  "narration-openai-v4",
);

const voiceDirection = [
  "Use a warm, natural, modern Irish English accent.",
  "Sound like an experienced restaurant consultant speaking to an owner or chef.",
  "Keep the delivery conversational, confident and measured, never theatrical or robotic.",
  "Use natural sentence rhythm and brief pauses between ideas.",
  "Pronounce 'hassup' as the common spoken form of HACCP, and 'skew' as the spoken form of SKU.",
].join(" ");

const lines = {
  intro:
    "Flowdish brings margin, stock and food safety into one operating system.",
  prices:
    "Start with current supplier prices. Upload the file, review every proposed change, and catch price drift before it reaches the menu.",
  bom:
    "Build dishes from ingredients, yield and portion size, with a live cost at every level. Use your own recipes, or start with Coco's proven menus.",
  sop:
    "One click turns the recipe into an interactive S O P. It reads aloud, pauses and repeats hands free while the chef prepares the dish.",
  forecast:
    "Forecast tomorrow's menu. Flowdish plans the prep, allocates first in, first out batches, and turns stock shortfalls into an order list ready to paste.",
  delivery:
    "At the back door, photograph the docket. A I matches your skew codes, checks price and V A T, then updates inventory after review.",
  dashboard:
    "Import the till readout, and sales feed back into stock and margin. The dashboard highlights profit, shortages and expiring batches before they become waste.",
  login: "On the floor, each chef enters with a private pin.",
  prep_intro:
    "During prep, say what was made, then add the hassup time and temperature checks.",
  prep_outro: "Flowdish drafts the batch, yield and expiry for approval.",
  waste_intro: "For waste, say the item, amount and reason.",
  waste_outro:
    "Stock changes only after approval, so every loss becomes measurable.",
  points:
    "Monthly points make good recording visible and help teams build the habit.",
  cold:
    "Cold storage probes and manual checks keep hassup evidence together, with live history ready when you need it.",
  outro: "Flowdish. Know every cost. Track every batch. Prove every check.",
};

const sampleOnly = process.argv.includes("--sample");
const selectedLines = sampleOnly
  ? {
      "voice-test":
        "Flowdish matches your skew codes and keeps your hassup evidence together. Know every cost. Track every batch. Prove every check.",
    }
  : lines;

await fs.mkdir(outputDir, { recursive: true });
const targetDir = sampleOnly ? path.join(outputDir, "samples") : outputDir;
await fs.mkdir(targetDir, { recursive: true });

for (const [name, input] of Object.entries(selectedLines)) {
  try {
    console.log(`Requesting '${name}' with voice '${voice}'...`);
    const response = await client.audio.speech.create({
      model: "gpt-4o-mini-tts",
      voice,
      input,
      instructions: voiceDirection,
      response_format: "mp3",
    });

    const fileName = sampleOnly ? `${name}-${voice}.mp3` : `${name}.mp3`;
    const target = path.join(targetDir, fileName);
    await fs.writeFile(target, Buffer.from(await response.arrayBuffer()));
    console.log(`Generated ${target} with voice '${voice}'.`);
  } catch (error) {
    const status = error?.status ? `HTTP ${error.status}` : "API error";
    console.error(`OpenAI speech generation failed (${status}).`);
    console.error(error?.message || error);
    if (error?.cause) {
      console.error("Underlying connection error:");
      console.error(error.cause?.message || error.cause);
      if (error.cause?.code) {
        console.error(`Connection code: ${error.cause.code}`);
      }
    }

    if (error?.status === 401) {
      console.error("The FLOWDISHVID4 key was rejected. Create or copy a valid project API key.");
    } else if (error?.status === 403) {
      console.error("The key or project does not have permission to use the Audio Speech API.");
    } else if (error?.status === 429) {
      console.error("Check the selected OpenAI project's API credit, billing and usage limits.");
    }

    process.exitCode = 1;
    break;
  }
}
