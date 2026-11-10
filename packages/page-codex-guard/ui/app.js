(function () {
  "use strict";

  var token = (document.querySelector('meta[name="codex-guard-token"]') || {}).content || "";
  var params = new URLSearchParams(location.search);
  var lang = String(params.get("lang") || "").toLowerCase().startsWith("zh") ? "zh" : "en";
  if (!params.get("lang")) lang = "zh";

  var words = {
    zh: {
      title: "Codex 守护",
      subtitle: "检查 Codex 的账号态文件，快照它，登出后把它恢复回来。",
      refresh: "刷新",
      stateTitle: "登录态",
      snapTitle: "快照与恢复",
      snapNote: "恢复会先把当前文件存进 pre-restore，再写回所选快照。",
      quotaTitle: "codex 额度",
      routeTitle: "路由现状",
      restore: "恢复所选",
      snapshot: "新建快照",
      autoRestore: "发现匿名态时自动恢复",
      restoreNow: "立即恢复",
      snapName: "快照名字（可留空）",
      reading: "读取中",
      healthy: "账号态正常",
      anonymous: "匿名态（已登出）",
      partial: "账号态不完整",
      missing: "找不到状态文件",
      unreadable: "状态文件读不出来",
      keys: "顶层键",
      projects: "项目",
      assignments: "会话归属",
      roots: "工作区根",
      size: "文件大小",
      mtime: "修改时间",
      file: "文件",
      home: "目录",
      none: "无",
      noteHealthy: "项目和会话归属都在，侧边栏会按项目分组显示。",
      noteAnonymous: "这正是「项目全没了」的样子：Codex 登出时把这个文件写成了没有项目的匿名版，连 .bak 一起。会话本身没被删。此处可以恢复最近一次健康快照。",
      notePartial: "有项目映射但不完整，可能是写入过程中读到，刷新一次再看。",
      noteMissing: "这个目录下没有 .codex-global-state.json。若 Codex 装在别处，可用插件选项 codexHome 指定。",
      noSnapshots: "还没有快照，先在登录正常时点「新建快照」。",
      restored: "已恢复",
      made: "已创建快照",
      low: "偏低",
      resets: "重置券",
      windowUsed: "已用",
      remaining: "剩余",
      resetsAt: "重置于",
      quotaOff: "读不到 magpie 网关的额度接口（网关未开或端口不同）。",
      ceiling: "ceiling",
      ceilingWhy: "语义「用到 N% 就让位」，所以留 1% 就是 ceiling=99。",
      affinityOff: "关闭",
      account: "账号",
      members: "成员",
      noRouting: "读不到 providers.json 里的路由组。"
    },
    en: {
      title: "Codex guard",
      subtitle: "Check Codex's account-state file, snapshot it, and put it back after a sign-out.",
      refresh: "Refresh",
      stateTitle: "Account state",
      snapTitle: "Snapshots and restore",
      snapNote: "A restore first copies the current file into pre-restore, then writes the chosen snapshot back.",
      quotaTitle: "codex windows",
      routeTitle: "Routing in effect",
      restore: "Restore selected",
      snapshot: "New snapshot",
      autoRestore: "Restore automatically when the signed-out state appears",
      restoreNow: "Restore now",
      snapName: "Snapshot name (optional)",
      reading: "reading",
      healthy: "account state healthy",
      anonymous: "anonymous (signed out)",
      partial: "account state incomplete",
      missing: "state file not found",
      unreadable: "state file unreadable",
      keys: "Top-level keys",
      projects: "Projects",
      assignments: "Session assignments",
      roots: "Workspace roots",
      size: "File size",
      mtime: "Modified",
      file: "File",
      home: "Folder",
      none: "none",
      noteHealthy: "Projects and assignments are here; the sidebar groups sessions by project.",
      noteAnonymous: "This is exactly what 'all my projects are gone' looks like: a sign-out rewrites this file as an anonymous copy without projects, .bak included. The sessions themselves are not deleted. Restore the last healthy snapshot here.",
      notePartial: "There are project mappings but the file looks incomplete; refresh once more.",
      noteMissing: "No .codex-global-state.json in this folder. If Codex lives elsewhere, set the codexHome plugin option.",
      noSnapshots: "No snapshot yet. Take one while Codex is signed in.",
      restored: "Restored",
      made: "Snapshot taken",
      low: "low",
      resets: "reset credits",
      windowUsed: "used",
      remaining: "remaining",
      resetsAt: "resets",
      quotaOff: "magpie's quota endpoint is not answering (gateway off or another port).",
      ceiling: "ceiling",
      ceilingWhy: "It means 'step aside once N% is used', so keeping 1% is ceiling=99.",
      affinityOff: "off",
      account: "account",
      members: "members",
      noRouting: "No routing group readable from providers.json."
    }
  };
  var t = words[lang];
  document.documentElement.lang = lang === "zh" ? "zh-CN" : "en";
  document.title = t.title;
  Array.prototype.forEach.call(document.querySelectorAll("[data-i18n]"), function (node) {
    var key = node.getAttribute("data-i18n");
    if (t[key]) node.textContent = t[key];
  });
  document.getElementById("snapName").placeholder = t.snapName;

  function el(id) { return document.getElementById(id); }
  function text(value) { return value === null || value === undefined || value === "" ? t.none : String(value); }
  function num(value) { return typeof value === "number" ? value.toLocaleString() : t.none; }
  function when(iso) {
    if (!iso) return t.none;
    var date = new Date(iso);
    if (isNaN(date.getTime())) return String(iso);
    return date.toLocaleString(lang === "zh" ? "zh-CN" : "en-GB", { hour12: false });
  }
  function bytes(value) {
    if (!value) return "0 B";
    if (value < 1024) return value + " B";
    if (value < 1048576) return (value / 1024).toFixed(1) + " KB";
    return (value / 1048576).toFixed(2) + " MB";
  }

  function toast(said, bad) {
    var node = el("toast");
    node.textContent = said;
    node.hidden = false;
    clearTimeout(toast.timer);
    toast.timer = setTimeout(function () { node.hidden = true; }, bad ? 5200 : 2600);
  }

  async function call(path, input) {
    var res = await fetch(path, {
      method: input === undefined ? "GET" : "POST",
      headers: input === undefined ? { "x-codex-guard-token": token } : { "content-type": "application/json", "x-codex-guard-token": token },
      body: input === undefined ? undefined : JSON.stringify(input)
    });
    var data = null;
    try { data = await res.json(); } catch (error) { data = null; }
    if (!res.ok || (data && data.ok === false)) {
      throw new Error((data && data.error) || ("HTTP " + res.status));
    }
    return data;
  }

  var last = null;

  function renderState(state) {
    var codex = state.codex;
    var badge = el("badge");
    var map = { healthy: "ok", anonymous: "bad", partial: "warn", missing: "warn", unreadable: "warn" };
    badge.className = "badge " + (map[codex.mode] || "");
    badge.textContent = t[codex.mode] || codex.mode;
    el("stateNote").textContent = t["note" + codex.mode.charAt(0).toUpperCase() + codex.mode.slice(1)] || "";

    var rows = [
      [t.keys, num(codex.topKeys)],
      [t.projects, num(codex.projectCount)],
      [t.assignments, num(codex.assignmentCount)],
      [t.roots, num(codex.workspaceRoots)],
      [t.size, bytes(codex.bytes)],
      [t.mtime, when(codex.mtime)],
      [t.home, codex.home],
      [t.file, codex.file]
    ];
    if (codex.error) rows.push(["error", codex.error]);
    var list = el("stateList");
    list.innerHTML = "";
    rows.forEach(function (pair) {
      var dt = document.createElement("dt");
      dt.textContent = pair[0];
      var dd = document.createElement("dd");
      dd.textContent = text(pair[1]);
      list.appendChild(dt);
      list.appendChild(dd);
    });
  }

  function renderSnapshots(state) {
    var pick = el("snapPick");
    var rows = state.snapshots || [];
    pick.innerHTML = "";
    if (!rows.length) {
      var empty = document.createElement("option");
      empty.value = "";
      empty.textContent = t.noSnapshots;
      pick.appendChild(empty);
      el("restorePick").disabled = true;
      el("restoreNow").disabled = true;
    } else {
      rows.forEach(function (row) {
        var option = document.createElement("option");
        option.value = row.name;
        option.textContent = row.name + " · " + row.topKeys + " keys · " + row.projectCount + " " + t.projects + (row.usable ? "" : " (unusable)");
        pick.appendChild(option);
      });
      el("restorePick").disabled = !rows.some(function (r) { return r.usable; });
      el("restoreNow").disabled = !rows.some(function (r) { return r.usable && r.topKeys >= 35; });
    }

    el("auto").checked = Boolean(state.settings && state.settings.autoRestore);

    var log = el("log");
    log.innerHTML = "";
    var lines = (state.settings && state.settings.log) || [];
    lines.slice(-8).reverse().forEach(function (row) {
      var li = document.createElement("li");
      li.textContent = when(row.at) + " · " + row.line;
      log.appendChild(li);
    });
  }

  function renderQuota(state) {
    var box = el("quota");
    box.innerHTML = "";
    var quota = state.quota || {};
    if (!quota.ok) {
      var off = document.createElement("p");
      off.className = "note";
      off.textContent = t.quotaOff + (quota.error ? " (" + quota.error + ")" : "");
      box.appendChild(off);
      return;
    }
    var rows = (quota.rows || []).filter(function (row) { return row.provider === "codex"; });
    if (!rows.length) {
      var none = document.createElement("p");
      none.className = "note";
      none.textContent = t.none;
      box.appendChild(none);
      return;
    }
    rows.forEach(function (row) {
      var wrap = document.createElement("div");
      wrap.className = "q";
      var head = document.createElement("div");
      head.className = "q-head";
      var left = document.createElement("b");
      left.textContent = row.user || row.name || "codex";
      var right = document.createElement("span");
      right.textContent = (row.plan || "") + (row.resets !== null && row.resets !== undefined ? " · " + row.resets + " " + t.resets : "");
      head.appendChild(left);
      head.appendChild(right);
      wrap.appendChild(head);
      if (row.error) {
        var bad = document.createElement("p");
        bad.className = "note";
        bad.textContent = row.error;
        wrap.appendChild(bad);
      }
      (row.windows || []).forEach(function (win) {
        var used = typeof win.used === "number" ? win.used : null;
        var track = document.createElement("div");
        track.className = "bar-track";
        var fill = document.createElement("div");
        fill.className = "bar-fill" + (used !== null && used >= 99 ? " low" : used !== null && used >= 90 ? " mid" : "");
        fill.style.width = Math.max(0, Math.min(100, used === null ? 0 : used)) + "%";
        track.appendChild(fill);
        var foot = document.createElement("div");
        foot.className = "q-foot";
        var name = document.createElement("span");
        name.textContent = win.name;
        var tail = document.createElement("span");
        tail.textContent = t.remaining + " " + (win.remaining === null ? "?" : win.remaining) + "% · " + t.resetsAt + " " + when(win.resetsAt);
        foot.appendChild(name);
        foot.appendChild(tail);
        wrap.appendChild(track);
        wrap.appendChild(foot);
      });
      box.appendChild(wrap);
    });
  }

  function renderRouting(state) {
    var box = el("routing");
    box.innerHTML = "";
    var routing = state.routing || {};
    var groups = routing.groups || [];
    if (!routing.ok || !groups.length) {
      var none = document.createElement("p");
      none.className = "note";
      none.textContent = t.noRouting + (routing.error ? " (" + routing.error + ")" : "");
      box.appendChild(none);
      return;
    }
    groups.forEach(function (group) {
      var head = document.createElement("div");
      head.className = "q-head";
      var left = document.createElement("b");
      left.textContent = group.name || group.id;
      var right = document.createElement("span");
      right.textContent = group.routing + (group.affinity ? " · affinity " + group.affinity : "");
      head.appendChild(left);
      head.appendChild(right);
      box.appendChild(head);
      var chips = document.createElement("div");
      chips.className = "chips";
      group.members.forEach(function (member) {
        var chip = document.createElement("span");
        chip.className = "chip";
        chip.textContent = member;
        chips.appendChild(chip);
      });
      box.appendChild(chips);
      var ceiling = routing.ceilings && routing.ceilings["@magpie-community/middleware-reserve"];
      if (ceiling !== undefined) {
        var note = document.createElement("p");
        note.className = "note";
        note.textContent = t.ceiling + " " + ceiling + " — " + t.ceilingWhy;
        box.appendChild(note);
      }
    });
  }

  function render(state) {
    last = state;
    renderState(state);
    renderSnapshots(state);
    renderQuota(state);
    renderRouting(state);
  }

  async function load() {
    try {
      render(await call("/api/state"));
    } catch (error) {
      toast(String(error.message || error), true);
    }
  }

  el("refresh").addEventListener("click", load);

  el("snapMake").addEventListener("click", async function () {
    try {
      var name = el("snapName").value.trim();
      var data = await call("/api/snapshot", { name: name || undefined });
      el("snapName").value = "";
      render(data.state);
      toast(t.made + ": " + data.snapshot.name);
    } catch (error) {
      toast(String(error.message || error), true);
    }
  });

  el("restorePick").addEventListener("click", async function () {
    var name = el("snapPick").value;
    if (!name) return;
    try {
      var data = await call("/api/restore", { name: name });
      render(data.state);
      toast(t.restored + ": " + name + " (" + data.restored.topKeys + " keys)");
    } catch (error) {
      toast(String(error.message || error), true);
    }
  });

  el("restoreNow").addEventListener("click", async function () {
    try {
      var data = await call("/api/restore-now", {});
      render(data.state);
      toast(t.restored + ": " + data.restored.name);
    } catch (error) {
      toast(String(error.message || error), true);
    }
  });

  el("auto").addEventListener("change", async function () {
    try {
      var data = await call("/api/settings", { autoRestore: el("auto").checked });
      render(data.state);
      toast(t.autoRestore + ": " + (el("auto").checked ? "on" : "off"));
    } catch (error) {
      toast(String(error.message || error), true);
    }
  });

  load();
  setInterval(load, 20000);
})();
