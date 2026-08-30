/* ============================================================
   Visitor Counter — JobExamJK
   Uses CountAPI (free, no auth). Counts once per browser
   session, not per page reload.
   ============================================================ */
(function () {
  const KEY = "alamgirhosain-jobexam-home-v1";
  const SESSION_KEY = "jobexamjk_visited";
  const el = document.getElementById("visitorCount");

  if (!el) return;

  const hasBeenCounted = sessionStorage.getItem(SESSION_KEY);
  const action = hasBeenCounted ? "get" : "hit";
  const endpoint = `https://countapi.mileshilliard.com/api/v1/${action}/${KEY}`;

  fetch(endpoint, { cache: "no-cache" })
    .then((res) => {
      if (!res.ok) throw new Error("API fail");
      return res.json();
    })
    .then((data) => {
      if (data && typeof data.value === "number") {
        el.textContent = data.value.toLocaleString();
        if (!hasBeenCounted) {
          sessionStorage.setItem(SESSION_KEY, "true");
        }
      } else {
        el.textContent = "—";
      }
    })
    .catch((e) => {
      console.error("Visitor Counter Error:", e);
      el.textContent = "—";
    });
})();