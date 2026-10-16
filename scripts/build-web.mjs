import { mkdir, copyFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'www');
await mkdir(out, { recursive: true });
for (const file of ['index.html', 'style.css', 'app.js', 'supabase-config.js']) {
  await copyFile(path.join(root, file), path.join(out, file));
}
console.log('Built Little Steps Planner web assets in www/.');
