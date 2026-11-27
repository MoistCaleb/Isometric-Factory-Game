// `npm run validate` — fails on content errors, prints coverage warnings.
import { buildRegistry } from '../src/content/registry';
import { validate } from '../src/content/validate';

const reg = buildRegistry();
const { errors, warnings } = validate(reg);
console.log(`content: ${reg.items.length} items, ${reg.fluids.length} fluids, ${reg.recipes.length} recipes`);
for (const w of warnings) console.log(`  warn: ${w}`);
for (const e of errors) console.error(`  ERROR: ${e}`);
if (errors.length) {
  console.error(`${errors.length} content error(s)`);
  process.exit(1);
}
console.log('content OK');
