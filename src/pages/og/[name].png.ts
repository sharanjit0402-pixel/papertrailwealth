import sharp from 'sharp';
import fs from 'node:fs';
import path from 'node:path';

const dir = path.resolve('public/images');

export function getStaticPaths() {
  return fs.readdirSync(dir).filter((f) => f.endsWith('.svg')).map((f) => ({ params: { name: f.replace(/\.svg$/, '') } }));
}

export async function GET({ params }: { params: { name: string } }) {
  const svg = fs.readFileSync(path.join(dir, `${params.name}.svg`));
  const png = await sharp(svg).resize(1200, 675).png().toBuffer();
  return new Response(png, { headers: { 'Content-Type': 'image/png' } });
}
