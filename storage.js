// storage.js
// Utilities for local persistence and JSONBin integration.
// Keeps a small stable local schema and flexible JSONBin helpers.

const SETTINGS_KEY = 'mg_quiz_settings_v1';
const HISTORY_KEY = 'mg_quiz_history_v1';
const SAVED_QUIZZES_KEY = 'mg_saved_quizzes_v1';

function safeParse(s, fallback = null) {
  try { return JSON.parse(s); } catch { return fallback; }
}

/* ========== Local Settings ========== */
// ========== Settings Management ==========
export function getLocalSettings() {
  try {
    return JSON.parse(localStorage.getItem('quiz_settings')) || {};
  } catch {
    return {};
  }
}

// export function saveLocalSettings(obj) {
//   localStorage.setItem('quiz_settings', JSON.stringify(obj || {}));
// }

export function saveLocalSettings(settings = {}) {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings || {}));
}

/* ========== Local History (attempts) ========== */
export function getLocalHistory() {
  return safeParse(localStorage.getItem(HISTORY_KEY), []) || [];
}

export function appendLocalHistory(attempt) {
  const h = getLocalHistory();
  h.push(attempt);
  localStorage.setItem(HISTORY_KEY, JSON.stringify(h));
  return attempt;
}

export function clearLocalHistory() {
  localStorage.removeItem(HISTORY_KEY);
}

/* Export CSV for attempts */
export function exportHistoryCSV() {
  const hist = getLocalHistory();
  if (!hist || !hist.length) return null;
  const rows = [['timestamp','topic','score','total','num_questions','language','difficulty','mode']];
  hist.forEach(h => {
    rows.push([
      `"${h.timestamp || ''}"`,
      `"${(h.topic || '').replace(/"/g,"'")}"`,
      h.score ?? '',
      h.total ?? '',
      h.num_questions ?? '',
      `"${h.language || ''}"`,
      `"${h.difficulty || ''}"`,
      `"${h.mode || ''}"`
    ]);
  });
  return rows.map(r => r.join(',')).join('\n');
}

/* ========== Saved Quizzes (local) ========== */
export function saveQuizLocally(meta = {}, questions = []) {
  const store = safeParse(localStorage.getItem(SAVED_QUIZZES_KEY), []) || [];
  const id = `quiz-${Date.now()}`;
  const payload = { id, meta: { ...meta, savedAt: new Date().toISOString() }, questions };
  store.push(payload);
  localStorage.setItem(SAVED_QUIZZES_KEY, JSON.stringify(store));
  return payload;
}

export function loadSavedQuizzes() {
  return safeParse(localStorage.getItem(SAVED_QUIZZES_KEY), []) || [];
}

export function deleteSavedQuiz(id) {
  const store = loadSavedQuizzes().filter(q => q.id !== id);
  localStorage.setItem(SAVED_QUIZZES_KEY, JSON.stringify(store));
  return true;
}

/* ========== JSONBin v3 helpers (best-effort generic) ==========
   Notes:
   - This uses JSONBin v3 style endpoints (POST create: /v3/b, GET/PUT /v3/b/{binId})
   - The caller must provide `xMasterKey` (JSONBin "X-Master-Key" or user key).
   - If your JSONBin account uses different endpoints/headers, adjust accordingly.
*/

async function jsonbinCreateBin(masterKey, payload, name = 'quiz-app-bin') {
  if (!masterKey) throw new Error('JSONBin master key required');
  const url = 'https://api.jsonbin.io/v3/b';
  const body = { name, record: payload };
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Master-Key': masterKey },
    body: JSON.stringify(body)
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.message || 'JSONBin create failed');
  // returns { metadata: { id: '...' } } depending on API
  return data;
}

async function jsonbinGetBin(masterKey, binId) {
  if (!masterKey) throw new Error('JSONBin master key required');
  if (!binId) throw new Error('JSONBin binId required');
  const url = `https://api.jsonbin.io/v3/b/${binId}`;
  const res = await fetch(url, { headers: { 'X-Master-Key': masterKey } });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.message || 'JSONBin get failed');
  return data;
}

async function jsonbinReplaceBin(masterKey, binId, payload) {
  if (!masterKey) throw new Error('JSONBin master key required');
  if (!binId) throw new Error('JSONBin binId required');
  const url = `https://api.jsonbin.io/v3/b/${binId}`;
  const res = await fetch(url, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', 'X-Master-Key': masterKey },
    body: JSON.stringify({ record: payload })
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.message || 'JSONBin replace failed');
  return data;
}

/* Save app settings to a jsonbin (creates new bin if none) */
export async function saveSettingsToJsonbin(masterKey, settings = {}) {
  // If you want to create a new bin for settings:
  const payload = { settings };
  const data = await jsonbinCreateBin(masterKey, payload, 'quiz-app-settings');
  // try to find binId in response
  const binId = data?.metadata?.id || data?.id || null;
  return { binId, data };
}

export async function loadSettingsFromJsonbin(masterKey, binId) {
  const data = await jsonbinGetBin(masterKey, binId);
  // structure depends on API; attempt to extract record
  const rec = data?.record || data?.metadata || data?.data || null;
  if (!rec) throw new Error('Invalid JSONBin response');
  return rec;
}

/* Append a single attempt object to a "history" bin.
   If historyBinId is empty, this will create a new bin and return its id.
   If bin exists we will fetch -> append -> replace.
*/
export async function appendAttemptToJsonbin(masterKey, historyBinId, attempt) {
  if (!masterKey) throw new Error('JSONBin master key required');
  if (!historyBinId) {
    // create a new bin with the attempt as an array
    const payload = [attempt];
    const data = await jsonbinCreateBin(masterKey, payload, 'quiz-app-history');
    const binId = data?.metadata?.id || data?.id || null;
    return { binId, count: 1, data };
  } else {
    // fetch existing, append, replace
    const existing = await jsonbinGetBin(masterKey, historyBinId);
    let arr = existing?.record ?? existing?.data ?? existing?.record ?? null;
    if (!Array.isArray(arr)) arr = [];
    arr.push(attempt);
    const replaced = await jsonbinReplaceBin(masterKey, historyBinId, arr);
    return { binId: historyBinId, count: arr.length, data: replaced };
  }
}

/* Push entire local history array to JSONBin (creates bin if none) */
export async function pushHistoryToJsonbin(masterKey, historyBinId, historyArray = []) {
  if (!masterKey) throw new Error('JSONBin master key required');
  if (!historyBinId) {
    const data = await jsonbinCreateBin(masterKey, historyArray, 'quiz-app-history');
    const binId = data?.metadata?.id || data?.id || null;
    return { binId, count: historyArray.length, data };
  } else {
    const replaced = await jsonbinReplaceBin(masterKey, historyBinId, historyArray);
    return { binId: historyBinId, count: historyArray.length, data: replaced };
  }
}

/* Save a quiz object to JSONBin (quiz payload = { meta, questions })
   Creates a new bin if binId not provided, otherwise appends to existing record array.
*/
export async function saveQuizToJsonbin(masterKey, binId, quizPayload) {
  if (!masterKey) throw new Error('JSONBin master key required');
  if (!binId) {
    const data = await jsonbinCreateBin(masterKey, quizPayload, 'saved-quiz');
    const newId = data?.metadata?.id || data?.id || null;
    return { binId: newId, data };
  } else {
    // Some users prefer one-quiz-per-bin. We'll replace the bin with quizPayload
    const replaced = await jsonbinReplaceBin(masterKey, binId, quizPayload);
    return { binId, data: replaced };
  }
}
