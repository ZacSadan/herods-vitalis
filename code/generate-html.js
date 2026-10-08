// Generates vitalis-prices.html from vitalis-prices.json.
const fs = require('fs');
const path = require('path');

const { outputPath, latestOutput } = require('./output-paths');

const json = latestOutput('vitalis-prices', 'json');
if (!json) throw new Error('no vitalis-prices.*.json in output/ — run generate-json.js first');
const jsonPath = json.path;
const data = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
const { summary, rows } = data;

function heDate(iso) {
  const [y, m, d] = iso.split('-');
  const months = ['ינואר','פברואר','מרץ','אפריל','מאי','יוני','יולי','אוגוסט','ספטמבר','אוקטובר','נובמבר','דצמבר'];
  return `${Number(d)} ב${months[Number(m) - 1]} ${y}`;
}
function shortHe(iso) {
  const [, m, d] = iso.split('-');
  return `${Number(d)}/${Number(m)}`;
}
function nis(n) {
  if (n == null) return '—';
  return '₪' + Math.round(n).toLocaleString('he-IL');
}
function nis1(n) {
  if (n == null) return '—';
  return '₪' + n.toLocaleString('he-IL', { maximumFractionDigits: 0 });
}

const by3 = rows.filter(r => r.nights === 3);
const by4 = rows.filter(r => r.nights === 4);
const checkIns = by3.map(r => r.checkIn);

function statusLabel(r) {
  if (!r) return 'לא זמין';
  if (r.available) return 'זמין';
  return r.statusMessage && r.statusMessage.includes('נותרו') ? 'אזל' : 'לא זמין';
}

// Each point carries the value (null when unavailable) plus the full date and
// status label, so charts can render gray markers for gaps and show rich tooltips.
function seriesFor(field, nightsArr) {
  return checkIns.map((ci, i) => {
    const r = nightsArr[i];
    return {
      v: r && r.available ? r[field] : null,
      date: ci,
      status: statusLabel(r),
    };
  });
}

const chartSeries = {
  labels: checkIns.map(shortHe),
  erTotal3: seriesFor('executiveRoomClubPrice', by3),
  erTotal4: seriesFor('executiveRoomClubPrice', by4),
  esTotal3: seriesFor('executiveSuiteClubPrice', by3),
  esTotal4: seriesFor('executiveSuiteClubPrice', by4),
  erPn3: seriesFor('executiveRoomClubPrice_perNight', by3),
  erPn4: seriesFor('executiveRoomClubPrice_perNight', by4),
  esPn3: seriesFor('executiveSuiteClubPrice_perNight', by3),
  esPn4: seriesFor('executiveSuiteClubPrice_perNight', by4),
};

// Green (cheapest) -> red (priciest) heat color for the Executive Room per-night column.
const erPnValues = rows.map(r => r.executiveRoomClubPrice_perNight).filter(v => v != null);
const erPnMin = Math.min(...erPnValues);
const erPnMax = Math.max(...erPnValues);

function heatColor(value, min, max) {
  if (value == null || max === min) return null;
  const t = (value - min) / (max - min); // 0 = cheapest, 1 = priciest
  const hue = 142 - t * 142; // 142 = green, 0 = red
  return `hsl(${hue.toFixed(0)} 68% 38%)`;
}

// Highlight every row whose Executive Room per-night price is among the 5 lowest
// distinct price levels (so tied prices are all marked consistently, not just
// however many happen to fall within the first 5 rows).
const distinctErPnAsc = [...new Set(erPnValues)].sort((a, b) => a - b);
const cheapestFiveValues = new Set(distinctErPnAsc.slice(0, 5));

const sortedRows = [...rows].sort((a, b) => a.checkIn.localeCompare(b.checkIn) || a.nights - b.nights);

const tableRows = sortedRows.map(r => {
  const erPnColor = heatColor(r.executiveRoomClubPrice_perNight, erPnMin, erPnMax);
  const isCheapestFive = r.executiveRoomClubPrice_perNight != null && cheapestFiveValues.has(r.executiveRoomClubPrice_perNight);
  const erPnClass = `num${isCheapestFive ? ' is-best-value' : ''}`;
  const erPnStyle = erPnColor ? ` style="color:${erPnColor};font-weight:600"` : '';
  return `
        <tr class="${r.available ? '' : 'is-unavailable'}">
          <td>${heDate(r.checkIn)}</td>
          <td>${r.stayPattern || (r.nights + ' לילות')} (${r.nights} לילות)</td>
          <td class="num">${nis1(r.executiveRoomClubPrice)}</td>
          <td class="${erPnClass}"${erPnStyle}>${nis1(r.executiveRoomClubPrice_perNight)}</td>
          <td class="num">${nis1(r.executiveSuiteClubPrice)}</td>
          <td class="num">${nis1(r.executiveSuiteClubPrice_perNight)}</td>
          <td class="status">${r.available ? 'זמין' : (r.statusMessage && r.statusMessage.includes('נותרו') ? 'אזל' : 'לא זמין')}</td>
        </tr>`;
}).join('');

const html = `<!doctype html>
<html lang="he" dir="rtl">
<head>
<meta charset="UTF-8">
<title>מחירי ויטאליס אילת</title>
<style>
${fs.readFileSync(path.join(__dirname, 'report.css'), 'utf8')}
</style>
</head>
<body>
${fs.readFileSync(path.join(__dirname, 'report-body-template.html'), 'utf8')
  .replace('__TABLE_ROWS__', tableRows)}
<script>
window.__VITALIS_DATA__ = ${JSON.stringify({ summary: { ...summary, generatedAt: data.generatedAt }, chartSeries })};
</script>
<script>
${fs.readFileSync(path.join(__dirname, 'report.js'), 'utf8')}
</script>
</body>
</html>
`;

const htmlPath = outputPath('vitalis-prices', json.stamp, 'html');
fs.writeFileSync(htmlPath, html, 'utf8');
console.log(`wrote ${path.basename(htmlPath)} from ${path.basename(jsonPath)}`);
