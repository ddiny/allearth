(() => {
  "use strict";
  const params = new URLSearchParams(location.search);
  const from = params.get("from") === "b" ? "b" : "a";
  const kind = params.get("kind") === "returning" ? "returning" : "new";
  const embedded = window.parent !== window;
  if (embedded) document.body.dataset.embedded = "true";
  if (kind === "returning") {
    document.getElementById("complete-title").textContent = "다시 만나 반가워요";
    document.getElementById("complete-description").textContent = "나만의 지구를 이어서 만나보세요.";
    document.title = "AllEarth · 기존 회원 로그인";
  }

  function publish(action) {
    const event = {
      channel: "allearth-prototype", screen: "complete", action,
      timestamp: Date.now(), detail: { mode: "preview", from, kind, authenticated: false },
    };
    window.dispatchEvent(new CustomEvent("allearth:action", { detail: event }));
    if (embedded) window.parent.postMessage(event, location.protocol === "file:" ? "*" : location.origin);
  }
  document.getElementById("enter-home").addEventListener("click", () => {
    window.AllEarthStore.login();
    publish("complete.entered");
    location.href = `home.html?from=${from}`;
  });
  document.fonts.ready.then(() => {
    document.getElementById("complete-title").focus({ preventScroll: true });
    publish("screen.ready");
  });
})();
