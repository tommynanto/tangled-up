/* Tangled Up — game logic
 *
 * How playback stays clean (no ads, no mis-timed clips):
 *  1. PRIME: when a track loads, it plays MUTED in a hidden player until we can prove the real
 *     song is running — right video ID, duration matches the song (an ad's won't), and the
 *     playhead is actually moving. Any pre-roll ad burns off silently during this step.
 *     Then we pause, rewind, and only then enable the Play button.
 *  2. MEASURED CLIPS: the 3-second clip counts only time the real song spends playing,
 *     so buffering can't eat part of it.
 *  3. WATCHDOGS: if playback stalls, the wrong video shows up, or the player errors, the track is
 *     re-primed (and the player rebuilt if needed). Unplayable videos are skipped automatically.
 */
(() => {
  "use strict";

  const SONGS = window.SONGS;
  const DEEP_START = SONGS.length - window.DEEP_CUT_COUNT;
  const MAX_GUESSES = 3;
  const CLIP_SECONDS = 3;
  const PRIME_TIMEOUT_MS = 20000;   // long enough to sit through a muted pre-roll ad
  const STALL_MS = 4000;

  const $ = (id) => document.getElementById(id);
  const el = {
    tape: $("tape"), label: document.querySelector(".label"), labelTitle: $("labelTitle"), labelSub: $("labelSub"),
    status: $("status"), playBtn: $("playBtn"), guessForm: $("guessForm"), guess: $("guess"),
    suggestions: $("suggestions"), submitBtn: $("submitBtn"), pips: $("pips"), giveUp: $("giveUp"),
    feedback: $("feedback"), reveal: $("reveal"), revealKicker: $("revealKicker"), revealTitle: $("revealTitle"),
    revealMeta: $("revealMeta"), bonus: $("bonus"), fullBtn: $("fullBtn"), nextBtn: $("nextBtn"),
    score: $("score"), player: $("player"),
  };

  // ── State ───────────────────────────────────────────
  const state = {
    deck: [], pos: 0, song: null,
    score: 0,
    guesses: 0, phase: "loading",          // loading | ready | clip | revealed | full | error
    primed: false,
  };

  let player = null;
  let playerReady = false;
  let loop = null;          // active watcher (interval id)
  let token = 0;            // invalidates stale watchers when the track changes
  let primeFailures = 0;

  const isDeepCut = (song) => SONGS.indexOf(song) >= DEEP_START;
  const startAt = (song) => song.start || 0;

  // ── Text matching ───────────────────────────────────
  // Forgiving: ignores case, punctuation, "&"/"and", leading "the", and knockin'/knocking.
  function norm(s) {
    return s.toLowerCase()
      .normalize("NFD").replace(/[̀-ͯ]/g, "")
      .replace(/[’‘`]/g, "'")
      .replace(/&/g, " and ")
      .replace(/\bmr\b\.?/g, "mister")
      .replace(/\bfourth\b/g, "4th")
      .replace(/[^a-z0-9]+/g, "")
      .replace(/^the/, "")
      .replace(/ing/g, "in");
  }
  const namesFor = (song) => [song.name, ...(song.aka || [])];
  const isMatch = (guess, song) => namesFor(song).some((n) => norm(n) === norm(guess));

  // ── Deck ────────────────────────────────────────────
  function shuffle(a) {
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
    return a;
  }
  // The game never announces how many songs there are: when the shuffled stack runs out it
  // quietly reshuffles (never repeating the song just played) and keeps going.
  function refillDeck() {
    const last = state.song;
    state.deck = shuffle(SONGS.slice());
    if (last && state.deck[0] === last) state.deck.push(state.deck.shift());
    state.pos = 0;
  }
  function newGame() {
    state.song = null; refillDeck();
    state.score = 0;
    renderScore();
    loadTrack();
  }

  function loadTrack() {
    state.song = state.deck[state.pos];
    state.guesses = 0;
    state.primed = false;
    primeFailures = 0;
    el.reveal.hidden = true; el.bonus.hidden = true;
    el.guessForm.hidden = false;
    el.guess.value = ""; el.guess.disabled = false;
    el.feedback.textContent = ""; el.feedback.className = "feedback";
    el.label.className = "label"; el.labelTitle.textContent = "?"; el.labelSub.textContent = "Bob Dylan";
    el.tape.classList.remove("insert"); void el.tape.offsetWidth; el.tape.classList.add("insert");
    closeSuggestions(); renderPips(); renderScore();
    if (!matchMedia("(pointer: coarse)").matches) el.guess.focus();
    prime();
  }

  // ── YouTube player ──────────────────────────────────
  function buildPlayer() {
    playerReady = false;
    if (player) { try { player.destroy(); } catch {} player = null; }
    const host = document.querySelector(".yt-wrap");
    host.innerHTML = '<div id="yt"></div>';
    player = new YT.Player("yt", {
      width: 200, height: 200,
      playerVars: { autoplay: 0, controls: 0, disablekb: 1, fs: 0, rel: 0, playsinline: 1, iv_load_policy: 3, cc_load_policy: 0 },
      events: {
        onReady: () => { playerReady = true; if (state.song) prime(); },
        onError: (e) => onPlayerError(e.data),
      },
    });
  }

  window.onYouTubeIframeAPIReady = () => { buildPlayer(); newGame(); };
  const tag = document.createElement("script");
  tag.src = "https://www.youtube.com/iframe_api";
  tag.onerror = () => fail("Couldn't reach YouTube. Check your connection or ad blocker, then reload.");
  document.head.appendChild(tag);

  // Safe wrappers — the iframe API throws if the player isn't fully alive yet.
  const yt = {
    time: () => { try { return player.getCurrentTime() || 0; } catch { return 0; } },
    dur: () => { try { return player.getDuration() || 0; } catch { return 0; } },
    st: () => { try { return player.getPlayerState(); } catch { return -1; } },
    id: () => { try { return (player.getVideoData() || {}).video_id; } catch { return null; } },
    call: (fn, ...a) => { try { player[fn](...a); return true; } catch { return false; } },
  };

  // Is the player actually playing OUR song (not an ad, not a different video)?
  function isRealSong(song) {
    if (yt.id() !== song.videoId) return false;
    const d = yt.dur();
    if (song.dur ? Math.abs(d - song.dur) > 6 : d < 60) return false;
    return yt.st() === YT.PlayerState.PLAYING;
  }

  function stopLoop() { if (loop) { clearInterval(loop); loop = null; } }

  // Step 1: silently play until the real song is confirmed, then park it at the start.
  function prime() {
    if (!playerReady || !state.song) return;
    stopLoop();
    const my = ++token, song = state.song, t0 = Date.now();
    state.primed = false;
    setPhase("loading", primeFailures ? "Re-loading the tape…" : "Loading the tape…");
    yt.call("mute");
    // Queue the track, then press play once it's cued. On real (non-localhost) sites YouTube blocks
    // loadVideoById() from starting on its own, but allows cue-then-play once the player is unlocked.
    yt.call("cueVideoById", { videoId: song.videoId, startSeconds: startAt(song) });

    let lastT = -1, advancing = 0, playSent = false;
    loop = setInterval(() => {
      if (my !== token) return stopLoop();
      if (!playSent && (yt.st() === YT.PlayerState.CUED || Date.now() - t0 > 1500)) { playSent = true; yt.call("playVideo"); }
      const t = yt.time();
      if (isRealSong(song) && t > lastT) advancing++; else advancing = 0;
      lastT = t;
      if (advancing >= 3 && t >= startAt(song) + 0.2) {
        stopLoop();
        yt.call("pauseVideo");
        yt.call("seekTo", startAt(song), true);
        state.primed = true;
        setPhase("ready");
        return;
      }
      if (Date.now() - t0 > 3500 && [-1, 5].includes(yt.st())) {
        // Browser blocked autoplay (common on phones). Let the first tap do the priming instead.
        stopLoop();
        state.needsTap = true;
        setPhase("ready", "Tap the tape or hit play to start");
        return;
      }
      if (Date.now() - t0 > PRIME_TIMEOUT_MS) { stopLoop(); retryPrime(); }
    }, 100);
  }

  function retryPrime() {
    primeFailures++;
    if (primeFailures === 2) { buildPlayer(); return; }   // onReady → prime()
    if (primeFailures >= 3) { skipBroken("This track won't load."); return; }
    prime();
  }

  function onPlayerError(code) {
    // 2 bad id · 5 html5 error · 100 removed · 101/150 embedding disabled
    stopLoop();
    if ([100, 101, 150].includes(code)) skipBroken("That track isn't available on YouTube right now.");
    else retryPrime();
  }

  function skipBroken(msg) {
    console.warn("Skipping", state.song && state.song.name, msg);
    state.deck.splice(state.pos, 1);
    if (state.pos >= state.deck.length) refillDeck();
    el.feedback.textContent = msg + " Skipped it — no points lost.";
    loadTrack();
  }

  // Step 2: play a measured clip. Stops on the video's own clock, so buffering can't shorten it.
  function playClip() {
    if (!["ready"].includes(state.phase) || !playerReady) return;
    if (!state.primed) {           // phone path: prime inside this tap, then play
      state.needsTap = false;
      return playFrom(true);
    }
    playFrom(false);
  }

  function playFrom(needsPrime) {
    stopLoop();
    const my = ++token, song = state.song, s = startAt(song), len = CLIP_SECONDS;
    setPhase("clip", needsPrime ? "Cueing…" : "Playing…");
    if (needsPrime) yt.call("mute"); else { yt.call("unMute"); yt.call("setVolume", 100); }
    if (needsPrime) {
      // This runs inside the user's tap. Browsers only "unlock" the player if that tap starts
      // playback with playVideo() on the already-loaded track — loadVideoById() doesn't count,
      // and without the unlock every later track would stall too.
      if (yt.id() !== song.videoId) yt.call("cueVideoById", { videoId: song.videoId, startSeconds: s });
      yt.call("playVideo");
    }
    else { yt.call("seekTo", s, true); yt.call("playVideo"); }

    // YouTube only reports its clock every ~250ms, so the clip is timed by counting the
    // milliseconds the real song has spent in the PLAYING state (paused during buffering/ads),
    // with the video clock as a backstop.
    let played = 0, lastTick = performance.now(), lastT = -1, lastMove = Date.now();
    let primedNow = !needsPrime, adMuted = false;
    loop = setInterval(() => {
      if (my !== token) return stopLoop();
      const now = performance.now(), dt = now - lastTick; lastTick = now;
      const t = yt.time(), real = isRealSong(song);
      if (t !== lastT || real) { if (t !== lastT) lastMove = Date.now(); lastT = t; }

      if (!primedNow) {
        // Burning off any ad muted, waiting for the real song to start moving.
        if (real && t >= s + 0.2) {
          primedNow = true; state.primed = true;
          yt.call("seekTo", s, true); yt.call("unMute"); yt.call("setVolume", 100);
          el.status.textContent = "Playing…";
          played = 0;
        } else if (Date.now() - lastMove > 3000 && [-1, 5].includes(yt.st())) {
          // Still blocked (no real user tap yet) — ask for one instead of waiting.
          stopLoop(); state.needsTap = true; setPhase("ready", "Tap the tape or hit play to start");
        } else if (Date.now() - lastMove > PRIME_TIMEOUT_MS) { stopLoop(); retryPrime(); }
        return;
      }

      if (!real) {
        // Something other than our song is playing (mid-roll ad, wrong video): silence it.
        const wrongVideo = (yt.id() && yt.id() !== song.videoId) || (yt.dur() && song.dur && Math.abs(yt.dur() - song.dur) > 6);
        if (wrongVideo && !adMuted) { yt.call("mute"); adMuted = true; }
        if (Date.now() - lastMove > STALL_MS) { stopLoop(); yt.call("pauseVideo"); primeFailures++; prime(); }
        return;
      }
      if (adMuted) { yt.call("seekTo", s, true); yt.call("unMute"); adMuted = false; played = 0; return; }
      played += dt;
      if (played >= len * 1000 || t >= s + len) {
        stopLoop();
        yt.call("pauseVideo");
        yt.call("seekTo", s, true);
        setPhase("ready", "Hear it again, or make your guess.");
      }
    }, 20);
  }

  function playFull() {
    if (!playerReady) return;
    if (state.phase === "full") { stopLoop(); yt.call("pauseVideo"); return setPhase("revealed"); }
    stopLoop();
    const my = ++token, song = state.song;
    setPhase("full", "Now playing — " + song.name);
    yt.call("unMute"); yt.call("setVolume", 100);
    yt.call("seekTo", startAt(song), true); yt.call("playVideo");
    loop = setInterval(() => {
      if (my !== token) return stopLoop();
      const st = yt.st();
      if (st === YT.PlayerState.ENDED) { stopLoop(); setPhase("revealed"); }
      if (st === YT.PlayerState.PLAYING && !isRealSong(song)) yt.call("mute");
      else if (st === YT.PlayerState.PLAYING) yt.call("unMute");
    }, 250);
  }

  // ── Guessing ────────────────────────────────────────
  function submitGuess(e) {
    e && e.preventDefault();
    if (!["ready", "clip", "loading"].includes(state.phase)) return;
    const g = el.guess.value.trim();
    if (!g) { el.feedback.textContent = "Type a title first."; el.feedback.className = "feedback wrong"; return; }
    closeSuggestions();
    state.guesses++;
    renderPips();
    if (isMatch(g, state.song)) {
      const deep = isDeepCut(state.song);
      state.score += deep ? 2 : 1;
      renderScore(true);
      reveal(true);
    } else if (state.guesses >= MAX_GUESSES) {
      reveal(false);
    } else {
      const left = MAX_GUESSES - state.guesses;
      el.feedback.textContent = `Nope, not “${g}”. ${left} guess${left > 1 ? "es" : ""} left.`;
      el.feedback.className = "feedback wrong";
      el.guessForm.classList.remove("shake"); void el.guessForm.offsetWidth; el.guessForm.classList.add("shake");
      el.guess.select();
    }
  }

  function reveal(won) {
    stopLoop(); token++;
    yt.call("pauseVideo");
    const song = state.song, deep = isDeepCut(song);
    el.guessForm.hidden = true;
    el.feedback.textContent = won
      ? (deep ? "+2 points" : "+1 point") + (state.guesses === 1 ? " — first try!" : "")
      : (state.guesses >= MAX_GUESSES ? "Out of guesses." : "");
    el.feedback.className = "feedback " + (won ? "right" : "wrong");
    el.revealKicker.textContent = won ? "Correct — it was" : "The song was";
    el.revealTitle.textContent = song.name;
    el.revealMeta.textContent = `${song.album} · ${song.year}`;
    el.bonus.hidden = !(won && deep);
    if (won && deep) el.bonus.innerHTML = "<strong>Congrats! Deep cut bonus +1</strong>Bonus point for identifying a song outside the top 20 most popular tracks.";
    el.label.className = "label revealed" + (won ? " correct" : "");
    el.labelTitle.textContent = song.name;
    el.labelSub.textContent = `${song.album.replace(/\s*\(.*\)/, "")} · ${song.year}`;
    el.reveal.hidden = false;
    setPhase("revealed");
    el.nextBtn.focus({ preventScroll: true });
  }

  function next() {
    stopLoop(); token++; yt.call("pauseVideo");
    state.pos++;
    if (state.pos >= state.deck.length) refillDeck();
    loadTrack();
  }

  function fail(msg) { setPhase("error", msg); }

  // ── Autocomplete ────────────────────────────────────
  let sugIndex = -1, sugItems = [];
  function updateSuggestions() {
    const q = el.guess.value.trim();
    if (!q) return closeSuggestions();
    const nq = norm(q);
    const hits = [];
    for (const song of SONGS) {
      const n = namesFor(song).find((x) => norm(x).includes(nq));
      if (n) hits.push(song.name);
    }
    sugItems = hits; sugIndex = -1;
    if (!hits.length) return closeSuggestions();
    const re = new RegExp("(" + q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + ")", "i");
    el.suggestions.innerHTML = hits.map((h, i) =>
      `<li role="option" id="sug-${i}" data-i="${i}">${escapeHtml(h).replace(re, "<mark>$1</mark>")}</li>`).join("");
    el.suggestions.hidden = false;
    el.guess.setAttribute("aria-expanded", "true");
  }
  function closeSuggestions() {
    el.suggestions.hidden = true; el.suggestions.innerHTML = ""; sugItems = []; sugIndex = -1;
    el.guess.setAttribute("aria-expanded", "false"); el.guess.removeAttribute("aria-activedescendant");
  }
  function highlight(i) {
    sugIndex = i;
    [...el.suggestions.children].forEach((li, j) => li.setAttribute("aria-selected", String(j === i)));
    const li = el.suggestions.children[i];
    if (li) { li.scrollIntoView({ block: "nearest" }); el.guess.setAttribute("aria-activedescendant", li.id); }
  }
  function choose(i) { el.guess.value = sugItems[i]; closeSuggestions(); el.guess.focus(); }
  const escapeHtml = (s) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

  el.guess.addEventListener("input", updateSuggestions);
  el.guess.addEventListener("keydown", (e) => {
    if (el.suggestions.hidden || !sugItems.length) return;
    if (e.key === "ArrowDown") { e.preventDefault(); highlight((sugIndex + 1) % sugItems.length); }
    else if (e.key === "ArrowUp") { e.preventDefault(); highlight((sugIndex - 1 + sugItems.length) % sugItems.length); }
    else if (e.key === "Enter" && sugIndex >= 0) { e.preventDefault(); e.stopPropagation(); choose(sugIndex); }
    else if (e.key === "Escape") closeSuggestions();
  });
  el.suggestions.addEventListener("mousedown", (e) => {
    const li = e.target.closest("li"); if (!li) return;
    e.preventDefault(); choose(+li.dataset.i);
  });
  document.addEventListener("mousedown", (e) => { if (!e.target.closest(".combo")) closeSuggestions(); });

  // ── UI wiring ───────────────────────────────────────
  function setPhase(phase, msg) {
    state.phase = phase;
    const canPlay = phase === "ready";
    el.tape.disabled = !canPlay;
    el.playBtn.disabled = !canPlay;
    el.player.classList.toggle("playing", phase === "clip" || phase === "full");
    el.fullBtn.textContent = phase === "full" ? "Stop" : "Play the song";
    const defaults = {
      loading: "Loading the tape…",
      ready: state.guesses ? "Hear it again, or take another guess." : "Ready when you are.",
      revealed: "", full: "", error: "Something went wrong.",
    };
    el.status.textContent = msg !== undefined ? msg : (defaults[phase] || "");
    el.status.className = "status" + (phase === "error" ? " error" : "");
  }

  function renderPips() {
    [...el.pips.children].forEach((p, i) => p.classList.toggle("used", i < state.guesses));
  }
  function renderScore(bump) {
    el.score.textContent = state.score;
    if (bump) { el.score.classList.remove("bump"); void el.score.offsetWidth; el.score.classList.add("bump"); }
  }

  el.tape.addEventListener("click", playClip);
  el.playBtn.addEventListener("click", playClip);
  el.guessForm.addEventListener("submit", submitGuess);
  el.giveUp.addEventListener("click", () => reveal(false));
  el.nextBtn.addEventListener("click", next);
  el.fullBtn.addEventListener("click", playFull);

  // Enter: play when the box is empty, advance after a reveal.
  window.addEventListener("keydown", (e) => {
    if (e.key !== "Enter" || e.isComposing) return;
    const inBox = e.target === el.guess;
    if ((state.phase === "revealed" || state.phase === "full") && e.target.tagName !== "BUTTON") { e.preventDefault(); return next(); }
    if (state.phase === "ready" && (!inBox || !el.guess.value.trim()) && e.target.tagName !== "BUTTON") { e.preventDefault(); return playClip(); }
  });

  // Pause everything if the tab is hidden mid-clip (prevents runaway audio / desynced timers).
  document.addEventListener("visibilitychange", () => {
    if (document.hidden && state.phase === "clip") { stopLoop(); token++; yt.call("pauseVideo"); yt.call("seekTo", startAt(state.song), true); setPhase("ready"); }
  });

  setPhase("loading");
})();
