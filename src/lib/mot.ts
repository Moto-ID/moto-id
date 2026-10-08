// Shared DVSA MOT-history rendering helpers — used by the owner-only pages
// in src/routes/vehicles.ts (MOT History, Mileage History) and by the
// public /verify page in src/routes/verify.ts (when an owner has opted a
// vehicle's MOT history and/or mileage chart into public visibility — see
// migrations/0011_mot_visibility_and_reminders.sql). Pulled into its own
// module so both route files render identical certificate cards and the
// identical chart rather than maintaining two copies.
//
// See migrations/0010_dvsa_mot_history.sql, src/lib/dvsa.ts and
// syncVehicleFromDvsa in src/routes/vehicles.ts. Each MOT test is rendered
// as a certificate-style record card (DVSA's API returns structured data
// only — there's no actual scan/PDF behind any of these, so this is built
// from that data rather than a literal document), plus a mileage-over-time
// chart.

import { esc } from "./html";
import { getMotTestsForVehicle, type MotTestRow, type MotDefectRow } from "./db";

// Guards every read of the mot_tests/mot_defects tables against migration
// 0010 not having been run yet on this database (D1 migrations are applied
// manually — see the project's deployment notes). Without this, every
// vehicle page would 500 for every user the moment this feature's code
// deployed, ahead of the migration actually being run. Once the migration
// is applied this is a no-op — it only ever catches the "no such table"
// case.
export async function getMotTestsSafely(db: D1Database, vehicleId: string): Promise<MotTestRow[]> {
  try {
    return await getMotTestsForVehicle(db, vehicleId);
  } catch (err) {
    console.error("getMotTestsForVehicle failed (has migration 0010 been run?):", err instanceof Error ? err.message : String(err));
    return [];
  }
}

export function formatMotDate(value: string | null): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return esc(value);
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

export function formatOdometer(value: number | null, unit: string | null): string {
  if (value === null) return "Not recorded";
  return `${value.toLocaleString("en-GB")} ${unit === "km" ? "km" : "mi"}`;
}

export function motTestCard(test: MotTestRow, defects: MotDefectRow[]): string {
  const passed = (test.test_result ?? "").toUpperCase() === "PASSED";
  const resultColor = passed ? "oklch(50% 0.14 142)" : "oklch(45% 0.18 25)";
  const defectRows = defects
    .map((d) => {
      const severe = d.dangerous || d.type === "DANGEROUS" || d.type === "MAJOR" || d.type === "FAIL";
      return `<div style="display:flex;gap:10px;padding:8px 0;border-top:1px solid var(--hairline);font-size:12px;line-height:1.5">
        <div style="flex:none;font-size:9.5px;letter-spacing:0.06em;color:${severe ? resultColor : "var(--ink-subtle)"};padding-top:2px;white-space:nowrap">${esc(d.type ?? "NOTE")}</div>
        <div style="color:var(--ink-muted)">${esc(d.text)}</div>
      </div>`;
    })
    .join("");

  return `
  <div style="border:1px solid var(--hairline);background:var(--bg);padding:20px 22px">
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px">
      <div>
        <div style="font-weight:600;font-size:14.5px;margin-bottom:2px">${formatMotDate(test.completed_date)}</div>
        <div style="font-size:11px;color:var(--ink-subtle)">MOT test no. <span class="mono">${esc(test.mot_test_number)}</span></div>
      </div>
      <div class="badge" style="border-color:${resultColor};color:${resultColor}">
        <div class="dot" style="background:${resultColor}"></div>${passed ? "PASS" : "FAIL"}
      </div>
    </div>
    <div style="display:flex;gap:28px;font-size:12.5px;margin-bottom:${defectRows ? "4px" : "0"}">
      <div><div style="font-size:10px;color:var(--ink-subtle);letter-spacing:0.06em;margin-bottom:3px">MILEAGE</div>${formatOdometer(test.odometer_value, test.odometer_unit)}</div>
      <div><div style="font-size:10px;color:var(--ink-subtle);letter-spacing:0.06em;margin-bottom:3px">EXPIRY</div>${formatMotDate(test.expiry_date)}</div>
    </div>
    ${defectRows}
  </div>`;
}

// Shared with the "Mileage History" tile's subtitle on the vehicle overview
// page, so both places agree on exactly what counts as a usable reading —
// the same filter mileageChart() itself applies before deciding whether it
// has enough points to draw a trend.
export function countMileageReadings(tests: MotTestRow[]): number {
  return tests.filter((t) => t.odometer_value !== null && t.completed_date && !Number.isNaN(new Date(t.completed_date as string).getTime())).length;
}

// A simple time-scaled SVG line chart of odometer readings across every
// test that has one — no charting library needed for a handful of points
// rendered server-side. Returns a placeholder message instead of a chart
// when there are fewer than two usable readings (a single point can't show
// a trend).
export function mileageChart(tests: MotTestRow[]): string {
  const points = tests
    .filter((t) => t.odometer_value !== null && t.completed_date)
    .map((t) => ({ date: new Date(t.completed_date as string), value: t.odometer_value as number, unit: t.odometer_unit }))
    .filter((p) => !Number.isNaN(p.date.getTime()))
    .sort((a, b) => a.date.getTime() - b.date.getTime());

  if (points.length < 2) {
    return `<div style="padding:28px 22px;font-size:12.5px;color:var(--ink-subtle);border:1px solid var(--hairline)">Not enough mileage readings yet to chart a history — this fills in as more MOT tests are recorded.</div>`;
  }

  const width = 640;
  const height = 240;
  const padLeft = 58;
  const padRight = 20;
  const padTop = 20;
  const padBottom = 38;
  const plotW = width - padLeft - padRight;
  const plotH = height - padTop - padBottom;

  const minT = points[0].date.getTime();
  const maxT = points[points.length - 1].date.getTime();
  const spanT = Math.max(maxT - minT, 1);
  // Padded around the actual readings (not forced to a zero baseline) —
  // mileage across a vehicle's MOT history is usually a tight, high range
  // (e.g. 80,000-85,000), and zero-anchoring a line chart like this would
  // flatten the very trend/inconsistency the chart exists to show.
  const values = points.map((p) => p.value);
  const rawMinV = Math.min(...values);
  const rawMaxV = Math.max(...values);
  const padV = Math.max((rawMaxV - rawMinV) * 0.12, 50);
  const minV = Math.max(rawMinV - padV, 0);
  const maxV = rawMaxV + padV;
  const spanV = Math.max(maxV - minV, 1);

  const x = (t: number) => padLeft + ((t - minT) / spanT) * plotW;
  const y = (v: number) => padTop + plotH - ((v - minV) / spanV) * plotH;

  const linePath = points.map((p, i) => `${i === 0 ? "M" : "L"}${x(p.date.getTime()).toFixed(1)},${y(p.value).toFixed(1)}`).join(" ");
  const unit = points[points.length - 1].unit === "km" ? "km" : "mi";

  const yTicks = [minV, (minV + maxV) / 2, maxV];
  const gridlines = yTicks
    .map(
      (v) => `
    <line x1="${padLeft}" y1="${y(v).toFixed(1)}" x2="${width - padRight}" y2="${y(v).toFixed(1)}" stroke="var(--hairline)" stroke-width="1"/>
    <text x="${padLeft - 10}" y="${y(v).toFixed(1)}" text-anchor="end" dominant-baseline="middle" font-size="10" fill="var(--ink-subtle)">${Math.round(v).toLocaleString("en-GB")}</text>`
    )
    .join("");

  // Date labels: every point if there are few enough, otherwise just the
  // first and last, so labels never overlap.
  const labelPoints = points.length <= 6 ? points : [points[0], points[points.length - 1]];
  const dateLabels = labelPoints
    .map(
      (p) => `
    <text x="${x(p.date.getTime()).toFixed(1)}" y="${height - padBottom + 20}" text-anchor="middle" font-size="10" fill="var(--ink-subtle)">${esc(
        p.date.toLocaleDateString("en-GB", { month: "short", year: "2-digit" })
      )}</text>`
    )
    .join("");

  // A visible 4px marker plus an invisible wider hit target (8px radius) for
  // each reading, with the real date/mileage carried as data attributes for
  // the hover tooltip below rather than relied on as the only access to that
  // value — every mark a label could reach is already on the axis, this is
  // just a precise read-out on demand.
  const dots = points
    .map((p) => {
      const cx = x(p.date.getTime()).toFixed(1);
      const cy = y(p.value).toFixed(1);
      const label = `${esc(p.date.toLocaleDateString("en-GB"))}: ${p.value.toLocaleString("en-GB")} ${unit}`;
      return `<g class="mot-point" data-label="${label}">
        <circle cx="${cx}" cy="${cy}" r="10" fill="transparent"/>
        <circle cx="${cx}" cy="${cy}" r="4" fill="var(--bg)" stroke="var(--ink)" stroke-width="2"/>
      </g>`;
    })
    .join("");

  return `
  <div style="border:1px solid var(--hairline);padding:18px 10px 6px;background:var(--bg);position:relative" id="mileageChartWrap">
    <div id="mileageTooltip" style="position:absolute;display:none;pointer-events:none;background:var(--ink);color:var(--bg);font-size:11px;padding:5px 9px;border-radius:4px;white-space:nowrap;transform:translate(-50%,-100%);z-index:10"></div>
    <svg viewBox="0 0 ${width} ${height}" style="width:100%;height:auto;display:block" role="img" aria-label="Mileage history, in ${unit}">
      ${gridlines}
      <path d="${linePath}" fill="none" stroke="var(--ink)" stroke-width="2"/>
      ${dots}
      ${dateLabels}
    </svg>
  </div>
  <script>
    (function () {
      var wrap = document.getElementById('mileageChartWrap');
      var tooltip = document.getElementById('mileageTooltip');
      if (!wrap || !tooltip) return;
      var svg = wrap.querySelector('svg');
      Array.prototype.slice.call(wrap.querySelectorAll('.mot-point')).forEach(function (point) {
        point.addEventListener('mouseenter', function () {
          var circle = point.querySelector('circle:last-child');
          var ptRect = circle.getBoundingClientRect();
          var wrapRect = wrap.getBoundingClientRect();
          tooltip.textContent = point.getAttribute('data-label');
          tooltip.style.left = (ptRect.left + ptRect.width / 2 - wrapRect.left) + 'px';
          tooltip.style.top = (ptRect.top - wrapRect.top - 8) + 'px';
          tooltip.style.display = 'block';
        });
        point.addEventListener('mouseleave', function () {
          tooltip.style.display = 'none';
        });
      });
    })();
  </script>`;
}
