(() => {
  "use strict";

  // Local flow simulation only. Production navigation must follow server-verified Google credentials.
  const channel = "allearth-prototype";
  const screen = document.querySelector("[data-screen]").dataset.screen;
  const from = screen === "login-b" ? "b" : "a";
  const requestedScenario = new URLSearchParams(location.search).get("scenario");
  const scenario = ["new", "existing", "cancel", "error"].includes(requestedScenario) ? requestedScenario : "new";
  const googleButton = document.querySelector('[data-action="google"]');
  const buttonLabel = googleButton.querySelector(".button-label");
  const notice = document.getElementById("prototype-notice");
  const embedded = window.parent !== window;
  let busy = false;
  let noticeTimer;

  function publish(action, detail = {}) {
    const event = {
      channel,
      action,
      screen,
      timestamp: Date.now(),
      detail,
    };
    window.dispatchEvent(new CustomEvent("allearth:action", { detail: event }));
    if (embedded) {
      window.parent.postMessage(event, location.protocol === "file:" ? "*" : location.origin);
    }
  }

  function explain(text, showInPreview = false) {
    if (embedded && !showInPreview) return;
    clearTimeout(noticeTimer);
    notice.textContent = `프로토타입 · ${text}`;
    notice.hidden = false;
    noticeTimer = setTimeout(() => { notice.hidden = true; }, 5000);
  }

  async function requestGoogle() {
    if (busy) return;
    busy = true;
    googleButton.disabled = true;
    googleButton.setAttribute("aria-busy", "true");
    buttonLabel.textContent = "로그인 요청 중";
    publish("auth.requested", { provider: "google", mode: "preview" });

    // A deterministic loading preview only. No account, OAuth, consent, or session is created.
    await new Promise(resolve => setTimeout(resolve, 700));
    if (!googleButton.isConnected) return;
    if (scenario === "new") {
      publish("auth.preview_succeeded", { mode: "preview", authenticated: false, from, nextScreen: "signup" });
      location.href = `signup.html?from=${from}`;
      return;
    }
    if (scenario === "existing") {
      publish("auth.returning", { mode: "preview", authenticated: false, from });
      location.href = `complete.html?kind=returning&from=${from}`;
      return;
    }
    if (scenario === "cancel") {
      publish("auth.cancelled", { mode: "preview", from });
      explain("로그인을 취소했어요. 원할 때 다시 시작해 주세요.", true);
    } else {
      publish("auth.failed", { mode: "preview", from });
      explain("로그인을 완료하지 못했어요. 잠시 후 다시 시도해 주세요.", true);
    }
    googleButton.disabled = false;
    googleButton.removeAttribute("aria-busy");
    buttonLabel.textContent = "Google로 계속하기";
    busy = false;
  }

  document.addEventListener("click", event => {
    const target = event.target.closest("button[data-action]");
    if (!target || target.disabled) return;
    switch (target.dataset.action) {
      case "google":
        void requestGoogle();
        break;
      case "dismiss":
        publish("login.dismiss", { nextScreen: "previous-or-home", connected: false });
        explain("닫기 요청을 확인했습니다. 이전 화면·홈 연결은 다음 화면을 만들 때 추가합니다.");
        break;
      case "terms":
        publish("legal.requested", { document: "terms", available: false });
        explain("이용약관 원문은 아직 연결되지 않았습니다. 약관 동의는 처리하지 않습니다.");
        break;
      case "privacy":
        publish("legal.requested", { document: "privacy", available: false });
        explain("개인정보 처리방침 원문은 아직 연결되지 않았습니다.");
        break;
    }
  });

  document.fonts.ready.then(() => {
    publish("screen.ready", { width: window.innerWidth, height: window.innerHeight, from, scenario, mode: "preview" });
  });
})();
