// Fetches Executive Room / Executive Suite club-member prices for Herods Vitalis
// Eilat (Fattal, Hotel=10051), for weekend (Thu->Sun, 3 nights) and midweek
// (Sun->Thu, 4 nights) stays, sampled weekly across the next 43 weeks (~10 months).
// Uses the site's own GraphQL API directly (be-new.fattal.co.il).

const fs = require('fs');
const { newStamp, outputPath, latestOutput } = require('./output-paths');

const HOTEL_ID = '10051';
const ROOM_CATEGORIES = {
  '24VVERVit.': 'חדר אקזקיוטיב (Executive Room)',
  '26VVLSVit.': 'סוויטת אקזקיוטיב (Executive Suite)',
};
// Stay patterns: check-in weekday (0=Sun..6=Sat) paired with the nights that land
// on the matching checkout weekday (Thu->Sun = 3 nights, Sun->Thu = 4 nights).
const STAY_PATTERNS = [
  { checkInWeekday: 4, nights: 3, label: 'חמישי-ראשון' }, // Thursday -> Sunday
  { checkInWeekday: 0, nights: 4, label: 'ראשון-חמישי' }, // Sunday -> Thursday
];
const WEEKS = 43; // ~10 months ahead
// Rows from the previous CSV are reused only if fetched within this window; older ones are re-fetched.
const MAX_REUSE_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const MIN_DELAY_MS = 4000;
const MAX_DELAY_MS = 10000;

const QUERY = `query Search($searchInput: SearchInput!) {
  search(searchInput: $searchInput) {
    hotelID
    fromDate
    toDate
    available
    availabilityMessage
    roomSelections {
      roomCategories {
        roomCategory
        availableCatRooms
        rooms {
          totalPrice
          clubTotalPrice
          currencyCode
          planCode
          roomCategory
          errorText
        }
      }
    }
  }
}`;

// Local calendar date. (toISOString() converts to UTC, which shifts local midnight
// in Israel back to the previous day.)
function fmtDate(d) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function addDays(d, days) {
  const nd = new Date(d);
  nd.setDate(nd.getDate() + days);
  return nd;
}

async function search(fromDate, nights) {
  const body = {
    operationName: 'Search',
    variables: {
      searchInput: {
        hotels: [{ hotelID: HOTEL_ID }],
        nights,
        rooms: [{ adults: 2, children: 0, infants: 0 }],
        isClerk: false,
        isLoggedIn: false,
        language: 'he-IL',
        flightOrigin: 'no_flights',
        fromDate,
        customerIds: { public: '1', club: '192' },
        pmsId: 'OPTIMA_IL',
        isLocal: true,
      },
    },
    query: QUERY,
  };

  const res = await fetch('https://be-new.fattal.co.il/graphql', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'Origin': 'https://www.fattal.co.il',
      'Referer': 'https://www.fattal.co.il/',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    throw new Error(`HTTP ${res.status} for ${fromDate} / ${nights} nights`);
  }
  return res.json();
}

// Picks the lowest club price per room category, restricted to the B/B (bed & breakfast) plan,
// matching what's shown by default on the site (מחיר לחברי מועדון for לינה וארוחת בוקר).
function bestClubPriceByCategory(json, fromDate, nights) {
  const result = {};
  for (const code of Object.keys(ROOM_CATEGORIES)) result[code] = null;

  const hotel = json?.data?.search?.[0];
  if (!hotel) return { available: false, result, message: 'no response' };

  if (!hotel.available) {
    let message = hotel.availabilityMessage;
    outer: for (const rs of hotel.roomSelections || []) {
      for (const cat of rs.roomCategories || []) {
        for (const room of cat.rooms || []) {
          if (room.errorText) {
            message = room.errorText;
            break outer;
          }
        }
      }
    }
    return { available: false, result, message };
  }

  for (const rs of hotel.roomSelections || []) {
    for (const cat of rs.roomCategories || []) {
      if (!(cat.roomCategory in result)) continue;
      for (const room of cat.rooms || []) {
        if (room.errorText) continue;
        if (room.planCode !== 'B/B') continue;
        if (result[cat.roomCategory] === null || room.clubTotalPrice < result[cat.roomCategory].clubTotalPrice) {
          result[cat.roomCategory] = {
            clubTotalPrice: room.clubTotalPrice,
            totalPrice: room.totalPrice,
            currencyCode: room.currencyCode,
          };
        }
      }
    }
  }
  return { available: true, result };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function randomDelay() {
  return MIN_DELAY_MS + Math.random() * (MAX_DELAY_MS - MIN_DELAY_MS);
}

function nextWeekday(from, weekday) {
  const diff = (weekday - from.getDay() + 7) % 7;
  return addDays(from, diff === 0 ? 0 : diff);
}

function loadExistingRows(csvPath) {
  if (!fs.existsSync(csvPath)) return [];
  const raw = fs.readFileSync(csvPath, 'utf8').replace(/^﻿/, '');
  const lines = raw.split('\n').filter(Boolean);
  if (lines.length < 2) return [];
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
  return lines.slice(1).map((l) => {
    const cols = parseCsvLine(l);
    const r = {};
    header.forEach((h, i) => (r[h] = cols[i]));
    return r;
  });
}

(async () => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const prevCsv = latestOutput('vitalis-prices', 'csv');
  const csvPath = outputPath('vitalis-prices', newStamp(), 'csv');
  const allCombos = [];
  for (const pattern of STAY_PATTERNS) {
    const firstCheckIn = nextWeekday(today, pattern.checkInWeekday);
    for (let w = 0; w < WEEKS; w++) {
      const checkIn = addDays(firstCheckIn, w * 7);
      allCombos.push({ checkIn, nights: pattern.nights, label: pattern.label, key: `${fmtDate(checkIn)}|${pattern.nights}` });
    }
  }

  // Reuse previous rows only if they belong to the current schedule and are fresh enough.
  const wantedKeys = new Set(allCombos.map((c) => c.key));
  const existingRows = (prevCsv ? loadExistingRows(prevCsv.path) : []).filter(
    (r) => wantedKeys.has(`${r.checkIn}|${r.nights}`) && Date.now() - new Date(r.fetchedAt).getTime() <= MAX_REUSE_AGE_MS
  );
  const existingKeys = new Set(existingRows.map((r) => `${r.checkIn}|${r.nights}`));
  const rows = [...existingRows];
  const combos = allCombos.filter((c) => !existingKeys.has(c.key));

  console.log(`${existingRows.length} rows fetched within the last 7 days reused; fetching ${combos.length} new check-in/stay combinations...`);

  for (const { checkIn, nights, label } of combos) {
    const fromDate = fmtDate(checkIn);
    const toDate = fmtDate(addDays(checkIn, nights));
    process.stdout.write(`  ${fromDate} -> ${toDate} (${nights}n, ${label})... `);

      try {
        const json = await search(fromDate, nights);
        const { available, result, message } = bestClubPriceByCategory(json, fromDate, nights);

        if (!available) {
          console.log(`unavailable: ${message || 'no rooms'}`);
          rows.push({
            checkIn: fromDate,
            checkOut: toDate,
            nights,
            stayPattern: label,
            executiveRoomClubPrice: '',
            executiveRoomClubPrice_perNight: '',
            executiveSuiteClubPrice: '',
            executiveSuiteClubPrice_perNight: '',
            currency: '',
            status: `unavailable: ${(message || 'no rooms').replace(/[\r\n,]+/g, ' ')}`,
            fetchedAt: new Date().toISOString(),
          });
        } else {
          const er = result['24VVERVit.'];
          const es = result['26VVLSVit.'];
          console.log(`ER=${er ? er.clubTotalPrice : 'N/A'} ES=${es ? es.clubTotalPrice : 'N/A'}`);
          rows.push({
            checkIn: fromDate,
            checkOut: toDate,
            nights,
            stayPattern: label,
            executiveRoomClubPrice: er ? er.clubTotalPrice : '',
            executiveRoomClubPrice_perNight: er ? +(er.clubTotalPrice / nights).toFixed(2) : '',
            executiveSuiteClubPrice: es ? es.clubTotalPrice : '',
            executiveSuiteClubPrice_perNight: es ? +(es.clubTotalPrice / nights).toFixed(2) : '',
            currency: (er || es)?.currencyCode || '',
            status: (er || es) ? 'ok' : 'sold out',
            fetchedAt: new Date().toISOString(),
          });
        }
      } catch (err) {
        console.log(`ERROR: ${err.message}`);
        rows.push({
          checkIn: fromDate,
          checkOut: toDate,
          nights,
          stayPattern: label,
          executiveRoomClubPrice: '',
          executiveRoomClubPrice_perNight: '',
          executiveSuiteClubPrice: '',
          executiveSuiteClubPrice_perNight: '',
          currency: '',
          status: `error: ${err.message}`,
          fetchedAt: new Date().toISOString(),
        });
      }

    await sleep(randomDelay());
  }

  function csvEscape(v) {
    const s = String(v ?? '');
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  }

  rows.sort((a, b) => String(a.checkIn).localeCompare(String(b.checkIn)) || Number(a.nights) - Number(b.nights));

  const header = ['checkIn', 'checkOut', 'nights', 'stayPattern', 'executiveRoomClubPrice', 'executiveRoomClubPrice_perNight', 'executiveSuiteClubPrice', 'executiveSuiteClubPrice_perNight', 'currency', 'status', 'fetchedAt'];
  const csvLines = [header.join(',')];
  for (const row of rows) {
    csvLines.push(header.map((h) => csvEscape(row[h])).join(','));
  }

  fs.writeFileSync(csvPath, '﻿' + csvLines.join('\n'), 'utf8');
  console.log(`\nWrote ${rows.length} rows to ${csvPath}`);
})();
