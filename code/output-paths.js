// Output files are saved as <base>.<YYYYMMDD_HHMM>.<ext> in ../output, e.g.
// vitalis-prices.20261008_1438.html. The stamp identifies a run: fetch-prices.js creates
// it, and each later step reuses the stamp of the file it reads, so every file produced
// from the same fetch shares one stamp.
const fs = require('fs');
const path = require('path');

const outDir = path.join(__dirname, '..', 'output');
fs.mkdirSync(outDir, { recursive: true });

function newStamp() {
  const pad = (n) => String(n).padStart(2, '0');
  const d = new Date();
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}`;
}

function outputPath(base, stamp, ext) {
  return path.join(outDir, `${base}.${stamp}.${ext}`);
}

// Newest stamped file for base/ext as { path, stamp }, or null if none exists.
function latestOutput(base, ext) {
  const re = new RegExp(`^${base.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\.(\\d{8}_\\d{4})\\.${ext}$`);
  const matches = fs.readdirSync(outDir).filter((f) => re.test(f)).sort();
  if (!matches.length) return null;
  const name = matches[matches.length - 1];
  return { path: path.join(outDir, name), stamp: name.match(re)[1] };
}

module.exports = { outDir, newStamp, outputPath, latestOutput };
