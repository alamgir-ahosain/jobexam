/* ============================================================
   JobExam — common.js
   Shared across every page: subject registry, progress storage,
   and the home page renderer.

   HOW TO ADD A NEW SUBJECT LATER
   --------------------------------------------------------------
   1. Convert its question bank into data/<id>.json — a plain JSON
      array of {question, options, answer, explanation} objects
      (no "var X = " wrapper, no trailing semicolon).
   2. Create subjects/<id>.html by duplicating subjects/cryptography.html
      and changing the subject-specific text + the initSubjectPage("<id>")
      call at the bottom.
   3. Add one entry to the SUBJECTS array below, with live: true,
      the correct page path, and questionCount set to the number of
      questions in that subject's JSON file (used for registry-page
      stats WITHOUT downloading the question bank first).
   That's it — the registry page, progress tracking, and exam engine
   all read from this registry automatically. Nothing is fetched
   over the network until the person enters the correct password.
   ============================================================ */

const EXAM_SIZE = 50; // fixed questions per exam, per spec
const SECONDS_PER_QUESTION = 30; // timer allowance per question
const NEGATIVE_MARK = 0.25; // deducted per incorrect answer

function examDurationSeconds(questionCount){
  return Math.floor(questionCount * SECONDS_PER_QUESTION);
}

const SUBJECTS = [
  { id: "combind",               name: "Combind",                      page: "subjects/combind.html",               live: true,  questionCount: 100 },
  { id: "oop",                   name: "Object-Oriented Programming",  page: "subjects/oop.html",                   live: true,  questionCount: 211 },
  { id: "networking",            name: "Networking",                   page: "subjects/networking.html",            live: true,  questionCount: 480 },
  { id: "database",              name: "Database",                     page: "subjects/database.html",              live: true,  questionCount: 399 },
  { id: "c",                     name: "C Programming",                page: "subjects/c.html",                     live: true,  questionCount: 431 },
  { id: "fundamentals",          name: "Computer Fundamentals",        page: "subjects/fundamentals.html",          live: true,  questionCount: 112 },
  { id: "dsa",                   name: "Data Structure & Algorithm",   page: "subjects/dsa.html",                   live: true,  questionCount: 574 },
  { id: "os",                    name: "Operating System",             page: "subjects/os.html",                    live: true,  questionCount: 389 },
  { id: "computer-architecture", name: "Computer Architecture",        page: "subjects/computer-architecture.html", live: true,  questionCount: 150 },
  { id: "software-eng",          name: "Software Engineering",         page: "subjects/software-eng.html",          live: true,  questionCount: 376 },
  { id: "cloud-virtualization",  name: "Cloud & Virtualization",       page: "subjects/cloud-virtualization.html",  live: true,  questionCount: 200 },
  { id: "cybersecurity",         name: "Cyber Security",               page: "subjects/cybersecurity.html",         live: true,  questionCount: 211 },

  // Cryptography — fully wired up to data/cryptography.json
  { id: "cryptography",          name: "Cryptography",                 page: "subjects/cryptography.html",          live: true,  questionCount: 100 },

  { id: "blockchain-dark-web",   name: "Blockchain & Dark Web",        page: "subjects/blockchain-dark-web.html",   live: true,  questionCount: 50 },

  { id: "bangla",       name: "Bangla",             page: "subjects/bangla.html",  live: false, questionCount: 0 },
  { id: "english",      name: "English",            page: "subjects/english.html", live: false, questionCount: 0 },
  { id: "math",         name: "Mathematics",        page: "subjects/math.html",    live: false, questionCount: 0 },
  { id: "gk",           name: "General Knowledge",  page: "subjects/gk.html",      live: false, questionCount: 0 },
];

function getSubject(id){
  return SUBJECTS.find(s => s.id === id) || null;
}

// Path prefix helper — works whether we're at the project root or
// one level down inside /subjects/.
function dataPathPrefix(){
  return /\/subjects\//.test(location.pathname) ? "../" : "";
}

// In-memory cache so we only fetch each subject's JSON once per page load.
const questionCache = {};

/* Lazy fetch — only ever called AFTER requireAccess() succeeds.
   Nothing downloads the question bank until the password is verified. */
async function getQuestionsAsync(subject){
  if(questionCache[subject.id]) return questionCache[subject.id];
  const res = await fetch(`${dataPathPrefix()}data/${subject.id}.json`);
  if(!res.ok) throw new Error(`Failed to load questions for ${subject.id}`);
  const data = await res.json();
  questionCache[subject.id] = data;
  return data;
}

function examCountFromTotal(total){
  return total ? Math.ceil(total / EXAM_SIZE) : 0;
}

function examRange(examIndex, total){
  const start = examIndex * EXAM_SIZE + 1;
  const end = Math.min(total, (examIndex + 1) * EXAM_SIZE);
  return { start, end, count: end - start + 1 };
}

/* ---------------- localStorage progress ---------------- */

function progressKey(subjectId, examIndex){
  return `jobexam:${subjectId}:exam${examIndex}`;
}

function loadProgress(subjectId, examIndex){
  try{
    const raw = localStorage.getItem(progressKey(subjectId, examIndex));
    return raw ? JSON.parse(raw) : null;
  }catch(e){ return null; }
}

function saveProgress(subjectId, examIndex, data){
  try{
    localStorage.setItem(progressKey(subjectId, examIndex), JSON.stringify(data));
  }catch(e){ /* storage unavailable — fail silently, exam still works in-memory */ }
}

function emptyProgress(qCount){
  return {
    answers: new Array(qCount).fill(null),   // selected option index per question, null = unanswered
    correctMap: new Array(qCount).fill(null),// true/false once answered
    status: "not-started",                   // not-started | in-progress | completed
    finishedAt: null,
    examEndTime: null                        // epoch ms timestamp when the timer runs out
  };
}

// Registry-page stats come entirely from the hardcoded questionCount —
// no fetch needed just to render the subject list.
function subjectStatsFromCount(subject){
  const total = subject.questionCount || 0;
  const exams = examCountFromTotal(total);
  let completed = 0, inProgress = 0;
  for(let i=0;i<exams;i++){
    const p = loadProgress(subject.id, i);
    if(p && p.status === "completed") completed++;
    else if(p && p.status === "in-progress") inProgress++;
  }
  return { total, exams, completed, inProgress };
}

/* ---------------- Subject registry page (subject-list.html) ---------------- */

function renderHome(){
  const grid = document.getElementById("subjectGrid");
  if(!grid) return;

  SUBJECTS.forEach(subject => {
    const card = document.createElement(subject.live ? "a" : "div");
    card.className = "subject-card" + (subject.live ? "" : " card-disabled");
    if(subject.live){
      card.href = subject.page;
      // Password-gate entry into any subject. requireAccess() shows the
      // modal only if the tab isn't already unlocked this session.
      card.addEventListener("click", (e) => {
        e.preventDefault();
        requireAccess(() => { window.location.href = subject.page; });
      });
    }

    if(subject.live){
      const stats = subjectStatsFromCount(subject);
      const pct = stats.exams ? Math.round(((stats.completed) / stats.exams) * 100) : 0;
      card.innerHTML = `
        <div class="subject-card-top">
          <h3 class="subject-name">${subject.name}</h3>
        </div>
        <div class="subject-stats">
          <span><b>${stats.total}</b> Questions</span>
          <span><b>${stats.exams}</b> Exams</span>
        </div>
        <div class="subject-progress-mini"><span style="width:${pct}%"></span></div>
        <div class="subject-stats">
          ${stats.completed ? `<span class="pill pill-done">${stats.completed}/${stats.exams} done</span>` : `<span class="pill pill-new">Start now</span>`}
          ${stats.inProgress ? `<span class="pill pill-progress">${stats.inProgress} in progress</span>` : ``}
        </div>
        <span class="btn btn-block">Open Subject</span>
      `;
    } else {
      card.innerHTML = `
        <div class="subject-card-top">
          <h3 class="subject-name">${subject.name}</h3>
        </div>
        <div class="subject-stats"><span>Upcoming...</span></div>
      `;
    }
    grid.appendChild(card);
  });
}

document.addEventListener("DOMContentLoaded", renderHome);