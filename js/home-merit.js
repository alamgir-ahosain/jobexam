/* ============================================================
   JobExam — home-merit.js
   Home-page "Your Merit List" — a personal, cross-subject
   practice log built entirely from this browser's own
   localStorage history (see subject-list.js: appendHistory()).
   No server, no shared ranking — just this device's own attempts,
   pulled together from every subject instead of one at a time.
   ============================================================ */

const HOME_PASS_THRESHOLD = 60; // % needed to count as "Passed"

function collectAllHistory(){
  const records = [];
  for(let i=0;i<localStorage.length;i++){
    const key = localStorage.key(i);
    const m = key && key.match(/^jobexam:history:(.+):exam(\d+)$/);
    if(!m) continue;
    const subjectId = m[1];
    const examIndex = parseInt(m[2], 10);
    let arr;
    try{ arr = JSON.parse(localStorage.getItem(key)) || []; }
    catch(e){ continue; }
    arr.forEach(rec => records.push(Object.assign({}, rec, { subjectId, examIndex })));
  }
  return records;
}

function renderHomeMerit(){
  const container = document.getElementById("homeMeritList");
  if(!container) return;

  const records = collectAllHistory();

  if(records.length === 0){
    container.innerHTML =
      `<div class="empty-note">No exam attempts yet on this device. Finish any exam and your personal results will start showing up here.</div>`;
    return;
  }

  const pctVals = records.map(r => r.pct);
  const best = Math.max(...pctVals);
  const avg = Math.round(pctVals.reduce((s,v) => s+v, 0) / pctVals.length);
  const passedCount = records.filter(r => r.pct >= HOME_PASS_THRESHOLD).length;
  const passRate = Math.round((passedCount / records.length) * 100);

  const ranked = [...records].sort((a,b) =>
    b.pct - a.pct ||
    new Date(b.finishedAt) - new Date(a.finishedAt)
  );

  const medals = ["\uD83E\uDD47","\uD83E\uDD48","\uD83E\uDD49"];
  const rows = ranked.slice(0, 10).map((r, i) => {
    const subj = (typeof getSubject === "function") ? getSubject(r.subjectId) : null;
    const subjName = subj ? subj.name : r.subjectId;
    const rankLabel = i < 3 ? medals[i] : `#${i+1}`;
    const dateLabel = r.finishedAt
      ? new Date(r.finishedAt).toLocaleDateString(undefined, { month:"short", day:"numeric", year:"numeric" })
      : "\u2014";
    const passed = r.pct >= HOME_PASS_THRESHOLD;
    const statusClass = passed ? "pass" : "fail";
    const statusLabel = passed ? "Passed" : "Below Pass";

    return `
      <div class="merit-item ${statusClass}">
        <div class="merit-rank">${rankLabel}</div>
        <div class="merit-main">
          <div class="merit-top">
            <span class="merit-name">${subjName} \u00B7 Exam ${r.examIndex+1}</span>
            <span class="merit-date">${dateLabel}</span>
          </div>
          <div class="merit-meta">
            <span class="merit-score">${r.pct}%</span>
            <span>${r.correct}/${r.total} correct</span>
            <span class="merit-status ${statusClass}">${statusLabel}</span>
          </div>
        </div>
      </div>`;
  }).join("");

  container.innerHTML = `
    <div class="merit-stats">
      <div class="merit-stat"><div class="l">Attempts</div><div class="n">${records.length}</div></div>
      <div class="merit-stat"><div class="l">Best Score</div><div class="n hi">${best}%</div></div>
      <div class="merit-stat"><div class="l">Average</div><div class="n">${avg}%</div></div>
      <div class="merit-stat"><div class="l">Pass Rate</div><div class="n">${passRate}%</div></div>
    </div>
    <div class="merit-list">${rows}</div>
  `;
}

document.addEventListener("DOMContentLoaded", renderHomeMerit);
