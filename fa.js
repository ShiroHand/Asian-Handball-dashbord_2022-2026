/* 因子分析の数値計算（外部ライブラリなし）。ブラウザでは window.FA、node では module.exports。
 *
 *   FA.analyze(X, m, {rotate})  X: n × p の配列（欠損なし）。m: 因子数
 *     → { n, p, R, eig, loadings, communality, ss, scores, ... }
 *
 * 手法: 主因子法（共通性の反復推定）+ バリマックス回転（Kaiser の正規化つき）。
 * 因子得点は最小二乗法 F = Z L (L'L)^-1（相関行列の逆行列を使わないので、n < p でも計算できる）。
 */
(function (root) {
  "use strict";

  const zeros = (n, m) => Array.from({ length: n }, () => new Array(m).fill(0));
  const identity = (n) => { const I = zeros(n, n); for (let i = 0; i < n; i++) I[i][i] = 1; return I; };

  // 対称行列の固有値分解（巡回ヤコビ法）。固有値は降順、vecs の列が固有ベクトル。
  function eigSym(A) {
    const n = A.length;
    const a = A.map((r) => r.slice());
    const v = identity(n);
    for (let sweep = 0; sweep < 100; sweep++) {
      let off = 0;
      for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) off += a[i][j] * a[i][j];
      if (off < 1e-24) break;
      for (let p = 0; p < n - 1; p++) {
        for (let q = p + 1; q < n; q++) {
          if (Math.abs(a[p][q]) < 1e-18) continue;
          const theta = (a[q][q] - a[p][p]) / (2 * a[p][q]);
          const t = (theta >= 0 ? 1 : -1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1));
          const c = 1 / Math.sqrt(t * t + 1), s = t * c;
          for (let k = 0; k < n; k++) {
            const akp = a[k][p], akq = a[k][q];
            a[k][p] = c * akp - s * akq;
            a[k][q] = s * akp + c * akq;
          }
          for (let k = 0; k < n; k++) {
            const apk = a[p][k], aqk = a[q][k];
            a[p][k] = c * apk - s * aqk;
            a[q][k] = s * apk + c * aqk;
          }
          for (let k = 0; k < n; k++) {
            const vkp = v[k][p], vkq = v[k][q];
            v[k][p] = c * vkp - s * vkq;
            v[k][q] = s * vkp + c * vkq;
          }
        }
      }
    }
    const order = a.map((_, i) => i).sort((i, j) => a[j][j] - a[i][i]);
    return { vals: order.map((i) => a[i][i]), vecs: v.map((row) => order.map((j) => row[j])) };
  }

  // 相関行列（母集団の標準偏差で標準化）。定数列は呼び出し側で除いておく。
  function standardize(X) {
    const n = X.length, p = X[0].length;
    const mean = new Array(p).fill(0), sd = new Array(p).fill(0);
    for (let j = 0; j < p; j++) {
      for (let i = 0; i < n; i++) mean[j] += X[i][j];
      mean[j] /= n;
      for (let i = 0; i < n; i++) sd[j] += (X[i][j] - mean[j]) ** 2;
      sd[j] = Math.sqrt(sd[j] / n);
    }
    const Z = X.map((r) => r.map((x, j) => (sd[j] > 0 ? (x - mean[j]) / sd[j] : 0)));
    return { Z, mean, sd };
  }
  function corr(Z) {
    const n = Z.length, p = Z[0].length;
    const R = zeros(p, p);
    for (let a = 0; a < p; a++) for (let b = a; b < p; b++) {
      let s = 0;
      for (let i = 0; i < n; i++) s += Z[i][a] * Z[i][b];
      R[a][b] = R[b][a] = s / n;
    }
    return R;
  }

  // 主因子法。共通性の初期値は他の変数との相関の最大絶対値。
  function principalAxis(R, m) {
    const p = R.length;
    let h = R.map((row, i) => Math.max(...row.map((x, j) => (j === i ? 0 : Math.abs(x)))));
    let L = zeros(p, m), iters = 0, converged = false;
    for (; iters < 500; iters++) {
      const Rr = R.map((row, i) => row.map((x, j) => (i === j ? h[i] : x)));
      const { vals, vecs } = eigSym(Rr);
      L = vecs.map((row) => row.slice(0, m).map((x, k) => x * Math.sqrt(Math.max(vals[k], 0))));
      const hn = L.map((row) => Math.min(row.reduce((a, x) => a + x * x, 0), 0.9999));
      const diff = Math.max(...hn.map((x, i) => Math.abs(x - h[i])));
      h = hn;
      if (diff < 1e-8) { converged = true; iters++; break; }
    }
    return { L, h, iters, converged };
  }

  // バリマックス回転（Kaiser の正規化つき、因子対ごとの回転）
  function varimax(L0) {
    const p = L0.length, m = L0[0].length;
    if (m < 2) return L0.map((r) => r.slice());
    const h = L0.map((r) => Math.sqrt(r.reduce((a, x) => a + x * x, 0)) || 1);
    const A = L0.map((r, i) => r.map((x) => x / h[i]));
    for (let iter = 0; iter < 1000; iter++) {
      let moved = 0;
      for (let i = 0; i < m - 1; i++) for (let j = i + 1; j < m; j++) {
        let sa = 0, sb = 0, sc = 0, sd = 0;
        for (let k = 0; k < p; k++) {
          const x = A[k][i], y = A[k][j];
          const u = x * x - y * y, w = 2 * x * y;
          sa += u; sb += w; sc += u * u - w * w; sd += 2 * u * w;
        }
        const num = sd - (2 * sa * sb) / p, den = sc - (sa * sa - sb * sb) / p;
        const ang = Math.atan2(num, den) / 4;
        if (Math.abs(ang) < 1e-9) continue;
        const c = Math.cos(ang), s = Math.sin(ang);
        for (let k = 0; k < p; k++) {
          const x = A[k][i], y = A[k][j];
          A[k][i] = c * x + s * y;
          A[k][j] = -s * x + c * y;
        }
        moved += Math.abs(ang);
      }
      if (moved < 1e-9) break;
    }
    return A.map((r, i) => r.map((x) => x * h[i]));
  }

  function inverse(M) {
    const n = M.length;
    const A = M.map((r, i) => r.concat(identity(n)[i]));
    for (let c = 0; c < n; c++) {
      let piv = c;
      for (let r = c + 1; r < n; r++) if (Math.abs(A[r][c]) > Math.abs(A[piv][c])) piv = r;
      [A[c], A[piv]] = [A[piv], A[c]];
      const d = A[c][c] || 1e-12;
      for (let k = 0; k < 2 * n; k++) A[c][k] /= d;
      for (let r = 0; r < n; r++) if (r !== c) {
        const f = A[r][c];
        if (f) for (let k = 0; k < 2 * n; k++) A[r][k] -= f * A[c][k];
      }
    }
    return A.map((r) => r.slice(n));
  }

  function analyze(X, m, opts) {
    const rotate = !opts || opts.rotate !== false;
    const { Z } = standardize(X);
    const n = Z.length, p = Z[0].length;
    const R = corr(Z);
    const eig = eigSym(R);
    const pa = principalAxis(R, m);
    let L = rotate ? varimax(pa.L) : pa.L.map((r) => r.slice());
    // 符号: 各因子で絶対値が最大の負荷量を正にする。順序: 負荷量の二乗和が大きい順
    for (let k = 0; k < m; k++) {
      let big = 0;
      for (let i = 0; i < p; i++) if (Math.abs(L[i][k]) > Math.abs(L[big][k])) big = i;
      if (L[big][k] < 0) for (let i = 0; i < p; i++) L[i][k] = -L[i][k];
    }
    const ssAll = Array.from({ length: m }, (_, k) => L.reduce((a, r) => a + r[k] * r[k], 0));
    const ord = ssAll.map((_, k) => k).sort((a, b) => ssAll[b] - ssAll[a]);
    L = L.map((r) => ord.map((k) => r[k]));
    const ss = ord.map((k) => ssAll[k]);
    const communality = L.map((r) => r.reduce((a, x) => a + x * x, 0));
    // 因子得点 F = Z L (L'L)^-1
    const LtL = zeros(m, m);
    for (let a = 0; a < m; a++) for (let b = 0; b < m; b++) for (let i = 0; i < p; i++) LtL[a][b] += L[i][a] * L[i][b];
    const inv = inverse(LtL);
    const ZL = Z.map((z) => Array.from({ length: m }, (_, k) => z.reduce((a, x, i) => a + x * L[i][k], 0)));
    const scores = ZL.map((r) => Array.from({ length: m }, (_, k) => r.reduce((a, x, j) => a + x * inv[j][k], 0)));
    return { n, p, m, R, eig, loadings: L, communality, ss, scores, iters: pa.iters, converged: pa.converged, rotated: rotate };
  }

  const FA = { analyze, eigSym, standardize, corr, principalAxis, varimax, inverse };
  if (typeof module !== "undefined" && module.exports) module.exports = FA;
  else root.FA = FA;
})(typeof window !== "undefined" ? window : globalThis);
