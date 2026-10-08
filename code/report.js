(function () {
  const { summary, chartSeries } = window.__VITALIS_DATA__;

  function heDateShort(iso) {
    const [y, m, d] = iso.split('-');
    const months = ['ינו','פבר','מרץ','אפר','מאי','יונ','יול','אוג','ספט','אוק','נוב','דצמ'];
    return `${Number(d)} ב${months[Number(m) - 1]}`;
  }
  function nis(n) {
    if (n == null) return '—';
    return '₪' + Math.round(n).toLocaleString('he-IL');
  }

  // ---------- Header meta ----------
  document.getElementById('hero-meta').innerHTML = `
    <span>טווח: <b>${heDateShort(summary.windowStart)} – ${heDateShort(summary.windowEnd)}</b></span>
    <span>${summary.availableCombinations} מתוך ${summary.totalCombinations} שילובי תאריך/משך שהות זמינים</span>
  `;
  document.getElementById('generated-at').textContent =
    'עודכן ' + new Date(window.__VITALIS_DATA__.summary.generatedAt || Date.now()).toLocaleDateString('he-IL');

  document.getElementById('premium-inline').textContent = `כ־${summary.stats.suitePremiumPercent.avg}%`;

  // ---------- Stat tiles ----------
  const s = summary.stats;
  const erTiles = [
    { label: 'הזול ביותר (סוף שבוע)', value: nis(s.executiveRoom.total3n.min), sub: heDateShort(s.executiveRoom.total3n.minDate), extra: `${nis(s.executiveRoom.total3n.min / 3)} ללילה`, cls: 'accent' },
    { label: 'הזול ביותר (אמצע שבוע)', value: nis(s.executiveRoom.total4n.min), sub: heDateShort(s.executiveRoom.total4n.minDate), extra: `${nis(s.executiveRoom.total4n.min / 4)} ללילה`, cls: 'accent' },
    { label: 'ממוצע ללילה', value: nis((s.executiveRoom.perNight3n.avg + s.executiveRoom.perNight4n.avg) / 2), sub: 'ממוצע סוף שבוע + אמצע שבוע', cls: 'accent' },
  ];
  const esTiles = [
    { label: 'הזולה ביותר (סוף שבוע)', value: nis(s.executiveSuite.total3n.min), sub: heDateShort(s.executiveSuite.total3n.minDate), extra: `${nis(s.executiveSuite.total3n.min / 3)} ללילה`, cls: 'accent2' },
    { label: 'הזולה ביותר (אמצע שבוע)', value: nis(s.executiveSuite.total4n.min), sub: heDateShort(s.executiveSuite.total4n.minDate), extra: `${nis(s.executiveSuite.total4n.min / 4)} ללילה`, cls: 'accent2' },
    { label: 'ממוצע ללילה', value: nis((s.executiveSuite.perNight3n.avg + s.executiveSuite.perNight4n.avg) / 2), sub: 'ממוצע סוף שבוע + אמצע שבוע', cls: 'accent2' },
  ];
  function renderTiles(tiles) {
    return tiles.map(t => `
    <div class="stat-tile">
      <span class="label">${t.label}</span>
      <span class="value ${t.cls}">${t.value}</span>
      <span class="sub">${t.sub}${t.extra ? ' · ' + t.extra : ''}</span>
    </div>`).join('');
  }
  document.getElementById('stat-grid-er').innerHTML = renderTiles(erTiles);
  document.getElementById('stat-grid-es').innerHTML = renderTiles(esTiles);

  // ---------- Availability pills ----------
  document.getElementById('avail-strip').innerHTML = summary.soldOutCheckIns.length
    ? summary.soldOutCheckIns.map(d => `<span class="avail-pill">שבוע ${heDateShort(d)}</span>`).join('')
    : '<span class="section-note">כל השבועות נמצאו זמינים.</span>';

  // ---------- Chart renderer ----------
  function heDateLong(iso) {
    const [y, m, d] = iso.split('-');
    const months = ['ינואר','פברואר','מרץ','אפריל','מאי','יוני','יולי','אוגוסט','ספטמבר','אוקטובר','נובמבר','דצמבר'];
    return `${Number(d)} ב${months[Number(m) - 1]} ${y}`;
  }

  // One shared tooltip element, reused by every chart.
  let tooltipEl = document.getElementById('chart-tooltip');
  if (!tooltipEl) {
    tooltipEl = document.createElement('div');
    tooltipEl.id = 'chart-tooltip';
    tooltipEl.className = 'chart-tooltip';
    tooltipEl.hidden = true;
    document.body.appendChild(tooltipEl);
  }
  function showTooltip(evt, html) {
    tooltipEl.innerHTML = html;
    tooltipEl.hidden = false;
    positionTooltip(evt);
  }
  function positionTooltip(evt) {
    const pad = 14;
    let left = evt.clientX + pad;
    let top = evt.clientY + pad;
    const rect = tooltipEl.getBoundingClientRect();
    if (left + rect.width > window.innerWidth - 8) left = evt.clientX - rect.width - pad;
    if (top + rect.height > window.innerHeight - 8) top = evt.clientY - rect.height - pad;
    tooltipEl.style.left = left + 'px';
    tooltipEl.style.top = top + 'px';
  }
  function hideTooltip() {
    tooltipEl.hidden = true;
  }

  function drawLineChart(containerId, labels, seriesA, seriesB, colorA, colorB, labelA, labelB) {
    const container = document.getElementById(containerId);
    const width = 900, height = 220;
    const padL = 46, padR = 12, padT = 14, padB = 28;
    const innerW = width - padL - padR, innerH = height - padT - padB;

    const allVals = seriesA.concat(seriesB).map(p => p.v).filter(v => v != null);
    const min = Math.min(...allVals), max = Math.max(...allVals);
    const pad = (max - min) * 0.12 || 100;
    const yMin = Math.floor((min - pad) / 100) * 100;
    const yMax = Math.ceil((max + pad) / 100) * 100;
    // Unavailable points are plotted at a fixed low position (just above the axis)
    // so they show up as a visible gray marker instead of disappearing.
    const yGap = padT + innerH - innerH * 0.03;

    const n = labels.length;
    const x = i => padL + (innerW * i) / (n - 1);
    const y = v => padT + innerH - ((v - yMin) / (yMax - yMin)) * innerH;

    function pathFor(series) {
      let d = '';
      let started = false;
      series.forEach((p, i) => {
        if (p.v == null) { started = false; return; }
        d += (started ? ' L ' : ' M ') + x(i).toFixed(1) + ' ' + y(p.v).toFixed(1);
        started = true;
      });
      return d;
    }

    const yTicks = 4;
    let gridSvg = '';
    for (let t = 0; t <= yTicks; t++) {
      const val = yMin + ((yMax - yMin) * t) / yTicks;
      const yy = y(val);
      gridSvg += `<line class="gridline" x1="${padL}" x2="${width - padR}" y1="${yy}" y2="${yy}" />`;
      gridSvg += `<text class="axis-label" x="${padL - 8}" y="${yy + 4}" text-anchor="end">${Math.round(val).toLocaleString('he-IL')}</text>`;
    }

    let xLabelsSvg = '';
    const labelStep = Math.ceil(n / 9);
    labels.forEach((lab, i) => {
      if (i % labelStep !== 0 && i !== n - 1) return;
      xLabelsSvg += `<text class="axis-label" x="${x(i)}" y="${height - 6}" text-anchor="middle">${lab}</text>`;
    });

    const points = []; // flat list for wiring up listeners after innerHTML is set
    let dotsSvg = '';
    [[seriesA, labelA, colorA], [seriesB, labelB, colorB]].forEach(([series, seriesLabel, seriesColor]) => {
      series.forEach((p, i) => {
        const cx = x(i).toFixed(1);
        const cy = p.v != null ? y(p.v).toFixed(1) : yGap.toFixed(1);
        const isGap = p.v == null;
        const id = `dot-${containerId}-${points.length}`;
        dotsSvg += `<circle id="${id}" class="dot${isGap ? ' dot-gap' : ''}" cx="${cx}" cy="${cy}" r="3.5" fill="${isGap ? 'var(--line)' : seriesColor}" />`;
        points.push({ id, point: p, seriesLabel });
      });
    });

    const svg = `
      <svg class="chart" viewBox="0 0 ${width} ${height}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="גרף מחירים">
        ${gridSvg}
        <path class="pt" d="${pathFor(seriesA)}" stroke="${colorA}" />
        <path class="pt" d="${pathFor(seriesB)}" stroke="${colorB}" />
        ${dotsSvg}
        ${xLabelsSvg}
      </svg>`;
    container.innerHTML = svg;

    points.forEach(({ id, point, seriesLabel }) => {
      const el = document.getElementById(id);
      if (!el) return;
      const tip = point.v != null
        ? `<div class="tt-date">${heDateLong(point.date)}</div>
           <div class="tt-row"><span class="tt-series">${seriesLabel}</span><span class="tt-price">${nis(point.v)}</span></div>`
        : `<div class="tt-date">${heDateLong(point.date)}</div>
           <div class="tt-row"><span class="tt-series">${seriesLabel}</span><span class="tt-status">${point.status}</span></div>`;
      el.addEventListener('pointerenter', (evt) => showTooltip(evt, tip));
      el.addEventListener('pointermove', positionTooltip);
      el.addEventListener('pointerleave', hideTooltip);
    });
  }

  const style = getComputedStyle(document.documentElement);
  const accent = style.getPropertyValue('--accent').trim() || '#1f7a6c';
  const accentAlt = style.getPropertyValue('--accent-alt').trim() || '#3c5f8a';
  const accent2 = style.getPropertyValue('--accent2').trim() || '#b5703c';
  const accent2Alt = style.getPropertyValue('--accent2-alt').trim() || '#8a4a6b';

  const weekendLabel = 'סוף שבוע (3 לילות)';
  const midweekLabel = 'אמצע שבוע (4 לילות)';

  drawLineChart('chart-er-total', chartSeries.labels, chartSeries.erTotal3, chartSeries.erTotal4, accent, accentAlt, weekendLabel, midweekLabel);
  drawLineChart('chart-es-total', chartSeries.labels, chartSeries.esTotal3, chartSeries.esTotal4, accent2, accent2Alt, weekendLabel, midweekLabel);
  drawLineChart('chart-er-pn', chartSeries.labels, chartSeries.erPn3, chartSeries.erPn4, accent, accentAlt, weekendLabel, midweekLabel);
  drawLineChart('chart-es-pn', chartSeries.labels, chartSeries.esPn3, chartSeries.esPn4, accent2, accent2Alt, weekendLabel, midweekLabel);
})();
