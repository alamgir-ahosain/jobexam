/* ============================================================
   JobExam — exam.js
   Generic exam engine. Every subject page calls:
     initSubjectPage("oop");
   after its data/<subject>.js file has been loaded.
   ============================================================ */

let SUBJECT = null;
let QUESTIONS = [];
let EXAMS = 0;

let currentExamIndex = null;   // 0-based
let currentQ = 0;              // 0-based, within the current exam
let progress = null;           // progress object for the current exam

function initSubjectPage(subjectId){
  SUBJECT = getSubject(subjectId);
  if(!SUBJECT){ console.error("Unknown subject:", subjectId); return; }
  QUESTIONS = getQuestions(SUBJECT);
  EXAMS = examCountFor(SUBJECT);

  document.getElementById("subjectTitle").textContent = SUBJECT.name;
  document.title = SUBJECT.name + " — JobExam";

  renderSubjectHeader();
  renderExamList();

  // Deep-link support: oop.html#exam=3
  const m = location.hash.match(/exam=(\d+)/);
  if(m){
    const idx = parseInt(m[1],10) - 1;
    if(idx >= 0 && idx < EXAMS) startExam(idx);
  }
}

/* ---------------- Subject overview ---------------- */

function renderSubjectHeader(){
  const stats = subjectStats(SUBJECT);
  document.getElementById("statTotalQ").textContent = stats.total;
  document.getElementById("statTotalExams").textContent = stats.exams;
  document.getElementById("statCompleted").textContent = `${stats.completed}/${stats.exams}`;
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

  if(QUESTIONS.length === 0){
    list.innerHTML = `<div class="empty-note">No questions loaded for this subject yet. Add them to <code>data/${SUBJECT.dataVar.toLowerCase()}.js</code>.</div>`;
    return;
  }

  for(let i=0;i<EXAMS;i++){
    const { start, end, count } = examRange(i, QUESTIONS.length);
    const st = statusOf(i);
    const card = document.createElement("div");
    card.className = "exam-card";

    let scoreLine = "";
    let actionsHtml = "";

    if(st.key === "done"){
      const correct = st.p.correctMap.filter(v => v === true).length;
      scoreLine = `<span class="exam-score-tag">Score ${correct}/${count}</span>`;
      actionsHtml = `
        <div class="exam-actions">
          <button class="btn btn-outline" data-action="review" data-exam="${i}">Review Answers</button>
          <button class="btn btn-gold" data-action="retake" data-exam="${i}">Retake Exam</button>
        </div>`;
    } else if(st.key === "progress"){
      const answered = st.p.answers.filter(a => a !== null).length;
      const allAnswered = answered === count;
      actionsHtml = `
        <div class="exam-actions">
          <button class="btn btn-block" data-action="resume" data-exam="${i}">${allAnswered ? "Finish Exam" : "Resume Exam"}</button>
        </div>`;
    } else {
      actionsHtml = `
        <div class="exam-actions">
          <button class="btn btn-block" data-action="start" data-exam="${i}">Start Exam</button>
        </div>`;
    }

    card.innerHTML = `
      <div class="exam-card-head">
        <span class="exam-num">EXAM ${i+1}</span>
        <span class="pill ${st.key === 'done' ? 'pill-done' : st.key === 'progress' ? 'pill-progress' : 'pill-soon'}">${st.label}</span>
      </div>
      <div class="exam-range">Questions ${start}&ndash;${end}</div>
      <div class="exam-status-text"><span class="status-dot ${st.key}"></span>${count} questions ${scoreLine}</div>
      ${actionsHtml}
    `;

    card.querySelectorAll("button[data-action]").forEach(btn => {
      const action = btn.dataset.action;
      const idx = parseInt(btn.dataset.exam, 10);
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        // Password-gate taking/resuming/retaking an exam. If the tab is
        // already unlocked this session (e.g. via the subject card on the
        // registry page), this runs immediately with no extra prompt.
        requireAccess(() => {
          if(action === "retake") retakeExamFromList(idx);
          else startExam(idx); // start / resume / review all just open the exam at its saved state
        });
      });
    });

    list.appendChild(card);
  }
}

/* ---------------- Starting / resuming an exam ---------------- */

/* Reset a completed exam's saved progress, then open it as a clean attempt.
   Used by the "Retake Exam" button on the subject overview's exam cards. */
function retakeExamFromList(examIndex){
  const { count } = examRange(examIndex, QUESTIONS.length);
  const fresh = emptyProgress(count);
  fresh.status = "in-progress";
  saveProgress(SUBJECT.id, examIndex, fresh);
  startExam(examIndex);
}

function startExam(examIndex){
  currentExamIndex = examIndex;
  const { start, end, count } = examRange(examIndex, QUESTIONS.length);

  const existing = loadProgress(SUBJECT.id, examIndex);
  progress = existing || emptyProgress(count);
  if(progress.status === "not-started") progress.status = "in-progress";

  currentQ = 0;
  // resume at first unanswered question, if any — but only for exams still
  // in progress. Completed exams are opened in read-only review mode, so
  // there's no "next unanswered" to resume to; always start at question 1.
  if(progress.status !== "completed"){
    const firstUnanswered = progress.answers.findIndex(a => a === null);
    if(firstUnanswered !== -1) currentQ = firstUnanswered;
  }

  document.getElementById("subjectHome").classList.add("hidden");
  document.getElementById("examView").classList.add("active");
  document.getElementById("resultsView").style.display = "none";
  document.getElementById("examTakingArea").style.display = "grid";

  location.hash = `exam=${examIndex+1}`;
  document.getElementById("examTitleLabel").textContent = `Exam ${examIndex+1}`;
  document.getElementById("examSubLabel").textContent = `${SUBJECT.name} · Questions ${start}\u2013${end}`;

  renderOmrGrid();
  renderQuestion();
  renderScorePanel();

  const finishBtn = document.getElementById("finishExamBtn");
  if(finishBtn) finishBtn.style.display = (progress.status === "completed") ? "none" : "";
}

function exitToSubjectHome(){
  document.getElementById("subjectHome").classList.remove("hidden");
  document.getElementById("examView").classList.remove("active");
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
  const total = getExamQuestions().length;
  const correct = progress.correctMap.filter(v => v === true).length;
  const incorrect = progress.correctMap.filter(v => v === false).length;
  const unanswered = total - correct - incorrect;
  const pct = total ? Math.round((correct/total)*100) : 0;

  progress.status = "completed";
  progress.finishedAt = new Date().toISOString();
  saveProgress(SUBJECT.id, currentExamIndex, progress);

  let message, tone;
  if(pct >= 90){ message = "Excellent"; tone="correct"; }
  else if(pct >= 75){ message = "Very Good"; tone="correct"; }
  else if(pct >= 60){ message = "Good"; tone="progress"; }
  else { message = "Needs Improvement"; tone="incorrect"; }

  document.getElementById("examTakingArea").style.display = "none";
  const results = document.getElementById("resultsView");
  results.style.display = "block";
  results.innerHTML = `
    <div class="results">
      <div class="results-seal">${pct}%</div>
      <div class="results-pct">${correct} / ${total}</div>
      <div class="results-msg">${message}</div>
      <div class="results-grid">
        <div class="cell"><div class="n">${correct}</div><div class="l">Correct</div></div>
        <div class="cell"><div class="n">${incorrect}</div><div class="l">Incorrect</div></div>
        <div class="cell"><div class="n">${unanswered}</div><div class="l">Unanswered</div></div>
        <div class="cell"><div class="n">${pct}%</div><div class="l">Score</div></div>
      </div>
      <div class="results-actions">
        <button class="btn btn-gold" onclick="retakeExam()">Retake Exam</button>
        <button class="btn btn-outline" onclick="reviewFinishedExam()">Review Answers</button>
      </div>
    </div>
  `;
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
  saveProgress(SUBJECT.id, currentExamIndex, progress);
  currentQ = 0;
  document.getElementById("resultsView").style.display = "none";
  document.getElementById("examTakingArea").style.display = "grid";
  renderOmrGrid();
  renderQuestion();
  renderScorePanel();
}