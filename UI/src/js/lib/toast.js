const CONTAINER_ID = 'broker-toast-root';

/** Cancels auto-hide timers so removed toasts do not fire callbacks later. */
const cancelAutoHide = new WeakMap();

function ensureContainer() {
  let el = document.getElementById(CONTAINER_ID);
  if (!el) {
    el = document.createElement('div');
    el.id = CONTAINER_ID;
    el.className = 'toast-container';
    el.setAttribute('aria-live', 'polite');
    document.body.appendChild(el);
  }
  return el;
}

/** Removes any visible toast so only one message can show at a time. */
function clearAllToasts() {
  const el = document.getElementById(CONTAINER_ID);
  if (!el) return;
  el.querySelectorAll('.toast').forEach((t) => {
    const cancel = cancelAutoHide.get(t);
    if (cancel) cancel();
    cancelAutoHide.delete(t);
    t.remove();
  });
  if (!el.children.length) {
    el.remove();
  }
}

/**
 * @param {string} message
 * @param {{ variant?: 'info' | 'success' | 'warning' | 'error', duration?: number }} [options]
 */
export function showToast(message, options = {}) {
  const variant = options.variant ?? 'info';
  const duration = options.duration ?? 4200;

  clearAllToasts();
  const container = ensureContainer();
  const toast = document.createElement('div');
  toast.className = `toast toast--${variant}`;
  toast.setAttribute('role', 'status');
  toast.textContent = message;

  let dismissed = false;
  let timer;

  const remove = () => {
    if (dismissed) return;
    dismissed = true;
    if (timer) clearTimeout(timer);
    toast.classList.remove('toast--visible');
    toast.classList.add('toast--out');
    const done = () => {
      cancelAutoHide.delete(toast);
      toast.remove();
      if (!container.children.length) {
        container.remove();
      }
    };
    toast.addEventListener('transitionend', done, { once: true });
    setTimeout(done, 320);
  };

  container.appendChild(toast);
  requestAnimationFrame(() => {
    requestAnimationFrame(() => toast.classList.add('toast--visible'));
  });

  timer = setTimeout(remove, duration);
  cancelAutoHide.set(toast, () => {
    if (timer) clearTimeout(timer);
  });
  toast.addEventListener('click', remove, { once: true });

  return toast;
}
