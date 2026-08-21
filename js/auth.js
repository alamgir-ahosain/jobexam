/* ============================================================
   JobExam — auth.js
   Lightweight access-password gate for entering a subject or
   starting/resuming/retaking an exam.

   NOTE: this is a shared-access checkpoint, not real security —
   the password list lives in this client-side file on purpose,
   so anyone reading the source can see it. It just keeps casual
   visitors out of the exam content, not a determined one.

   Once the correct password is entered, access stays unlocked
   for the rest of the browser tab's session (sessionStorage), so
   the prompt only needs to be solved once per visit.
   ============================================================ */

const ACCESS_PASSWORDS = ["amarnamalamgir", "tuikedare", "amiektakhrapmanush"];
const ACCESS_KEY = "jobexam:unlocked";

function isUnlocked(){
  try{ return sessionStorage.getItem(ACCESS_KEY) === "1"; }
  catch(e){ return false; }
}

function setUnlocked(){
  try{ sessionStorage.setItem(ACCESS_KEY, "1"); }catch(e){ /* storage unavailable */ }
}

/* Call this to gate any navigation/action. If already unlocked this
   session, onSuccess runs immediately; otherwise a password modal
   is shown first. */
function requireAccess(onSuccess){
  if(isUnlocked()){ onSuccess(); return; }
  showAccessModal(onSuccess);
}

function showAccessModal(onSuccess){
  if(document.getElementById("accessOverlay")) return; // already open

  const overlay = document.createElement("div");
  overlay.id = "accessOverlay";
  overlay.className = "pw-overlay";
  overlay.innerHTML = `
    <div class="pw-modal" role="dialog" aria-modal="true" aria-labelledby="pwTitle">
      <div class="pw-seal">🔒</div>
      <h3 class="pw-title" id="pwTitle">Access Password Required</h3>
      <p class="pw-desc">Enter the access password to open this subject and take exams.</p>
      <div class="pw-input-wrap">
        <input type="password" class="pw-input" id="pwInput" placeholder="Enter password" autocomplete="off" />
        <button type="button" class="pw-eye-btn" id="pwEyeBtn" aria-label="Show password" title="Show password">
          <svg class="pw-eye-icon" id="pwEyeIcon" viewBox="0 0 24 24" stroke-linecap="round" stroke-linejoin="round">
            <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7z"></path>
            <circle cx="12" cy="12" r="3"></circle>
          </svg>
        </button>
      </div>
      <div class="pw-error" id="pwError">Incorrect password. Please try again.</div>
      <div class="pw-actions">
        <button class="btn btn-outline" id="pwCancel" type="button">Cancel</button>
        <button class="btn btn-gold" id="pwSubmit" type="button">Unlock</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  const modalEl = overlay.querySelector(".pw-modal");
  const input = document.getElementById("pwInput");
  const error = document.getElementById("pwError");
  const eyeBtn = document.getElementById("pwEyeBtn");
  const eyeIcon = document.getElementById("pwEyeIcon");
  input.focus();

  const EYE_OPEN = `<path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7z"></path><circle cx="12" cy="12" r="3"></circle>`;
  const EYE_OFF = `<path d="M17.94 17.94A10.94 10.94 0 0 1 12 20c-7 0-11-7-11-7a21.77 21.77 0 0 1 5.06-6.06M9.9 4.24A10.94 10.94 0 0 1 12 4c7 0 11 7 11 7a21.77 21.77 0 0 1-2.16 3.19M14.12 14.12a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line>`;

  eyeBtn.addEventListener("click", () => {
    const showing = input.type === "text";
    input.type = showing ? "password" : "text";
    eyeIcon.innerHTML = showing ? EYE_OPEN : EYE_OFF;
    eyeBtn.setAttribute("aria-label", showing ? "Show password" : "Hide password");
    eyeBtn.setAttribute("title", showing ? "Show password" : "Hide password");
    input.focus();
  });

  function closeModal(){
    document.removeEventListener("keydown", onKeydown);
    overlay.remove();
  }

  function trySubmit(){
    const val = input.value.trim();
    if(val && ACCESS_PASSWORDS.includes(val)){
      setUnlocked();
      closeModal();
      onSuccess();
    } else {
      error.classList.add("show");
      modalEl.classList.remove("pw-shake");
      void modalEl.offsetWidth; // restart animation
      modalEl.classList.add("pw-shake");
      input.value = "";
      input.focus();
    }
  }

  function onKeydown(e){
    if(e.key === "Enter") trySubmit();
    if(e.key === "Escape") closeModal();
  }

  document.getElementById("pwSubmit").addEventListener("click", trySubmit);
  document.getElementById("pwCancel").addEventListener("click", closeModal);
  overlay.addEventListener("click", (e) => { if(e.target === overlay) closeModal(); });
  document.addEventListener("keydown", onKeydown);
}
