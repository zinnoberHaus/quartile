// Writes the component JSON Schema (the spec that models generate against) to dist/schema.json.
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const { quartileSchema } = await import(join(root, 'dist/index.js'));
writeFileSync(join(root, 'dist/schema.json'), `${JSON.stringify(quartileSchema, null, 2)}\n`);
console.log(`schema.json: ${Object.keys(quartileSchema.$defs ?? {}).length} component definitions`);
