// Signs a built MyiaOS zip for System update: run AFTER npm run package.
//   node tools/release.mjs "What's new, in plain words for the owner"
// Writes dist/releases/: myiaos-<version>.zip and latest.json (signed with the private release key, which never leaves
// this PC). Upload the releases folder's contents to myiaos.com/releases/ (by drag in File Manager). Every MyiaOS
// with the updater then offers the new version in the Application manager, under Updates.
import { createHash, createPrivateKey, sign } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
// The private key's file, kept outside every repository: set MYIAOS_RELEASE_KEY to its full path before running this.
const keyPath = process.env.MYIAOS_RELEASE_KEY;
if (!keyPath || !existsSync(keyPath)) {
  throw new Error('The release key was not found. Set MYIAOS_RELEASE_KEY to the full path of the private key file (.pem), then run this again.');
}
const notes = process.argv.slice(2).join(' ').trim();
if (!notes) throw new Error('Say what is new: node tools/release.mjs "What changed"');
const { version } = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const zip = join(root, 'dist', `myiaos-${version}.zip`);
if (!existsSync(zip)) throw new Error(`${zip} is missing: run npm run package first.`);
const out = join(root, 'dist', 'releases');
mkdirSync(out, { recursive: true });
const bytes = readFileSync(zip);
const name = `myiaos-${version}.zip`;
const payload = Buffer.from(JSON.stringify({
  version, date: new Date().toISOString().slice(0, 10), notes,
  zip: `https://myiaos.com/releases/${name}`, sha256: createHash('sha256').update(bytes).digest('hex'), bytes: bytes.length,
}));
const sig = sign(null, payload, createPrivateKey(readFileSync(keyPath)));
copyFileSync(zip, join(out, name));
writeFileSync(join(out, 'latest.json'), JSON.stringify({ release: payload.toString('base64'), sig: sig.toString('base64') }) + '\n');
console.log(`Signed ${name}. Upload dist/releases/* to myiaos.com/releases/.`);
