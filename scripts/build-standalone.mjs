// يبني نسخة من ملف واحد (dist/mada-standalone.html) للمشاركة أو الفتح المباشر دون خادم.
// النسخة المنشورة على GitHub Pages تبقى متعددة الملفات لأنها أكثر أماناً:
// سياستها تمنع أي سكربت مضمّن (script-src 'self').
// التشغيل: node scripts/build-standalone.mjs
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = p => readFileSync(join(root, p), "utf8");

let html = read("index.html");
const css = read("assets/css/mada.css");
const js = read("assets/js/app.js").replace(/<\/script/gi, "<\\/script");
const favicon = "data:image/svg+xml," + encodeURIComponent(read("assets/favicon.svg").trim());

const swap = (from, to) => {
  if (!html.includes(from)) throw new Error("لم يُعثر على: " + from);
  html = html.replace(from, () => to);
};
swap(`<link rel="stylesheet" href="assets/css/mada.css">`, `<style>\n${css}</style>`);
swap(`<script src="assets/js/app.js"></script>`, `<script>\n${js}</script>`);
swap(`href="assets/favicon.svg"`, `href="${favicon}"`);
// ملف واحد يحتاج السكربت المضمّن، فيُسمح به في هذه النسخة وحدها.
swap(`script-src 'self';`, `script-src 'self' 'unsafe-inline';`);

mkdirSync(join(root, "dist"), { recursive: true });
writeFileSync(join(root, "dist/mada-standalone.html"), html);
console.log("dist/mada-standalone.html", Math.round(html.length / 1024) + " KB");
