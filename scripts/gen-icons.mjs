// Generate PWA icons from an inline SVG using sharp. Run: npm run gen-icons
import sharp from "sharp";
import { mkdir } from "node:fs/promises";
import path from "node:path";

const OUT = path.join(process.cwd(), "public", "icons");

// A simple lightning glyph (Hermes / speed) on the brand background.
const svg = (bg, pad) => `
<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="${pad ? 0 : 96}" fill="${bg}"/>
  <path d="M300 60 L150 290 L240 290 L210 452 L372 222 L280 222 Z"
        fill="#f59e0b" stroke="#fde68a" stroke-width="6" stroke-linejoin="round"/>
</svg>`;

async function main() {
  await mkdir(OUT, { recursive: true });
  const base = svg("#0b0f14", false);
  const maskable = svg("#0b0f14", true);

  await sharp(Buffer.from(base)).resize(192, 192).png().toFile(path.join(OUT, "icon-192.png"));
  await sharp(Buffer.from(base)).resize(512, 512).png().toFile(path.join(OUT, "icon-512.png"));
  await sharp(Buffer.from(maskable)).resize(512, 512).png().toFile(path.join(OUT, "maskable-512.png"));
  console.log("Icons written to public/icons/");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
