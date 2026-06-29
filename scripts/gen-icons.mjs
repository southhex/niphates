// Generate PWA icons from an inline SVG using sharp. Run: npm run gen-icons
import sharp from "sharp";
import { mkdir } from "node:fs/promises";
import path from "node:path";

const OUT = path.join(process.cwd(), "public", "icons");

// "N" glyph (vertical bars + diagonal) on the brand background.
const svg = (bg, pad) => `
<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="${pad ? 0 : 96}" fill="${bg}"/>
  <g fill="none" stroke="#C4A350" stroke-width="10" stroke-linecap="round">
    <line x1="135" y1="150" x2="135" y2="362"/>
    <line x1="135" y1="150" x2="377" y2="362"/>
    <line x1="377" y1="150" x2="377" y2="362"/>
  </g>
</svg>`;

async function main() {
  await mkdir(OUT, { recursive: true });
  const base = svg("#100E14", false);
  const maskable = svg("#100E14", true);

  await sharp(Buffer.from(base)).resize(192, 192).png().toFile(path.join(OUT, "icon-192.png"));
  await sharp(Buffer.from(base)).resize(512, 512).png().toFile(path.join(OUT, "icon-512.png"));
  await sharp(Buffer.from(maskable)).resize(512, 512).png().toFile(path.join(OUT, "maskable-512.png"));

  // Also copy the source SVG next to the PNGs for reference.
  const { writeFile } = await import("node:fs/promises");
  await writeFile(path.join(OUT, "icon.svg"), svg("#100E14", false).trim());
  console.log("Icons written to public/icons/");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
