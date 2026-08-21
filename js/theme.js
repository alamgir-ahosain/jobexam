/* ============================================================
   JobExam — theme.js
   Dark / light mode toggle. Preference is stored in localStorage
   under "jobexam:theme" and falls back to the OS-level preference
   (prefers-color-scheme) when the user hasn't chosen one yet.

   NOTE: the actual theme is applied as early as possible via a
   small inline <script> in each page's <head>, BEFORE this file
   loads, so there's no flash of the wrong theme on page load.
   This file only wires up the toggle button + keeps things in
   sync if the OS theme changes mid-session.
   ============================================================ */

const THEME_KEY = "jobexam:theme";

function getStoredTheme(){
  try{
    const saved = localStorage.getItem(THEME_KEY);
    if(saved === "light" || saved === "dark") return saved;
  }catch(e){ /* storage unavailable */ }
  return null;
}

function getPreferredTheme(){
  return getStoredTheme() ||
    (window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
}

function applyTheme(theme){
  document.documentElement.setAttribute("data-theme", theme);
}

function toggleTheme(){
  const current = document.documentElement.getAttribute("data-theme") || "light";
  const next = current === "dark" ? "light" : "dark";
  applyTheme(next);
  try{ localStorage.setItem(THEME_KEY, next); }catch(e){ /* fail silently */ }
}

// Keep in sync with OS-level changes, but only if the user hasn't
// explicitly picked a theme on this device.
if(window.matchMedia){
  window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", (e) => {
    if(!getStoredTheme()) applyTheme(e.matches ? "dark" : "light");
  });
}

// Theme is already applied by the inline head script; this just
// makes sure it's consistent in case that script was skipped.
applyTheme(getPreferredTheme());
