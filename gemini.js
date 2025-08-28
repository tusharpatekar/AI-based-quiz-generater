// Gemini 1.5 Flash Free integration + robust JSON extraction
export const DEFAULT_GEMINI_KEY = "AIzaSyDSWTMouKYiPALZb9twdtKDfYGmevtWYAY"; // leave blank & paste in Settings OR hardcode personal key

/* ========== Prompt Builders ========== */
function buildMarathiPrompt(text, numQuestions, mode = 'generate') {
  let base = `तुमच्यासमोर दिलेला मजकूर वाचा. `;
  if (mode === 'extract') {
    base += `हा मजकूर प्रश्नसंच (Question Bank) आहे. त्यातील MCQs **जसेच्या तसे** काढा आणि प्रत्येक प्रश्नासाठी योग्य उत्तर व स्पष्टीकरण द्या. `;
  } else {
    base += `त्या आधारावर MPSC स्तरावरील ${numQuestions} बहुपर्यायी प्रश्न (MCQs) तयार करा. प्रत्येक प्रश्नासाठी स्पष्टीकरण द्या. `;
  }

  return base + `
📘 प्रश्न प्रकार:
- विधान I आणि II
- सत्य / असत्य
- योग्य-अयोग्य
- जोड्या लावा
- क्रम लावा
- कारण-परिणाम
- संकल्पनात्मक/विश्लेषणात्मक

📌 सूचना:
- नेहमी 4 पर्याय द्या.
- "correct_index" योग्य उत्तरासाठी (0 = पहिला).
- "explanation" द्या.
- JSON array व्यतिरिक्त दुसरे काहीही आउटपुट देऊ नका.

उदाहरण:
[
  {"question":"...","options":["...","...","...","..."],"correct_index":1,"explanation":"..."}
]

मजकूर:
${text}`;
}

function buildEnglishPrompt(text, numQuestions, mode = 'generate') {
  let base = `Read the content carefully. `;
  if (mode === 'extract') {
    base += `This is a question bank. Extract the existing MCQs exactly, and provide the correct answer with explanation. `;
  } else {
    base += `Generate ${numQuestions} competitive-level MCQs. Each must include explanation. `;
  }

  return base + `
Guidelines:
- Always give 4 options.
- Use "correct_index" (0 = first).
- Add "explanation" for reasoning.
- Output ONLY valid JSON array, nothing else.

Example:
[
  {"question":"...","options":["...","...","...","..."],"correct_index":2,"explanation":"..."}
]

Context:
${text}`;
}

/* ========== Gemini API Caller ========== */
async function callGeminiApi(key, prompt){
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${encodeURIComponent(key)}`;
  const body = { contents: [{ parts: [{ text: prompt }]}] };

  const res = await fetch(url, {
    method:'POST',
    headers:{ 'Content-Type':'application/json' },
    body: JSON.stringify(body)
  });

  if(!res.ok){ throw new Error('Gemini API error: ' + (await res.text())); }

  const data = await res.json();
  let raw = data?.candidates?.[0]?.content?.parts?.map(p => p.text || '').join('\n') || '';
  if(!raw) raw = JSON.stringify(data);
  return raw;
}

/* ========== JSON Extractor ========== */
function extractJsonFromText(raw){
  if(!raw) return { error:'empty' };

  let cleaned = raw.replace(/```json/g,'').replace(/```/g,'').trim();
  const match = cleaned.match(/(\[[\s\S]*\])/);
  let jsonText = match ? match[0] : cleaned;

  // Fix incomplete array edge case
  if(!jsonText.trim().endsWith("]")) {
    jsonText = jsonText.trim() + "]";
  }

  try {
    const parsed = JSON.parse(jsonText);
    return { parsed: Array.isArray(parsed) ? parsed : [parsed], raw: jsonText };
  }
  catch (e){
    return { error:'parse_error', raw: jsonText, detail: e.message };
  }
}

/* ========== Main Quiz Generator ========== */
export async function generateQuiz({ key, text, numQuestions=10, language='mr', mode='generate' }){
  const apiKey = key || DEFAULT_GEMINI_KEY;
  if(!apiKey) throw new Error('No Gemini key provided');

  const prompt = (language==='mr')
    ? buildMarathiPrompt(text, numQuestions, mode)
    : buildEnglishPrompt(text, numQuestions, mode);

  const raw = await callGeminiApi(apiKey, prompt);
  const extracted = extractJsonFromText(raw);
  return { raw, extracted };
}

/* ========== Mock Generator (offline testing) ========== */
export function mockGenerate(n=5, lang='mr', mode='generate'){
  const out=[]; 
  for(let i=0;i<n;i++){ 
    out.push({
      question:`Mock Q${i+1} (${lang})`,
      options:['A','B','C','D'],
      correct_index:i%4,
      explanation:'Mock explanation'
    }); 
  }
  return { parsed: out, raw: JSON.stringify(out,null,2) };
}
