/**
 * Twilio ↔ Jaiminho Carousel Builder
 * A tool to convert between Twilio and Jaiminho carousel message formats
 */

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Extracts variables from a string that match the pattern {{variable}}
 * @param {string} str - The string to extract variables from
 * @param {Object} seen - Object to track seen variables
 * @param {Array} order - Array to maintain variable order
 */
function extractVars(str, seen, order) {
  if (typeof str !== 'string') return;
  const re = /{{\s*([^{}]+?)\s*}}/g;
  let m;
  while ((m = re.exec(str)) !== null) {
    const v = m[1];
    if (!(v in seen)) {
      seen[v] = true;
      order.push(v);
    }
  }
}

/**
 * Replaces variables in a string with numbered versions
 * @param {string} str - The string to process
 * @param {Object} map - Map of variable names to numbers
 * @returns {string} The processed string
 */
function replaceNums(str, map) {
  return typeof str === 'string'
    ? str.replace(/{{\s*([^{}]+?)\s*}}/g, (_, p) => `{{${map[p] ?? p}}}`)
    : str;
}

/**
 * Creates an action object for a card button
 * @param {string} type - Action type (URL or QUICK_REPLY)
 * @param {string} title - Button title
 * @param {string} val - URL or ID value
 * @returns {Object} Action object
 */
function makeAction(type, title, val) {
  return type === 'URL' ? { type, title, url: val } : { type, title, id: val };
}

// ============================================================================
// Card Management
// ============================================================================

let cardSeq = 0;

/**
 * Adds a new card to the carousel
 * @param {Object} d - Card data object
 */
function addCard(d = {}) {
  cardSeq++;
  const w = document.createElement('div');
  w.className = 'card-block';
  w.innerHTML = `
    <h3>Card #${cardSeq}</h3>
    <button class="delete-card" type="button">🗑️</button>

    <label>Body</label>
    <textarea class="c-body" rows="4">${d.body || ''}</textarea>

    <label>Media URL</label>
    <input class="c-media" value="${d.media || ''}">

    <label>Title (optional)</label>
    <input class="c-title" value="${d.title || ''}">

    <h4>Action 1</h4>
      <select class="a1-type"><option>URL</option><option>QUICK_REPLY</option></select>
      <input  class="a1-title" placeholder="Button title" value="${d.actions?.[0]?.title || ''}">
      <input  class="a1-val"   placeholder="URL or ID"   value="${d.actions?.[0]?.url || d.actions?.[0]?.id || ''}">

    <h4>Action 2</h4>
      <select class="a2-type"><option>URL</option><option>QUICK_REPLY</option></select>
      <input  class="a2-title" placeholder="Button title" value="${d.actions?.[1]?.title || ''}">
      <input  class="a2-val"   placeholder="URL or ID"   value="${d.actions?.[1]?.url || d.actions?.[1]?.id || ''}">
  `;

  if (d.actions) {
    w.querySelector('.a1-type').value = d.actions[0]?.type || 'URL';
    w.querySelector('.a2-type').value = d.actions[1]?.type || 'URL';
  }

  w.querySelector('.delete-card').onclick = () => w.remove();
  document.getElementById('cards-container').appendChild(w);
}

// ============================================================================
// Template Management
// ============================================================================

/**
 * Collects all template data from the form
 * @returns {Object} Template data object
 */
function collectTemplate() {
  const friendly = document.getElementById('friendly').value.trim();
  const body = document.getElementById('body').value.trim();

  const seen = {},
    order = [];
  extractVars(body, seen, order);

  const cards = [...document.querySelectorAll('.card-block')]
    .map((b) => {
      const cBody = b.querySelector('.c-body').value.trim();
      if (!cBody) return null;
      const media = b.querySelector('.c-media').value.trim() || null;
      const cTitle = b.querySelector('.c-title').value.trim() || null;

      const acts = [1, 2].map((n) => ({
        type: b.querySelector(`.a${n}-type`).value,
        title: b.querySelector(`.a${n}-title`).value.trim(),
        val: b.querySelector(`.a${n}-val`).value.trim(),
      }));

      extractVars(media, seen, order);
      extractVars(cBody, seen, order);
      extractVars(cTitle, seen, order);
      acts.forEach((a) => {
        extractVars(a.val, seen, order);
        extractVars(a.title, seen, order);
      });

      return {
        body: cBody,
        media,
        title: cTitle,
        actions: acts.map((a) => makeAction(a.type, a.title, a.val)),
      };
    })
    .filter(Boolean);

  return { friendly, body, cards, variables: order };
}

// ============================================================================
// JSON Builders
// ============================================================================

/**
 * Builds Twilio JSON format
 * @param {boolean} numbered - Whether to number the variables
 * @returns {Object} Twilio JSON object
 */
function buildTwilioJson(numbered = false) {
  const { friendly, body, cards, variables } = collectTemplate();
  const map = {};
  variables.forEach((v, i) => (map[v] = i + 1));
  const swap = (s) => replaceNums(s, map);

  const cardsOut = cards.map((c) => ({
    media: numbered ? swap(c.media) : c.media,
    body: numbered ? swap(c.body) : c.body,
    title: numbered ? swap(c.title) : c.title,
    actions: c.actions.map((a) => {
      const o = { type: a.type, title: numbered ? swap(a.title) : a.title };
      if (a.type === 'URL') o.url = numbered ? swap(a.url) : a.url;
      else o.id = numbered ? swap(a.id) : a.id;
      return o;
    }),
  }));

  const varsObj = {};
  variables.forEach((v, i) => {
    varsObj[i + 1] = v;
  });

  return {
    friendlyName: friendly || undefined,
    language: 'pt_BR',
    types: {
      'twilio/carousel': Object.assign(
        { body: numbered ? swap(body) : body },
        cardsOut.length ? { cards: cardsOut } : {}
      ),
    },
    variables: varsObj,
  };
}

/**
 * Builds Jaiminho JSON format
 * @returns {Object} Jaiminho JSON object
 */
function buildJaiminhoJson() {
  const { friendly, body, cards, variables } = collectTemplate();
  const samples = variables.map((v) => ({ [v]: '' }));

  const jCards = cards.map((c) => ({
    mediaUrl: c.media,
    contents: [{ locale: 'pt-BR', body: c.body }],
    buttons: c.actions.map((a) =>
      a.type === 'URL'
        ? {
            type: 'call_to_action',
            url: a.url,
            contents: [{ locale: 'pt-BR', label: a.title }],
          }
        : {
            type: 'quick_reply',
            identifier: a.id,
            contents: [{ locale: 'pt-BR', label: a.title }],
          }
    ),
  }));

  return {
    category: 'UTILITY',
    type: 'carrousel',
    'pt-BR': {
      forno: 'HX_FORNO_ASSET_SID',
      staging: 'HX_STAGING_ASSET_SID',
      prod: 'HX_PROD_ASSET_SID',
    },
    samples,
    contents: [{ locale: 'pt-BR', content: body }],
    cards: jCards,
    friendlyName: friendly || undefined,
  };
}

// ============================================================================
// UI Helpers
// ============================================================================

const out = document.getElementById('output');

/**
 * Displays JSON in the output area
 * @param {Object} obj - Object to display
 */
function show(obj) {
  out.value = JSON.stringify(obj, null, 2).replace(/\\\\n/g, '\\n');
}

// ============================================================================
// Template Library
// ============================================================================

const LS = 'twilioCarouselTemplates';
const read = () => JSON.parse(localStorage.getItem(LS) || '{}');
const write = (l) => localStorage.setItem(LS, JSON.stringify(l));

/**
 * Refreshes the template list in the UI
 */
function refreshLib() {
  const sel = document.getElementById('tpl-list');
  sel.innerHTML = '';
  Object.keys(read()).forEach((k) => {
    const o = document.createElement('option');
    o.textContent = k;
    sel.appendChild(o);
  });
}

// ============================================================================
// Event Listeners
// ============================================================================

// Card management
document.getElementById('add-card').onclick = () => addCard();

// JSON generation
document.getElementById('generate').onclick = () => show(buildTwilioJson(false));
document.getElementById('generate-numbered').onclick = () => show(buildTwilioJson(true));
document.getElementById('generate-jaiminho').onclick = () => show(buildJaiminhoJson());

// Download
document.getElementById('download').onclick = () => {
  if (!out.value) return;
  const blob = new Blob([out.value], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'template.json';
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
};

// Import
document.getElementById('import-btn').onclick = () => {
  const raw = document.getElementById('import-json').value.trim();
  if (!raw) return;
  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    alert('Invalid JSON');
    return;
  }
  const car = data.types?.['twilio/carousel'];
  if (!car) {
    alert('No "twilio/carousel" in pasted JSON');
    return;
  }

  document.getElementById('friendly').value = data.friendlyName || '';
  document.getElementById('body').value = car.body || '';
  document.getElementById('cards-container').innerHTML = '';
  cardSeq = 0;

  (car.cards || []).forEach((cd) => {
    const acts = (cd.actions || []).map((a) =>
      a.type === 'URL'
        ? { type: 'URL', title: a.title, url: a.url }
        : { type: 'QUICK_REPLY', title: a.title, id: a.id }
    );
    addCard({ body: cd.body, media: cd.media, title: cd.title, actions: acts });
  });
  out.value = '';
};

// Template library
document.getElementById('tpl-save').onclick = () => {
  const name = prompt('Template name?');
  if (!name) return;
  const lib = read();
  lib[name] = collectTemplate();
  write(lib);
  refreshLib();
};

document.getElementById('tpl-load').onclick = () => {
  const name = document.getElementById('tpl-list').value;
  if (!name) return;
  const tpl = read()[name];
  if (!tpl) return;
  document.getElementById('friendly').value = tpl.friendly || '';
  document.getElementById('body').value = tpl.body || '';
  document.getElementById('cards-container').innerHTML = '';
  cardSeq = 0;
  (tpl.cards || []).forEach(addCard);
  out.value = '';
};

document.getElementById('tpl-delete').onclick = () => {
  const name = document.getElementById('tpl-list').value;
  if (!name) return;
  if (!confirm(`Delete template "${name}"?`)) return;
  const lib = read();
  delete lib[name];
  write(lib);
  refreshLib();
};

// Initialize template library
refreshLib(); 