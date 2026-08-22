/* ============================================================
   JobExam — common.js
   Shared across every page: subject registry, progress storage,
   and the home page renderer.

   HOW TO ADD A NEW SUBJECT LATER
   --------------------------------------------------------------
   1. Create data/<id>.js defining a global array with `var` (not
      const/let — those don't attach to window in a plain script tag
      and the app won't be able to see them), e.g.:
        var NETWORKING_QUESTIONS = [ {question, options, answer, explanation}, ... ];
   2. Create subjects/<id>.html by duplicating subjects/oop.html and
      changing the three lines marked "SUBJECT SETTINGS" near the top
      of its <script> block. Because it lives one level down, its
      asset paths must be prefixed with "../" (css, js, data).
   3. Add one entry to the SUBJECTS array below, with live: true, and
      page: "subjects/<id>.html".
   4. Add <script src="data/<id>.js"></script> to exams.html (before
      common.js) so the subject-registry page can count its
      questions/exams.
   That's it — the home page, progress tracking, and exam engine
   all read from this registry automatically.
   ============================================================ */

const EXAM_SIZE = 50; // fixed questions per exam, per spec
const SECONDS_PER_QUESTION = 30; // timer allowance per question
const NEGATIVE_MARK = 0.25; // deducted per incorrect answer

function examDurationSeconds(questionCount){
  return Math.floor(questionCount * SECONDS_PER_QUESTION);
}

const SUBJECTS = [
{ id: "combind",      name: "Combind",                      dataVar: "COMBIND_QUESTIONS",       page: "subjects/combind.html",      live: true },
  { id: "oop",          name: "Object-Oriented Programming", dataVar: "OOP_QUESTIONS", page: "subjects/oop.html",          live: true  },
  { id: "networking",   name: "Networking",                  dataVar: "NETWORKING_QUESTIONS",   page: "subjects/networking.html",   live: true  },
  { id: "database",     name: "Database",                    dataVar: "DATABASE_QUESTIONS",     page: "subjects/database.html",     live: true  },
  { id: "c",            name: "C Programming",                dataVar: "C_QUESTIONS",            page: "subjects/c.html",            live: true  },
  { id: "fundamentals", name: "Computer Fundamentals",         dataVar: "FUNDAMENTALS_QUESTIONS", page: "subjects/fundamentals.html", live: true  },
  { id: "dsa",          name: "Data Structure & Algorithm",  dataVar: "DSA_QUESTIONS",           page: "subjects/dsa.html",          live: true  },
  { id: "os",           name: "Operating System",             dataVar: "OS_QUESTIONS",            page: "subjects/os.html",           live: true  },
  { id: "computer-architecture", name: "Computer Architecture", dataVar: "COMPUTER_ARCHITECTURE_QUESTIONS", page: "subjects/computer-architecture.html", live: true },
  { id: "software-eng", name: "Software Engineering",         dataVar: "SOFTWARE_ENG_QUESTIONS",  page: "subjects/software-eng.html", live: true  },
{ id: "cloud-virtualization",          name: "Cloud & Virtualization",                          dataVar: "CLOUD_VIRTUALIZATION_QUESTIONS",           page: "subjects/cloud-virtualization.html",          live: true },
  { id: "cybersecurity", name: "Cyber Security",               dataVar: "CYBERSECURITY_QUESTIONS", page: "subjects/cybersecurity.html", live: true  },
  { id: "cryptography",  name: "Cryptography",                 dataVar: "CRYPTOGRAPHY_QUESTIONS",  page: "subjects/cryptography.html",  live: true  },
  { id: "blockchain-dark-web", name: "Blockchain & Dark Web", dataVar: "BLOCKCHAIN_DARK_WEB_QUESTIONS", page: "subjects/blockchain-dark-web.html", live: true },


  { id: "bangla",       name: "Bangla",                       dataVar: "BANGLA_QUESTIONS",        page: "subjects/bangla.html",       live: false },
{ id: "english",      name: "English",                      dataVar: "ENGLISH_QUESTIONS",       page: "subjects/english.html",      live: false },
  { id: "math",         name: "Mathematics",                  dataVar: "MATH_QUESTIONS",          page: "subjects/math.html",         live: false },
  { id: "gk",           name: "General Knowledge",            dataVar: "GK_QUESTIONS",             page: "subjects/gk.html",           live: false },
];


function getSubject(id){
  return SUBJECTS.find(s => s.id === id) || null;
}

function getQuestions(subject){
  return (typeof window !== "undefined" && window[subject.dataVar]) ? window[subject.dataVar] : [];
}

function examCountFor(subject){
  const total = getQuestions(subject).length;
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

function subjectStats(subject){
  const total = getQuestions(subject).length;
  const exams = examCountFor(subject);
  let completed = 0, inProgress = 0;
  for(let i=0;i<exams;i++){
    const p = loadProgress(subject.id, i);
    if(p && p.status === "completed") completed++;
    else if(p && p.status === "in-progress") inProgress++;
  }
  return { total, exams, completed, inProgress };
}

/* ---------------- Subject registry page (exams.html) ---------------- */

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
      const stats = subjectStats(subject);
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