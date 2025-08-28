import { initViewRouter, switchView } from './ui.js';
import { extractTextFromPdfFile, chunkText } from './pdf-utils.js';
import { generateQuiz, mockGenerate } from './gemini.js';
import { renderQuizInto, collectAnswers, scoreQuiz } from './quiz.js';
import {
  getLocalSettings, saveLocalSettings,
  getLocalHistory, appendLocalHistory, clearLocalHistory, exportHistoryCSV,
  saveSettingsToJsonbin, loadSettingsFromJsonbin,
  appendAttemptToJsonbin, pushHistoryToJsonbin,
  saveQuizLocally, loadSavedQuizzes, deleteSavedQuiz,
  saveQuizToJsonbin
} from './storage.js';
import { renderScoreChart, renderDistributionChart } from './analytics.js';

initViewRouter();

// Switch to a tab programmatically
function goToTab(tabId) {
  const tabTriggerEl = document.querySelector(`[data-bs-target="#${tabId}"]`);
  if (tabTriggerEl) {
    const tab = new bootstrap.Tab(tabTriggerEl);
    tab.show();
  }
}

/* ========== Elements ========== */
const els = {
  docType: document.getElementById('docType'),
  numQuestions: document.getElementById('numQuestions'),
  pdfFiles: document.getElementById('pdfFiles'),
  pasteText: document.getElementById('pasteText'),
  ingestBtn: document.getElementById('ingestBtn'),
  clearStore: document.getElementById('clearStore'),
  ingestMsg: document.getElementById('ingestMsg'),
  storePreview: document.getElementById('storePreview'),
  chunkCount: document.getElementById('chunkCount'),
  parsedQCount: document.getElementById('parsedQCount'),

  topic: document.getElementById('topic'),
  genNum: document.getElementById('genNum'),
  outLang: document.getElementById('outLang'),
  difficulty: document.getElementById('difficulty'),
  generateBtn: document.getElementById('generateBtn'),
  mockGenerate: document.getElementById('mockGenerate'),
  genStatus: document.getElementById('genStatus'),
  rawOutput: document.getElementById('rawOutput'),

  quizArea: document.getElementById('quizArea'),
  submitQuizBtn: document.getElementById('submitQuizBtn'),
  saveQuizBtn: document.getElementById('saveQuizBtn'),
  saveToJsonbin: document.getElementById('saveToJsonbin'),
  quizResult: document.getElementById('quizResult'),
  savedQuizList: document.getElementById('savedQuizList'),
  negativeMarkChk: document.getElementById('negativeMarkChk'),
  negValue: document.getElementById('negValue'),

  historyList: document.getElementById('historyList'),
  scoreChart: document.getElementById('scoreChart'),
  distChart: document.getElementById('distChart'),

  geminiKey: document.getElementById('geminiKey'),
  jsonbinKey: document.getElementById('jsonbinKey'),
  settingsBinId: document.getElementById('settingsBinId'),
  historyBinId: document.getElementById('historyBinId'),
  saveSettingsLocal: document.getElementById('saveSettingsLocal'),
  saveSettingsJsonbin: document.getElementById('saveSettingsJsonbin'),
  loadSettingsJsonbin: document.getElementById('loadSettingsJsonbin'),
  clearHistory: document.getElementById('clearHistory'),
  exportAll: document.getElementById('exportAll'),
  syncHistoryJsonbin: document.getElementById('syncHistoryJsonbin'),
};

/* ========== State ========== */
let localChunks = [];
let currentQuiz = null;
let currentMeta = {};

/* ========== Settings Bootstrap ========== */
(function loadSettingsIntoUI(){
  const s = getLocalSettings();
  els.geminiKey.value = s.geminiKey || '';
  els.jsonbinKey.value = s.jsonbinKey || '';
  els.settingsBinId.value = s.settingsBinId || '';
  els.historyBinId.value = s.historyBinId || '';
})();

let useIngestContext = false;

/* ========== Ingest ========== */
function updateStoreUI(){
  els.chunkCount.textContent = localChunks.length;
  els.parsedQCount.textContent = currentQuiz ? currentQuiz.length : 0;
  els.storePreview.textContent = localChunks.slice(0,6).map((c,i)=>`${i+1}. ${c.slice(0,220)}…`).join('\n\n');
}

els.ingestBtn.addEventListener('click', async ()=>{
  els.ingestMsg.textContent = 'Processing...';
  const files = Array.from(els.pdfFiles.files || []);
  let addedChunks=0;

  for(const f of files){
    try{
      const txt = await extractTextFromPdfFile(f);
      const chunks = chunkText(txt);
      localChunks.push(...chunks); addedChunks += chunks.length;
    }catch(e){ console.error(e); els.ingestMsg.textContent = 'Error processing file'; }
  }

  const pasted = els.pasteText.value.trim();
  if(pasted){
    const chunks = chunkText(pasted);
    localChunks.push(...chunks); addedChunks += chunks.length;
  }

  updateStoreUI();
  els.ingestMsg.textContent = `Done. Chunks +${addedChunks}.`;

  if(localChunks.length>0){
    useIngestContext = true;  // Set flag before auto-generating from ingest
    await autoGenerateQuiz();
    useIngestContext = false;  // Reset flag after
  }
});

els.clearStore.addEventListener('click', ()=>{
  localChunks=[]; currentQuiz=null; updateStoreUI(); els.ingestMsg.textContent='Cleared';
});

/* ========== Quiz Submit Flow ========== */
els.submitQuizBtn.addEventListener('click', () => submitCurrentQuiz(false));

function submitCurrentQuiz(isAuto=false){
  if(!currentQuiz) return alert('No quiz loaded');
  const answers = collectAnswers(els.quizArea);
  const neg = els.negativeMarkChk.checked;
  const negValue = parseFloat(els.negValue.value) || 0;

  const { score, total, results } = scoreQuiz(currentQuiz, answers, { negativeMark: neg, negValue });

  // Update UI with results
  els.quizResult.style.display = 'block';
  els.quizResult.innerHTML = `Score: ${score} / ${total}`;

  // Show explanations
  const cards = els.quizArea.querySelectorAll('.card');
  cards.forEach((card, idx) => {
    const result = results[idx];
    const explEl = card.querySelector('.explanation-text');
    const lang = card.querySelector('.question-text')?.dataset.lang || 'mr';
    const explText = typeof result.explanation === 'string' ? result.explanation : (result.explanation?.[lang] || result.explanation?.en || result.explanation?.mr || '');
    explEl.innerHTML = `<small class="text-muted ${result.ok ? 'text-success' : 'text-danger'}">${escapeHtml(explText)}</small>`;
    explEl.style.display = 'block';
    // Highlight correct and incorrect answers
    const inputs = card.querySelectorAll('input[type=radio]');
    inputs.forEach((input, optIdx) => {
      const label = input.parentElement;
      if (optIdx === currentQuiz[idx].correct_index) {
        label.classList.add('bg-success', 'bg-opacity-10');
      }
      if (result.user === optIdx && !result.ok) {
        label.classList.add('bg-danger', 'bg-opacity-10');
      }
    });
  });

  const attempt={
    timestamp: new Date().toISOString(),
    topic: currentMeta.topic,
    score,
    total: currentQuiz.length,
    num_questions: currentQuiz.length,
    language: currentMeta.language,
    difficulty: currentMeta.difficulty,
    mode: currentMeta.mode,
    quiz_id: currentMeta.id || null
  };
  appendLocalHistory(attempt);
  refreshHistoryUI();

  if(isAuto) alert('Quiz auto-submitted.');
}

/* ========== Saved Quizzes Refresh ========== */
function refreshSavedQuizzes() {
  const list = els.savedQuizList;
  list.innerHTML = '';
  const quizzes = loadSavedQuizzes();
  if (!quizzes.length) {
    list.innerHTML = '<li class="list-group-item text-muted">No saved quizzes</li>'; 
    return; 
  }
  quizzes.forEach(q=>{
    const li=document.createElement('li');
    li.className='list-group-item d-flex justify-content-between align-items-center';
    li.innerHTML=`<span>${q.meta.topic||'Untitled'} (${q.questions.length} Qs)</span>`;
    const btns=document.createElement('div');
    const load=document.createElement('button');
    load.className='btn btn-sm btn-primary me-1'; 
    load.textContent='Load';
    load.onclick=()=>{
      currentQuiz=q.questions; 
      currentMeta={ ...q.meta, id: q.id };
      renderQuizInto(els.quizArea, currentQuiz, { defaultLang: q.meta.language || 'mr' });
      goToTab("quiz");
    };
    const del=document.createElement('button');
    del.className='btn btn-sm btn-danger'; 
    del.textContent='Delete';
    del.onclick=()=>{ deleteSavedQuiz(q.id); refreshSavedQuizzes(); };
    btns.append(load,del); li.appendChild(btns); list.appendChild(li);
  });
}

/* ========== Save Quiz Handlers ========== */
els.saveQuizBtn.addEventListener('click', () => {
  if (!currentQuiz) return alert('No quiz to save');
  const saved = saveQuizLocally(currentMeta, currentQuiz);
  currentMeta.id = saved.id; // Set id after saving
  alert('Quiz saved locally. ID: ' + saved.id);
  refreshSavedQuizzes();
});

els.saveToJsonbin.addEventListener('click', async () => {
  const s = getLocalSettings();
  if (!s.jsonbinKey) return alert('JSONBin key required');
  if (!currentQuiz) return alert('No quiz to save');
  const quizPayload = { meta: currentMeta, questions: currentQuiz };
  const { binId, data } = await saveQuizToJsonbin(s.jsonbinKey, null, quizPayload); // null for new bin
  alert('Quiz saved to JSONBin. Bin ID: ' + binId);
});

/* ========== Generate & Auto Mode ========== */
async function autoGenerateQuiz(){
  els.genStatus.textContent='Generating...';
  els.rawOutput.textContent='';

  const topic=els.topic.value||'General';
  const mode=els.docType.value==='question_bank'?'extract':'generate';
  const n=mode==='generate'?Number(els.genNum.value||els.numQuestions.value||10):50;
  const lang=mode==='extract'?(document.getElementById('qbLang')?.value||'both'):els.outLang.value;
  const diff=els.difficulty.value;

  let context;
  if (mode === 'extract') {
    context = localChunks.join('\n\n');
  } else {  // mode === 'generate'
    if (useIngestContext) {
      // Use ingested chunks only if flagged (i.e., called right after ingest for notes)
      context = localChunks.slice(0, n).join('\n\n') || topic;
    } else {
      // Otherwise (from Generate tab), use topic only for a different, independent prompt context
      context = topic;
    }
  }

  try{
    const key=(els.geminiKey.value||'').trim();
    const { raw, extracted }=await generateQuiz({key,text:context,numQuestions:n,language:lang,mode});
    els.rawOutput.textContent=raw;
    if(extracted.error){ els.genStatus.textContent='Parse error'; return; }

    currentQuiz=extracted.parsed.map(q=>({
      question: q.question||'',
      options: (q.options||[]).map(o => {
        if (typeof o === 'string') return o;
        if (o.A && o.B) return o; // Preserve object format for matching pairs
        return String(o).replace(/^[A-D][\).\s:-]*/i,'').trim();
      }).slice(0,4),
      correct_index: q.correct_index||0,
      explanation: q.explanation||''
    }));
    currentMeta={topic,num_questions:currentQuiz.length,language:lang,difficulty:diff,mode,generated_at:new Date().toISOString()};

    goToTab("quiz");
    renderQuizInto(els.quizArea, currentQuiz, { defaultLang: lang });
    els.genStatus.textContent='Quiz ready!';
  }catch(e){ els.genStatus.textContent='Error: '+e.message; console.error(e); }
}

els.generateBtn.addEventListener('click', autoGenerateQuiz);
els.mockGenerate.addEventListener('click', ()=>{
  const n=Number(els.genNum.value||10), lang=els.outLang.value, mode=els.docType.value==='question_bank'?'extract':'generate';
  const {parsed}=mockGenerate(n,lang,mode);
  currentQuiz=parsed; 
  currentMeta={topic:'Mock',num_questions:n,language:lang,difficulty:'mock',mode};
  goToTab("quiz");
  renderQuizInto(els.quizArea, currentQuiz, { defaultLang: lang });
});

/* ========== DocType Change ========== */
els.docType.addEventListener('change', ()=>{
  els.numQuestions.disabled=els.docType.value==='question_bank';
  document.getElementById('qbLangWrapper').style.display=els.docType.value==='question_bank'?'block':'none';
});

/* ========== History & Analytics ========== */
function refreshHistoryUI(){
  const hist=getLocalHistory().slice().reverse();
  els.historyList.innerHTML='';
  hist.forEach(h=>{
    const item=document.createElement('div');
    item.className='list-group-item';
    let html = `<div class="d-flex justify-content-between"><div><strong>${h.topic}</strong><div class="text-muted small">${new Date(h.timestamp).toLocaleString()}</div>`;
    if (h.quiz_id) html += `<small>Quiz ID: ${h.quiz_id}</small>`;
    html += `</div><div><span class="badge bg-primary">${h.score}/${h.total}</span></div></div>`;
    item.innerHTML = html;
    els.historyList.appendChild(item);
  });
  renderScoreChart(els.scoreChart, getLocalHistory());
  renderDistributionChart(els.distChart, getLocalHistory());
}
refreshHistoryUI();

/* ========== Settings Events ========== */
els.saveSettingsLocal.addEventListener('click', ()=>{ saveLocalSettings({
  geminiKey:els.geminiKey.value.trim(), jsonbinKey:els.jsonbinKey.value.trim(),
  settingsBinId:els.settingsBinId.value.trim(), historyBinId:els.historyBinId.value.trim()
}); alert('Saved locally.'); });

els.saveSettingsJsonbin.addEventListener('click', async ()=>{
  const s={geminiKey:els.geminiKey.value.trim(), jsonbinKey:els.jsonbinKey.value.trim(), settingsBinId:els.settingsBinId.value.trim(), historyBinId:els.historyBinId.value.trim()};
  if(!s.jsonbinKey) return alert('JSONBin key required');
  const {binId}=await saveSettingsToJsonbin(s.jsonbinKey, s);
  s.settingsBinId=binId; saveLocalSettings(s); els.settingsBinId.value=binId; alert('Settings saved to JSONBin. Bin ID: '+binId);
});
els.loadSettingsJsonbin.addEventListener('click', async ()=>{
  const key=els.jsonbinKey.value.trim(), bin=els.settingsBinId.value.trim();
  if(!key||!bin) return alert('Provide JSONBin key & Settings Bin ID');
  const rec=await loadSettingsFromJsonbin(key,bin);
  els.geminiKey.value=rec.geminiKey||''; els.jsonbinKey.value=rec.jsonbinKey||key;
  els.settingsBinId.value=rec.settingsBinId||bin; els.historyBinId.value=rec.historyBinId||'';
  saveLocalSettings({...rec,jsonbinKey:rec.jsonbinKey||key}); alert('Settings loaded from JSONBin.');
});
els.clearHistory.addEventListener('click',()=>{ if(confirm('Clear history?')){clearLocalHistory(); refreshHistoryUI();}});
els.exportAll.addEventListener('click',()=>{
  const csv=exportHistoryCSV(); if(!csv) return alert('No history');
  const blob=new Blob([csv],{type:'text/csv'}); saveAs(blob,`attempts_${Date.now()}.csv`); alert('Exported CSV.');
});
els.syncHistoryJsonbin.addEventListener('click', async ()=>{
  const s=getLocalSettings(); if(!s.jsonbinKey) return alert('Add JSONBin key');
  const {binId,count}=await pushHistoryToJsonbin(s.jsonbinKey,s.historyBinId,getLocalHistory());
  if(!s.historyBinId){s.historyBinId=binId; saveLocalSettings(s); els.historyBinId.value=binId;}
  alert(`Pushed ${count} attempts. Bin ID: ${s.historyBinId||binId}`);
});

// Initial refresh for saved quizzes
refreshSavedQuizzes();