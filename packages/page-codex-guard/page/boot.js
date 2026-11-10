(async () => {
  var DEFAULT_PORT = 4391;
  var words = {
    en: { title: "Codex guard", connecting: "Connecting to the local service...", stopped: function (port) { return "The local service is not running (127.0.0.1:" + port + ")."; }, retry: "Retry" },
    zh: { title: "Codex 守护", connecting: "正在连接本地服务...", stopped: function (port) { return "本地服务没有在运行（127.0.0.1:" + port + "）。"; }, retry: "重试" }
  };

  var port = DEFAULT_PORT;
  var theme = "light";
  var lang = "zh";
  var service = "";

  function followLanguage(value) {
    lang = String(value || "").toLowerCase().startsWith("zh") ? "zh" : "en";
    var text = words[lang];
    document.documentElement.lang = lang === "zh" ? "zh-CN" : "en";
    document.title = text.title;
    document.getElementById("title").textContent = text.title;
    document.getElementById("said").textContent = text.connecting;
    document.getElementById("retry").textContent = text.retry;
  }

  try {
    var current = await (window.magpie && window.magpie.ready);
    if (current) {
      theme = current.dark ? "dark" : "light";
      lang = String(current.lang || lang).toLowerCase().startsWith("zh") ? "zh" : "en";
    }
  } catch (error) {
    // The page still works without the bridge.
  }

  try {
    var options = await (window.magpie && window.magpie.options && window.magpie.options.get && window.magpie.options.get());
    var value = Number(options && options.port);
    if (Number.isInteger(value) && value > 0 && value < 65536) port = value;
  } catch (error) {
    // Use the declared default.
  }

  try {
    var given = window.magpie && window.magpie.service;
    if (typeof given === "string" && /^https?:\/\//.test(given)) service = given;
  } catch (error) {
    // Desktop windows navigate straight to loopback.
  }

  followLanguage(lang);
  if (window.magpie && window.magpie.onTheme) {
    window.magpie.onTheme(function (next) {
      if (!next) return;
      if (typeof next.dark === "boolean") theme = next.dark ? "dark" : "light";
      if (typeof next.lang === "string") followLanguage(next.lang);
    });
  }

  var query = new URLSearchParams();
  query.set("theme", theme);
  query.set("lang", lang);

  var target = service || "http://127.0.0.1:" + port + "/";
  var url = new URL(target, location.href);
  query.forEach(function (value, key) {
    url.searchParams.set(key, value);
  });

  var timer = setTimeout(function () {
    var said = document.getElementById("said");
    if (said) said.textContent = words[lang].stopped(port);
    var retry = document.getElementById("retry");
    if (retry) retry.hidden = false;
  }, 5000);

  var button = document.getElementById("retry");
  if (button) {
    button.addEventListener("click", function () {
      clearTimeout(timer);
      location.reload();
    });
  }

  location.replace(url.href);
})();
