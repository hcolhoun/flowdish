import asyncio
import sys
from pathlib import Path

sys.path.insert(0, r"C:\Users\Shann\AppData\Local\Temp\flowdish-video-tools\python")

import edge_tts


OUTPUT_DIR = Path(r"C:\Users\Shann\kitchen-cloud\artifacts\flowdish-promo\narration-openai")
VOICE = "en-IE-ConnorNeural"

LINES = {
    "intro": "Flowdish brings margin, stock and food safety into one operating system.",
    "prices": "Start with current supplier prices. Upload the file, review every proposed change, and catch price drift before it reaches the menu.",
    "bom": "Build dishes from ingredients, yield and portion size, with a live cost at every level. Use your own recipes, or start with Coco's proven menus.",
    "sop": "One click turns the recipe into an interactive S O P. It reads aloud, pauses and repeats hands free while the chef prepares the dish.",
    "forecast": "Forecast tomorrow's menu. Flowdish plans the prep, allocates first in, first out batches, and turns stock shortfalls into an order list ready to paste.",
    "delivery": "At the back door, photograph the docket. A I matches S K U's, checks price and V A T, then updates inventory after review.",
    "dashboard": "Import the till readout, and sales feed back into stock and margin. The dashboard highlights profit, shortages and expiring batches before they become waste.",
    "login": "On the floor, each chef enters with a private pin.",
    "prep_intro": "During prep, say what was made, then add the H A C C P time and temperature checks.",
    "prep_outro": "Flowdish drafts the batch, yield and expiry for approval.",
    "waste_intro": "For waste, say the item, amount and reason.",
    "waste_outro": "Stock changes only after approval, so every loss becomes measurable.",
    "points": "Monthly points make good recording visible and help teams build the habit.",
    "cold": "Cold storage probes and manual checks keep H A C C P evidence together, with live history ready when you need it.",
    "outro": "Flowdish. Know every cost. Track every batch. Prove every check.",
}


async def main() -> None:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    for name, text in LINES.items():
        target = OUTPUT_DIR / f"{name}.mp3"
        speech = edge_tts.Communicate(text, VOICE, rate="+10%", pitch="-2Hz")
        await speech.save(str(target))
        print(f"Generated {target.name}")


if __name__ == "__main__":
    asyncio.run(main())
