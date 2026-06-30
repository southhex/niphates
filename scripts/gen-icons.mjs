// Generate PWA icons from public/icons/icon.svg using sharp. Run: npm run gen-icons
import sharp from "sharp";
import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";

const OUT = path.join(process.cwd(), "public", "icons");
const SRC = path.join(OUT, "icon.svg");

async function main() {
  await mkdir(OUT, { recursive: true });
  const svg = await readFile(SRC);

  // Standard icons — resize the SVG directly.
  await sharp(svg).resize(192, 192).png().toFile(path.join(OUT, "icon-192.png"));
  await sharp(svg).resize(512, 512).png().toFile(path.join(OUT, "icon-512.png"));

  // Maskable — embed in a 512×512 canvas with padding so the design sits
  // within the safe zone (inner ~80%).
  const raw = svg.toString();
  const inner = raw
    .replace(/<\?xml[^>]*\?>/, "")
    .replace(/<!DOCTYPE[^>]*>/i, "")
    .replace(/<svg[^>]*>/, "")
    .replace(/<\/svg>/, "");
  const maskable = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <rect width="512" height="512" fill="#100E14"/>
  <g transform="translate(77 77) scale(0.88)">${inner}</g>
</svg>`;
  await sharp(Buffer.from(maskable)).resize(512, 512).png().toFile(path.join(OUT, "maskable-512.png"));

  console.log("Icons written to public/icons/");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
