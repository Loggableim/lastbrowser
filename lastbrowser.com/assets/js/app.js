/**
 * Lastbrowser Web Platform - Main Application Logic
 * Zero Telemetry · High Performance · 100% Local-First
 */

document.addEventListener('DOMContentLoaded', function() {
  // --- 1. Mobile Menu Drawer ---
  var mobileToggle = document.querySelector('.mobile-toggle');
  var mobileDrawer = document.querySelector('.mobile-drawer');
  if (mobileToggle && mobileDrawer) {
    mobileToggle.addEventListener('click', function() {
      mobileDrawer.classList.toggle('open');
      mobileToggle.setAttribute('aria-expanded', mobileDrawer.classList.contains('open'));
    });
  }

  // --- 2. Language Picker Dropdown ---
  var langPickers = document.querySelectorAll('.lang-picker');
  langPickers.forEach(function(picker) {
    var btn = picker.querySelector('.lang-btn');
    var menu = picker.querySelector('.lang-menu');
    if (btn && menu) {
      btn.addEventListener('click', function(e) {
        e.stopPropagation();
        menu.classList.toggle('open');
      });
      menu.querySelectorAll('a').forEach(function(item) {
        item.addEventListener('click', function() {
          var chosenLang = item.getAttribute('data-lang');
          if (chosenLang) {
            localStorage.setItem('preferred_lang', chosenLang);
          }
        });
      });
    }
  });

  document.addEventListener('click', function() {
    document.querySelectorAll('.lang-menu.open').forEach(function(menu) {
      menu.classList.remove('open');
    });
  });

  // --- 3. Interactive Screenshot Showcase ---
  var scBtns = document.querySelectorAll('.sc-btn');
  var scImg = document.getElementById('showcase-image');
  var scTitle = document.getElementById('showcase-title');
  var scDesc = document.getElementById('showcase-desc');

  if (scBtns.length > 0 && scImg) {
    scBtns.forEach(function(btn) {
      btn.addEventListener('click', function() {
        scBtns.forEach(function(b) { b.classList.remove('active'); });
        btn.classList.add('active');

        var newSrc = btn.getAttribute('data-img');
        var newTitle = btn.getAttribute('data-title');
        var newDesc = btn.getAttribute('data-desc');

        scImg.classList.add('fade-out');
        setTimeout(function() {
          scImg.src = newSrc;
          if (scTitle && newTitle) scTitle.textContent = newTitle;
          if (scDesc && newDesc) scDesc.textContent = newDesc;
          scImg.classList.remove('fade-out');
        }, 200);
      });
    });
  }

  // --- 4. Lightbox Modal ---
  var lightbox = document.getElementById('lightbox-modal');
  var lightboxImg = document.getElementById('lightbox-img');
  if (lightbox && lightboxImg) {
    document.querySelectorAll('.zoomable-img, .showcase-view img').forEach(function(img) {
      img.addEventListener('click', function() {
        lightboxImg.src = img.currentSrc || img.src;
        lightbox.classList.add('open');
      });
    });

    lightbox.addEventListener('click', function(e) {
      if (e.target === lightbox || e.target.classList.contains('modal-close') || e.target.closest('.modal-close')) {
        lightbox.classList.remove('open');
      }
    });
  }

  // --- 5. Windows SmartScreen Modal ---
  var smartScreenModal = document.getElementById('smartscreen-modal');
  var openSmartScreenBtns = document.querySelectorAll('.open-smartscreen-modal');
  if (smartScreenModal) {
    openSmartScreenBtns.forEach(function(btn) {
      btn.addEventListener('click', function(e) {
        e.preventDefault();
        smartScreenModal.classList.add('open');
      });
    });

    smartScreenModal.addEventListener('click', function(e) {
      if (e.target === smartScreenModal || e.target.classList.contains('modal-close') || e.target.closest('.modal-close')) {
        smartScreenModal.classList.remove('open');
      }
    });
  }

  // --- 6. Waitlist Modal (Non-Windows Visitors) ---
  var waitlistModal = document.getElementById('waitlist-modal');
  var openWaitlistBtns = document.querySelectorAll('.open-waitlist-modal');
  if (waitlistModal) {
    openWaitlistBtns.forEach(function(btn) {
      btn.addEventListener('click', function(e) {
        e.preventDefault();
        waitlistModal.classList.add('open');
      });
    });

    waitlistModal.addEventListener('click', function(e) {
      if (e.target === waitlistModal || e.target.classList.contains('modal-close') || e.target.closest('.modal-close')) {
        waitlistModal.classList.remove('open');
      }
    });
  }

  // --- 7. Sticky Floating Download Bar ---
  var floatingBar = document.querySelector('.floating-bar');
  if (floatingBar) {
    var checkScroll = function() {
      if (window.scrollY > 600) {
        floatingBar.classList.add('visible');
      } else {
        floatingBar.classList.remove('visible');
      }
    };
    window.addEventListener('scroll', checkScroll, { passive: true });
    checkScroll();
  }

  // --- 8. Code & Checksum Copy Buttons ---
  document.querySelectorAll('.copy-btn').forEach(function(btn) {
    btn.addEventListener('click', function() {
      var targetId = btn.getAttribute('data-target');
      var textToCopy = '';
      if (targetId) {
        var targetEl = document.getElementById(targetId);
        if (targetEl) textToCopy = targetEl.textContent.trim();
      } else if (btn.getAttribute('data-copy')) {
        textToCopy = btn.getAttribute('data-copy');
      }

      if (textToCopy) {
        navigator.clipboard.writeText(textToCopy).then(function() {
          var originalText = btn.innerHTML;
          btn.innerHTML = '✓ Kopiert';
          btn.classList.add('copied');
          setTimeout(function() {
            btn.innerHTML = originalText;
            btn.classList.remove('copied');
          }, 2200);
        });
      }
    });
  });

  // --- 9. Smart OS Detection on Download Page ---
  var winDownloadBtn = document.getElementById('hero-win-download');
  var osNotice = document.getElementById('hero-os-notice');
  if (winDownloadBtn) {
    var ua = navigator.userAgent || '';
    var isWin = /Windows/i.test(ua);
    var isMac = /Macintosh|Mac OS X/i.test(ua);
    var isLinux = /Linux/i.test(ua) && !/Android/i.test(ua);

    if (isMac || isLinux) {
      if (osNotice) {
        osNotice.innerHTML = 'Hinweis: Du besuchst uns von ' + (isMac ? 'macOS' : 'Linux') + '. Lastbrowser ist aktuell nativ optimiert für <strong>Windows 10 & 11 (64-Bit)</strong>.';
      }
    }
  }

  // --- 10. Filterable Feature Matrix ---
  var filterBtns = document.querySelectorAll('.filter-btn');
  var featureRows = document.querySelectorAll('.matrix-row');
  if (filterBtns.length > 0 && featureRows.length > 0) {
    filterBtns.forEach(function(btn) {
      btn.addEventListener('click', function() {
        filterBtns.forEach(function(b) { b.classList.remove('active'); });
        btn.classList.add('active');
        var category = btn.getAttribute('data-category');

        featureRows.forEach(function(row) {
          if (category === 'all' || row.getAttribute('data-category') === category) {
            row.style.display = '';
          } else {
            row.style.display = 'none';
          }
        });
      });
    });
  }
});
