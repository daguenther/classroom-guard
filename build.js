const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { execSync } = require('child_process');

console.log('=== Classroom Guard Build & Package Tool ===\n');

// 1. Validate JSON Files
const jsonFiles = [
  'manifest.json',
  'schema.json',
  'rules/rules.json',
  'rules/ai_overview.json'
];

for (const rel of jsonFiles) {
  try {
    const raw = fs.readFileSync(rel, 'utf8');
    JSON.parse(raw);
    console.log(`[PASS] JSON valid: ${rel}`);
  } catch (err) {
    console.error(`[FAIL] JSON invalid: ${rel}`, err.message);
    process.exit(1);
  }
}

// 2. Validate JS Syntax
const jsFiles = [
  'config.js',
  'background/service-worker.js',
  'content/nuke-main.js',
  'content/nuke-isolated.js',
  'content/search-ai-overview.js'
];

for (const js of jsFiles) {
  try {
    execSync(`node --check "${js}"`, { stdio: 'pipe' });
    console.log(`[PASS] Syntax valid: ${js}`);
  } catch (err) {
    console.error(`[FAIL] Syntax error in ${js}:`, err.stderr?.toString());
    process.exit(1);
  }
}

// 3. Validate Manifest & Icons
const manifest = JSON.parse(fs.readFileSync('manifest.json', 'utf8'));
if (manifest.description.length > 132) {
  console.error(`[FAIL] manifest.description too long: ${manifest.description.length} chars (max 132)`);
  process.exit(1);
}
console.log(`[PASS] Manifest description length: ${manifest.description.length}/132 chars`);

for (const [size, iconPath] of Object.entries(manifest.icons)) {
  if (!fs.existsSync(iconPath)) {
    console.error(`[FAIL] Icon missing: ${iconPath}`);
    process.exit(1);
  }
  const buf = fs.readFileSync(iconPath);
  const w = buf.readUInt32BE(16);
  const h = buf.readUInt32BE(20);
  const target = Number(size);
  if (w !== target || h !== target) {
    console.error(`[FAIL] Icon ${iconPath} has dimensions ${w}x${h}, expected ${target}x${target}`);
    process.exit(1);
  }
  console.log(`[PASS] Icon dimensions correct: ${iconPath} (${w}x${h})`);
}

// 4. Build Clean Release ZIP
const filesToPack = [
  'manifest.json',
  'schema.json',
  'config.js',
  'background/service-worker.js',
  'content/nuke-main.js',
  'content/nuke-isolated.js',
  'content/search-ai-overview.js',
  'rules/rules.json',
  'rules/ai_overview.json',
  'icons/icon-16.png',
  'icons/icon-48.png',
  'icons/icon-128.png'
];

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (c & 1 ? 0xedb88320 : 0);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function createZip(entries) {
  const localParts = [];
  const centralParts = [];
  let offset = 0;

  for (const relPath of entries) {
    const data = fs.readFileSync(relPath);
    const compressed = zlib.deflateRawSync(data);
    const nameBuf = Buffer.from(relPath.replace(/\\/g, '/'), 'utf8');
    const crc = crc32(data);

    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4);
    localHeader.writeUInt16LE(0, 6);
    localHeader.writeUInt16LE(8, 8);
    localHeader.writeUInt16LE(0, 10);
    localHeader.writeUInt16LE(0, 12);
    localHeader.writeUInt32LE(crc, 14);
    localHeader.writeUInt32LE(compressed.length, 18);
    localHeader.writeUInt32LE(data.length, 22);
    localHeader.writeUInt16LE(nameBuf.length, 26);
    localHeader.writeUInt16LE(0, 28);

    localParts.push(localHeader, nameBuf, compressed);

    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0);
    centralHeader.writeUInt16LE(20, 4);
    centralHeader.writeUInt16LE(20, 6);
    centralHeader.writeUInt16LE(0, 8);
    centralHeader.writeUInt16LE(8, 10);
    centralHeader.writeUInt16LE(0, 12);
    centralHeader.writeUInt16LE(0, 14);
    centralHeader.writeUInt32LE(crc, 16);
    centralHeader.writeUInt32LE(compressed.length, 20);
    centralHeader.writeUInt32LE(data.length, 24);
    centralHeader.writeUInt16LE(nameBuf.length, 28);
    centralHeader.writeUInt16LE(0, 30);
    centralHeader.writeUInt16LE(0, 32);
    centralHeader.writeUInt16LE(0, 34);
    centralHeader.writeUInt16LE(0, 36);
    centralHeader.writeUInt32LE(0, 38);
    centralHeader.writeUInt32LE(offset, 42);

    centralParts.push(centralHeader, nameBuf);
    offset += localHeader.length + nameBuf.length + compressed.length;
  }

  const centralDir = Buffer.concat(centralParts);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(centralDir.length, 12);
  eocd.writeUInt32LE(offset, 16);
  eocd.writeUInt16LE(0, 20);

  return Buffer.concat([...localParts, centralDir, eocd]);
}

const distDir = path.join(__dirname, 'dist');
if (!fs.existsSync(distDir)) {
  fs.mkdirSync(distDir, { recursive: true });
}

const zipName = `classroom-guard-v${manifest.version}.zip`;
const zipPath = path.join(distDir, zipName);
const zipBuf = createZip(filesToPack);
fs.writeFileSync(zipPath, zipBuf);

console.log(`\n[SUCCESS] Packaged ${zipPath} (${zipBuf.length} bytes, ${filesToPack.length} files).`);
console.log('Package contents:');
filesToPack.forEach(f => console.log(`  - ${f}`));
