import satori from 'satori';
import { html } from 'satori-html';
import sharp from 'sharp';
import fs from 'node:fs';
import path from 'node:path';

const dir = path.resolve('src/pins');
const font = (w: number) => fs.readFileSync(path.resolve(`node_modules/@fontsource/inter/files/inter-latin-${w}-normal.woff`));
const fonts = [400, 500, 600, 700, 800, 900].map((w) => ({ name: 'Inter', data: font(w), weight: w as any, style: 'normal' as const }));

export function getStaticPaths() {
  return fs.readdirSync(dir).filter((f) => f.endsWith('.html')).map((f) => ({ params: { name: f.replace(/\.html$/, '') } }));
}

export async function GET({ params }: { params: { name: string } }) {
  const body = fs.readFileSync(path.join(dir, `${params.name}.html`), 'utf8');
  const page = `<div style="display:flex;flex-direction:column;width:1000px;height:1500px;font-family:Inter;color:#14171A;background:linear-gradient(160deg,#FFFDF8 0%,#FBF7EE 45%,#F3EBD8 100%)">
<div style="display:flex;flex-direction:column;flex:1;padding:80px 80px 40px;overflow:hidden">${body}</div>
<div style="display:flex;align-items:center;justify-content:center;height:120px;flex-shrink:0;background:#0B3D26;color:#fff;font-size:34px;font-weight:700"><div style="width:12px;height:12px;border-radius:6px;background:#34A871;margin-right:16px"></div>papertrailwealth<span style="color:#8FD6AE">.com</span></div></div>`;
  const svg = await satori(html(page) as any, { width: 1000, height: 1500, fonts });
  const png = await sharp(Buffer.from(svg)).png().toBuffer();
  return new Response(png, { headers: { 'Content-Type': 'image/png' } });
}
