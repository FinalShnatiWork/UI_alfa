const OVERLAY_ID = 'broker-confirm-modal';

function ensureOverlay() {
  let overlay = document.getElementById(OVERLAY_ID);
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = OVERLAY_ID;
    overlay.className = 'confirm-modal-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-labelledby', 'broker-confirm-modal-msg');
    overlay.innerHTML = `
      <div class="confirm-modal-dialog card">
        <p class="confirm-modal-message" id="broker-confirm-modal-msg"></p>
        <div class="confirm-modal-actions">
          <button type="button" class="btn btn-outline-dark confirm-modal-cancel"></button>
          <button type="button" class="btn btn-primary confirm-modal-ok"></button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
    overlay.setAttribute('hidden', '');
  }
  return overlay;
}

/**
 * @param {{ message: string, confirmLabel: string, cancelLabel: string }} opts
 * @returns {Promise<boolean>} true = confirm, false = cancel / backdrop / Escape
 */
export function showConfirmModal(opts) {
  const { message, confirmLabel, cancelLabel } = opts;

  return new Promise((resolve) => {
    const overlay = ensureOverlay();
    const msgEl = overlay.querySelector('.confirm-modal-message');
    const btnOk = overlay.querySelector('.confirm-modal-ok');
    const btnCancel = overlay.querySelector('.confirm-modal-cancel');

    msgEl.textContent = message;
    btnOk.textContent = confirmLabel;
    btnCancel.textContent = cancelLabel;

    let settled = false;
    const ac = new AbortController();
    const { signal } = ac;

    const finish = (value) => {
      if (settled) return;
      settled = true;
      ac.abort();
      overlay.setAttribute('hidden', '');
      document.documentElement.classList.remove('confirm-modal-open');
      resolve(value);
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
      },
      { signal }
    );

    btnOk.addEventListener('click', () => finish(true), { signal });
    btnCancel.addEventListener('click', () => finish(false), { signal });

    requestAnimationFrame(() => {
      btnOk.focus();
    });
  });
}
