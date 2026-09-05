/* ============================================================
   JobExam — subject-list.js
   Generic exam engine. Every subject page calls:
     initSubjectPage("cryptography");
   after auth.js and common.js have loaded. Questions are fetched
   as JSON, lazily, only after the access password is verified.
   ============================================================ */

let SUBJECT = null;
let QUESTIONS = [];
let EXAMS = 0;

let currentExamIndex = null;   // 0-based
let currentQ = 0;              // 0-based, within the current exam
let progress = null;           // progress object for the current exam
let examTimerInterval = null;  // interval handle for the countdown timer

/* ---------------- Test-taker profile (name, no login) ----------------
   Collected once per browser, the first time someone actually starts/
   resumes/retakes an exam. Reused after that so they're never asked
   again on this device. This is NOT authentication — there's no
   server, so nothing stops someone from typing any name they like.
   It only exists so their own personal exam log (see below) has a
   name attached to it, which is why every attempt is also labelled
   "Guest" everywhere in the UI: it's an honor-system name, not a
   verified identity. */
const PROFILE_KEY = "jobexam:profile";
const PASS_THRESHOLD = 60; // % needed for an attempt to count as "Passed" in the personal log

function getProfile(){
  try{
    const raw = localStorage.getItem(PROFILE_KEY);
    return raw ? JSON.parse(raw) : null;
  }catch(e){ return null; }
}

function saveProfile(profile){
  try{ localStorage.setItem(PROFILE_KEY, JSON.stringify(profile)); }catch(e){ /* storage unavailable */ }
}

/* Gate any exam-starting action on having a saved name. If already
   saved on this device, onSuccess runs immediately. */
function requireProfile(onSuccess){
  const p = getProfile();
  if(p && p.name){ onSuccess(); return; }
  showProfileModal(onSuccess);
}

function showProfileModal(onSuccess){
  if(document.getElementById("profileOverlay")) return; // already open

  const overlay = document.createElement("div");
  overlay.id = "profileOverlay";
  overlay.className = "profile-overlay";
  overlay.innerHTML = `
    <div class="profile-modal" role="dialog" aria-modal="true" aria-labelledby="profileTitle">
      <div class="profile-seal">\u270D\uFE0F</div>
      <h3 class="profile-title" id="profileTitle">Before You Begin</h3>
      <p class="profile-desc">Enter a name to label your results in <b>your own</b> exam history on this device. There's no account or login \u2014 nothing is verified or shared anywhere else.</p>
      <div class="profile-field">
        <label for="profileName">Name</label>
        <input type="text" class="profile-input" id="profileName" placeholder="e.g. Alamgir Hosain" autocomplete="off" />
      </div>
      <div class="profile-error" id="profileError">Please enter a name (2+ characters).</div>
      <div class="profile-actions">
        <button class="btn btn-outline" id="profileCancel" type="button">Cancel</button>
        <button class="btn btn-gold" id="profileSubmit" type="button">Continue</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  const modalEl = overlay.querySelector(".profile-modal");
  const nameInput = document.getElementById("profileName");
  const error = document.getElementById("profileError");
  nameInput.focus();

  function closeModal(){
    document.removeEventListener("keydown", onKeydown);
    overlay.remove();
  }

  function trySubmit(){
    const name = nameInput.value.trim();

    if(name.length >= 2){
      saveProfile({ name, savedAt: new Date().toISOString() });
      closeModal();
      onSuccess();
    } else {
      error.textContent = "Please enter a name (2+ characters).";
      error.classList.add("show");
      modalEl.classList.remove("pw-shake");
      void modalEl.offsetWidth; // restart animation
      modalEl.classList.add("pw-shake");
    }
  }

  function onKeydown(e){
    if(e.key === "Enter") trySubmit();
    if(e.key === "Escape") closeModal();
  }

  document.getElementById("profileSubmit").addEventListener("click", trySubmit);
  document.getElementById("profileCancel").addEventListener("click", closeModal);
  overlay.addEventListener("click", (e) => { if(e.target === overlay) closeModal(); });
  document.addEventListener("keydown", onKeydown);
}

/* ---------------- Personal exam history ("Merit List") ----------------
   Pure client-side, per-browser log of every completed attempt at a
   given subject+exam. There is no shared server, so this can only ever
   rank THIS device's own attempts against each other — it is a personal
   practice log, not a real leaderboard against other test-takers. */

function historyKey(subjectId, examIndex){
  return `jobexam:history:${subjectId}:exam${examIndex}`;
}

function loadHistory(subjectId, examIndex){
  try{
    const raw = localStorage.getItem(historyKey(subjectId, examIndex));
    return raw ? JSON.parse(raw) : [];
  }catch(e){ return []; }
}

function appendHistory(subjectId, examIndex, record){
  const list = loadHistory(subjectId, examIndex);
  list.push(record);
  try{ localStorage.setItem(historyKey(subjectId, examIndex), JSON.stringify(list)); }catch(e){ /* storage unavailable */ }
}

function showMeritList(examIndex){
  if(document.getElementById("meritOverlay")) return; // already open

  const attempts = loadHistory(SUBJECT.id, examIndex);
  const profile = getProfile();

  let bodyHtml;
  if(attempts.length === 0){
    bodyHtml = `<div class="merit-empty">No attempts logged yet for Exam ${examIndex+1}. Finish it once and it'll start showing up here.</div>`;
  } else {
    const pctVals = attempts.map(a => a.pct);
    const best = Math.max(...pctVals);
    const avg = Math.round(pctVals.reduce((s,v)=>s+v,0) / pctVals.length);
    const passedCount = attempts.filter(a => a.pct >= PASS_THRESHOLD).length;
    const passRate = Math.round((passedCount / attempts.length) * 100);

    const ranked = [...attempts].sort((a,b) =>
      b.pct - a.pct ||
      (a.timeSec ?? Infinity) - (b.timeSec ?? Infinity) ||
      new Date(b.finishedAt) - new Date(a.finishedAt)
    );

    const medals = ["\uD83E\uDD47","\uD83E\uDD48","\uD83E\uDD49"];
    const rows = ranked.map((a, i) => {
      const rankLabel = i < 3 ? medals[i] : `#${i+1}`;
      const dateLabel = a.finishedAt
        ? new Date(a.finishedAt).toLocaleDateString(undefined, { month:"short", day:"numeric", year:"numeric" })
        : "\u2014";
      const timeLabel = (a.timeSec !== null && a.timeSec !== undefined) ? formatTime(a.timeSec) : "N/A";
      const passed = a.pct >= PASS_THRESHOLD;
      const statusClass = passed ? "pass" : "fail";
      const statusLabel = passed ? "Passed" : "Below Pass";

      return `
        <div class="merit-item ${statusClass}">
          <div class="merit-rank">${rankLabel}</div>
          <div class="merit-main">
            <div class="merit-top">
              <span class="merit-name">${a.name || "Guest"}</span>
              <span class="merit-date">${dateLabel}</span>
            </div>
            <div class="merit-meta">
              <span class="merit-score">${a.pct}%</span>
              <span>${a.correct}/${a.total} correct</span>
              <span>${timeLabel}</span>
              <span class="merit-status ${statusClass}">${statusLabel}</span>
            </div>
          </div>
        </div>`;
    }).join("");

    bodyHtml = `
      <div class="merit-stats">
        <div class="merit-stat"><div class="l">Attempts</div><div class="n">${attempts.length}</div></div>
        <div class="merit-stat"><div class="l">Best Score</div><div class="n hi">${best}%</div></div>
        <div class="merit-stat"><div class="l">Average</div><div class="n">${avg}%</div></div>
        <div class="merit-stat"><div class="l">Pass Rate</div><div class="n">${passRate}%</div></div>
      </div>
      <div class="merit-list">${rows}</div>
    `;
  }

  const overlay = document.createElement("div");
  overlay.id = "meritOverlay";
  overlay.className = "merit-overlay";
  overlay.innerHTML = `
    <div class="merit-modal" role="dialog" aria-modal="true" aria-labelledby="meritTitle">
      <div class="merit-head">
        <div>
          <div class="merit-eyebrow">Your Personal Exam Log</div>
          <h3 id="meritTitle">${SUBJECT.name} \u2014 Exam ${examIndex+1}</h3>
          ${profile ? `<div class="merit-who">Logged as <b>${profile.name}</b> on this device</div>` : ``}
        </div>
        <button class="btn btn-outline" id="meritClose" type="button">Close</button>
      </div>
      <div class="merit-body">${bodyHtml}</div>
    </div>
  `;
  document.body.appendChild(overlay);

  function closeModal(){
    document.removeEventListener("keydown", onKeydown);
    overlay.remove();
  }
  function onKeydown(e){ if(e.key === "Escape") closeModal(); }

  document.getElementById("meritClose").addEventListener("click", closeModal);
  overlay.addEventListener("click", (e) => { if(e.target === overlay) closeModal(); });
  document.addEventListener("keydown", onKeydown);
}

/* ---------------- Bookmarks ("Watchlist") ----------------
   Per-subject, per-device list of questions marked important.
   Each bookmark is keyed by a fixed composite id "examIndex-qInExam"
   (both 0-based) — NOT a computed running index — so it can never
   drift or collide with another question. */

function bookmarkKey(subjectId){
  return `jobexam:bookmarks:${subjectId}`;
}

function loadBookmarks(subjectId){
  try{
    const raw = localStorage.getItem(bookmarkKey(subjectId));
    return raw ? JSON.parse(raw) : [];
  }catch(e){ return []; }
}

function saveBookmarks(subjectId, list){
  try{ localStorage.setItem(bookmarkKey(subjectId), JSON.stringify(list)); }
  catch(e){ /* storage unavailable — fail silently */ }
}

function makeBookmarkId(examIndex, qInExam){
  return `${examIndex}-${qInExam}`;
}

function isBookmarked(subjectId, examIndex, qInExam){
  const id = makeBookmarkId(examIndex, qInExam);
  return loadBookmarks(subjectId).some(b => b.id === id);
}

/* Reads currentExamIndex / currentQ at call-time — always the
   question actually on screen right now. */
function toggleCurrentBookmark(){
  if(currentExamIndex === null || !progress) return;

  const examIndex = currentExamIndex;
  const qInExam = currentQ;
  const id = makeBookmarkId(examIndex, qInExam);
  const q = getExamQuestions()[qInExam];
  if(!q) return;

  let list = loadBookmarks(SUBJECT.id);
  const existingIdx = list.findIndex(b => b.id === id);

  if(existingIdx !== -1){
    list.splice(existingIdx, 1); // un-bookmark — removes ONLY this exact id
  } else {
    list.push({
      id,
      examIndex,
      qInExam,
      question: q.question,
      options: q.options,
      answer: q.answer,
      explanation: q.explanation,
      savedAt: new Date().toISOString()
    });
  }
  saveBookmarks(SUBJECT.id, list);
  updateBookmarkButton();
}

function updateBookmarkButton(){
  const btn = document.getElementById("bookmarkBtn");
  if(!btn || currentExamIndex === null) return;
  const marked = isBookmarked(SUBJECT.id, currentExamIndex, currentQ);
  btn.classList.toggle("active", marked);
  btn.innerHTML = marked ? "&#9733;" : "&#9734;"; // ★ vs ☆
  btn.title = marked ? "Remove bookmark" : "Bookmark this question";
}

function removeBookmark(subjectId, id){
  const list = loadBookmarks(subjectId).filter(b => b.id !== id);
  saveBookmarks(subjectId, list);
}

/* Jump straight to a bookmarked question, opening its exam if needed. */
function goToBookmark(examIndex, qInExam){
  document.getElementById("bookmarksOverlay")?.remove();
  const proceed = () => {
    startExam(examIndex);
    goTo(qInExam);
  };
  if(isPreviewSubject()) requireProfile(proceed);
  else requireAccess(() => requireProfile(proceed));
}

function bookmarksListHtml(list, letters){
  if(list.length === 0){
    return `<div class="merit-empty">No bookmarks yet for ${SUBJECT.name}. Tap the ☆ next to any question while taking an exam to save it here.</div>`;
  }
  return list.map(b => `
    <div class="bookmark-item">
      <div class="bookmark-top">
        <span class="bookmark-tag">Exam ${b.examIndex+1} · Q${b.qInExam+1}</span>
        <button class="bookmark-remove" data-remove="${b.id}" title="Remove">&times;</button>
      </div>
      <p class="bookmark-q">${b.question}</p>
      <div class="bookmark-answer">Answer: <b>${letters[b.answer]}. ${b.options[b.answer]}</b></div>
      <button class="btn btn-outline" data-goto="${b.examIndex}|${b.qInExam}">Go to Question</button>
    </div>
  `).join("");
}

function wireBookmarkListButtons(container){
  container.querySelectorAll("[data-goto]").forEach(btn => {
    btn.addEventListener("click", () => {
      const [examIndex, qInExam] = btn.dataset.goto.split("|").map(Number);
      goToBookmark(examIndex, qInExam);
    });
  });
  container.querySelectorAll("[data-remove]").forEach(btn => {
    btn.addEventListener("click", () => {
      removeBookmark(SUBJECT.id, btn.dataset.remove);
      // re-render whichever bookmark surface is currently open
      if(document.getElementById("bookmarksOverlay")) { document.getElementById("bookmarksOverlay").remove(); showBookmarksModal(); }
      const inlineBox = document.getElementById("resultsBookmarksBox");
      if(inlineBox) renderResultsBookmarksBox();
    });
  });
}

function showBookmarksModal(){
  if(document.getElementById("bookmarksOverlay")) return;

  const letters = ["A","B","C","D"];
  const list = loadBookmarks(SUBJECT.id).sort((a,b) => a.examIndex - b.examIndex || a.qInExam - b.qInExam);

  const overlay = document.createElement("div");
  overlay.id = "bookmarksOverlay";
  overlay.className = "merit-overlay";
  overlay.innerHTML = `
    <div class="merit-modal" role="dialog" aria-modal="true" aria-labelledby="bookmarksTitle">
      <div class="merit-head">
        <div>
          <div class="merit-eyebrow">Saved on this device</div>
          <h3 id="bookmarksTitle">${SUBJECT.name} — Bookmarks (${list.length})</h3>
        </div>
        <button class="btn btn-outline" id="bookmarksClose" type="button">Close</button>
      </div>
      <div class="merit-body">${bookmarksListHtml(list, letters)}</div>
    </div>
  `;
  document.body.appendChild(overlay);
  wireBookmarkListButtons(overlay);

  function closeModal(){ document.removeEventListener("keydown", onKeydown); overlay.remove(); }
  function onKeydown(e){ if(e.key === "Escape") closeModal(); }
  document.getElementById("bookmarksClose").addEventListener("click", closeModal);
  overlay.addEventListener("click", (e) => { if(e.target === overlay) closeModal(); });
  document.addEventListener("keydown", onKeydown);
}

/* Renders/refreshes the bookmarks box shown right on the results screen. */
function renderResultsBookmarksBox(){
  const box = document.getElementById("resultsBookmarksBox");
  if(!box) return;
  const letters = ["A","B","C","D"];
  const list = loadBookmarks(SUBJECT.id)
    .filter(b => b.examIndex === currentExamIndex)
    .sort((a,b) => a.qInExam - b.qInExam);

  box.innerHTML = `
    <h3 class="side-title" style="margin-top:0;">&#9733; Bookmarked in this Exam (${list.length})</h3>
    ${bookmarksListHtml(list, letters)}
  `;
  wireBookmarkListButtons(box);
}

/* ---------------- Init: gate on password, THEN fetch questions ----------------
   Exception: PREVIEW_SUBJECT_ID (see common.js) never needs the password —
   it's a fixed 30-question demo anyone can try straight from the modal. */

function isPreviewSubject(){
  return SUBJECT && SUBJECT.id === PREVIEW_SUBJECT_ID;
}

async function initSubjectPage(subjectId){
  SUBJECT = getSubject(subjectId);
  if(!SUBJECT){ console.error("Unknown subject:", subjectId); return; }

  document.getElementById("subjectTitle").textContent = SUBJECT.name;
  document.title = SUBJECT.name + " — JobExam";

  const loadQuestions = async () => {
    try{
      QUESTIONS = await getQuestionsAsync(SUBJECT);
    }catch(err){
      document.getElementById("examList").innerHTML =
        `<div class="empty-note">Failed to load questions. Please refresh and try again.</div>`;
      console.error(err);
      return;
    }
    EXAMS = examCountFromTotal(QUESTIONS.length);

    renderSubjectHeader();
    renderExamList();

    // Deep-link support: cryptography.html#exam=3
    const m = location.hash.match(/exam=(\d+)/);
    if(m){
      const idx = parseInt(m[1],10) - 1;
      if(idx >= 0 && idx < EXAMS){
        if(isPreviewSubject()) requireProfile(() => startExam(idx));
        else startExam(idx);
      }
    }
  };

  if(isPreviewSubject()){
    loadQuestions();
    return;
  }

  // Nothing is fetched yet — show a locked placeholder immediately.
  document.getElementById("statTotalQ").textContent = "—";
  document.getElementById("statTotalExams").textContent = "—";
  document.getElementById("statCompleted").textContent = "—";
  document.getElementById("examList").innerHTML =
    `<div class="empty-note">Enter the access password to view this subject's exams.</div>`;

  requireAccess(loadQuestions);
}

/* ---------------- Subject overview ---------------- */

function renderSubjectHeader(){
  const total = QUESTIONS.length;
  const exams = EXAMS;
  let completed = 0;
  for(let i=0;i<exams;i++){
    const p = loadProgress(SUBJECT.id, i);
    if(p && p.status === "completed") completed++;
  }
  document.getElementById("statTotalQ").textContent = total;
  document.getElementById("statTotalExams").textContent = exams;
  document.getElementById("statCompleted").textContent = `${completed}/${exams}`;

  // Bookmarks entry point — inject once, above the exam list
  if(!document.getElementById("bookmarksEntryBtn")){
    const count = loadBookmarks(SUBJECT.id).length;
    const btn = document.createElement("button");
    btn.id = "bookmarksEntryBtn";
    btn.className = "btn btn-outline";
    btn.style.margin = "0 0 20px";
    btn.innerHTML = `&#9733; My Bookmarks (${count})`;
    btn.addEventListener("click", showBookmarksModal);
    const home = document.getElementById("subjectHome");
    const list = document.getElementById("examList");
    if(home && list) home.insertBefore(btn, list);
  } else {
    document.getElementById("bookmarksEntryBtn").innerHTML = `&#9733; My Bookmarks (${loadBookmarks(SUBJECT.id).length})`;
  }
}

function statusOf(examIndex){
  const p = loadProgress(SUBJECT.id, examIndex);
  if(p && p.status === "completed") return { key:"done", label:"Completed", p };
  if(p && p.status === "in-progress") return { key:"progress", label:"In Progress", p };
  return { key:"new", label:"Not Started", p:null };
}

function renderExamList(){
  const list = document.getElementById("examList");
  list.innerHTML = "";
  list.classList.add("ticket-grid");
  list.classList.remove("grid");

  if(QUESTIONS.length === 0){
    list.innerHTML = `<div class="empty-note">No questions loaded for this subject yet. Add them to <code>data/${SUBJECT.id}.json</code>.</div>`;
    return;
  }

  for(let i=0;i<EXAMS;i++){
    const { start, end, count } = examRange(i, QUESTIONS.length);
    const st = statusOf(i);
    const card = document.createElement("div");
    card.className = "ticket-card";

    // seal + stub style per status — an icon, not the exam number
    // (the number already appears once, in the card title below)
    let sealClass = "", sealGlyph = "&#128221;", statusClass = ""; // 📝 not started
    if(st.key === "done"){
      sealClass = "emerald"; sealGlyph = "&#10003;"; statusClass = "pass"; // ✓
    } else if(st.key === "progress"){
      sealClass = "gold"; sealGlyph = "&#9686;"; statusClass = ""; // ◔
    }

    let actionsHtml = "";
    if(st.key === "done"){
      actionsHtml = `
        <div class="ticket-actions">
          <button class="btn btn-outline btn-merit" data-merit="${i}">Merit List</button>
          <button class="btn" data-action="retake" data-exam="${i}">Retake Exam</button>
        </div>`;
    } else if(st.key === "progress"){
      const answered = st.p.answers.filter(a => a !== null).length;
      const allAnswered = answered === count;
      actionsHtml = `
        <div class="ticket-actions">
          <button class="btn btn-outline btn-merit" data-merit="${i}">Merit List</button>
          <button class="btn" data-action="resume" data-exam="${i}">${allAnswered ? "Finish Exam" : "Resume Exam"}</button>
        </div>`;
    } else {
      actionsHtml = `
        <div class="ticket-actions">
          <button class="btn" data-action="start" data-exam="${i}">Start Exam</button>
        </div>`;
    }

    const answeredCount = st.p ? st.p.answers.filter(a => a !== null).length : 0;
    const progressPct = st.key === "done" ? 100 : (count ? Math.round((answeredCount/count)*100) : 0);

    card.innerHTML = `
      <div class="ticket-stub">
        <div class="ticket-seal ${sealClass}">${sealGlyph}</div>
        <div class="ticket-status ${statusClass}">${st.label}</div>
      </div>
      <div class="ticket-body">
        <div class="ticket-top">
          <div>
            <h3 class="ticket-title">Exam ${i+1}</h3>
            <div class="ticket-sub">Questions ${start}&ndash;${end}</div>
          </div>
        </div>
        <div class="ticket-meta">
          <span class="ticket-chip">${count} Questions</span>
          <span class="ticket-chip">${Math.round(examDurationSeconds(count)/60)} min</span>
        </div>
        <div class="ticket-progress"><span style="width:${progressPct}%"></span></div>
        ${actionsHtml}
      </div>
    `;

    card.querySelectorAll("button[data-action]").forEach(btn => {
      const action = btn.dataset.action;
      const idx = parseInt(btn.dataset.exam, 10);
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        const proceed = () => {
          // Then make sure we have a name to label this attempt with in
          // the personal exam log. Only asked once per device.
          requireProfile(() => {
            if(action === "retake") retakeExamFromList(idx);
            else startExam(idx); // start / resume just opens the exam at its saved state
          });
        };
        // Password-gate taking/resuming/retaking an exam — except the
        // free preview subject, which never needs it. If the tab is
        // already unlocked this session (e.g. via the subject card on the
        // registry page), this runs immediately with no extra prompt.
        if(isPreviewSubject()) proceed();
        else requireAccess(proceed);
      });
    });

    card.querySelectorAll("button[data-merit]").forEach(btn => {
      const idx = parseInt(btn.dataset.merit, 10);
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        if(isPreviewSubject()) showMeritList(idx);
        else requireAccess(() => { showMeritList(idx); });
      });
    });

    list.appendChild(card);
  }
}

/* ---------------- Timer helpers ---------------- */

function formatTime(totalSeconds){
  const s = Math.max(0, Math.floor(totalSeconds));
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${sec.toString().padStart(2,"0")}`;
}

function stopExamTimer(){
  if(examTimerInterval){
    clearInterval(examTimerInterval);
    examTimerInterval = null;
  }
}

function startExamTimer(){
  stopExamTimer();
  const timerEl = document.getElementById("examTimer");
  if(!timerEl) return;

  // Review mode (already completed) has no countdown — hide it.
  if(progress.status === "completed"){
    timerEl.style.display = "none";
    return;
  }
  timerEl.style.display = "";

  function tick(){
    if(!progress.examEndTime){ timerEl.style.display = "none"; return; }
    const remainingMs = progress.examEndTime - Date.now();
    const remainingSec = Math.ceil(remainingMs / 1000);

    if(remainingSec <= 0){
      timerEl.textContent = "0:00";
      timerEl.classList.add("low");
      stopExamTimer();
      autoFinishExam();
      return;
    }

    timerEl.textContent = formatTime(remainingSec);
    timerEl.classList.toggle("low", remainingSec <= 30);
  }

  tick();
  examTimerInterval = setInterval(tick, 1000);
}

/* Called when the countdown reaches zero — finishes the exam
   automatically without requiring the user to click "Finish Exam". */
function autoFinishExam(){
  if(!progress || progress.status === "completed") return; // guard double-fire
  finishExam();
}

/* ---------------- Starting / resuming an exam ---------------- */

/* Reset a completed exam's saved progress, then open it as a clean attempt.
   Used by the "Retake Exam" button on the subject overview's exam cards. */
function retakeExamFromList(examIndex){
  const { count } = examRange(examIndex, QUESTIONS.length);
  const fresh = emptyProgress(count);
  fresh.status = "in-progress";
  fresh.examEndTime = Date.now() + examDurationSeconds(count) * 1000;
  saveProgress(SUBJECT.id, examIndex, fresh);
  startExam(examIndex);
}

function startExam(examIndex){
  currentExamIndex = examIndex;
  const { start, end, count } = examRange(examIndex, QUESTIONS.length);

  const existing = loadProgress(SUBJECT.id, examIndex);
  progress = existing || emptyProgress(count);
  if(progress.status === "not-started") progress.status = "in-progress";

  // Set the timer deadline the first time this attempt starts. On resume,
  // examEndTime is already saved, so the countdown continues from where
  // it left off in real wall-clock time — even across page reloads.
  if(progress.status === "in-progress" && !progress.examEndTime){
    progress.examEndTime = Date.now() + examDurationSeconds(count) * 1000;
    saveProgress(SUBJECT.id, examIndex, progress);
  }

  currentQ = 0;
  // resume at first unanswered question, if any — but only for exams still
  // in progress. Completed exams are opened in read-only review mode, so
  // there's no "next unanswered" to resume to; always start at question 1.
  if(progress.status !== "completed"){
    const firstUnanswered = progress.answers.findIndex(a => a === null);
    if(firstUnanswered !== -1) currentQ = firstUnanswered;
  }

  document.getElementById("subjectHome")?.classList.add("hidden");
  document.getElementById("examView")?.classList.add("active");
  document.getElementById("resultsView").style.display = "none";
  document.getElementById("examTakingArea").style.display = "grid";

  location.hash = `exam=${examIndex+1}`;
  document.getElementById("examTitleLabel").textContent = `Exam ${examIndex+1}`;
  document.getElementById("examSubLabel").textContent = `${SUBJECT.name} · Questions ${start}\u2013${end}`;

  renderOmrGrid();
  renderQuestion();
  renderScorePanel();
  startExamTimer();

  const finishBtn = document.getElementById("finishExamBtn");
  if(finishBtn) finishBtn.style.display = (progress.status === "completed") ? "none" : "";
}

function exitToSubjectHome(){
  stopExamTimer();
  document.getElementById("subjectHome")?.classList.remove("hidden");
  document.getElementById("examView")?.classList.remove("active");
  history.replaceState(null, "", location.pathname);
  renderSubjectHeader();
  renderExamList();
}

/* ---------------- Rendering a question ---------------- */

function getExamQuestions(){
  const { start, end } = examRange(currentExamIndex, QUESTIONS.length);
  return QUESTIONS.slice(start-1, end);
}

function renderQuestion(){
  const qs = getExamQuestions();
  const q = qs[currentQ];
  const total = qs.length;

  document.getElementById("qCount").textContent = `Question ${currentQ+1} of ${total}`;
  document.getElementById("qText").textContent = q.question;

  const answered = progress.answers[currentQ];
  // Once an exam is marked "completed", it opens in read-only review mode:
  // every option's correctness is revealed. While an exam is still in
  // progress, options never reveal correct/incorrect — an answered
  // question just shows which option was picked (locked, no verdict).
  const reviewMode = progress.status === "completed";
  const letters = ["A","B","C","D"];
  const optionsWrap = document.getElementById("optionsWrap");
  optionsWrap.innerHTML = "";

  q.options.forEach((optText, i) => {
    const btn = document.createElement("button");
    btn.className = "opt";
    btn.type = "button";
    btn.innerHTML = `<span class="opt-letter">${letters[i]}</span><span>${optText}</span>`;

    if(reviewMode){
      btn.disabled = true;
      if(answered !== null){
        if(i === q.answer) btn.classList.add("correct");
        else if(i === answered) btn.classList.add("incorrect");
        else btn.classList.add("dim");
      } else {
        // left blank when the exam was finished — reveal the correct
        // answer, but never make it clickable again.
        if(i === q.answer) btn.classList.add("correct");
        else btn.classList.add("dim");
      }
    } else {
      // Exam still in progress — options always stay clickable so the
      // user can change their mind at any time (e.g. after jumping back
      // to a previous question). Only the correctness reveal is locked
      // until review mode; the previously picked option is highlighted
      // neutrally, not as correct/incorrect.
      if(answered !== null && i === answered) btn.classList.add("selected");
      btn.addEventListener("click", () => selectAnswer(i));
    }
    optionsWrap.appendChild(btn);
  });

  const verdict = document.getElementById("verdict");
  if(reviewMode){
    if(answered !== null){
      const wasCorrect = answered === q.answer;
      verdict.className = "verdict show " + (wasCorrect ? "correct" : "incorrect");
      verdict.innerHTML = `
        <div class="verdict-head">${wasCorrect ? "✓ Correct" : "✗ Incorrect"}${!wasCorrect ? ` — correct answer is ${letters[q.answer]}` : ""}</div>
        <div class="verdict-exp">${q.explanation}</div>
      `;
    } else {
      verdict.className = "verdict show incorrect";
      verdict.innerHTML = `
        <div class="verdict-head">Not Answered — correct answer is ${letters[q.answer]}</div>
        <div class="verdict-exp">${q.explanation}</div>
      `;
    }
  } else {
    // No inline verdict/explanation while the exam is in progress —
    // answers auto-advance to the next question instead.
    verdict.className = "verdict";
    verdict.innerHTML = "";
  }

  const jumpInputEl = document.getElementById("jumpInput");
  if(jumpInputEl){
    jumpInputEl.value = currentQ+1;
    jumpInputEl.max = total;
  }

  updateOmrGrid();
  updateProgressBar();
  updateBookmarkButton();
}

function selectAnswer(optionIndex){
  if(progress.status === "completed") return; // exam finished — review mode is read-only
  const qs = getExamQuestions();
  const q = qs[currentQ];
  const wasUnanswered = progress.answers[currentQ] === null;

  progress.answers[currentQ] = optionIndex;
  progress.correctMap[currentQ] = (optionIndex === q.answer);
  saveProgress(SUBJECT.id, currentExamIndex, progress);

  renderQuestion();   // brief selected flash on the chosen option
  renderScorePanel();

  // Only auto-advance the first time a question is answered. Changing an
  // already-answered question (after jumping back to it) just updates the
  // selection in place — no forced navigation away, since the user came
  // back on purpose to fix their answer.
  if(wasUnanswered){
    const total = qs.length;
    if(currentQ < total - 1){
      setTimeout(() => { goTo(currentQ + 1); }, 280);
    }
  }
}

/* ---------------- Navigation ---------------- */

function goTo(index){
  const total = getExamQuestions().length;
  if(index < 0 || index >= total) return;
  currentQ = index;
  renderQuestion();
}
function nextQuestion(){ goTo(currentQ+1); }
function prevQuestion(){ goTo(currentQ-1); }
function firstQuestion(){ goTo(0); }
function lastQuestion(){ goTo(getExamQuestions().length - 1); }
function jumpToQuestion(){
  const val = parseInt(document.getElementById("jumpInput").value, 10);
  if(!isNaN(val)) goTo(val-1);
}

/* ---------------- OMR-style question grid ---------------- */

function renderOmrGrid(){
  const total = getExamQuestions().length;
  const grid = document.getElementById("omrGrid");
  grid.innerHTML = "";
  for(let i=0;i<total;i++){
    const b = document.createElement("button");
    b.type = "button";
    b.className = "omr-bubble";
    b.textContent = i+1;
    b.addEventListener("click", () => goTo(i));
    grid.appendChild(b);
  }
  updateOmrGrid();
}

function updateOmrGrid(){
  const grid = document.getElementById("omrGrid");
  // Correct/incorrect coloring on the answer sheet is a review-only
  // feature. While the exam is still in progress, an answered bubble
  // only shows as "answered" (neutral) — never green or red.
  const reviewMode = progress.status === "completed";
  [...grid.children].forEach((b, i) => {
    b.classList.remove("current","correct","incorrect","answered");
    const ans = progress.answers[i];
    if(ans !== null){
      if(reviewMode){
        b.classList.add(progress.correctMap[i] ? "correct" : "incorrect");
      } else {
        b.classList.add("answered");
      }
    }
    if(i === currentQ) b.classList.add("current");
  });
  updateOmrLegend(reviewMode);
}

function updateOmrLegend(reviewMode){
  const legend = document.querySelector(".omr-legend");
  if(!legend) return;
  legend.innerHTML = reviewMode
    ? `
      <span><i></i>Unanswered</span>
      <span><i class="progress"></i>Current</span>
      <span><i class="done"></i>Correct</span>
      <span><i class="wrong"></i>Incorrect</span>
    `
    : `
      <span><i></i>Unanswered</span>
      <span><i class="progress"></i>Current</span>
      <span><i class="answered"></i>Answered</span>
    `;
}

/* ---------------- Progress / score panel ---------------- */

function updateProgressBar(){
  const total = getExamQuestions().length;
  const answered = progress.answers.filter(a => a !== null).length;
  const pct = total ? Math.round((answered/total)*100) : 0;
  document.getElementById("progressFill").style.width = pct + "%";
  document.getElementById("progressLabel").textContent = `${answered} of ${total} answered`;
}

function renderScorePanel(){
  const total = getExamQuestions().length;
  const reviewMode = progress.status === "completed";
  const scoreGrid = document.querySelector(".side-panel .score-grid");

  if(reviewMode){
    // Correct/Incorrect/Unanswered breakdown is a review-only feature —
    // only reveal it once the exam is finished and reopened for review.
    const correct = progress.correctMap.filter(v => v === true).length;
    const incorrect = progress.correctMap.filter(v => v === false).length;
    const unanswered = total - correct - incorrect;

    if(scoreGrid) scoreGrid.style.display = "";
    document.getElementById("scoreCorrect").textContent = correct;
    document.getElementById("scoreIncorrect").textContent = incorrect;
    document.getElementById("scoreUnanswered").textContent = unanswered;
    document.getElementById("scoreTotal").textContent = total;
  } else {
    // While the exam is in progress, hide the score breakdown entirely.
    // Only the neutral progress bar + "X of Y answered" caption remain.
    if(scoreGrid) scoreGrid.style.display = "none";
  }

  updateProgressBar();
}

/* ---------------- Finish exam ---------------- */

function finishExam(){
  stopExamTimer();
  if(!progress || progress.status === "completed") return; // guard against double-submit

  const total = getExamQuestions().length;
  const correct = progress.correctMap.filter(v => v === true).length;
  const incorrect = progress.correctMap.filter(v => v === false).length;
  const unanswered = total - correct - incorrect;

  const rawScore = correct - (incorrect * NEGATIVE_MARK);
  const finalScore = Math.max(0, rawScore); // never show a negative total
  const pct = total ? Math.round((finalScore / total) * 100) : 0;
  const scoreDisplay = Number.isInteger(finalScore) ? finalScore : finalScore.toFixed(2);

  // Capture elapsed time before the countdown deadline is cleared below.
  const durationSec = examDurationSeconds(total);
  const remainingSec = progress.examEndTime ? Math.max(0, Math.ceil((progress.examEndTime - Date.now()) / 1000)) : 0;
  const elapsedSec = Math.max(0, durationSec - remainingSec);
  const timeTakenLabel = formatTime(elapsedSec);

  progress.status = "completed";
  progress.finishedAt = new Date().toISOString();
  progress.examEndTime = null; // no longer relevant once finished
  saveProgress(SUBJECT.id, currentExamIndex, progress);

  // Log this attempt into the personal exam history ("Merit List").
  const profile = getProfile();
  appendHistory(SUBJECT.id, currentExamIndex, {
    name: profile ? profile.name : "Guest",
    pct, score: finalScore, total, correct, incorrect, unanswered,
    timeSec: elapsedSec, finishedAt: progress.finishedAt
  });

  let message, tierKey;
  if(pct >= 90){ message = "Outstanding!"; tierKey = "excellent"; }
  else if(pct >= 75){ message = "Very Good!"; tierKey = "excellent"; }
  else if(pct >= 60){ message = "Good Job!"; tierKey = "good"; }
  else { message = "Keep Practicing!"; tierKey = "poor"; }

  const correctPct = total ? Math.round((correct/total)*100) : 0;
  const wrongPct = total ? Math.round((incorrect/total)*100) : 0;
  const unansweredPct = Math.max(0, 100 - correctPct - wrongPct);

  document.getElementById("examTakingArea").style.display = "none";
  const results = document.getElementById("resultsView");
  results.style.display = "block";
  results.innerHTML = `
    <div class="rescard">
      <div class="rescard-head tier-bg-${tierKey}">
        <div class="rescard-badge">${SUBJECT.name} \u00B7 Exam ${currentExamIndex+1}</div>
        <div class="rescard-ring" style="--pct:${pct}">
          <div class="rescard-ring-inner tier-bg-${tierKey}">
            <div class="rescard-pct">${pct}<span>%</span></div>
            <div class="rescard-pct-l">Your Score</div>
          </div>
        </div>
        <div class="rescard-msg">${message}</div>
      </div>

      <div class="rescard-body">
        <div class="rescard-metrics">
          <div class="rescard-metric"><span class="v c-correct">${correct}</span><span class="l">Correct</span></div>
          <div class="rescard-metric"><span class="v c-wrong">${incorrect}</span><span class="l">Wrong</span></div>
          <div class="rescard-metric"><span class="v c-unanswered">${unanswered}</span><span class="l">Unanswered</span></div>
          <div class="rescard-metric"><span class="v c-time">${timeTakenLabel}</span><span class="l">Time Taken</span></div>
        </div>

        <div class="rescard-bar">
          <span class="seg correct" style="width:${correctPct}%"></span>
          <span class="seg wrong" style="width:${wrongPct}%"></span>
          <span class="seg unanswered" style="width:${unansweredPct}%"></span>
        </div>
        <div class="rescard-bar-legend">
          <span><i class="correct"></i>Correct ${correctPct}%</span>
          <span><i class="wrong"></i>Wrong ${wrongPct}%</span>
          <span><i class="unanswered"></i>Unanswered ${unansweredPct}%</span>
        </div>

        <div class="rescard-points">
          <div><span class="l">Points Earned</span><span class="v">${scoreDisplay} / ${total}</span></div>
          <div><span class="l">Negative Marking</span><span class="v neg">\u2212${NEGATIVE_MARK} per wrong</span></div>
        </div>

        <div class="results-actions">
          <button class="btn btn-outline" onclick="exitToSubjectHome()">Back</button>
          <button class="btn btn-gold" onclick="retakeExam()">Retake Exam</button>
          <button class="btn btn-outline" onclick="reviewFinishedExam()">Review Answers</button>
        </div>

        <div id="resultsBookmarksBox" style="margin-top:24px; padding-top:20px; border-top:1px solid var(--line);"></div>
      </div>
    </div>
  `;
  renderResultsBookmarksBox();
}

/* Reopen the exam just finished, in read-only review mode, straight from
   the results screen — same view as clicking "Review Answers" on the
   subject's exam list. Progress is already saved as completed, so this
   just re-runs the normal exam view render pipeline. */
function reviewFinishedExam(){
  startExam(currentExamIndex);
}

function retakeExam(){
  const { count } = examRange(currentExamIndex, QUESTIONS.length);
  progress = emptyProgress(count);
  progress.status = "in-progress";
  progress.examEndTime = Date.now() + examDurationSeconds(count) * 1000;
  saveProgress(SUBJECT.id, currentExamIndex, progress);
  currentQ = 0;
  document.getElementById("resultsView").style.display = "none";
  document.getElementById("examTakingArea").style.display = "grid";
  renderOmrGrid();
  renderQuestion();
  renderScorePanel();
  startExamTimer();
}