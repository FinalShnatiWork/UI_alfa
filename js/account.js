document.addEventListener('DOMContentLoaded', () => {
  console.log('Account loaded');

  // Simulate fetching user profile
  const mockUser = {
    uid: "USR-" + Math.floor(Math.random() * 100000),
    name: "John Doe",
    // In a real app, the server would encrypt the base64 Secret Key and send this ciphertext
    encryptedKey: "U2FsdGVkX1" + btoa(Math.random().toString()).substring(0, 30) + "=="
  };

  const nameEl = document.getElementById('account-name');
  if(nameEl) nameEl.textContent = mockUser.name;

  const uidEl = document.getElementById('account-uid');
  if(uidEl) uidEl.textContent = `UID: ${mockUser.uid}`;

  const encryptedEl = document.getElementById('encrypted-secret-key');
  if(encryptedEl) {
    encryptedEl.textContent = mockUser.encryptedKey;
    encryptedEl.style.color = "var(--primary, #00c8ff)";
  }
});
