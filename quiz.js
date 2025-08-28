// quiz.js
// Rendering, collecting answers, scoring.
// Exports: renderQuizInto, collectAnswers, scoreQuiz

// Small helper to escape HTML
function escapeHtml(s) {
  if (!s && s !== 0) return '';
  return String(s).replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":"&#39;"}[ch]));
}

/**
 * renderQuizInto(container, questions, opts)
 * - container: DOM element to render into
 * - questions: array of question objects. Supports bilingual form:
 *    q.question = string OR { mr: "...", en: "..." }
 *    q.options = [string|{mr,en}|{A,B}, ... up to 4]
 *    q.correct_index = 0..3
 *    q.explanation = string or {mr,en}
 * - opts: { defaultLang: 'mr'|'en' }
 */
export function renderQuizInto(container, questions = [], opts = { defaultLang: 'mr' }) {
  container.innerHTML = '';
  if (!questions || !questions.length) {
    container.innerHTML = '<div class="text-muted p-3">No questions available</div>';
    return;
  }

  const frag = document.createDocumentFragment();

  questions.forEach((q, idx) => {
    const card = document.createElement('div');
    card.className = 'card mb-3 quiz-card';
    card.dataset.index = idx;

    const body = document.createElement('div');
    body.className = 'card-body';

    // Header row: Q number + language toggle
    const header = document.createElement('div');
    header.className = 'd-flex align-items-start mb-2';

    const qnum = document.createElement('div');
    qnum.innerHTML = `<strong>Q${idx+1}.</strong>`;
    qnum.className = 'me-3 text-primary';
    header.appendChild(qnum);

    const qtextWrap = document.createElement('div');
    qtextWrap.className = 'flex-grow-1';

    // Question text
    const defaultLang = opts.defaultLang || 'mr';
    function getQText(lang) {
      if (typeof q.question === 'string') return q.question;
      if (q.question && q.question[lang]) return q.question[lang];
      if (q.question && q.question.en) return q.question.en;
      if (q.question && q.question.mr) return q.question.mr;
      return '';
    }

    const qTextEl = document.createElement('div');
    qTextEl.className = 'question-text';
    qTextEl.dataset.lang = defaultLang;
    qTextEl.innerHTML = escapeHtml(getQText(defaultLang));
    qtextWrap.appendChild(qTextEl);

    // Language toggle if both available
    const hasMr = q.question && typeof q.question === 'object' && q.question.mr;
    const hasEn = q.question && typeof q.question === 'object' && q.question.en;
    if (hasMr && hasEn) {
      const btnGroup = document.createElement('div');
      btnGroup.className = 'btn-group btn-group-sm ms-2';
      btnGroup.innerHTML = `
        <button type="button" class="btn btn-outline-secondary ${defaultLang === 'mr' ? 'active' : ''}" data-lang="mr">MR</button>
        <button type="button" class="btn btn-outline-secondary ${defaultLang === 'en' ? 'active' : ''}" data-lang="en">EN</button>
      `;
      btnGroup.addEventListener('click', (ev) => {
        const btn = ev.target.closest('button');
        if (!btn) return;
        const lang = btn.dataset.lang;
        [...btnGroup.querySelectorAll('button')].forEach(b => b.classList.toggle('active', b === btn));
        qTextEl.dataset.lang = lang;
        qTextEl.innerHTML = escapeHtml(getQText(lang));
        // Update options text
        const optionLabels = card.querySelectorAll('.option-label');
        optionLabels.forEach((lab, i) => {
          const opt = q.options[i];
          lab.innerHTML = escapeHtml(getOptionText(opt, lang));
        });
        // Update explanation if present
        const explEl = card.querySelector('.explanation-text');
        if (explEl) {
          const expl = getExplanationText(q.explanation, lang);
          explEl.innerHTML = `<small>${escapeHtml(expl)}</small>`;
        }
      });
      qtextWrap.appendChild(btnGroup);
    }

    header.appendChild(qtextWrap);
    body.appendChild(header);

    // Helper to get option text (handles string, {mr,en}, or {A,B} formats)
    function getOptionText(opt, lang) {
      if (typeof opt === 'string') return opt;
      if (opt && opt[lang]) return opt[lang];
      if (opt && opt.en) return opt.en;
      if (opt && opt.mr) return opt.mr;
      if (opt && opt.A && opt.B) return `${opt.A} → ${opt.B}`; // For matching pairs
      return '';
    }

    // Options
    const list = document.createElement('div');
    list.className = 'list-group';

    q.options.forEach((opt, optIdx) => {
      const label = document.createElement('label');
      label.className = 'list-group-item d-flex align-items-center';
      label.style.cursor = 'pointer';
      const input = document.createElement('input');
      input.type = 'radio';
      input.name = `q_${idx}`;
      input.value = String(optIdx);
      input.className = 'me-2';
      label.appendChild(input);
      const span = document.createElement('span');
      span.className = 'option-label';
      span.innerHTML = escapeHtml(getOptionText(opt, defaultLang));
      label.appendChild(span);
      list.appendChild(label);
    });

    body.appendChild(list);

    // Explanation area (collapsible)
    function getExplanationText(expl, lang) {
      if (typeof expl === 'string') return expl;
      if (expl && expl[lang]) return expl[lang];
      if (expl && expl.en) return expl.en;
      if (expl && expl.mr) return expl.mr;
      return '';
    }

    const explWrap = document.createElement('div');
    explWrap.className = 'explanation-text collapse mt-2';
    const explText = getExplanationText(q.explanation, defaultLang);
    explWrap.innerHTML = `<small>${escapeHtml(explText)}</small>`;
    body.appendChild(explWrap);

    // Toggle explanation button
    const toggleBtn = document.createElement('button');
    toggleBtn.className = 'btn btn-link btn-sm text-decoration-none mt-2';
    toggleBtn.textContent = 'Show Explanation';
    toggleBtn.addEventListener('click', () => {
      const isVisible = explWrap.classList.contains('show');
      explWrap.classList.toggle('show');
      toggleBtn.textContent = isVisible ? 'Show Explanation' : 'Hide Explanation';
    });
    body.appendChild(toggleBtn);

    card.appendChild(body);
    frag.appendChild(card);
  });

  container.appendChild(frag);

  // Attach change listener to update progress
  container.addEventListener('change', () => updateQuizProgress(container));
  updateQuizProgress(container);
}

/* Collect answers from container and return array of selected indexes or null */
export function collectAnswers(container) {
  const cards = container.querySelectorAll('.card');
  const answers = [];
  cards.forEach((card, idx) => {
    const checked = card.querySelector(`input[name="q_${idx}"]:checked`);
    answers.push(checked ? Number(checked.value) : null);
  });
  return answers;
}

/**
 * scoreQuiz(questions, answers, opts)
 * - questions: array of normalized questions (with correct_index)
 * - answers: array of user-selected indices (or null)
 * - opts: { negativeMark: boolean, negValue: number }
 * Returns: { score, total, results: [{index, ok, user, explanation}] }
 */
export function scoreQuiz(questions, answers = null, opts = { negativeMark: false, negValue: 0 }) {
  const total = (questions || []).length;
  if (!answers) answers = []; // Try to collect externally
  const results = [];
  let score = 0;

  for (let i = 0; i < total; i++) {
    const q = questions[i];
    const user = answers[i] === undefined ? null : answers[i];
    const ok = (user !== null && user !== undefined) && (user === q.correct_index);
    if (ok) score += 1;
    else if (opts.negativeMark && user !== null && user !== undefined) {
      score -= (Number(opts.negValue) || 0);
    }
    results.push({ index: i, ok, user, explanation: q.explanation });
  }

  // Clamp negative to two decimals
  score = Number((Math.max(score, 0) + 0).toFixed(2));
  return { score, total, results };
}

function updateQuizProgress(container) {
  const total = container.querySelectorAll('.card').length;
  const answered = Array.from(container.querySelectorAll('input[type=radio]')).filter(i => i.checked).length;
  const label = document.getElementById('quizProgressLabel');
  if (label) label.textContent = `${answered} / ${total}`;
}

export default {
  renderQuizInto,
  collectAnswers,
  scoreQuiz
};