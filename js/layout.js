/* ============================================================
   JobExam — layout.js
   Single source of truth for the topbar (header), site footer,
   and the exam-taking view markup. Every page just drops in
   three empty placeholders:

     <div id="site-header"></div>
     ...
     <div id="site-examview"></div>   (subject pages only)
     ...
     <div id="site-footer"></div>

   ...and loads this script. No more copy-pasting the same
   header/footer/exam-view markup into every HTML file — change
   it once here and every page picks it up.

   Works from both the project root (index.html, exams.html) and
   one level down (subjects/*.html) by detecting the current
   folder and prefixing links/paths with "../" when needed.
   ============================================================ */

(function(){

  // Pages inside /subjects/ need "../" in front of every root-relative
  // link (index.html, exams.html, css/, js/, data/, etc).
  var inSubjectsFolder = /\/subjects\//.test(location.pathname);
  var base = inSubjectsFolder ? "../" : "";

  function headerHTML(){
    return (
      '<div class="topbar">' +
        '<div class="topbar-inner">' +
          '<a class="brand" href="' + base + 'index.html">' +
            // '<span class="brand-mark">JE</span>' +
            '<img src="' + base + 'images/logo.png" alt="JobExam" class="brand-mark" style="width:36px;height:36px;object-fit:contain;" />' +
            '<span class="brand-text">' +
              '<div class="brand-title">JobExam</div>' +
              '<div class="brand-sub">Govt \u00B7 Bank \u00B7 IT Exam Practice</div>' +
            '</span>' +
          '</a>' +
          '<div class="topbar-actions">' +
            '<button class="theme-toggle" type="button" aria-label="Toggle color theme" title="Toggle color theme" onclick="toggleTheme()">' +
              '<svg class="icon-sun" viewBox="0 0 24 24" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"></circle><line x1="12" y1="1" x2="12" y2="3"></line><line x1="12" y1="21" x2="12" y2="23"></line><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line><line x1="1" y1="12" x2="3" y2="12"></line><line x1="21" y1="12" x2="23" y2="12"></line><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line></svg>' +
              '<svg class="icon-moon" viewBox="0 0 24 24" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path></svg>' +
            '</button>' +
          '</div>' +
        '</div>' +
      '</div>'
    );
  }

  function examViewHTML(){
    return (
      '<div id="examView">' +
        '<div class="exam-top-bar">' +
          '<div>' +
            '<div class="exam-top-title" id="examTitleLabel">Exam</div>' +
            '<div class="sub" id="examSubLabel"></div>' +
          '</div>' +
          '<div style="display:flex; align-items:center; gap:14px;">' +
            '<div class="exam-timer" id="examTimer">0:00</div>' +
            '<button class="btn btn-outline" onclick="exitToSubjectHome()">\u2190 Back to Exams</button>' +
          '</div>' +
        '</div>' +

        '<div id="examTakingArea" class="exam-shell">' +
          '<div>' +
            '<div class="q-panel">' +
              '<div class="q-meta"><span class="q-count" id="qCount">Question 1 of 50</span></div>' +
              '<p class="q-text" id="qText"></p>' +
              '<div class="options" id="optionsWrap"></div>' +
              '<div class="verdict" id="verdict"></div>' +
              '<div class="q-nav-row">' +
                '<div class="left"><button class="btn btn-outline" onclick="prevQuestion()">\u2039 Previous</button></div>' +
                '<div class="right"><button class="btn btn-outline" onclick="nextQuestion()">Next \u203a</button></div>' +
              '</div>' +
            '</div>' +
          '</div>' +

          '<div class="side-panel">' +
            '<h3 class="side-title">Progress</h3>' +
            '<div class="progress-track"><span id="progressFill" style="width:0%"></span></div>' +
            '<p class="omr-caption" id="progressLabel">0 of 0 answered</p>' +

            '<div class="score-grid">' +
              '<div class="score-cell correct"><div class="n" id="scoreCorrect">0</div><div class="l">Correct</div></div>' +
              '<div class="score-cell incorrect"><div class="n" id="scoreIncorrect">0</div><div class="l">Incorrect</div></div>' +
              '<div class="score-cell"><div class="n" id="scoreUnanswered">0</div><div class="l">Unanswered</div></div>' +
              '<div class="score-cell"><div class="n" id="scoreTotal">0</div><div class="l">Total</div></div>' +
            '</div>' +

            '<h3 class="side-title">Answer Sheet</h3>' +
            '<p class="omr-caption">Tap any number to jump straight to that question.</p>' +
            '<div class="omr-grid" id="omrGrid"></div>' +
            '<div class="omr-legend">' +
              '<span><i></i>Unanswered</span>' +
              '<span><i class="progress"></i>Current</span>' +
              '<span><i class="done"></i>Correct</span>' +
              '<span><i class="wrong"></i>Incorrect</span>' +
            '</div>' +

            '<button class="btn btn-gold" id="finishExamBtn" style="width:100%; margin-top:16px;" onclick="finishExam()">Finish Exam</button>' +
          '</div>' +
        '</div>' +

        '<div id="resultsView" style="display:none;"></div>' +
      '</div>'
    );
  }

  function footerHTML(){
    return (
      '<footer class="site-foot">' +
        '<div>© 2026 Alamgir Hosain. All rights reserved.</div>' +
        '<div class="foot-connect">' +
          '<a href="https://github.com/alamgir-ahosain" target="_blank" rel="noopener">' +
            '<svg viewBox="0 0 16 16"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27s1.36.09 2 .27c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8z"/></svg>' +
            'GitHub' +
          '</a>' +
          '<span class="foot-sep">\u00B7</span>' +
          '<a href="https://www.linkedin.com/in/alamgir-ahosain" target="_blank" rel="noopener">' +
            '<svg viewBox="0 0 16 16"><path d="M0 1.15C0 .52.53 0 1.19 0h13.62C15.47 0 16 .52 16 1.15v13.7c0 .63-.53 1.15-1.19 1.15H1.19C.53 16 0 15.48 0 14.85V1.15zM4.75 13.44V6h-2.5v7.44h2.5zM3.5 4.96c.87 0 1.41-.58 1.41-1.3-.02-.74-.54-1.3-1.39-1.3-.85 0-1.41.56-1.41 1.3 0 .72.54 1.3 1.38 1.3h.01zM13.44 13.44h-2.5V9.36c0-1.02-.36-1.72-1.27-1.72-.7 0-1.11.47-1.29.92-.07.16-.08.39-.08.61v4.27h-2.5s.03-6.93 0-7.44h2.5v1.05c.33-.51.93-1.24 2.26-1.24 1.65 0 2.88 1.08 2.88 3.4v4.23z"/></svg>' +
            'LinkedIn' +
          '</a>' +
        '</div>' +
      '</footer>'
    );
  }

  function mount(){
    var h = document.getElementById("site-header");
    var f = document.getElementById("site-footer");
    var e = document.getElementById("site-examview");
    if(h) h.outerHTML = headerHTML();
    if(f) f.outerHTML = footerHTML();
    if(e) e.outerHTML = examViewHTML();

var favicon = document.createElement('link');
favicon.rel = 'icon';
favicon.type = 'image/png';
favicon.href = base + 'images/logo.png';
document.head.appendChild(favicon);
  }

  if(document.readyState === "loading"){
    document.addEventListener("DOMContentLoaded", mount);
  } else {
    mount();
  }

})();