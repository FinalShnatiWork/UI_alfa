const API = 'http://localhost:8080/api';

const COLOR_NAMES = {
  '#F7A600': 'Gold',
  '#3B82F6': 'Blue',
  '#17C784': 'Green',
  '#6D5EF7': 'Purple',
  '#F6465D': 'Red',
  '#22D3EE': 'Cyan',
};

let selectedColor = '#F7A600';
let selectedTheme = 'dark';

function applyAccentColor(color) {
  document.documentElement.style.setProperty('--accent', color);
  document.documentElement.style.setProperty('--accent-strong', color + 'CC');
  // Update selected label
  const label = document.getElementById('selectedColorLabel');
  if (label) {
    label.textContent = COLOR_NAMES[color] || color;
    label.style.color = color;
  }
  // Update swatch selection
  document.querySelectorAll('.color-swatch').forEach(sw => {
    sw.classList.toggle('selected', sw.dataset.color === color);
  });
  selectedColor = color;
}

function saveToLocalStorage() {
  localStorage.setItem('pref_accent_color', selectedColor);
  localStorage.setItem('pref_theme', selectedTheme);
}

async function saveToDB() {
  const token = localStorage.getItem('authToken');
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = 'Bearer ' + token;

  const prefs = [
    { key: 'accent_color', value: selectedColor },
    { key: 'theme', value: selectedTheme },
  ];

  let saved = true;
  for (const p of prefs) {
    try {
      const res = await fetch(API + '/broker/preferences', {
        method: 'PUT',
        credentials: 'include',
        headers,
        body: JSON.stringify(p)
      });
      if (!res.ok) saved = false;
    } catch { saved = false; }
  }
  return saved;
}

async function loadPreferences() {
  const localColor = localStorage.getItem('pref_accent_color');
  const localTheme = localStorage.getItem('pref_theme');
  if (localColor) applyAccentColor(localColor);
  if (localTheme) {
    selectedTheme = localTheme;
    const sel = document.getElementById('themeSelect');
    if (sel) sel.value = localTheme;
  }

  // Try to load from DB (overrides localStorage if available)
  try {
    const token = localStorage.getItem('authToken');
    const headers = token ? { 'Authorization': 'Bearer ' + token } : {};
    const res = await fetch(API + '/broker/preferences', { credentials: 'include', headers });
    if (res.ok) {
      const prefs = await res.json();
      if (prefs.accent_color) applyAccentColor(prefs.accent_color);
      if (prefs.theme) {
        selectedTheme = prefs.theme;
        const sel = document.getElementById('themeSelect');
        if (sel) sel.value = prefs.theme;
      }
    }
  } catch { /* backend offline - use localStorage */ }
}

// Global function to apply color on any page load
window.applyUserPreferences = function () {
  const color = localStorage.getItem('pref_accent_color');
  if (color) {
    document.documentElement.style.setProperty('--accent', color);
    document.documentElement.style.setProperty('--accent-strong', color + 'CC');
  }
};

document.addEventListener('DOMContentLoaded', async () => {
  await loadPreferences();

  document.querySelectorAll('.color-swatch').forEach(sw => {
    sw.addEventListener('click', () => applyAccentColor(sw.dataset.color));
  });

  document.getElementById('themeSelect').addEventListener('change', (e) => {
    selectedTheme = e.target.value;
  });

  document.getElementById('saveAppearanceBtn').addEventListener('click', async () => {
    saveToLocalStorage();
    const msgEl = document.getElementById('savePrefMsg');
    const savedDB = await saveToDB();
    msgEl.style.display = 'block';
    if (savedDB) {
      msgEl.textContent = '✓ Appearance settings saved to your account.';
      msgEl.style.color = 'var(--green)';
    } else {
      msgEl.textContent = '✓ Saved locally (sign in to sync with your account).';
      msgEl.style.color = 'var(--amber)';
    }
    setTimeout(() => { msgEl.style.display = 'none'; }, 3000);
  });
});
