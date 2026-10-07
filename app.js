/* 攻守対照表ダッシュボード。window.DASH（data/M.js か data/W.js）を読む。 */
(function () {
  "use strict";
  const D = window.DASH;
  const GENDER_LABEL = { M: "男子", W: "女子" };
  const POS_LABEL = { "6m": "6m", wing: "ウイング", "9m": "9m", fb: "速攻", bt: "ブレイクスルー", "7m": "7m", free: "フリースロー", eg: "無人ゴール" };
  const TOUR = Object.fromEntries(D.tournaments.map((t) => [t.id, t]));

  const state = { tours: [], view: "team", sub: "attack", posMetric: "g_s", pOrgs: [], role: "field", minShots: 0, q: "", pSel: { field: [], gk: [] }, pSlots: {}, pPos: "", tOrgs: [], tSlots: {}, tSide: "attack", tPos: "", tTable: false, sSplit: false, sK: 0,
    fSide: "attack", fK: 0, fRot: true, fPool: false, fX: 0, fY: 1, fOn: {}, sort: {} };

  // ---------- URL ハッシュ ----------
  function readHash() {
    const p = new URLSearchParams(location.hash.slice(1));
    const def = { view: "team", sub: "attack", posMetric: "g_s", role: "field", q: "", tSide: "attack", tPos: "" };
    state.pOrgs = (p.get("org") || "").split(",").filter((o) => o && o !== "all");
    state.pSel = { field: (p.get("pf") || "").split(",").filter(Boolean).slice(0, 8), gk: (p.get("pg") || "").split(",").filter(Boolean).slice(0, 8) };
    state.pSlots = {};
    ["field", "gk"].forEach((r) => state.pSel[r].forEach((id, i) => (state.pSlots[r + id] = i)));
    state.pPos = p.get("pPos") || "";
    state.tOrgs = (p.get("tOrg") || "").split(",").filter(Boolean).slice(0, 8);
    state.tSlots = {};
    state.tOrgs.forEach((o, i) => (state.tSlots[o] = i));
    state.tTable = p.get("tTable") === "1";
    state.sSplit = p.get("sSplit") === "1";
    state.sK = [3, 4, 5].includes(Number(p.get("sK"))) ? Number(p.get("sK")) : 0;
    state.fSide = ["attack", "defense", "both"].includes(p.get("fSide")) ? p.get("fSide") : "attack";
    state.fK = [1, 2, 3].includes(Number(p.get("fK"))) ? Number(p.get("fK")) : 0;
    state.fRot = p.get("fRot") !== "0";
    state.fPool = p.get("fPool") === "1";
    state.fX = Math.max(0, Number(p.get("fX")) || 0);
    state.fY = p.has("fY") ? Math.max(0, Number(p.get("fY")) || 0) : 1;
    for (const k of Object.keys(def)) state[k] = p.has(k) ? p.get(k) : def[k];
    state.minShots = Number(p.get("min")) || 0;
    const t = p.get("tour");
    const all = D.tournaments.map((x) => x.id);
    state.tours = t === "all" ? all : (t ? t.split(",").filter((id) => TOUR[id]) : []);
    if (!state.tours.length) state.tours = all.length ? [all[0]] : [];
  }
  function writeHash() {
    const p = new URLSearchParams();
    for (const k of ["view", "sub", "posMetric", "role", "q", "tSide", "tPos"]) if (state[k] && state[k] !== "all" && state[k] !== "") p.set(k, state[k]);
    if (state.pOrgs.length) p.set("org", state.pOrgs.join(","));
    if (state.pSel.field.length) p.set("pf", state.pSel.field.join(","));
    if (state.pSel.gk.length) p.set("pg", state.pSel.gk.join(","));
    if (state.pPos) p.set("pPos", state.pPos);
    if (state.tOrgs.length) p.set("tOrg", state.tOrgs.join(","));
    if (state.tTable) p.set("tTable", "1");
    if (state.sSplit) p.set("sSplit", "1");
    if (state.sK) p.set("sK", state.sK);
    if (state.view === "factor") {
      p.set("fSide", state.fSide);
      if (state.fK) p.set("fK", state.fK);
      if (!state.fRot) p.set("fRot", "0");
      if (state.fPool) p.set("fPool", "1");
      if (state.fX) p.set("fX", state.fX);
      if (state.fY !== 1) p.set("fY", state.fY);
    }
    if (state.minShots) p.set("min", state.minShots);
    p.set("tour", selIds().length === D.tournaments.length ? "all" : selIds().join(","));
    history.replaceState(null, "", "#" + p.toString());
  }

  // ---------- 整形 ----------
  const isNum = (v) => typeof v === "number" && isFinite(v);
  const fmt = (v, d = 1) => (isNum(v) ? v.toFixed(d) : "–");
  const pct = (v, d = 1) => (isNum(v) ? v.toFixed(d) + "%" : "–");
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const tourLabel = (id) => (TOUR[id] ? TOUR[id].label : id);
  // 選択中の大会（大会の並び順に揃える）。チームの行はこのキーで引く
  const selIds = () => D.tournaments.map((t) => t.id).filter((id) => state.tours.includes(id));
  const selKey = () => selIds().join("+");

  // ---------- 汎用テーブル ----------
  // col: {key,label,title,get(row)->sort値,html(row)->表示,cls,bar:{max},heat:true,l:true,grp:true}
  function renderTable(host, id, cols, rows, defSort, rowOpts) {
    const st = state.sort[id] || (state.sort[id] = defSort || { key: null, dir: "desc" });
    let list = rows.slice();
    const col = cols.find((c) => c.key === st.key);
    if (col) {
      const dir = st.dir === "asc" ? 1 : -1;
      list.sort((a, b) => {
        const x = col.get(a), y = col.get(b);
        const xn = x === null || x === undefined || (typeof x === "number" && !isFinite(x));
        const yn = y === null || y === undefined || (typeof y === "number" && !isFinite(y));
        if (xn && yn) return 0;
        if (xn) return 1; // 欠損は常に末尾
        if (yn) return -1;
        if (typeof x === "string") return dir * x.localeCompare(y, "ja");
        return dir * (x - y);
      });
    }
    // ヒートの範囲
    const ranges = {};
    cols.forEach((c) => {
      if (!c.heat) return;
      const vs = rows.map(c.get).filter(isNum);
      ranges[c.key] = vs.length ? [Math.min(...vs), Math.max(...vs)] : [0, 1];
    });
    const head = cols.map((c) => {
      const sorted = st.key === c.key ? (st.dir === "asc" ? "ascending" : "descending") : "none";
      return `<th scope="col" class="${c.l ? "l" : ""} ${c.grp ? "grp-start" : ""}" aria-sort="${sorted}" ${c.title ? `title="${esc(c.title)}"` : ""}><button type="button" data-k="${c.key}">${esc(c.label)}</button></th>`;
    }).join("");
    const body = list.map((r, ri) => `<tr data-ri="${ri}"${rowOpts ? ` tabindex="0" class="pick${rowOpts.isSel(r) ? " sel" : ""}"` : ""}>` + cols.map((c) => {
      const v = c.get(r);
      const na = v === null || v === undefined || (typeof v === "number" && !isFinite(v));
      let style = "", inner = c.html ? c.html(r) : typeof v === "string" ? esc(v) : fmt(v, c.d === undefined ? 1 : c.d);
      let cls = (c.l ? "l " : "") + (c.cls || "") + (c.grp ? " grp-start" : "") + (na && !c.html ? " na" : "");
      if (c.heat && isNum(v)) {
        const [lo, hi] = ranges[c.key];
        const t = hi > lo ? (v - lo) / (hi - lo) : 0;
        style = ` style="background:color-mix(in srgb, var(--heat) ${Math.round(t * 38)}%, transparent)"`;
      }
      if (c.bar && isNum(v)) {
        cls += " bar";
        inner = `<div class="fill" style="width:${Math.max(0, Math.min(100, (v / c.bar) * 100))}%"></div><span>${inner}</span>`;
      }
      return `<td class="${cls.trim()}"${style}>${na && !c.html ? "–" : inner}</td>`;
    }).join("") + "</tr>").join("");
    host.innerHTML = `<div class="scroll"><table><thead><tr>${head}</tr></thead><tbody>${body || `<tr><td class="empty" colspan="${cols.length}">該当なし</td></tr>`}</tbody></table></div>`;
    host.querySelectorAll("th button").forEach((b) => b.addEventListener("click", () => {
      const k = b.dataset.k;
      const c = cols.find((x) => x.key === k);
      if (st.key === k) st.dir = st.dir === "desc" ? "asc" : "desc";
      else { st.key = k; st.dir = c && c.l ? "asc" : "desc"; }
      renderTable(host, id, cols, rows, defSort, rowOpts);
    }));
    if (rowOpts) host.querySelectorAll("tbody tr.pick").forEach((tr) => {
      const go = () => rowOpts.onPick(list[Number(tr.dataset.ri)]);
      tr.addEventListener("click", go);
      tr.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); go(); } });
    });
  }

  // ---------- チーム ----------
  const tcols = {
    base: (multi) => [
      { key: "org", label: "国", l: true, cls: "org", get: (r) => r.org },
      { key: "games", label: "試合", d: 0, get: (r) => r.games },
    ],
  };
  const pg = (k) => (r) => r.per_game[k];
  const rt = (k) => (r) => r.rate[k];

  function attackCols(multi) {
    return [...tcols.base(multi),
      { key: "attacks", label: "攻撃回数", title: "シュート + ターンオーバー（TO + TF）。1試合平均", get: pg("attacks") },
      { key: "shots", label: "シュート", title: "全試投（枠外・ブロック含む）。1試合平均", get: pg("shots") },
      { key: "goals", label: "得点", get: pg("goals") },
      { key: "atk_succ", label: "攻撃成功率", title: "得点 ÷ 攻撃回数", get: rt("attack_success"), bar: 100, html: (r) => pct(r.rate.attack_success) },
      { key: "shot_succ", label: "シュート成功率", title: "得点 ÷ シュート", get: rt("shot_success"), html: (r) => pct(r.rate.shot_success) },
      { key: "per50", label: "50攻撃あたり得点", title: "得点 ÷ 攻撃回数 × 50", get: rt("per50_goals") },
      { key: "assists", label: "アシスト", get: pg("assists") },
      { key: "a_g", label: "AS/得点", title: "ゴールあたりアシスト数", get: rt("assists_per_goal"), html: (r) => fmt(r.rate.assists_per_goal, 2) },
      { key: "to", label: "TO", title: "ターンオーバー（TO + TF）。1試合平均", get: pg("turnovers") },
      { key: "to_rate", label: "TO率", title: "ターンオーバー ÷ 攻撃回数", get: rt("turnover_rate"), html: (r) => pct(r.rate.turnover_rate) },
      { key: "drawn", label: "2分獲得", title: "相手に出させた2分間退場。1試合平均", get: pg("drawn_2min") },
    ];
  }
  function defenseCols(multi) {
    return [...tcols.base(multi),
      { key: "def_att", label: "守備回数", title: "相手の攻撃回数（相手のシュート + TO + TF）。1試合平均", get: pg("def_attacks") },
      { key: "faced", label: "被シュート", title: "全試投（枠外・ブロック含む）。1試合平均", get: pg("faced_shots") },
      { key: "conc", label: "失点", get: pg("conceded") },
      { key: "def_succ", label: "守備成功率", title: "100 − 失点 ÷ 守備回数", get: rt("defense_success"), bar: 100, html: (r) => pct(r.rate.defense_success) },
      { key: "def_rate", label: "防御率", title: "100 − 失点 ÷ 被シュート（全試投ベース）", get: rt("defense_rate"), html: (r) => pct(r.rate.defense_rate) },
      { key: "per50", label: "50守備あたり失点", title: "失点 ÷ 守備回数 × 50", get: rt("per50_conceded") },
      { key: "gk_rate", label: "GKセーブ率", title: "セーブ ÷ 枠内被シュート", get: rt("gk_save_rate"), html: (r) => pct(r.rate.gk_save_rate) },
      { key: "c_as", label: "被アシスト", get: pg("conceded_assists") },
      { key: "c_as_g", label: "被AS/失点", title: "失点あたり被アシスト数", get: rt("conceded_assists_per_goal"), html: (r) => fmt(r.rate.conceded_assists_per_goal, 2) },
      { key: "forced", label: "TO奪取率", title: "相手のターンオーバー ÷ 守備回数", get: rt("forced_turnover_rate"), html: (r) => pct(r.rate.forced_turnover_rate) },
      { key: "given", label: "2分与", title: "与えた2分間退場（自チームの2分間退場）。1試合平均", get: pg("given_2min") },
    ];
  }

  const POS_METRICS = [
    { id: "g_s", side: "攻撃", label: "得点/シュート（1試合平均）", pair: (r, k) => [r.per_game[`goals_${k}`], r.per_game[`shots_${k}`]], total: (r) => [r.per_game.goals, r.per_game.shots] },
    { id: "per50g", side: "攻撃", label: "50攻撃あたり得点", val: (r, k) => r.rate[`per50_goals_${k}`], total: (r) => r.rate.per50_goals, d: 1, heat: true },
    { id: "shot_succ", side: "攻撃", label: "シュート成功率", val: (r, k) => r.rate[`shot_success_${k}`], total: (r) => r.rate.shot_success, d: 0, unit: "%", heat: true },
    { id: "c_f", side: "守備", label: "失点/被シュート（1試合平均）", pair: (r, k) => [r.per_game[`conceded_${k}`], r.per_game[`faced_${k}`]], total: (r) => [r.per_game.conceded, r.per_game.faced_shots] },
    { id: "per50c", side: "守備", label: "50守備あたり失点", val: (r, k) => r.rate[`per50_conceded_${k}`], total: (r) => r.rate.per50_conceded, d: 1, heat: true },
    { id: "def_rate", side: "守備", label: "防御率（全試投ベース）", val: (r, k) => r.rate[`defense_rate_${k}`], total: (r) => r.rate.defense_rate, d: 0, unit: "%", heat: true },
    { id: "gk_sv", side: "守備", label: "GKセーブ数/枠内被シュート（1試合平均）", gk: true, pair: (r, k) => [r.per_game[`saves_${k}`], r.per_game[`gkfaced_${k}`]], total: (r) => [r.per_game.gk_saves, r.per_game.gk_faced] },
    { id: "gk_rate", side: "守備", label: "GKセーブ率（枠内ベース）", gk: true, val: (r, k) => r.rate[`gk_save_rate_${k}`], total: (r) => r.rate.gk_save_rate, d: 0, unit: "%", heat: true },
  ];

  function positionCols(multi, metric) {
    const kinds = metric.gk ? D.gk_kinds : D.kinds;
    const present = kinds.filter((k) => teamRows().some((r) => (metric.pair ? metric.pair(r, k).some(isNum) : isNum(metric.val(r, k)))));
    const cell = (r, k) => {
      if (metric.pair) {
        const [a, b] = k === "計" ? metric.total(r) : metric.pair(r, k);
        return isNum(a) && isNum(b) ? { sort: a, html: `${a.toFixed(1)}/${b.toFixed(1)}` } : { sort: null };
      }
      const v = k === "計" ? metric.total(r) : metric.val(r, k);
      return isNum(v) ? { sort: v, html: v.toFixed(metric.d) + (metric.unit || "") } : { sort: null };
    };
    return [...tcols.base(multi),
      ...["計", ...present].map((k, i) => ({
        key: "p_" + k, label: k === "計" ? "計" : POS_LABEL[k] || k, grp: i === 0,
        title: k === "計" ? "全ポジションの合計" : POS_LABEL[k],
        get: (r) => cell(r, k).sort, html: (r) => cell(r, k).html || "–", heat: !!metric.heat && k !== "計",
      })),
    ];
  }

  function teamRows() {
    const key = selKey();
    return D.teams.filter((r) => r.tournament === key);
  }

  function renderTeam(host) {
    const multi = false;
    const rows = teamRows();
    const sub = ["attack", "defense", "position"].includes(state.sub) ? state.sub : "attack";
    state.sub = sub;
    const tabs = `<div class="tabs subtabs" role="tablist">${[["attack", "攻撃"], ["defense", "守備"], ["position", "ポジション別"]]
      .map(([k, l]) => `<button role="tab" type="button" data-sub="${k}" aria-selected="${sub === k}">${l}</button>`).join("")}</div>`;
    let inner = "", notes = "";
    if (sub === "position") {
      const metric = POS_METRICS.find((m) => m.id === state.posMetric) || POS_METRICS[0];
      state.posMetric = metric.id;
      const opts = ["攻撃", "守備"].map((side) => `<optgroup label="${side}">${POS_METRICS.filter((m) => m.side === side)
        .map((m) => `<option value="${m.id}" ${m.id === metric.id ? "selected" : ""}>${m.label}</option>`).join("")}</optgroup>`).join("");
      inner = `<div class="controls"><label>指標 <select id="posMetric">${opts}</select></label></div><div id="tbl"></div>`;
      notes = `<ul class="notes"><li>ポジションは紙面の区分。6m・ウイング・9m はシュートの出どころ、7m・速攻・ブレイクスルー・フリースロー・無人ゴールは位置ではなく状況。選手個人のポジション（LW / LB / CB など）は紙面にありません。</li>
        <li>空欄の区分は 0 として平均しています。フリースローは選手権のみ、無人ゴールは AG のみ。</li>
        <li>被シュートは枠外・ブロックを含む全試投、GK のセーブ数・セーブ率は枠内のみ。分母が違います。</li></ul>`;
    } else {
      inner = `<div id="tbl"></div>`;
      notes = `<ul class="notes"><li>攻撃回数 = シュート + ターンオーバー（TO + TF）。守備回数は相手の攻撃回数。オフェンスリバウンドによる再シュートは 1 攻撃に畳まれないので、公式の Number of Attacks とは数が合いません。</li>
        <li>カウントは 1 試合平均。率は試合ごとの比の平均ではなく、合計どうしの比。ターンオーバーが取れていない試合はその試合ごと外れます。</li>
        <li>GK セーブ率は、公式帳票の分母が壊れた試合を除いて集計。</li></ul>`;
    }
    host.innerHTML = tabs + inner + `<div class="count">${rows.length} チーム${selIds().length > 1 ? `・${selIds().length} 大会を積算` : ""}</div>` + notes;
    host.querySelectorAll("[data-sub]").forEach((b) => b.addEventListener("click", () => { state.sub = b.dataset.sub; update(); }));
    const sel = host.querySelector("#posMetric");
    if (sel) sel.addEventListener("change", () => { state.posMetric = sel.value; update(); });
    const tbl = host.querySelector("#tbl");
    if (sub === "attack") renderTable(tbl, "t-atk" + multi, attackCols(multi), rows, { key: "atk_succ", dir: "desc" });
    else if (sub === "defense") renderTable(tbl, "t-def" + multi, defenseCols(multi), rows, { key: "def_succ", dir: "desc" });
    else {
      const metric = POS_METRICS.find((m) => m.id === state.posMetric);
      renderTable(tbl, "t-pos" + multi + metric.id, positionCols(multi, metric), rows, { key: "org", dir: "asc" });
    }
  }

  // ---------- 選手 ----------
  const posCell = (r, k) => {
    const v = r.pos && r.pos[k];
    return v ? { sort: v[0], html: `${v[0]}/${v[1]}` } : { sort: null };
  };
  const gkPosCell = (r, k) => {
    const v = r.gk && r.gk.pos && r.gk.pos[k];
    return v ? { sort: v[1] ? v[0] / v[1] : null, html: `${v[0]}/${v[1]}${v[1] ? ` <span class="sub">${Math.round((100 * v[0]) / v[1])}%</span>` : ""}` } : { sort: null };
  };

  function playerBase(multi) {
    return [
      { key: "name", label: "選手", l: true, get: (r) => r.name, html: (r) => `${esc(r.name)}${r.captain ? ' <span class="sub">(C)</span>' : ""}` },
      { key: "org", label: "国", l: true, cls: "org", get: (r) => r.org },
      { key: "bib", label: "#", title: "背番号。大会で変わった選手は / で並べる", get: (r) => r.bibSort, html: (r) => esc(r.bibText) },
      ...(multi ? [{ key: "tours", label: "出場大会", l: true, get: (r) => r.tours.join(","), html: (r) => esc(r.tours.join(" ")) }] : []),
    ];
  }
  function fieldCols(multi) {
    return [...playerBase(multi),
      { key: "games", label: "試合", title: "記録のある試合数（紙面に何も記録が無い試合は数えません）", d: 0, get: (r) => r.games },
      { key: "goals", label: "得点", d: 0, get: (r) => r.goals, grp: true },
      { key: "shots", label: "シュート", d: 0, title: "全試投（枠外・ブロック含む）", get: (r) => r.shots },
      { key: "rate", label: "成功率", title: "得点 ÷ シュート", get: (r) => (r.shots ? (100 * r.goals) / r.shots : null), html: (r) => pct((100 * r.goals) / r.shots, 0), bar: 100 },
      { key: "ast", label: "AS", d: 0, title: "アシスト", get: (r) => r.assists },
      { key: "to", label: "TO", d: 0, title: "ターンオーバー（TO + TF）", get: (r) => r.turnovers },
      { key: "m2", label: "2分", d: 0, title: "2分間退場", get: (r) => r.susp_2min },
      { key: "st", label: "STL", d: 0, title: "スティール。AG のみ", get: (r) => r.steals },
      { key: "bl", label: "BLK", d: 0, title: "ブロック。AG のみ", get: (r) => r.blocks },
      ...D.kinds.filter((k) => k !== "eg" && k !== "free").map((k, i) => ({
        key: "p_" + k, label: POS_LABEL[k], grp: i === 0, title: `${POS_LABEL[k]} 得点/シュート`,
        get: (r) => posCell(r, k).sort, html: (r) => posCell(r, k).html || "–",
      })),
    ];
  }
  function gkCols(multi) {
    return [...playerBase(multi),
      { key: "games", label: "試合", d: 0, title: "GK として記録のある試合数（分母が壊れた試合は除く）", get: (r) => r.gk.games },
      { key: "sv", label: "セーブ", d: 0, get: (r) => r.gk.saves, grp: true },
      { key: "fc", label: "枠内被シュート", d: 0, title: "セーブ + 失点（枠内のみ）", get: (r) => r.gk.faced },
      { key: "rate", label: "セーブ率", title: "セーブ ÷ 枠内被シュート", get: (r) => (r.gk.faced ? (100 * r.gk.saves) / r.gk.faced : null), html: (r) => pct((100 * r.gk.saves) / r.gk.faced, 0), bar: 100 },
      ...D.gk_kinds.map((k, i) => ({
        key: "p_" + k, label: POS_LABEL[k], grp: i === 0, title: `${POS_LABEL[k]} セーブ/枠内被シュート`,
        get: (r) => gkPosCell(r, k).sort, html: (r) => gkPosCell(r, k).html || "–",
      })),
    ];
  }

  // 選択した大会の選手行を、同一人物（pid）ごとに足し合わせる。欠損（null）は足さず、全て null なら null のまま
  function mergePlayers(list) {
    const SUM = ["goals", "shots", "assists", "turnovers", "steals", "blocks", "yellow", "susp_2min", "red"];
    const m = new Map();
    for (const r of list) {
      let a = m.get(r.pid);
      if (!a) {
        a = { pid: r.pid, org: r.org, name: r.name, bibs: [], tours: [], captain: false, is_gk: false, games: 0, pos: {}, gk: null };
        SUM.forEach((k) => (a[k] = null));
        m.set(r.pid, a);
      }
      if (r.name.length > a.name.length) a.name = r.name;
      if (!a.bibs.includes(r.bib)) a.bibs.push(r.bib);
      a.tours.push(r.tournament);
      a.captain = a.captain || r.captain;
      a.is_gk = a.is_gk || r.is_gk;
      a.games += r.games;
      SUM.forEach((k) => { if (r[k] !== null && r[k] !== undefined) a[k] = (a[k] || 0) + r[k]; });
      for (const [k, v] of Object.entries(r.pos || {})) {
        const c = a.pos[k] || (a.pos[k] = [0, 0]);
        c[0] += v[0]; c[1] += v[1];
      }
      if (r.gk) {
        const g = a.gk || (a.gk = { games: 0, saves: 0, faced: 0, pos: {} });
        g.games += r.gk.games; g.saves += r.gk.saves; g.faced += r.gk.faced;
        for (const [k, v] of Object.entries(r.gk.pos || {})) {
          const c = g.pos[k] || (g.pos[k] = [0, 0]);
          c[0] += v[0]; c[1] += v[1];
        }
      }
    }
    return [...m.values()].map((a) => ({ ...a, bibSort: a.bibs[0], bibText: a.bibs.join("/") }));
  }

  // ---------- 選手の推移（行をクリックして 3 大会のグラフ）----------
  const perG = (a, g) => (g ? (a || 0) / g : null);
  const P_METRICS = {
    field: [
      { id: "games", label: "試合数（記録あり）", unit: "試合", d: 0, get: (r) => r.games },
      { id: "g_pg", label: "得点（1試合平均）", unit: "点/試合", d: 1, get: (r) => perG(r.goals, r.games) },
      { id: "s_pg", label: "シュート（1試合平均）", unit: "本/試合", d: 1, get: (r) => perG(r.shots, r.games) },
      { id: "rate", label: "シュート成功率", unit: "%", d: 0, get: (r) => (r.shots ? (100 * (r.goals || 0)) / r.shots : null) },
      { id: "as_pg", label: "アシスト（1試合平均）", unit: "本/試合", d: 1, get: (r) => perG(r.assists, r.games) },
      { id: "to_pg", label: "ターンオーバー（1試合平均）", unit: "回/試合", d: 1, get: (r) => perG(r.turnovers, r.games) },
      { id: "m2_pg", label: "2分間退場（1試合平均）", unit: "回/試合", d: 2, get: (r) => perG(r.susp_2min, r.games) },
      { id: "g_tot", label: "得点（大会合計）", unit: "点", d: 0, get: (r) => r.goals || 0 },
      { id: "s_tot", label: "シュート（大会合計）", unit: "本", d: 0, get: (r) => r.shots || 0 },
    ],
    gk: [
      { id: "games", label: "試合数（GKとして記録あり）", unit: "試合", d: 0, get: (r) => r.gk && r.gk.games },
      { id: "sv_pg", label: "セーブ数（1試合平均）", unit: "本/試合", d: 1, get: (r) => r.gk && perG(r.gk.saves, r.gk.games) },
      { id: "fc_pg", label: "枠内被シュート（1試合平均）", unit: "本/試合", d: 1, get: (r) => r.gk && perG(r.gk.faced, r.gk.games) },
      { id: "rate", label: "セーブ率", unit: "%", d: 1, get: (r) => (r.gk && r.gk.faced ? (100 * r.gk.saves) / r.gk.faced : null) },
      { id: "sv_tot", label: "セーブ数（大会合計）", unit: "本", d: 0, get: (r) => r.gk && r.gk.saves },
      { id: "fc_tot", label: "枠内被シュート（大会合計）", unit: "本", d: 0, get: (r) => r.gk && r.gk.faced },
    ],
  };
  const P_POS = {
    field: [
      { id: "g_pg", label: "得点（1試合平均）", unit: "点/試合", d: 1, get: (k) => (r) => (r.games ? ((r.pos && r.pos[k] ? r.pos[k][0] : 0) / r.games) : null) },
      { id: "s_pg", label: "シュート数（1試合平均）", unit: "本/試合", d: 1, get: (k) => (r) => (r.games ? ((r.pos && r.pos[k] ? r.pos[k][1] : 0) / r.games) : null) },
      { id: "rate", label: "シュート成功率", unit: "%", d: 0, get: (k) => (r) => (r.pos && r.pos[k] && r.pos[k][1] ? (100 * r.pos[k][0]) / r.pos[k][1] : null) },
    ],
    gk: [
      { id: "sv_pg", label: "セーブ数（1試合平均）", unit: "本/試合", d: 1, get: (k) => (r) => (r.gk && r.gk.games ? ((r.gk.pos && r.gk.pos[k] ? r.gk.pos[k][0] : 0) / r.gk.games) : null) },
      { id: "fc_pg", label: "枠内被シュート（1試合平均）", unit: "本/試合", d: 1, get: (k) => (r) => (r.gk && r.gk.games ? ((r.gk.pos && r.gk.pos[k] ? r.gk.pos[k][1] : 0) / r.gk.games) : null) },
      { id: "rate", label: "セーブ率", unit: "%", d: 0, get: (k) => (r) => (r.gk && r.gk.pos && r.gk.pos[k] && r.gk.pos[k][1] ? (100 * r.gk.pos[k][0]) / r.gk.pos[k][1] : null) },
    ],
  };

  function playerTrendPanel(role, names) {
    const sel = state.pSel[role];
    if (!sel.length) {
      return `<div class="ptrend"><div class="count">表の選手の行をクリックすると、その選手の 3 大会の推移グラフがここに出ます（最大 8 人まで重ねて比較できます）。</div></div>`;
    }
    const tours = D.tournaments.map((t) => t.id); // 時系列
    const labels = tours.map(shortTour);
    const byPid = {};
    D.players.forEach((r) => { if (sel.includes(r.pid)) (byPid[r.pid] = byPid[r.pid] || {})[r.tournament] = r; });
    for (const k of Object.keys(state.pSlots)) if (k.startsWith(role) && !sel.includes(k.slice(role.length))) delete state.pSlots[k];
    sel.forEach((id) => {
      if (state.pSlots[role + id] === undefined) {
        const used = new Set(Object.entries(state.pSlots).filter(([k]) => k.startsWith(role)).map(([, v]) => v));
        let i = 0; while (used.has(i)) i++;
        state.pSlots[role + id] = i;
      }
    });
    const nameOf = (id) => names[id] || ((D.players.find((r) => r.pid === id) || {}).name || id);
    const orgOf = (id) => (D.players.find((r) => r.pid === id) || {}).org || "";
    const mk = (getter) => sel.map((id) => ({ label: `${nameOf(id)} (${orgOf(id)})`, slot: state.pSlots[role + id], vals: tours.map((t) => { const r = (byPid[id] || {})[t]; return r ? getter(r) : null; }) }));
    const metrics = P_METRICS[role];
    const posDefs = P_POS[role];
    if (!posDefs.some((m) => m.id === state.pPos)) state.pPos = posDefs[0].id;
    const pm = posDefs.find((m) => m.id === state.pPos);
    const chips = sel.map((id) => `<span class="orgchip" title="${esc(nameOf(id))}（${esc(orgOf(id))}）"><span class="swatch" style="background:var(--s${state.pSlots[role + id] + 1})"></span>${esc(nameOf(id))}<span class="sub">${esc(orgOf(id))}</span><button type="button" class="x" data-prm="${esc(id)}" aria-label="${esc(nameOf(id))} を外す">✕</button></span>`).join("");
    const cards = metrics.map((m) => lineChart(m.label, m.unit, m.d, labels, mk(m.get))).join("");
    const posCards = T_KINDS.map((k) => lineChart(POS_LABEL[k], pm.unit, pm.d, labels, mk(pm.get(k)))).join("");
    return `<div class="ptrend" id="ptrend"><h2>選手の推移（大会ごと・時系列）</h2>
      <div class="controls orgs"><span class="lbl">選手</span>${chips}<button type="button" class="chip all" id="pClear">すべて外す</button></div>
      <div class="grid">${cards}</div>
      <h2>ポジション別</h2>
      <div class="controls"><label>指標 <select id="pPosSel">${posDefs.map((m) => `<option value="${m.id}" ${m.id === pm.id ? "selected" : ""}>${esc(m.label)}</option>`).join("")}</select></label></div>
      <div class="grid">${posCards}</div>
      <ul class="notes"><li>大会ごとの値で、大会内で出場していない選手は「–」（線が切れます）。「試合数」は紙面に記録のある試合で、1 試合平均もその試合数で割っています。</li>
        <li>この推移は、表の大会選択とは関係なく、常に全大会を並べます。同一人物は氏名の前方一致で判定しています。</li></ul></div>`;
  }

  function renderPlayers(host) {
    const multi = selIds().length > 1;
    const base = mergePlayers(D.players.filter((r) => state.tours.includes(r.tournament)));
    const orgs = [...new Set(base.map((r) => r.org))].sort();
    state.pOrgs = state.pOrgs.filter((o) => orgs.includes(o));
    const role = state.role === "gk" ? "gk" : "field";
    let rows = base.filter((r) => !state.pOrgs.length || state.pOrgs.includes(r.org));
    rows = role === "gk" ? rows.filter((r) => r.gk) : rows.filter((r) => !r.is_gk || (r.shots || 0) > 0).filter((r) => r.games > 0);
    if (role === "field" && state.minShots > 0) rows = rows.filter((r) => (r.shots || 0) >= state.minShots);
    const q = state.q.trim().toLowerCase();
    if (q) rows = rows.filter((r) => r.name.toLowerCase().includes(q));
    const names = {}; D.players.forEach((r) => { if (!names[r.pid] || r.name.length > names[r.pid].length) names[r.pid] = r.name; });

    const orgChips = state.pOrgs.map((o) => `<span class="orgchip"><span class="swatch" style="background:var(--text-3)"></span>${esc(o)}<button type="button" class="x" data-orm="${o}" aria-label="${o} を外す">✕</button></span>`).join("");
    const addable = orgs.filter((o) => !state.pOrgs.includes(o));
    host.innerHTML = `<div class="controls">
        <div class="tabs" role="tablist">${[["field", "CP"], ["gk", "GK"]].map(([k, l]) => `<button role="tab" type="button" data-role="${k}" aria-selected="${role === k}" ${k === "field" ? 'title="コートプレーヤー（GK 以外）"' : ""}>${l}</button>`).join("")}</div>
        ${role === "field" ? `<label>最小シュート数 <input type="number" id="minShots" min="0" step="1" value="${state.minShots}"></label>` : ""}
        <label>名前 <input type="search" id="q" value="${esc(state.q)}" placeholder="例: KOBAYASHI"></label>
      </div>
      <div class="controls orgs"><span class="lbl">チーム</span>${orgChips || '<span class="count">すべてのチーム</span>'}
        ${addable.length ? `<select id="orgAdd" aria-label="チームを追加"><option value="">＋ チームを選ぶ…</option>${addable.map((o) => `<option>${o}</option>`).join("")}</select>` : ""}
        ${state.pOrgs.length ? '<button type="button" class="chip all" id="orgClear">すべてのチーム</button>' : ""}</div>
      ${playerTrendPanel(role, names)}
      <div id="tbl"></div><div class="count">${rows.length} 人・行をクリックすると上の推移グラフに追加（${state.pSel[role].length} / 8 人）</div>
      <ul class="notes">
        <li>CP = コートプレーヤー（GK 以外）。数値は選択した大会の合計（1 試合平均ではありません）。複数の大会を選ぶと積算します。「試合」は紙面に記録のある試合数で、出場しても何も記録が無い試合は数えません。</li>
        <li>シュートは全試投（枠外・ブロック含む）、GK の分母は枠内のみ。GK の個人行は、公式帳票の分母が壊れた試合を除いています。</li>
        <li>STL（スティール）・BLK（ブロック）は AG のみ。選手権の紙面にはありません。複数大会の積算では AG の分だけです。</li>
        <li>氏名は紙面で切り捨てられることがあるので、複数大会に出た選手は長いほうの表記に揃えています。大会をまたぐ同一人物の判定は氏名の前方一致で、背番号は大会ごとに変わります。</li></ul>`;
    host.querySelectorAll("[data-role]").forEach((b) => b.addEventListener("click", () => { state.role = b.dataset.role; update(); }));
    host.querySelectorAll("[data-orm]").forEach((b) => b.addEventListener("click", () => { state.pOrgs = state.pOrgs.filter((o) => o !== b.dataset.orm); update(); }));
    const oa = host.querySelector("#orgAdd");
    if (oa) oa.addEventListener("change", () => { if (oa.value) { state.pOrgs = [...state.pOrgs, oa.value]; update(); } });
    const oc = host.querySelector("#orgClear");
    if (oc) oc.addEventListener("click", () => { state.pOrgs = []; update(); });
    const ms = host.querySelector("#minShots");
    if (ms) ms.addEventListener("change", () => { state.minShots = Math.max(0, Number(ms.value) || 0); update(); });
    const qi = host.querySelector("#q");
    qi.addEventListener("input", () => { state.q = qi.value; update(true); });
    host.querySelectorAll("[data-prm]").forEach((b) => b.addEventListener("click", () => { state.pSel[role] = state.pSel[role].filter((x) => x !== b.dataset.prm); update(); }));
    const pc = host.querySelector("#pClear");
    if (pc) pc.addEventListener("click", () => { state.pSel[role] = []; update(); });
    const pp = host.querySelector("#pPosSel");
    if (pp) pp.addEventListener("change", () => { state.pPos = pp.value; update(); });
    renderTable(host.querySelector("#tbl"), "p-" + role + multi, role === "gk" ? gkCols(multi) : fieldCols(multi), rows,
      role === "gk" ? { key: "sv", dir: "desc" } : { key: "goals", dir: "desc" },
      {
        isSel: (r) => state.pSel[role].includes(r.pid),
        onPick: (r) => {
          const cur = state.pSel[role], had = cur.length;
          if (cur.includes(r.pid)) state.pSel[role] = cur.filter((x) => x !== r.pid);
          else if (cur.length < 8) state.pSel[role] = [...cur, r.pid];
          update();
          if (!had && state.pSel[role].length) { const t = document.getElementById("ptrend"); if (t) t.scrollIntoView({ block: "start", behavior: "smooth" }); }
        },
      });
  }


  // ---------- 推移（国ごとの大会別グラフ）----------
  const shortTour = (id) => tourLabel(id).replace("アジア選手権 ", "選手権 ").replace("アジア競技大会 ", "AG ");
  const T_KINDS = ["6m", "wing", "9m", "fb", "bt", "7m"]; // free は選手権のみ、eg は AG のみなので推移では扱わない
  const pgv = (k) => (r) => r.per_game[k];
  const rtv = (k) => (r) => r.rate[k];
  const T_METRICS = {
    attack: [
      { id: "attacks", label: "攻撃回数", unit: "回/試合", d: 1, get: pgv("attacks") },
      { id: "goals", label: "得点", unit: "点/試合", d: 1, get: pgv("goals") },
      { id: "atk", label: "攻撃回数あたり得点の割合", unit: "%", d: 1, get: rtv("attack_success") },
      { id: "to", label: "ミス数", unit: "回/試合", d: 1, get: pgv("turnovers") },
      { id: "to_rate", label: "攻撃回数あたりミスの割合", unit: "%", d: 1, get: rtv("turnover_rate") },
      { id: "p50g", label: "50回攻撃あたり得点", unit: "点", d: 1, get: rtv("per50_goals") },
      { id: "p50t", label: "50回攻撃あたりミス数", unit: "回", d: 1, get: rtv("per50_turnovers") },
      { id: "shot", label: "シュート成功率", unit: "%", d: 1, get: rtv("shot_success") },
    ],
    defense: [
      { id: "def_att", label: "守備回数", unit: "回/試合", d: 1, get: pgv("def_attacks") },
      { id: "conc", label: "失点", unit: "点/試合", d: 1, get: pgv("conceded") },
      { id: "conc_pct", label: "守備回数あたり失点の割合", unit: "%", d: 1, get: rtv("conceded_pct") },
      { id: "forced", label: "相手のミス数（奪取）", unit: "回/試合", d: 1, get: pgv("opp_turnovers") },
      { id: "forced_rate", label: "守備回数あたり相手ミスの割合", unit: "%", d: 1, get: rtv("forced_turnover_rate") },
      { id: "p50c", label: "50回守備あたり失点", unit: "点", d: 1, get: rtv("per50_conceded") },
      { id: "p50f", label: "50回守備あたり相手ミス数", unit: "回", d: 1, get: rtv("per50_forced") },
      { id: "faced", label: "被シュート成功率", unit: "%", d: 1, get: rtv("faced_success") },
      { id: "def_rate", label: "防御率（= 100 − 被シュート成功率）", unit: "%", d: 1, get: rtv("defense_rate") },
    ],
    gk: [
      { id: "sv", label: "GKセーブ数", unit: "本/試合", d: 1, get: pgv("gk_saves") },
      { id: "fc", label: "GK枠内被シュート", unit: "本/試合", d: 1, get: pgv("gk_faced") },
      { id: "sv_rate", label: "GKセーブ率", unit: "%", d: 1, get: rtv("gk_save_rate") },
    ],
  };
  const T_POS = {
    attack: [
      { id: "goals", label: "得点（1試合平均）", unit: "点/試合", d: 1, get: (k) => pgv(`goals_${k}`) },
      { id: "shots", label: "シュート数（1試合平均）", unit: "本/試合", d: 1, get: (k) => pgv(`shots_${k}`) },
      { id: "goal_pct", label: "攻撃回数あたり得点の割合", unit: "%", d: 1, get: (k) => rtv(`goal_pct_${k}`) },
      { id: "p50", label: "50回攻撃あたり得点", unit: "点", d: 1, get: (k) => rtv(`per50_goals_${k}`) },
      { id: "shot", label: "シュート成功率", unit: "%", d: 0, get: (k) => rtv(`shot_success_${k}`) },
    ],
    defense: [
      { id: "conc", label: "失点（1試合平均）", unit: "点/試合", d: 1, get: (k) => pgv(`conceded_${k}`) },
      { id: "faced_n", label: "被シュート数（1試合平均）", unit: "本/試合", d: 1, get: (k) => pgv(`faced_${k}`) },
      { id: "conc_pct", label: "守備回数あたり失点の割合", unit: "%", d: 1, get: (k) => rtv(`conceded_pct_${k}`) },
      { id: "p50", label: "50回守備あたり失点", unit: "点", d: 1, get: (k) => rtv(`per50_conceded_${k}`) },
      { id: "faced", label: "被シュート成功率", unit: "%", d: 0, get: (k) => rtv(`faced_success_${k}`) },
      { id: "def_rate", label: "防御率", unit: "%", d: 0, get: (k) => rtv(`defense_rate_${k}`) },
    ],
    gk: [
      { id: "sv", label: "セーブ数（1試合平均）", unit: "本/試合", d: 1, get: (k) => pgv(`saves_${k}`) },
      { id: "fc", label: "枠内被シュート（1試合平均）", unit: "本/試合", d: 1, get: (k) => pgv(`gkfaced_${k}`) },
      { id: "rate", label: "セーブ率", unit: "%", d: 0, get: (k) => rtv(`gk_save_rate_${k}`) },
    ],
  };

  // 折れ線のカード。系列は 1〜8 か国。
  //   1 か国: 全点に値を直接書く。
  //   2 か国以上: 値は y 軸の目盛りとホバー（<title>）、表示切替の表で読む。国ごとの色は固定（凡例は上の選択ボタン）。
  function lineChart(title, unit, d, labels, series) {
    const multi = series.length > 1;
    const W = 260, H = multi ? 150 : 124, pl = multi ? 36 : 34, pr = multi ? 26 : 34, pt = multi ? 14 : 26, pb = 30;
    const vals = series.flatMap((s) => s.vals).filter(isNum);
    const lo = vals.length ? Math.min(...vals) : 0, hi = vals.length ? Math.max(...vals) : 1;
    const span = hi - lo || Math.max(Math.abs(hi), 1) * 0.2;
    const ylo = lo - span * (multi ? 0.08 : 0.25), yhi = hi + span * (multi ? 0.08 : 0.25);
    const n = labels.length;
    const x = (i) => pl + (n === 1 ? (W - pl - pr) / 2 : (i * (W - pl - pr)) / (n - 1));
    const y = (v) => pt + (H - pt - pb) * (1 - (v - ylo) / (yhi - ylo));
    const fmtv = (v) => v.toFixed(d);

    let grid = "";
    if (multi) { // 目盛り 3 本（最小・中央・最大）
      // 表示が同じ値になる目盛り（整数の指標の中央値など）は省く
      const seen = new Set();
      grid = [lo, hi, (lo + hi) / 2].filter((v) => { const t = fmtv(v); if (seen.has(t)) return false; seen.add(t); return true; })
        .map((v) => `<line x1="${pl - 6}" x2="${W - pr}" y1="${y(v)}" y2="${y(v)}" class="gl faint"/><text x="${pl - 9}" y="${y(v) + 3.5}" text-anchor="end" class="ax">${fmtv(v)}</text>`).join("");
    }
    const xl = labels.map((l, i) => `<text x="${x(i)}" y="${H - 8}" text-anchor="middle" class="ax">${esc(l)}</text>`).join("");
    const base = `<line x1="${pl - 6}" x2="${W - pr + 6}" y1="${H - pb + 6}" y2="${H - pb + 6}" class="gl"/>`;

    const lines = series.map((s) => {
      let path = "", pen = false;
      s.vals.forEach((v, i) => {
        if (!isNum(v)) { pen = false; return; }
        path += `${pen ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)} `;
        pen = true;
      });
      return `<path d="${path}" class="ln" style="stroke:var(--s${s.slot + 1})"/>`;
    }).join("");

    const dots = series.map((s) => s.vals.map((v, i) => {
      if (!isNum(v)) {
        return multi ? "" : `<text x="${x(i)}" y="${(pt + H - pb) / 2}" text-anchor="middle" class="ax">–</text>`;
      }
      const tip = `${labels[i]}  ${s.label}: ${fmtv(v)} ${unit}`;
      return `<g><title>${esc(tip)}</title>
        <circle cx="${x(i)}" cy="${y(v)}" r="13" fill="transparent"/>
        <circle cx="${x(i)}" cy="${y(v)}" r="${multi ? 4 : 4.5}" class="pt" style="fill:var(--s${s.slot + 1})"/>
        ${multi ? "" : `<text x="${x(i)}" y="${y(v) - 10}" text-anchor="middle" class="vl">${fmtv(v)}</text>`}</g>`;
    }).join("")).join("");

    const aria = series.map((s) => `${s.label}: ${s.vals.map((v, i) => `${labels[i]} ${isNum(v) ? fmtv(v) : "なし"}`).join("、")}`).join(" / ");
    return `<figure class="card"><figcaption>${esc(title)}<span class="u">${esc(unit)}</span></figcaption>
      <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(title)}。${esc(aria)}">${grid}${base}${lines}${dots}${xl}</svg></figure>`;
  }

  // 表。国が複数なら 1 指標につき国ごとに 1 行
  function trendTable(rowsDef, tours, orgs, rowOf) {
    const head = tours.map((t) => `<th scope="col">${esc(shortTour(t))}</th>`).join("");
    const body = rowsDef.map((m) => orgs.map((o, i) => `<tr><td class="l">${i === 0 ? `${esc(m.label)} <span class="sub">${esc(m.unit)}</span>` : ""}</td>${orgs.length > 1 ? `<td class="l org"><span class="swatch" style="background:var(--s${state.tSlots[o] + 1})"></span>${esc(o)}</td>` : ""}${tours.map((t) => {
      const r = rowOf(o, t);
      const v = r ? m.get(r) : null;
      return `<td>${isNum(v) ? v.toFixed(m.d) : "–"}</td>`;
    }).join("")}</tr>`).join("")).join("");
    return `<div class="scroll"><table><thead><tr><th class="l">指標</th>${orgs.length > 1 ? '<th class="l">国</th>' : ""}${head}</tr></thead><tbody>${body}</tbody></table></div>`;
  }

  function renderTrend(host) {
    const tours = D.tournaments.map((t) => t.id); // 時系列（export で並べてある）
    const orgs = [...new Set(D.teams.filter((r) => !r.tournament.includes("+")).map((r) => r.org))].sort();
    state.tOrgs = state.tOrgs.filter((o) => orgs.includes(o));
    if (!state.tOrgs.length) state.tOrgs = [orgs.includes("JPN") ? "JPN" : orgs[0]];
    // 色は国に固定。外しても残りの色は変えず、足すときは空いている最小の枠を使う
    for (const o of Object.keys(state.tSlots)) if (!state.tOrgs.includes(o)) delete state.tSlots[o];
    for (const o of state.tOrgs) {
      if (state.tSlots[o] === undefined) {
        const used = new Set(Object.values(state.tSlots));
        let i = 0; while (used.has(i)) i++;
        state.tSlots[o] = i;
      }
    }
    const sel = state.tOrgs;
    const side = ["attack", "defense", "gk"].includes(state.tSide) ? state.tSide : "attack";
    state.tSide = side;

    const rows = {};
    D.teams.filter((r) => !r.tournament.includes("+")).forEach((r) => ((rows[r.org] = rows[r.org] || {})[r.tournament] = r));
    const rowOf = (o, t) => (rows[o] || {})[t];
    const played = (o) => tours.filter((t) => rowOf(o, t)).length;

    const posDefs = T_POS[side];
    if (!posDefs.some((m) => m.id === state.tPos)) state.tPos = posDefs[0].id;
    const pm = posDefs.find((m) => m.id === state.tPos);

    const labels = tours.map(shortTour);
    const mkSeries = (getter) => sel.map((o) => ({ org: o, label: o, slot: state.tSlots[o], vals: tours.map((t) => (rowOf(o, t) ? getter(rowOf(o, t)) : null)) }));
    const card = (m) => lineChart(m.label, m.unit, m.d, labels, mkSeries(m.get));
    const posCard = (k) => lineChart(POS_LABEL[k], pm.unit, pm.d, labels, mkSeries(pm.get(k)));
    const posRowsForTable = T_KINDS.map((k) => ({ label: POS_LABEL[k], unit: pm.unit, d: pm.d, get: pm.get(k) }));

    const chips = sel.map((o) => `<span class="orgchip" title="${esc(o)}（${played(o)} / ${tours.length} 大会に出場）"><span class="swatch" style="background:var(--s${state.tSlots[o] + 1})"></span>${esc(o)}<span class="sub">${played(o)}/${tours.length}</span>${sel.length > 1 ? `<button type="button" class="x" data-rm="${o}" aria-label="${o} を外す">✕</button>` : ""}</span>`).join("");
    const addable = orgs.filter((o) => !sel.includes(o));

    host.innerHTML = `<div class="controls">
        <div class="tabs" role="tablist">${[["attack", "攻撃"], ["defense", "守備"], ["gk", "GK"]].map(([k, l]) => `<button role="tab" type="button" data-side="${k}" aria-selected="${side === k}">${l}</button>`).join("")}</div>
        <label class="chk"><input type="checkbox" id="tTable" ${state.tTable ? "checked" : ""}> 表で見る</label>
      </div>
      <div class="controls orgs">
        <span class="lbl">国</span>${chips}
        ${sel.length < 8 ? `<select id="tAdd" aria-label="国を追加"><option value="">＋ 追加…</option>${addable.map((o) => `<option>${o}</option>`).join("")}</select>` : `<span class="count">最大 8 か国</span>`}
      </div>
      <h2>全体</h2>
      ${state.tTable ? trendTable(T_METRICS[side], tours, sel, rowOf) : `<div class="grid">${T_METRICS[side].map(card).join("")}</div>`}
      <h2>ポジション別</h2>
      <div class="controls"><label>指標 <select id="tPos">${posDefs.map((m) => `<option value="${m.id}" ${m.id === pm.id ? "selected" : ""}>${esc(m.label)}</option>`).join("")}</select></label></div>
      ${state.tTable ? trendTable(posRowsForTable, tours, sel, rowOf) : `<div class="grid">${T_KINDS.map(posCard).join("")}</div>`}
      <ul class="notes">
        <li>各国の大会ごとの値（時系列）。国は最大 8 か国まで重ねて比べられます。国ごとの色は固定で、点にカーソルを重ねると値が出ます（表で見るで一覧にもできます）。</li>
        <li>大会ごとに対戦相手が違うので、増減は相手の強さの違いも含みます。</li>
        <li>攻撃回数 = シュート + ターンオーバー（TO + TF）、守備回数は相手の攻撃回数。ミス数 = ターンオーバー。率は大会内の合計どうしの比。</li>
        <li>ポジションは紙面の区分で、選手個人のポジションではありません。ミス（ターンオーバー）にはポジションの区分がないので、ポジション別には出ません。フリースロー（選手権のみ）と無人ゴール（AG のみ）は大会間で比べられないので省いています。</li>
        <li>線が切れている・「–」は、その大会に出場していない、または値が取れていないことを表します。</li></ul>`;
    host.querySelectorAll("[data-side]").forEach((b) => b.addEventListener("click", () => { state.tSide = b.dataset.side; update(); }));
    host.querySelectorAll("[data-rm]").forEach((b) => b.addEventListener("click", () => { state.tOrgs = state.tOrgs.filter((o) => o !== b.dataset.rm); update(); }));
    const add = host.querySelector("#tAdd");
    if (add) add.addEventListener("change", () => { if (add.value) { state.tOrgs = [...state.tOrgs, add.value]; update(); } });
    host.querySelector("#tPos").addEventListener("change", (e) => { state.tPos = e.target.value; update(); });
    host.querySelector("#tTable").addEventListener("change", (e) => { state.tTable = e.target.checked; update(); });
  }



  // ---------- クラスター分析（k-means）----------
  // 2 軸（攻撃回数あたり得点、守備回数あたり失点）を標準化して、ユークリッド距離で分ける。
  // 結果が毎回同じになるよう、初期中心は「最遠点法」で、最初の点を全部試して誤差平方和が最小のものを採る。
  const d2 = (a, b) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2;
  function kmeans(pts, k) {
    const n = pts.length;
    let best = null;
    for (let s0 = 0; s0 < n; s0++) {
      const cent = [pts[s0]];
      while (cent.length < k) {
        let bi = 0, bd = -1;
        pts.forEach((p, i) => { const d = Math.min(...cent.map((c) => d2(p, c))); if (d > bd) { bd = d; bi = i; } });
        cent.push(pts[bi]);
      }
      const asg = new Array(n).fill(-1);
      for (let it = 0; it < 100; it++) {
        let changed = false;
        pts.forEach((p, i) => {
          let bj = 0, bd = Infinity;
          cent.forEach((c, j) => { const d = d2(p, c); if (d < bd) { bd = d; bj = j; } });
          if (asg[i] !== bj) { asg[i] = bj; changed = true; }
        });
        for (let j = 0; j < k; j++) {
          const m = pts.filter((_, i) => asg[i] === j);
          if (m.length) cent[j] = [m.reduce((a, p) => a + p[0], 0) / m.length, m.reduce((a, p) => a + p[1], 0) / m.length];
        }
        if (!changed) break;
      }
      const sse = pts.reduce((a, p, i) => a + d2(p, cent[asg[i]]), 0);
      if (!best || sse < best.sse - 1e-12) best = { asg: asg.slice(), cent: cent.map((c) => c.slice()), sse };
    }
    return best;
  }
  function silhouette(pts, asg, k) {
    const n = pts.length;
    let tot = 0;
    for (let i = 0; i < n; i++) {
      const own = [], other = Array.from({ length: k }, () => []);
      for (let j = 0; j < n; j++) {
        if (j === i) continue;
        const d = Math.sqrt(d2(pts[i], pts[j]));
        (asg[j] === asg[i] ? own : other[asg[j]]).push(d);
      }
      if (!own.length) continue; // 1 点だけのクラスターは 0
      const a = own.reduce((x, y) => x + y, 0) / own.length;
      const b = Math.min(...other.filter((o) => o.length).map((o) => o.reduce((x, y) => x + y, 0) / o.length));
      tot += (b - a) / Math.max(a, b);
    }
    return tot / n;
  }
  // points: [{x, y}]。戻り値: クラスター番号（0 始まり。攻撃 − 失点 の平均が大きい順）、中心（元の単位）、シルエット係数
  function clusterPoints(points, k) {
    const mean = (f) => points.reduce((a, p) => a + f(p), 0) / points.length;
    const mx = mean((p) => p.x), my = mean((p) => p.y);
    const sx = Math.sqrt(mean((p) => (p.x - mx) ** 2)) || 1, sy = Math.sqrt(mean((p) => (p.y - my) ** 2)) || 1;
    const z = points.map((p) => [(p.x - mx) / sx, (p.y - my) / sy]);
    const r = kmeans(z, k);
    const raw = Array.from({ length: k }, (_, j) => {
      const m = points.filter((_, i) => r.asg[i] === j);
      return { n: m.length, x: m.reduce((a, p) => a + p.x, 0) / (m.length || 1), y: m.reduce((a, p) => a + p.y, 0) / (m.length || 1) };
    });
    const order = raw.map((c, j) => j).sort((a, b) => (raw[b].x - raw[b].y) - (raw[a].x - raw[a].y));
    const rank = {}; order.forEach((j, i) => (rank[j] = i));
    return {
      asg: r.asg.map((j) => rank[j]),
      centers: order.map((j) => raw[j]),
      sil: silhouette(z, r.asg, k),
    };
  }
  const tourTag = (id) => { const l = tourLabel(id); return (l.startsWith("アジア競技大会") ? "AG" : "選") + l.slice(-2); };

  // ---------- 散布図（攻守の位置づけ）----------
  // 横軸 = 攻撃回数あたり得点の割合（右ほど攻撃が良い）、縦軸 = 守備回数あたり失点の割合（下ほど守備が良い）
  function niceTicks(lo, hi) {
    const span = hi - lo;
    const step = span > 40 ? 10 : span > 18 ? 5 : span > 8 ? 2 : 1;
    const a = Math.floor(lo / step) * step, b = Math.ceil(hi / step) * step;
    const ticks = [];
    for (let v = a; v <= b + 1e-9; v += step) ticks.push(v);
    return { lo: a, hi: b, ticks };
  }

  function scatterSvg(points, centers) {
    const W = 680, H = 510, ml = 56, mr = 64, mt = 34, mb = 52;
    const xs = points.map((p) => p.x), ys = points.map((p) => p.y);
    const X = niceTicks(Math.min(...xs) - 1.5, Math.max(...xs) + 1.5);
    const Y = niceTicks(Math.min(...ys) - 1.5, Math.max(...ys) + 1.5);
    const px = (v) => ml + ((v - X.lo) / (X.hi - X.lo)) * (W - ml - mr);
    const py = (v) => mt + (1 - (v - Y.lo) / (Y.hi - Y.lo)) * (H - mt - mb); // 値が大きいほど上
    const mx = xs.reduce((a, b) => a + b, 0) / xs.length, my = ys.reduce((a, b) => a + b, 0) / ys.length;

    const grid = X.ticks.map((v) => `<line x1="${px(v)}" x2="${px(v)}" y1="${mt}" y2="${H - mb}" class="gl faint"/><text x="${px(v)}" y="${H - mb + 16}" text-anchor="middle" class="ax">${v}%</text>`).join("")
      + Y.ticks.map((v) => `<line x1="${ml}" x2="${W - mr}" y1="${py(v)}" y2="${py(v)}" class="gl faint"/><text x="${ml - 8}" y="${py(v) + 3.5}" text-anchor="end" class="ax">${v}%</text>`).join("");
    const frame = `<rect x="${ml}" y="${mt}" width="${W - ml - mr}" height="${H - mt - mb}" class="frame"/>`;
    const means = `<line x1="${px(mx)}" x2="${px(mx)}" y1="${mt}" y2="${H - mb}" class="mean"/><line x1="${ml}" x2="${W - mr}" y1="${py(my)}" y2="${py(my)}" class="mean"/>
      <text x="${px(mx)}" y="${mt - 8}" text-anchor="middle" class="ax">平均 ${mx.toFixed(1)}%</text><text x="${W - mr + 6}" y="${py(my) + 4}" class="ax">平均 ${my.toFixed(1)}%</text>`;
    const quad = `<text x="${ml + 8}" y="${mt + 24}" class="quad">攻撃 弱 / 守備 弱</text><text x="${W - mr - 8}" y="${mt + 24}" text-anchor="end" class="quad">攻撃 強 / 守備 弱</text>
      <text x="${ml + 8}" y="${H - mb - 10}" class="quad">攻撃 弱 / 守備 強</text><text x="${W - mr - 8}" y="${H - mb - 10}" text-anchor="end" class="quad">攻撃 強 / 守備 強</text>`;
    const axes = `<text x="${(ml + W - mr) / 2}" y="${H - 8}" text-anchor="middle" class="axt">攻撃回数あたり得点の割合（攻撃成功率）→ 右ほど攻撃が良い</text>
      <text transform="translate(14 ${(mt + H - mb) / 2}) rotate(-90)" text-anchor="middle" class="axt">守備回数あたり失点の割合 → 上ほど失点が多い（下ほど守備が良い）</text>`;

    // ラベルの置き場所: 右・左・上・下の順で、既に置いたラベルや他の点と重ならない最初の位置
    const placed = [];
    const overlap = (a, b) => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;
    const dots = [...points].sort((a, b) => a.y - b.y).map((p) => {
      const label = p.tag ? `${p.org} ${p.tag}` : p.org;
      const cx = px(p.x), cy = py(p.y), w = label.length * 7 + 2, h = 12;
      const cands = [
        { dx: 9, dy: 4, anchor: "start", box: { x0: cx + 8, y0: cy - 8, x1: cx + 8 + w, y1: cy + 4 } },
        { dx: -9, dy: 4, anchor: "end", box: { x0: cx - 8 - w, y0: cy - 8, x1: cx - 8, y1: cy + 4 } },
        { dx: 0, dy: -10, anchor: "middle", box: { x0: cx - w / 2, y0: cy - 10 - h, x1: cx + w / 2, y1: cy - 10 } },
        { dx: 0, dy: 19, anchor: "middle", box: { x0: cx - w / 2, y0: cy + 8, x1: cx + w / 2, y1: cy + 8 + h } },
      ];
      const hitsPoint = (b) => points.some((q) => { const qx = px(q.x), qy = py(q.y); return b.x0 < qx + 6 && qx - 6 < b.x1 && b.y0 < qy + 6 && qy - 6 < b.y1; });
      const c = cands.find((c) => !placed.some((b) => overlap(b, c.box)) && !hitsPoint(c.box)) || cands[0];
      placed.push(c.box);
      const color = `var(--s${p.slot + 1})`;
      const tip = `${p.org}${p.tid ? `（${shortTour(p.tid)}）` : ""}${p.cluster !== undefined ? `  クラスター ${p.cluster + 1}` : ""}  攻撃回数あたり得点 ${p.x.toFixed(1)}% / 守備回数あたり失点 ${p.y.toFixed(1)}% / ${p.games} 試合`;
      return `<g><title>${esc(tip)}</title><circle cx="${cx}" cy="${cy}" r="14" fill="transparent"/>
        <circle cx="${cx}" cy="${cy}" r="6" class="pt" style="fill:${color}"/>
        <text x="${cx + c.dx}" y="${cy + c.dy}" text-anchor="${c.anchor}" class="vl">${esc(label)}</text></g>`;
    }).join("");
    const aria = points.map((p) => `${p.org} 攻撃 ${p.x.toFixed(1)}% 失点 ${p.y.toFixed(1)}%`).join("、");
    const cmarks = (centers || []).map((c, j) => {
      const cx = px(c.x), cy = py(c.y), col = `var(--s${j + 1})`;
      return `<g><title>${esc(`クラスター ${j + 1} の中心（${c.n} 点）  攻撃 ${c.x.toFixed(1)}% / 失点 ${c.y.toFixed(1)}%`)}</title>
        <path d="M${cx},${cy - 9} L${cx + 9},${cy} L${cx},${cy + 9} L${cx - 9},${cy} Z" fill="none" stroke="${col}" stroke-width="3"/>
        <path d="M${cx},${cy - 9} L${cx + 9},${cy} L${cx},${cy + 9} L${cx - 9},${cy} Z" fill="none" stroke="var(--surface)" stroke-width="1" opacity=".9"/></g>`;
    }).join("");
    return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="攻撃回数あたり得点の割合と守備回数あたり失点の割合の散布図。${esc(aria)}">${grid}${frame}${means}${quad}${axes}${cmarks}${dots}</svg>`;
  }

  function renderScatter(host) {
    const ids = selIds();
    const split = state.sSplit && ids.length > 1;
    let points = [];
    if (split) {
      ids.forEach((tid, i) => D.teams.filter((r) => r.tournament === tid).forEach((r) => points.push({ r, tid, slot: i })));
    } else {
      D.teams.filter((r) => r.tournament === selKey()).forEach((r) => points.push({ r, tid: null, slot: 0 }));
    }
    points = points
      .map((p) => ({ org: p.r.org, tid: p.tid, slot: p.slot, games: p.r.games, x: p.r.rate.attack_success, y: p.r.rate.conceded_pct }))
      .filter((p) => isNum(p.x) && isNum(p.y));

    // クラスター分析
    const K = state.sK;
    const canCluster = points.length >= 6;
    let cl = null, sils = {};
    if (K && canCluster && K <= points.length) {
      cl = clusterPoints(points, K);
      points.forEach((p, i) => { p.cluster = cl.asg[i]; p.slot = cl.asg[i]; if (split) p.tag = tourTag(p.tid); });
      [3, 4, 5].filter((k) => k <= points.length).forEach((k) => { sils[k] = k === K ? cl.sil : clusterPoints(points, k).sil; });
    } else if (canCluster) {
      [3, 4, 5].forEach((k) => { sils[k] = clusterPoints(points, k).sil; });
    }

    const kBtns = `<div class="tabs" role="tablist" aria-label="クラスター数">${[[0, "なし"], [3, "3"], [4, "4"], [5, "5"]].map(([k, l]) => `<button role="tab" type="button" data-k="${k}" aria-selected="${state.sK === k}" ${k && !canCluster ? "disabled" : ""}>${l}</button>`).join("")}</div>`;
    const silTxt = Object.keys(sils).length ? `<span class="count" title="1 に近いほど、同じクラスター内がまとまり、他のクラスターと離れている">参考: シルエット係数 ${Object.entries(sils).map(([k, v]) => `k=${k}: ${v.toFixed(2)}`).join(" / ")}（大きいほど分けやすい）</span>` : "";

    const legend = cl ? `<div class="controls orgs"><span class="lbl">クラスター</span>${cl.centers.map((c, j) => `<span class="orgchip" title="${esc(points.filter((p) => p.cluster === j).map((p) => p.org + (p.tag ? " " + p.tag : "")).join("、"))}"><span class="swatch" style="background:var(--s${j + 1})"></span>${j + 1}<span class="sub">${c.n} 点・攻 ${c.x.toFixed(1)}% / 失 ${c.y.toFixed(1)}%</span></span>`).join("")}</div>` : split ? `<div class="controls orgs"><span class="lbl">凡例</span>${ids.map((tid, i) => `<span class="orgchip"><span class="swatch" style="background:var(--s${i + 1})"></span>${esc(tourLabel(tid))}</span>`).join("")}</div>` : "";
    host.innerHTML = `<div class="controls">
        <label class="chk"><input type="checkbox" id="sSplit" ${state.sSplit ? "checked" : ""} ${ids.length < 2 ? "disabled" : ""}> 大会ごとに点を分ける（2 大会以上を選んだとき）</label>
        <span class="count">${points.length} 点</span></div>
      <div class="controls"><span class="lbl">クラスター数</span>${kBtns}${silTxt}</div>${legend}
      ${points.length ? `<div class="scatter">${scatterSvg(points, cl && cl.centers)}</div>` : '<div class="empty">該当なし</div>'}
      ${cl ? `<div class="members">${cl.centers.map((c, j) => `<div><span class="swatch" style="background:var(--s${j + 1})"></span><b>${j + 1}</b>　${esc(points.filter((p) => p.cluster === j).sort((a, b) => (b.x - b.y) - (a.x - a.y)).map((p) => p.org + (p.tag ? " " + p.tag : "")).join("、"))}</div>`).join("")}</div>` : ""}
      <div id="tbl"></div>
      <ul class="notes">
        ${cl ? `<li>クラスター分析は k-means（${K} 群）。横軸・縦軸を標準化（平均 0・標準偏差 1）して距離を測り、初期値は決め打ちなので毎回同じ結果になります。番号は「攻撃 − 失点」の平均が大きい順で、1 が最も攻守の差が大きい群です。◇ は各群の中心。${split ? "大会を分けた表示では、同じ国でも大会ごとに別の点として分けます（選 = アジア選手権、AG = アジア競技大会、数字は開催年の下 2 桁）。" : ""}</li>` : ""}
        <li>横軸は攻撃回数あたり得点の割合（得点 ÷ 攻撃回数）、縦軸は守備回数あたり失点の割合（失点 ÷ 守備回数）。<b>右下</b>ほど攻守ともに良いチームです。点線は表示中のチームの平均で、四隅の文字はその平均を境にした 4 つの区画です。</li>
        <li>攻撃回数 = シュート + ターンオーバー（TO + TF）、守備回数は相手の攻撃回数。複数の大会を選ぶと、試合を全部まとめた合計で計算します。</li>
        <li>大会ごとに対戦相手が違うので、チームの位置は相手の強さの違いも含みます。点にカーソルを重ねると値が出ます。</li></ul>`;
    host.querySelectorAll("[data-k]").forEach((b) => b.addEventListener("click", () => { state.sK = Number(b.dataset.k); update(); }));
    const cb = host.querySelector("#sSplit");
    cb.addEventListener("change", () => { state.sSplit = cb.checked; update(); });
    if (points.length) {
      const cols = [
        ...(split ? [{ key: "tid", label: "大会", l: true, get: (r) => r.tid, html: (r) => esc(shortTour(r.tid)) }] : []),
        { key: "org", label: "国", l: true, cls: "org", get: (r) => r.org },
        { key: "games", label: "試合", d: 0, get: (r) => r.games },
        { key: "x", label: "攻撃回数あたり得点", get: (r) => r.x, html: (r) => pct(r.x) },
        { key: "y", label: "守備回数あたり失点", get: (r) => r.y, html: (r) => pct(r.y) },
        ...(cl ? [{ key: "cl", label: "クラスター", get: (r) => r.cluster + 1, d: 0, html: (r) => `<span class="swatch" style="background:var(--s${r.cluster + 1})"></span>${r.cluster + 1}` }] : []),
        { key: "d", label: "差（攻撃 − 失点）", title: "攻撃回数あたり得点 − 守備回数あたり失点。大きいほど攻守のバランスが良い", get: (r) => r.x - r.y, html: (r) => ((r.x - r.y) >= 0 ? "+" : "") + (r.x - r.y).toFixed(1) },
      ];
      renderTable(host.querySelector("#tbl"), "scatter" + split + K, cols, points, { key: "d", dir: "desc" });
    }
  }


  // ---------- 因子分析 ----------
  // 観測 = 「大会 × チーム」の 1 行。変数は攻撃・守備それぞれの指標（ポジション別の成功率・防御率を含む）。
  // 主因子法 + バリマックス回転（計算は fa.js）。大会の選択が観測の範囲になる。
  const FA_KINDS = ["6m", "wing", "9m", "fb", "bt", "7m"];
  const FA_VARS = [
    ...FA_KINDS.map((k) => ({ id: "a" + k, side: "a", def: true, label: `${POS_LABEL[k]} シュート成功率`, short: `${POS_LABEL[k]}成功`, get: (r) => r.rate[`shot_success_${k}`] })),
    { id: "ato", side: "a", def: true, both: true, label: "ターンオーバー率", short: "TO率", get: (r) => r.rate.turnover_rate },
    { id: "aas", side: "a", def: true, both: true, label: "ゴールあたりアシスト", short: "AS/得点", get: (r) => r.rate.assists_per_goal },
    { id: "atp", side: "a", def: true, both: true, label: "攻撃回数（1試合）", short: "攻撃回数", get: (r) => r.per_game.attacks },
    { id: "adr", side: "a", def: true, both: true, label: "2分獲得（1試合）", short: "2分獲得", get: (r) => r.per_game.drawn_2min },
    { id: "asu", side: "a", def: false, both: true, label: "攻撃成功率", short: "攻撃成功率", get: (r) => r.rate.attack_success },
    ...FA_KINDS.map((k) => ({ id: "d" + k, side: "d", def: true, label: `${POS_LABEL[k]} 防御率`, short: `${POS_LABEL[k]}防御`, get: (r) => r.rate[`defense_rate_${k}`] })),
    { id: "dfo", side: "d", def: true, both: true, label: "TO奪取率", short: "TO奪取率", get: (r) => r.rate.forced_turnover_rate },
    { id: "dgk", side: "d", def: true, both: true, label: "GKセーブ率", short: "GKセーブ率", get: (r) => r.rate.gk_save_rate },
    { id: "das", side: "d", def: true, both: true, label: "失点あたり被アシスト", short: "被AS/失点", get: (r) => r.rate.conceded_assists_per_goal },
    { id: "dgv", side: "d", def: true, both: true, label: "2分与（1試合）", short: "2分与", get: (r) => r.per_game.given_2min },
    { id: "dtp", side: "d", def: true, both: true, label: "守備回数（1試合）", short: "守備回数", get: (r) => r.per_game.def_attacks },
    { id: "dsu", side: "d", def: false, both: true, label: "守備成功率", short: "守備成功率", get: (r) => r.rate.defense_success },
  ];
  const faPool = (side) => FA_VARS.filter((v) => side === "both" || v.side === (side === "attack" ? "a" : "d"));
  function faOn(side) {
    if (!state.fOn[side]) state.fOn[side] = new Set(faPool(side).filter((v) => (side === "both" ? !!v.both : v.def)).map((v) => v.id));
    return state.fOn[side];
  }
  const sgn = (x, d = 2) => (x >= 0 ? "+" : "−") + Math.abs(x).toFixed(d);

  // 2 次元プロット（原点に軸）。ラベルは右・左・上・下の順に、重ならない位置へ。
  function faPlot(points, xl, yl, range, title, thin) {
    const W = 560, H = 440, ml = 54, mr = 20, mt = 16, mb = 48;
    const lim = range || Math.max(1, ...points.flatMap((p) => [Math.abs(p.x), Math.abs(p.y)])) * 1.12;
    const px = (v) => ml + ((v + lim) / (2 * lim)) * (W - ml - mr), py = (v) => mt + (1 - (v + lim) / (2 * lim)) * (H - mt - mb);
    const step = lim > 2.5 ? 1 : lim > 1.2 ? 0.5 : 0.25;
    const ticks = []; for (let v = -Math.floor(lim / step) * step; v <= lim + 1e-9; v += step) ticks.push(Math.round(v * 100) / 100);
    const grid = ticks.map((v) => `<line x1="${px(v)}" x2="${px(v)}" y1="${mt}" y2="${H - mb}" class="gl faint"/><text x="${px(v)}" y="${H - mb + 15}" text-anchor="middle" class="ax">${v}</text>
      <line x1="${ml}" x2="${W - mr}" y1="${py(v)}" y2="${py(v)}" class="gl faint"/><text x="${ml - 7}" y="${py(v) + 3.5}" text-anchor="end" class="ax">${v}</text>`).join("");
    const placed = [];
    const overlap = (a, b) => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;
    // 点が多いとき（thin）は、原点から遠い点だけにラベルを付ける。残りはホバーと表で確認する
    const far = new Set();
    if (thin && points.length > 24) [...points].sort((a, b) => (b.x ** 2 + b.y ** 2) - (a.x ** 2 + a.y ** 2)).slice(0, Math.ceil(points.length * 0.45)).forEach((p) => far.add(p));
    const thinned = far.size > 0;
    const dots = [...points].sort((a, b) => (b.x ** 2 + b.y ** 2) - (a.x ** 2 + a.y ** 2)).map((p) => {
      const showLabel = !thinned || far.has(p);
      const cx = px(p.x), cy = py(p.y), w = p.label.length * 6.6 + 2;
      const cands = [
        { dx: 8, dy: 4, a: "start", b: { x0: cx + 7, y0: cy - 8, x1: cx + 7 + w, y1: cy + 4 } },
        { dx: -8, dy: 4, a: "end", b: { x0: cx - 7 - w, y0: cy - 8, x1: cx - 7, y1: cy + 4 } },
        { dx: 0, dy: -9, a: "middle", b: { x0: cx - w / 2, y0: cy - 21, x1: cx + w / 2, y1: cy - 9 } },
        { dx: 0, dy: 18, a: "middle", b: { x0: cx - w / 2, y0: cy + 7, x1: cx + w / 2, y1: cy + 19 } },
      ];
      const hits = (b) => points.some((q) => { const qx = px(q.x), qy = py(q.y); return b.x0 < qx + 5 && qx - 5 < b.x1 && b.y0 < qy + 5 && qy - 5 < b.y1; });
      const c = cands.find((c) => !placed.some((b) => overlap(b, c.b)) && !hits(c.b)) || (thinned ? null : cands[0]);
      const draw = showLabel && c;
      if (draw) placed.push(c.b);
      return `<g><title>${esc(`${p.label}  ${xl}: ${p.x.toFixed(2)} / ${yl}: ${p.y.toFixed(2)}`)}</title><circle cx="${cx}" cy="${cy}" r="12" fill="transparent"/>
        <circle cx="${cx}" cy="${cy}" r="5" class="pt" style="fill:var(--s${(p.slot || 0) + 1})"/>
        ${draw ? `<text x="${cx + c.dx}" y="${cy + c.dy}" text-anchor="${c.a}" class="vl">${esc(p.label)}</text>` : ""}</g>`;
    }).join("");
    return `<figure class="faplot"><figcaption>${esc(title)}</figcaption><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(title)}">${grid}
      <line x1="${px(0)}" x2="${px(0)}" y1="${mt}" y2="${H - mb}" class="mean"/><line x1="${ml}" x2="${W - mr}" y1="${py(0)}" y2="${py(0)}" class="mean"/>
      <rect x="${ml}" y="${mt}" width="${W - ml - mr}" height="${H - mt - mb}" class="frame"/>
      <text x="${(ml + W - mr) / 2}" y="${H - 6}" text-anchor="middle" class="axt">${esc(xl)}</text>
      <text transform="translate(13 ${(mt + H - mb) / 2}) rotate(-90)" text-anchor="middle" class="axt">${esc(yl)}</text>${dots}</svg></figure>`;
  }

  function screeSvg(vals, m) {
    const W = 360, H = 210, ml = 36, mr = 14, mt = 14, mb = 34, n = vals.length;
    const hi = Math.max(1.2, vals[0] * 1.1);
    const x = (i) => ml + (n === 1 ? 0 : (i * (W - ml - mr)) / (n - 1)), y = (v) => mt + (1 - v / hi) * (H - mt - mb);
    const path = vals.map((v, i) => `${i ? "L" : "M"}${x(i)},${y(v)}`).join(" ");
    const yt = [0, 1, 2, 3, 4, 5, 6].filter((v) => v <= hi);
    return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="スクリープロット（相関行列の固有値）">
      ${yt.map((v) => `<line x1="${ml}" x2="${W - mr}" y1="${y(v)}" y2="${y(v)}" class="gl faint"/><text x="${ml - 6}" y="${y(v) + 3.5}" text-anchor="end" class="ax">${v}</text>`).join("")}
      <line x1="${ml}" x2="${W - mr}" y1="${y(1)}" y2="${y(1)}" class="mean"/><text x="${W - mr}" y="${y(1) - 4}" text-anchor="end" class="ax">固有値 = 1（Kaiser の基準）</text>
      <path d="${path}" class="ln"/>
      ${vals.map((v, i) => `<g><title>${esc(`第 ${i + 1} 固有値: ${v.toFixed(2)}`)}</title><circle cx="${x(i)}" cy="${y(v)}" r="${i < m ? 5 : 4}" class="pt" style="fill:${i < m ? "var(--s1)" : "var(--text-3)"}"/></g><text x="${x(i)}" y="${H - 14}" text-anchor="middle" class="ax">${i + 1}</text>`).join("")}
      <text x="${(ml + W - mr) / 2}" y="${H - 1}" text-anchor="middle" class="axt">因子の番号（青 = 採用した因子）</text></svg>`;
  }

  function renderFactor(host) {
    const side = state.fSide;
    const on = faOn(side);
    const pool = faPool(side);
    const ids = selIds();
    // 観測
    const obs = [];
    if (state.fPool) D.teams.filter((r) => r.tournament === selKey()).forEach((r) => obs.push({ r, tid: null }));
    else ids.forEach((tid) => D.teams.filter((r) => r.tournament === tid).forEach((r) => obs.push({ r, tid })));
    let vars = pool.filter((v) => on.has(v.id));
    const rowsAll = obs.map((o) => ({ o, x: vars.map((v) => v.get(o.r)) }));
    const rows = rowsAll.filter((q) => q.x.every(isNum));
    const dropped = rowsAll.length - rows.length;
    // 定数の列は除く
    const keep = vars.map((_, j) => new Set(rows.map((q) => q.x[j])).size > 1);
    const constant = vars.filter((_, j) => !keep[j]);
    vars = vars.filter((_, j) => keep[j]);
    const X = rows.map((q) => q.x.filter((_, j) => keep[j]));
    const n = X.length, p = vars.length;

    const chips = pool.map((v) => `<button type="button" class="chip" role="checkbox" aria-checked="${on.has(v.id)}" data-v="${v.id}" title="${esc(v.label)}">${esc(v.short)}</button>`).join("");
    const head = `<div class="controls">
        <div class="tabs" role="tablist">${[["attack", "攻撃"], ["defense", "守備"], ["both", "攻守まとめて"]].map(([k, l]) => `<button role="tab" type="button" data-fside="${k}" aria-selected="${side === k}">${l}</button>`).join("")}</div>
        <label class="chk"><input type="checkbox" id="fPool" ${state.fPool ? "checked" : ""} ${ids.length < 2 ? "disabled" : ""}> 大会を積算して 1 チーム 1 行にする</label>
      </div>
      <details class="vars" ${p < 3 ? "open" : ""}><summary>変数（${p} 個を使用）。クリックで入れ替え</summary><div class="chips">${chips}</div></details>`;

    if (p < 3 || n < 6) {
      host.innerHTML = head + `<div class="empty">因子分析には、変数が 3 個以上、観測が 6 件以上必要です（いま 変数 ${p} / 観測 ${n}）。大会や変数を増やしてください。</div>`;
      bindFactor(host);
      return;
    }

    const mMax = Math.min(3, p - 1, n - 1);
    const probe = FA.analyze(X, 1, { rotate: false }); // 固有値を得るためだけ
    const kaiser = probe.eig.vals.filter((v) => v > 1).length;
    const m = Math.max(1, Math.min(state.fK || kaiser || 1, mMax));
    const res = FA.analyze(X, m, { rotate: state.fRot });
    const cum = res.ss.reduce((a, b) => a + b, 0) / p;
    const ratio = n / p;
    const warn = ratio < 3 ? `<div class="warn">観測 ${n} 件に対して変数が ${p} 個と多く（比 ${ratio.toFixed(1)}）、結果が不安定です。変数を減らすか、大会を増やしてください。</div>`
      : ratio < 5 ? `<div class="note-warn">観測 ${n} / 変数 ${p}（比 ${ratio.toFixed(1)}）。目安の 5 倍未満なので、因子の読み取りには余裕を持ってください。</div>` : "";

    const fb = [["自動", 0], ["1", 1], ["2", 2], ["3", 3]].map(([l, k]) => `<button role="tab" type="button" data-fk="${k}" aria-selected="${state.fK === k}" ${k > mMax ? "disabled" : ""}>${l}</button>`).join("");
    const fx = Math.min(state.fX, m - 1), fy = m > 1 ? (state.fY === fx || state.fY >= m ? (fx === 0 ? 1 : 0) : state.fY) : 0;
    const fsel = m >= 3 ? `<label>横軸 <select id="fX">${Array.from({ length: m }, (_, k) => `<option value="${k}" ${k === fx ? "selected" : ""}>因子 ${k + 1}</option>`).join("")}</select></label>
      <label>縦軸 <select id="fY">${Array.from({ length: m }, (_, k) => `<option value="${k}" ${k === fy ? "selected" : ""}>因子 ${k + 1}</option>`).join("")}</select></label>` : "";

    // 負荷量表
    const hl = (l) => `style="background:color-mix(in srgb, var(${l >= 0 ? "--s1" : "--s8"}) ${Math.round(Math.min(1, Math.abs(l)) * 55)}%, transparent)"`;
    const loadRows = vars.map((v, i) => `<tr><td class="l">${esc(v.label)}</td>${res.loadings[i].map((l) => `<td class="${Math.abs(l) >= 0.5 ? "strong" : ""}" ${hl(l)}>${sgn(l)}</td>`).join("")}<td class="grp-start">${res.communality[i].toFixed(2)}</td><td>${(1 - res.communality[i]).toFixed(2)}</td></tr>`).join("");
    const loadTable = `<div class="scroll"><table><thead><tr><th class="l">変数</th>${res.loadings[0].map((_, k) => `<th>因子 ${k + 1}</th>`).join("")}<th class="grp-start" title="共通性: 因子で説明される分散の割合">共通性</th><th title="独自性 = 1 − 共通性">独自性</th></tr></thead><tbody>${loadRows}
      <tr class="sumrow"><td class="l">負荷量の二乗和</td>${res.ss.map((x) => `<td>${x.toFixed(2)}</td>`).join("")}<td class="grp-start"></td><td></td></tr>
      <tr class="sumrow"><td class="l">寄与率</td>${res.ss.map((x) => `<td>${pct((100 * x) / p, 0)}</td>`).join("")}<td class="grp-start" colspan="2">累積 ${pct(100 * cum, 0)}</td></tr></tbody></table></div>`;

    // 因子の読み取り（|負荷量| ≥ 0.5 の変数）
    const reading = res.ss.map((_, k) => {
      const items = vars.map((v, i) => ({ v, l: res.loadings[i][k] })).filter((q) => Math.abs(q.l) >= 0.5).sort((a, b) => Math.abs(b.l) - Math.abs(a.l));
      return `<li><b>因子 ${k + 1}</b>　${items.length ? items.map((q) => `${esc(q.v.short)} (${sgn(q.l)})`).join("、") : "|負荷量| 0.5 以上の変数なし"}</li>`;
    }).join("");

    // 得点
    const labelOf = (q) => q.o.r.org + (q.o.tid ? " " + tourTag(q.o.tid) : "");
    const scorePts = rows.map((q, i) => ({ q, label: labelOf(q), x: res.scores[i][fx], y: res.scores[i][fy], slot: q.o.tid ? Math.max(0, ids.indexOf(q.o.tid)) : 0 }));
    const loadPts = vars.map((v, i) => ({ label: v.short, x: res.loadings[i][fx], y: res.loadings[i][fy], slot: v.side === "a" ? 0 : 1 }));
    const plots = m >= 2 ? `<div class="faplots">${faPlot(loadPts, `因子 ${fx + 1}`, `因子 ${fy + 1}`, 1.05, "因子負荷量（変数の位置）")}${faPlot(scorePts, `因子 ${fx + 1} の得点`, `因子 ${fy + 1} の得点`, null, "因子得点（チームの位置）", true)}</div>
      <div class="count">${scorePts.length > 24 ? "点が多いので、得点プロットは原点から遠い点だけにラベルを付けています（他の点はホバーと下の表で確認できます）。" : ""}${side === "both" ? "負荷量プロットの青は攻撃の変数、橙は守備の変数。" : ""}${state.fPool || ids.length < 2 ? "" : "得点プロットの色は大会（" + ids.map((t, i) => `<span class="swatch" style="background:var(--s${i + 1})"></span>${esc(tourLabel(t))}`).join(" ") + "）。"}</div>`
      : `<div class="empty">因子が 1 つなので 2 次元のプロットは出ません。因子数を 2 以上にしてください。</div>`;

    host.innerHTML = head + warn + `<div class="controls">
        <span class="lbl">因子数</span><div class="tabs" role="tablist" aria-label="因子数">${fb}</div>
        <label class="chk"><input type="checkbox" id="fRot" ${state.fRot ? "checked" : ""}> バリマックス回転</label>${fsel}
        <span class="count">観測 ${n} 件・変数 ${p} 個${dropped ? `・欠損で除外 ${dropped} 件` : ""}${constant.length ? `・定数のため除外: ${esc(constant.map((v) => v.short).join("、"))}` : ""}・因子数 ${m}${state.fK ? "" : `（固有値 > 1 が ${kaiser} 個 → 自動）`}・累積寄与率 ${pct(100 * cum, 0)}</span>
      </div>
      <div class="fagrid"><div><h2>固有値（スクリープロット）</h2>${screeSvg(res.eig.vals, m)}</div>
        <div><h2>因子の読み取り</h2><ul class="reading">${reading}</ul>
        <div class="count">${state.fRot ? "バリマックス回転後" : "回転なし"}の負荷量。因子の符号は、絶対値が最大の変数が正になるよう揃えています。</div></div></div>
      <h2>因子負荷量</h2>${loadTable}
      <h2>因子プロット</h2>${plots}
      <h2>因子得点</h2><div id="tbl"></div>
      <ul class="notes">
        <li>観測は「大会 × チーム」の 1 件（大会を複数選ぶと件数が増えます）。「大会を積算して 1 チーム 1 行にする」を選ぶと 1 チーム 1 件になり、件数は減ります。</li>
        <li>変数は大会内の割合・平均です。ポジション別の成功率・防御率は、その区分のシュートが無いチームがあると観測から除外されます。</li>
        <li>手法は主因子法（共通性を反復推定）。回転はバリマックス（直交回転）。因子得点は最小二乗法で、因子ごとに平均 0 です。</li>
        <li>チーム数が少ないため、因子は「傾向の整理」として読んでください。変数を加減すると結果が変わります。攻撃回数と各率のように、定義の上で関係する変数が同時に入ると、その関係が因子として現れます。</li></ul>`;
    const cols = [
      { key: "lab", label: "チーム", l: true, cls: "org", get: (r) => r.label },
      ...Array.from({ length: m }, (_, k) => ({ key: "f" + k, label: `因子 ${k + 1}`, get: (r) => r.s[k], html: (r) => sgn(r.s[k]), heat: true })),
    ];
    renderTable(host.querySelector("#tbl"), "fa" + side + state.fPool + m, cols, rows.map((q, i) => ({ label: labelOf(q), s: res.scores[i] })), { key: "f0", dir: "desc" });
    bindFactor(host);
  }
  function bindFactor(host) {
    host.querySelectorAll("[data-fside]").forEach((b) => b.addEventListener("click", () => { state.fSide = b.dataset.fside; update(); }));
    host.querySelectorAll("[data-fk]").forEach((b) => b.addEventListener("click", () => { state.fK = Number(b.dataset.fk); update(); }));
    host.querySelectorAll("[data-v]").forEach((b) => b.addEventListener("click", () => {
      const on = faOn(state.fSide), id = b.dataset.v;
      on.has(id) ? on.delete(id) : on.add(id);
      update();
    }));
    const cb = (id, f) => { const e = host.querySelector(id); if (e) e.addEventListener("change", () => f(e)); };
    cb("#fPool", (e) => { state.fPool = e.checked; update(); });
    cb("#fRot", (e) => { state.fRot = e.checked; update(); });
    cb("#fX", (e) => { state.fX = Number(e.value); update(); });
    cb("#fY", (e) => { state.fY = Number(e.value); update(); });
  }

  // ---------- 大会の選択 ----------
  function renderTours() {
    const host = document.getElementById("tours");
    const sel = new Set(state.tours);
    host.innerHTML = D.tournaments.map((t) =>
      `<button type="button" class="chip" role="checkbox" aria-checked="${sel.has(t.id)}" data-id="${t.id}" title="${esc(t.name)}">${esc(t.label)}</button>`).join("") +
      `<button type="button" class="chip all" data-all="1" ${sel.size === D.tournaments.length ? "disabled" : ""}>すべて</button>`;
    host.querySelectorAll("[data-id]").forEach((b) => b.addEventListener("click", () => {
      const id = b.dataset.id;
      const next = sel.has(id) ? state.tours.filter((x) => x !== id) : [...state.tours, id];
      if (!next.length) return; // 0 大会にはしない
      state.tours = next;
      update();
    }));
    const all = host.querySelector("[data-all]");
    all.addEventListener("click", () => { state.tours = D.tournaments.map((t) => t.id); update(); });
  }

  // ---------- 全体 ----------
  function update(keepSearch) {
    writeHash();
    const host = document.getElementById("view");
    document.querySelectorAll("[data-view]").forEach((b) => b.setAttribute("aria-selected", String(b.dataset.view === state.view)));
    renderTours();
    const hadFocus = keepSearch && document.activeElement && document.activeElement.id === "q";
    const caret = hadFocus ? document.activeElement.selectionStart : null;
    const tr = document.querySelector(".tours");
    if (tr) tr.hidden = state.view === "trend"; // 推移は常に全大会を並べる
    if (state.view === "player") renderPlayers(host); else if (state.view === "trend") renderTrend(host); else if (state.view === "scatter") renderScatter(host); else if (state.view === "factor") renderFactor(host); else renderTeam(host);
    if (hadFocus) { const q = host.querySelector("#q"); if (q) { q.focus(); q.setSelectionRange(caret, caret); } }
  }

  function init() {
    const label = GENDER_LABEL[D.gender];
    document.title = `アジア${label}ハンドボール 攻守対照表`;
    document.getElementById("title").textContent = `アジア${label}ハンドボール 攻守対照表`;
    const other = D.gender === "M" ? ["women.html", "女子へ"] : ["men.html", "男子へ"];
    const link = document.getElementById("other");
    link.href = other[0]; link.textContent = other[1];
    document.querySelectorAll("[data-view]").forEach((b) => b.addEventListener("click", () => { state.view = b.dataset.view; update(); }));

    const theme = document.getElementById("theme");
    const saved = (() => { try { return localStorage.getItem("theme"); } catch (e) { return null; } })();
    if (saved) document.documentElement.dataset.theme = saved;
    theme.addEventListener("click", () => {
      const dark = document.documentElement.dataset.theme
        ? document.documentElement.dataset.theme === "dark"
        : matchMedia("(prefers-color-scheme: dark)").matches;
      const next = dark ? "light" : "dark";
      document.documentElement.dataset.theme = next;
      try { localStorage.setItem("theme", next); } catch (e) { /* 保存できなくても動く */ }
    });

    readHash();
    update();
    window.addEventListener("hashchange", () => { readHash(); update(); });
  }
  document.addEventListener("DOMContentLoaded", init);
})();
