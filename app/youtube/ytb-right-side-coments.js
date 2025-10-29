// ==UserScript==
// @name         YouTube Right-Side Comments
// @namespace    http://tampermonkey.net/
// @version      1.0.0
// @description  Move YouTube comments to right sidebar with full-width, modern YouTube-style tabs (Videos / Comments)
// @include   *://*.youtube.com/**
// @exclude   *://accounts.youtube.com/*
// @exclude   *://www.youtube.com/live_chat_replay*
// @exclude   *://www.youtube.com/persist_identity*
// @grant        GM_addStyle
// ==/UserScript==

(function () {
  'use strict';

  // === CSS is unchanged ===
  GM_addStyle(`
    #yt-right-toggle-header {
      display: flex;
      width: 100%;
      border-bottom: 1px solid var(--yt-spec-10-percent-layer);
      background-color: var(--yt-spec-base-background);
      font-family: "Roboto", "Arial", sans-serif;
      position: sticky;
      top: 0;
      z-index: 10;
    }

    #yt-right-toggle-header button {
      flex: 1;
      border: none;
      background: none;
      color: var(--yt-spec-text-secondary);
      font-size: 15px;
      font-weight: 500;
      padding: 10px 0;
      text-align: center;
      cursor: pointer;
      transition: background-color 0.25s ease, color 0.25s ease;
      border-radius: 10px;
    }

    #yt-right-toggle-header button:hover {
      background-color: var(--yt-spec-badge-chip-background);
      color: var(--yt-spec-text-primary);
    }

    #yt-right-toggle-header button.active {
      background-color: var(--yt-spec-10-percent-layer);
      color: var(--yt-spec-text-primary);
      font-weight: 600;
    }

    #right-comments-container {
      display: none;
      overflow-y: auto;
      max-height: calc(100vh - 150px);
      padding-right: 6px;
      scrollbar-width: thin;
    }

    #right-comments-container::-webkit-scrollbar {
      width: 6px;
    }

    #right-comments-container::-webkit-scrollbar-thumb {
      background-color: var(--yt-spec-outline);
      border-radius: 3px;
    }
  `);

  /**
   * OPTIMIZATION: Cached the '#secondary-inner' query.
   * This element is now found once instead of on every click.
   */
  function createToggleButtons(sidebar, commentsContainer) {
    if (sidebar.querySelector('#yt-right-toggle-header')) return;

    // Cache the video list container
    const secondaryInner = sidebar.querySelector('#secondary-inner');
    if (!secondaryInner) {
      console.warn("YT-Comments-Right: Could not find #secondary-inner.");
      return;
    }

    const header = document.createElement('div');
    header.id = 'yt-right-toggle-header';

    const btnVideos = document.createElement('button');
    btnVideos.textContent = 'Videos';
    const btnComments = document.createElement('button');
    btnComments.textContent = 'Comments';

    btnVideos.classList.add('active');

    btnVideos.onclick = () => {
      secondaryInner.style.display = 'block'; // Use cached variable
      commentsContainer.style.display = 'none';
      btnVideos.classList.add('active');
      btnComments.classList.remove('active');
    };

    btnComments.onclick = () => {
      secondaryInner.style.display = 'none'; // Use cached variable
      commentsContainer.style.display = 'block';
      btnComments.classList.add('active');
      btnVideos.classList.remove('active');
    };

    header.append(btnVideos, btnComments);
    sidebar.prepend(header);
  }

  /**
   * Main function to move comments.
   * Returns `true` on success, `false` if elements aren't ready.
   */
  function moveComments() {
    const sidebar = document.querySelector('#secondary');
    const comments = document.querySelector('#comments');

    // Guard: Elements not ready or already moved
    if (!sidebar || !comments || comments.dataset.moved) {
      return false;
    }

    // --- Perform the move ---
    const commentsContainer = document.createElement('div');
    commentsContainer.id = 'right-comments-container';
    commentsContainer.appendChild(comments);
    comments.dataset.moved = 'true'; // Mark as moved

    sidebar.appendChild(commentsContainer);
    createToggleButtons(sidebar, commentsContainer);

    return true; // Signal success
  }

  /**
   * OPTIMIZATION: Replaced the inefficient body observer.
   *
   * This logic now uses YouTube's 'yt-navigate-finish' event to detect
   * page changes. It then *only* observes for DOM changes on /watch
   * pages, and disconnects itself as soon as the comments are moved.
   */
  const observer = new MutationObserver(() => {
    // This callback runs when the DOM changes.
    // We try to moveComments(), and if it's successful (returns true),
    // we stop observing to save performance.
    if (moveComments()) {
      observer.disconnect();
    }
  });

  // Main function to run on page changes
  function onPageChange() {
    // Always disconnect any previous observer
    observer.disconnect();

    if (location.pathname.startsWith('/watch')) {
      // Try to move comments immediately.
      // If it fails (returns false), it means #comments isn't loaded yet.
      // In that case, start the observer to wait for it to appear.
      if (!moveComments()) {
        // Observe a more specific container than <body>
        const pageManager = document.querySelector('ytd-page-manager');
        observer.observe(pageManager || document.body, {
          childList: true,
          subtree: true
        });
      }
    }
  }

  // Listen for YouTube's specific SPA navigation event
  document.addEventListener('yt-navigate-finish', onPageChange);

  // Run once on initial script load (in case it loads on a watch page)
  onPageChange();
})();