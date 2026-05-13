/**
 * LastBrowser — Sidebar Script
 *
 * Handles navigation, server status polling, and quick actions
 * for the native sidebar overlay window.
 */
(function () {
  'use strict';

  // ── State ───────────────────────────────────────────────────────────────
  let activeRoute = 'chat';
  const navButtons = document.querySelectorAll('.nav-item');
  const statusDot = document.getElementById('statusDot');
  const statusLabel = document.getElementById('statusLabel');

  // ── Navigation ──────────────────────────────────────────────────────────
  function switchRoute(route) {
    activeRoute = route;
    navButtons.forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.route === route);
    });

    // Tell the main window to switch panels
    if (window.hermes) {
      window.hermes.navigate(route);
    }
  }

  navButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      switchRoute(btn.dataset.route);
    });
  });

  // Keyboard shortcuts: Cmd/Ctrl+1-8 for nav
  document.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key >= '1' && e.key <= '8') {
      const idx = parseInt(e.key) - 1;
      const btns = Array.from(navButtons);
      if (btns[idx]) {
        e.preventDefault();
        switchRoute(btns[idx].dataset.route);
      }
    }
  });

  // ── Server Status Polling ───────────────────────────────────────────────
  async function pollServerStatus() {
    try {
      if (window.hermes) {
        const status = await window.hermes.serverStatus();
        if (status.running) {
          statusDot.className = 'status-dot online';
          statusLabel.textContent = 'Server running';
        } else {
          statusDot.className = 'status-dot offline';
          statusLabel.textContent = 'Server offline';
        }
      } else {
        // Fallback: direct HTTP check
        const resp = await fetch('http://127.0.0.1:8787/health');
        if (resp.ok) {
          statusDot.className = 'status-dot online';
          statusLabel.textContent = 'Server running';
        } else {
          throw new Error('not ok');
        }
      }
    } catch {
      statusDot.className = 'status-dot offline';
      statusLabel.textContent = 'Server offline';
    }
  }

  // Poll every 10s
  setInterval(pollServerStatus, 10000);
  pollServerStatus();

  // ── Quick Actions ───────────────────────────────────────────────────────
  document.getElementById('openExternalBtn')?.addEventListener('click', () => {
    // Use Electron shell to open in default browser
    if (window.hermes) {
      const a = document.createElement('a');
      a.href = 'http://127.0.0.1:8787';
      a.target = '_blank';
      a.rel = 'noopener';
      a.click();
    } else {
      window.open('http://127.0.0.1:8787', '_blank');
    }
  });

  document.getElementById('restartServerBtn')?.addEventListener('click', async () => {
    statusDot.className = 'status-dot connecting';
    statusLabel.textContent = 'restarting...';
    if (window.hermes) {
      await window.hermes.serverRestart();
    }
    setTimeout(pollServerStatus, 2000);
  });

  document.getElementById('quitBtn')?.addEventListener('click', () => {
    if (window.hermes) {
      window.hermes.close();
    }
  });

  // ── Version Display ─────────────────────────────────────────────────────
  if (window.hermes) {
    window.hermes.getVersion().then((ver) => {
      const el = document.createElement('div');
      el.className = 'sidebar-version';
      el.textContent = `v${ver}`;
      document.querySelector('.sidebar-footer')?.appendChild(el);
    }).catch(() => {});
  }

  console.log('[sidebar] LastBrowser Sidebar initialized');
})();
