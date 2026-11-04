import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const backendRoot = path.resolve(__dirname, "..");
const source = path.resolve(backendRoot, "../admin/dist");
const target = path.resolve(backendRoot, "public/backoffice");

if (!fs.existsSync(path.join(source, "index.html"))) {
  console.error(`[copy-admin-dist] ${source}/index.html is missing — build the admin app first.`);
  process.exit(1);
}

fs.rmSync(target, { recursive: true, force: true });
fs.mkdirSync(target, { recursive: true });
fs.cpSync(source, target, { recursive: true });

const fileCount = fs.readdirSync(path.join(target, "assets")).length;
console.log(`[copy-admin-dist] copied ${fileCount + 1} files to ${path.relative(backendRoot, target)}`);
