// Case-insensitive, typo-tolerant fuzzy search.
// Returns true if query matches the haystack with character-subsequence + small edit tolerance.

const norm = (s) => String(s ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '');

// Subsequence match - allows missing chars / typos to pass.
const subsequence = (q, h) => {
  if (!q) return true;
  let i = 0;
  for (let j = 0; j < h.length && i < q.length; j++) if (h[j] === q[i]) i++;
  return i === q.length;
};

// Lightweight Levenshtein up to a budget of 2
const editDistance = (a, b, max = 2) => {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  const dp = Array.from({ length: a.length + 1 }, () => 0);
  for (let i = 0; i <= a.length; i++) dp[i] = i;
  for (let j = 1; j <= b.length; j++) {
    let prev = dp[0];
    dp[0] = j;
    let rowMin = dp[0];
    for (let i = 1; i <= a.length; i++) {
      const tmp = dp[i];
      dp[i] = Math.min(
        dp[i] + 1,
        dp[i - 1] + 1,
        prev + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
      prev = tmp;
      if (dp[i] < rowMin) rowMin = dp[i];
    }
    if (rowMin > max) return max + 1;
  }
  return dp[a.length];
};

export const matches = (query, ...haystacks) => {
  const q = norm(query);
  if (!q) return true;
  for (const raw of haystacks) {
    const h = norm(raw);
    if (!h) continue;
    if (h.includes(q)) return true;
    if (subsequence(q, h)) return true;
    // Token-level edit distance for short queries
    const tokens = String(raw ?? '').toLowerCase().split(/\s+/);
    for (const t of tokens) {
      const tn = norm(t);
      if (!tn) continue;
      const max = Math.max(1, Math.floor(q.length / 4));
      if (editDistance(q, tn, Math.min(max, 2)) <= Math.min(max, 2)) return true;
    }
  }
  return false;
};
