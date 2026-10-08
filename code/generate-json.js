// Builds vitalis-prices.json (rows + summary stats) from vitalis-prices.csv.
const fs = require('fs');
const path = require('path');

const { outputPath, latestOutput } = require('./output-paths');

const csv = latestOutput('vitalis-prices', 'csv');
if (!csv) throw new Error('no vitalis-prices.*.csv in output/ — run fetch-prices.js first');
const csvPath = csv.path;
const raw = fs.readFileSync(csvPath, 'utf8').replace(/^﻿/, '');
const lines = raw.split('\n').filter(Boolean);
const header = lines[0].split(',');

function parseCsvLine(line) {
  const out = [];
  let cur = '';
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQ) {
      if (c === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++; } else { inQ = false; }
      } else cur += c;
    } else {
      if (c === '"') inQ = true;
      else if (c === ',') { out.push(cur); cur = ''; }
      else cur += c;
    }
  }
  out.push(cur);
  return out;
}

const rawRows = lines.slice(1).map((l) => {
  const cols = parseCsvLine(l);
  const r = {};
  header.forEach((h, i) => (r[h] = cols[i]));
  return r;
});

const rows = rawRows.map((r) => ({
  checkIn: r.checkIn,
  checkOut: r.checkOut,
  nights: Number(r.nights),
  stayPattern: r.stayPattern || null,
  executiveRoomClubPrice: r.executiveRoomClubPrice ? Number(r.executiveRoomClubPrice) : null,
  executiveRoomClubPrice_perNight: r.executiveRoomClubPrice_perNight ? Number(r.executiveRoomClubPrice_perNight) : null,
  executiveSuiteClubPrice: r.executiveSuiteClubPrice ? Number(r.executiveSuiteClubPrice) : null,
  executiveSuiteClubPrice_perNight: r.executiveSuiteClubPrice_perNight ? Number(r.executiveSuiteClubPrice_perNight) : null,
  currency: r.currency || null,
  available: r.status === 'ok',
  statusMessage: r.status === 'ok' ? null : r.status.replace(/^unavailable: /, ''),
  fetchedAt: r.fetchedAt,
}));

const ok = rows.filter((r) => r.available);

function stats(arr, field) {
  const vals = arr.map((r) => r[field]).filter((v) => v != null);
  if (!vals.length) return null;
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const avg = +(vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(2);
  return {
    min,
    max,
    avg,
    minDate: arr.find((r) => r[field] === min).checkIn,
    maxDate: arr.find((r) => r[field] === max).checkIn,
  };
}

const by3 = ok.filter((r) => r.nights === 3);
const by4 = ok.filter((r) => r.nights === 4);
const premiums = ok
  .map((r) =>
    r.executiveSuiteClubPrice != null && r.executiveRoomClubPrice != null
      ? (r.executiveSuiteClubPrice / r.executiveRoomClubPrice - 1) * 100
      : null
  )
  .filter((v) => v != null);

const summary = {
  hotel: { nameHe: 'הרודס ויטאליס אילת', hotelId: '10051', citySlug: 'eilat-hotels' },
  roomTypes: {
    executiveRoom: { code: '24VVERVit.', nameHe: 'חדר אקזקיוטיב', cheapestInHotel: true },
    executiveSuite: { code: '26VVLSVit.', nameHe: 'סוויטת אקזקיוטיב', cheapestInHotel: false },
    otherCategory: { code: '35VVRSVit.', nameHe: 'סוויטת גשם' },
  },
  stayPatterns: {
    weekend: { nights: 3, label: 'חמישי-ראשון', checkInWeekday: 4 },
    midweek: { nights: 4, label: 'ראשון-חמישי', checkInWeekday: 0 },
  },
  windowStart: rows[0].checkIn,
  windowEnd: rows[rows.length - 1].checkIn,
  totalCombinations: rows.length,
  availableCombinations: ok.length,
  unavailableCombinations: rows.length - ok.length,
  soldOutCheckIns: [
    ...new Set(
      rows
        .filter((r) => !r.available && r.statusMessage && r.statusMessage.includes('נותרו'))
        .map((r) => r.checkIn)
    ),
  ],
  stats: {
    executiveRoom: {
      total3n: stats(by3, 'executiveRoomClubPrice'),
      total4n: stats(by4, 'executiveRoomClubPrice'),
      perNight3n: stats(by3, 'executiveRoomClubPrice_perNight'),
      perNight4n: stats(by4, 'executiveRoomClubPrice_perNight'),
    },
    executiveSuite: {
      total3n: stats(by3, 'executiveSuiteClubPrice'),
      total4n: stats(by4, 'executiveSuiteClubPrice'),
      perNight3n: stats(by3, 'executiveSuiteClubPrice_perNight'),
      perNight4n: stats(by4, 'executiveSuiteClubPrice_perNight'),
    },
    suitePremiumPercent: {
      min: +Math.min(...premiums).toFixed(1),
      max: +Math.max(...premiums).toFixed(1),
      avg: +(premiums.reduce((a, b) => a + b, 0) / premiums.length).toFixed(1),
    },
  },
};

const out = { generatedAt: new Date().toISOString(), summary, rows };
const jsonPath = outputPath('vitalis-prices', csv.stamp, 'json');
fs.writeFileSync(jsonPath, JSON.stringify(out, null, 2), 'utf8');
console.log(`Wrote ${path.basename(jsonPath)} from ${path.basename(csvPath)} with ${rows.length} rows (${ok.length} available)`);
