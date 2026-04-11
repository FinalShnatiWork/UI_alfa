const OVERLAY_ID = 'broker-reason-modal';

function ensureOverlay() {
  let overlay = document.getElementById(OVERLAY_ID);
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = OVERLAY_ID;
    overlay.className = 'confirm-modal-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-labelledby', 'broker-reason-modal-title');
    overlay.innerHTML = `
      <div class="confirm-modal-dialog card">
        <p class="confirm-modal-message" id="broker-reason-modal-title"></p>
        <textarea class="input" id="broker-reason-modal-input" rows="3" style="width:100%; resize: vertical; margin: 0 0 18px;" maxlength="500"></textarea>
        <div class="confirm-modal-actions">
          <button type="button" class="btn btn-outline-dark reason-modal-cancel"></button>
          <button type="button" class="btn btn-danger reason-modal-ok"></button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
    overlay.setAttribute('hidden', '');
  }
  return overlay;
}

/**
 * @param {{ title: string, placeholder?: string, okLabel: string, cancelLabel: string, defaultValue?: string }} opts
 * @returns {Promise<{ ok: boolean, value: string }>}
 */
export function showReasonModal(opts) {
  const { title, placeholder = '', okLabel, cancelLabel, defaultValue = '' } = opts;
  return new Promise((resolve) => {
    const overlay = ensureOverlay();
    const titleEl = overlay.querySelector('#broker-reason-modal-title');
    const input = overlay.querySelector('#broker-reason-modal-input');
    const btnOk = overlay.querySelector('.reason-modal-ok');
    const btnCancel = overlay.querySelector('.reason-modal-cancel');

    titleEl.textContent = title;
    input.value = defaultValue;
    input.placeholder = placeholder;
    btnOk.textContent = okLabel;
    btnCancel.textContent = cancelLabel;

    let settled = false;
    const ac = new AbortController();
    const { signal } = ac;

    const finish = (ok) => {
      if (settled) return;
      settled = true;
      ac.abort();
      overlay.setAttribute('hidden', '');
      document.documentElement.classList.remove('confirm-modal-open');
      resolve({ ok, value: String(input.value || '').trim() });
    };

    overlay.removeAttribute('hidden');
    document.documentElement.classList.add('confirm-modal-open');

    overlay.addEventListener(
      'click',
      (ev) => {
        if (ev.target === overlay) finish(false);
      },
      { signal }
    );

    document.addEventListener(
      'keydown',
      (ev) => {
        if (ev.key === 'Escape') {
          ev.preventDefault();
          finish(false);
        }
        if ((ev.ctrlKey || ev.metaKey) && ev.key === 'Enter') {
          ev.preventDefault();
          finish(true);
        }
      },
      { signal }
    );

    btnOk.addEventListener('click', () => finish(true), { signal });
    btnCancel.addEventListener('click', () => finish(false), { signal });

    requestAnimationFrame(() => {
      input.focus();
      input.setSelectionRange(input.value.length, input.value.length);
    });
  });
}

