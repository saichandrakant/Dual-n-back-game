/* =========================================
   Dual N-Back — Complete Game Engine
   Production-grade, hardened for reliability
   Pure vanilla JS, zero dependencies
   ========================================= */

(function () {
  'use strict';

  // ==========================================
  // CONSTANTS
  // ==========================================
  const LETTERS = 'CDHKLMOPQRSTW'.split(''); // distinct-sounding subset
  const GRID_SIZE = 9;
  const STIMULUS_DURATION = 500;  // ms — how long the cell glows
  const MATCH_RATE_MIN = 0.20;
  const MATCH_RATE_MAX = 0.30;

  // ==========================================
  // GAME STATES (strict FSM)
  // ==========================================
  const STATE = {
    IDLE:     'idle',
    RUNNING:  'running',
    PAUSED:   'paused',
    FINISHED: 'finished',
  };

  // ==========================================
  // AUDIO ENGINE — Spoken Letters via SpeechSynthesis
  // ==========================================
  let selectedVoice = null;

  function pickBestVoice() {
    const voices = speechSynthesis.getVoices();
    if (!voices.length) return null;

    const priorities = [
      v => /google/i.test(v.name) && /en/i.test(v.lang),
      v => /microsoft/i.test(v.name) && /en[-_]us/i.test(v.lang),
      v => /en[-_]us/i.test(v.lang),
      v => /en/i.test(v.lang),
    ];

    for (const test of priorities) {
      const match = voices.find(test);
      if (match) return match;
    }
    return voices[0];
  }

  function initVoices() {
    selectedVoice = pickBestVoice();
    if (selectedVoice) {
      console.log('🎙️ Voice selected:', selectedVoice.name, selectedVoice.lang);
    }
  }

  if (speechSynthesis.onvoiceschanged !== undefined) {
    speechSynthesis.onvoiceschanged = initVoices;
  }
  initVoices();

  /**
   * Speak a letter using SpeechSynthesis.
   * Always cancels previous to prevent overlap.
   */
  function playSound(letter) {
    speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(letter);
    if (selectedVoice) utterance.voice = selectedVoice;
    utterance.rate = 1.0;
    utterance.pitch = 1.0;
    utterance.volume = 1.0;

    speechSynthesis.speak(utterance);
    console.log('🔊 Speaking:', letter);
  }

  function stopAudio() {
    speechSynthesis.cancel();
  }

  // ==========================================
  // STIMULUS GENERATOR
  // ==========================================
  function randomStimulus() {
    return {
      position: Math.floor(Math.random() * GRID_SIZE),
      sound: LETTERS[Math.floor(Math.random() * LETTERS.length)],
    };
  }

  function generateStimulus(sequence, nLevel) {
    const idx = sequence.length;
    if (idx < nLevel) return randomStimulus();

    const target = sequence[idx - nLevel];
    const eligible = idx - nLevel;
    let vMatches = 0, aMatches = 0;

    for (let i = nLevel; i < idx; i++) {
      if (sequence[i].position === sequence[i - nLevel].position) vMatches++;
      if (sequence[i].sound === sequence[i - nLevel].sound) aMatches++;
    }

    const vRate = eligible > 0 ? vMatches / eligible : 0;
    const aRate = eligible > 0 ? aMatches / eligible : 0;

    let forceV = false, forceA = false;
    if (vRate < MATCH_RATE_MIN) forceV = Math.random() < 0.5;
    else if (vRate <= MATCH_RATE_MAX) forceV = Math.random() < 0.25;

    if (aRate < MATCH_RATE_MIN) forceA = Math.random() < 0.5;
    else if (aRate <= MATCH_RATE_MAX) forceA = Math.random() < 0.25;

    const stim = randomStimulus();
    if (forceV) stim.position = target.position;
    if (forceA) stim.sound = target.sound;
    return stim;
  }

  function isVisualMatch(seq, idx, n) {
    return idx >= n && seq[idx].position === seq[idx - n].position;
  }

  function isAudioMatch(seq, idx, n) {
    return idx >= n && seq[idx].sound === seq[idx - n].sound;
  }

  // ==========================================
  // DOM REFERENCES
  // ==========================================
  const $ = (id) => document.getElementById(id);

  const dom = {
    grid: $('game-grid'),
    trialBadge: $('trial-badge'),
    trialNumber: $('trial-number'),
    letterBadge: $('letter-badge'),
    debugLetter: $('debug-letter'),
    pauseBadge: $('pause-badge'),
    btnVisual: $('btn-visual-match'),
    btnAudio: $('btn-audio-match'),
    controlsButtons: $('controls-buttons'),
    nSelector: $('n-selector'),
    nHint: $('n-hint'),
    speedSlider: $('speed-slider'),
    speedLabel: $('speed-label'),
    headerNLevel: $('header-n-level'),
    helpN: $('help-n'),
    helpN2: $('help-n2'),

    // Trials input
    trialsInput: $('trials-input'),
    trialsLabel: $('trials-label'),

    // Progress graph
    graphSection: $('graph-section'),
    graphCanvas: $('progress-graph'),
    graphAccuracy: $('graph-accuracy'),
    graphTrials: $('graph-trials'),

    // Score elements
    overallPct: $('overall-pct'),
    overallBar: $('overall-bar'),
    totalTrials: $('total-trials'),
    visualPct: $('visual-pct'),
    visualBar: $('visual-bar'),
    visualHits: $('visual-hits'),
    visualMisses: $('visual-misses'),
    visualFP: $('visual-fp'),
    audioPct: $('audio-pct'),
    audioBar: $('audio-bar'),
    audioHits: $('audio-hits'),
    audioMisses: $('audio-misses'),
    audioFP: $('audio-fp'),
  };

  // ==========================================
  // BUILD GRID CELLS
  // ==========================================
  const cells = [];
  for (let i = 0; i < 9; i++) {
    const cell = document.createElement('div');
    cell.className = 'grid-cell';
    cell.id = 'grid-cell-' + i;
    const inner = document.createElement('div');
    inner.className = 'grid-cell-inner';
    cell.appendChild(inner);
    dom.grid.appendChild(cell);
    cells.push(cell);
  }

  // ==========================================
  // BUILD N-LEVEL BUTTONS
  // ==========================================
  const nButtons = [];
  for (let n = 1; n <= 5; n++) {
    const btn = document.createElement('button');
    btn.className = 'n-btn' + (n === 2 ? ' n-btn--active' : '');
    btn.textContent = n;
    btn.id = 'n-level-' + n;
    btn.addEventListener('click', () => setNLevel(n));
    dom.nSelector.appendChild(btn);
    nButtons.push(btn);
  }

  // ==========================================
  // GAME STATE — Single source of truth
  // ==========================================
  let gameState = STATE.IDLE;
  let nLevel = 2;
  let gapDuration = 1500;
  let userTrials = 20;     // user-configurable (10-100)
  let sequence = [];
  let currentIndex = -1;
  let maxTrials = 22;      // recalculated at start: userTrials + nLevel

  // Timing — single RAF loop, no duplicates
  let rafId = null;
  let phase = 'idle';       // 'stimulus' | 'gap' | 'idle'
  let phaseStart = 0;

  // Input — per-trial locks, reset each stimulus
  let visualPressed = false;
  let audioPressed = false;
  let inputWindowOpen = false;

  // Per-trial result log (for detailed history)
  let trialResults = [];

  // Aggregate scores
  let scores = {
    visualHits: 0, visualMisses: 0, visualFP: 0,
    audioHits: 0, audioMisses: 0, audioFP: 0,
    totalTrials: 0,
  };

  // ==========================================
  // SAFE RAF MANAGEMENT — prevents duplicate loops
  // ==========================================
  function stopLoop() {
    if (rafId !== null) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
  }

  // ==========================================
  // UI UPDATERS
  // ==========================================
  function updateScoreUI() {
    const s = scores;
    const vTotal = s.visualHits + s.visualMisses;
    const aTotal = s.audioHits + s.audioMisses;
    const vPct = vTotal > 0 ? Math.round((s.visualHits / vTotal) * 100) : 0;
    const aPct = aTotal > 0 ? Math.round((s.audioHits / aTotal) * 100) : 0;
    const allCorrect = s.visualHits + s.audioHits;
    const allTotal = vTotal + aTotal;
    const oPct = allTotal > 0 ? Math.round((allCorrect / allTotal) * 100) : 0;

    dom.overallPct.textContent = oPct + '%';
    dom.overallBar.style.width = oPct + '%';
    dom.totalTrials.textContent = s.totalTrials + ' / ' + userTrials + ' trials';
    dom.visualPct.textContent = vPct + '%';
    dom.visualBar.style.width = vPct + '%';
    dom.visualHits.textContent = s.visualHits;
    dom.visualMisses.textContent = s.visualMisses;
    dom.visualFP.textContent = s.visualFP;
    dom.audioPct.textContent = aPct + '%';
    dom.audioBar.style.width = aPct + '%';
    dom.audioHits.textContent = s.audioHits;
    dom.audioMisses.textContent = s.audioMisses;
    dom.audioFP.textContent = s.audioFP;
  }

  function renderControlButtons() {
    const container = dom.controlsButtons;
    container.innerHTML = '';

    if (gameState === STATE.IDLE || gameState === STATE.FINISHED) {
      const btn = document.createElement('button');
      btn.className = 'btn btn-primary';
      btn.id = 'btn-start';
      btn.innerHTML = '<span class="btn-icon">▶</span> ' +
        (gameState === STATE.FINISHED ? 'Play Again' : 'Start Game');
      btn.addEventListener('click', startGame);
      container.appendChild(btn);
    }

    if (gameState === STATE.RUNNING) {
      const btn = document.createElement('button');
      btn.className = 'btn btn-warning';
      btn.id = 'btn-pause';
      btn.innerHTML = '<span class="btn-icon">⏸</span> Pause';
      btn.addEventListener('click', pauseGame);
      container.appendChild(btn);
    }

    if (gameState === STATE.PAUSED) {
      const btn = document.createElement('button');
      btn.className = 'btn btn-primary';
      btn.id = 'btn-resume';
      btn.innerHTML = '<span class="btn-icon">▶</span> Resume';
      btn.addEventListener('click', resumeGame);
      container.appendChild(btn);
    }

    if (gameState === STATE.RUNNING || gameState === STATE.PAUSED) {
      const btn = document.createElement('button');
      btn.className = 'btn btn-danger';
      btn.id = 'btn-reset';
      btn.innerHTML = '<span class="btn-icon">⟲</span> Reset';
      btn.addEventListener('click', resetGame);
      container.appendChild(btn);
    }
  }

  function updateNButtons() {
    const canChange = gameState === STATE.IDLE || gameState === STATE.FINISHED;
    nButtons.forEach((btn, i) => {
      const n = i + 1;
      btn.disabled = !canChange;
      btn.className = 'n-btn' + (n === nLevel ? ' n-btn--active' : '');
    });
    dom.nHint.style.display = canChange ? 'none' : 'block';
    dom.headerNLevel.textContent = nLevel;
    dom.helpN.textContent = nLevel;
    dom.helpN2.textContent = nLevel;

    // Trials input — disable during gameplay
    dom.trialsInput.disabled = !canChange;
  }

  function setActiveCell(position) {
    cells.forEach((cell, i) => {
      if (i === position) {
        cell.className = 'grid-cell grid-cell--active';
        let glow = cell.querySelector('.grid-cell-glow');
        if (!glow) {
          glow = document.createElement('div');
          glow.className = 'grid-cell-glow';
          cell.appendChild(glow);
        }
      } else {
        cell.className = 'grid-cell';
        const glow = cell.querySelector('.grid-cell-glow');
        if (glow) glow.remove();
      }
    });
  }

  function clearGrid() {
    cells.forEach(cell => {
      cell.className = 'grid-cell';
      const glow = cell.querySelector('.grid-cell-glow');
      if (glow) glow.remove();
    });
  }

  function updateMatchButtons() {
    const active = gameState === STATE.RUNNING && inputWindowOpen;

    dom.btnVisual.disabled = !active;
    let vCls = 'match-btn match-btn--visual';
    if (!active) vCls += ' match-btn--disabled';
    dom.btnVisual.className = vCls;

    dom.btnAudio.disabled = !active;
    let aCls = 'match-btn match-btn--audio';
    if (!active) aCls += ' match-btn--disabled';
    dom.btnAudio.className = aCls;
  }

  function setMatchButtonFeedback(btn, type, feedback) {
    let cls = 'match-btn match-btn--' + type + ' match-btn--pressed';
    if (feedback === 'correct') cls += ' match-btn--correct';
    if (feedback === 'incorrect') cls += ' match-btn--incorrect';
    btn.className = cls;
  }

  function showTrialInfo(index, letter, showing) {
    if (gameState === STATE.IDLE) {
      dom.trialBadge.style.display = 'none';
      dom.letterBadge.style.display = 'none';
      dom.debugLetter.style.display = 'none';
      dom.pauseBadge.style.display = 'none';
      return;
    }

    dom.trialBadge.style.display = 'inline-block';
    dom.trialNumber.textContent = index >= 0 ? index + 1 : '—';

    if (showing && letter) {
      dom.letterBadge.style.display = 'inline-block';
      dom.letterBadge.textContent = letter;
      dom.debugLetter.style.display = 'inline-block';
      dom.debugLetter.textContent = '🔊 ' + letter;
    } else {
      dom.letterBadge.style.display = 'none';
      // Debug letter stays visible during gap for recall
    }

    dom.pauseBadge.style.display = gameState === STATE.PAUSED ? 'inline-block' : 'none';
  }

  // ==========================================
  // SCORING — finalize AFTER input window closes
  // ==========================================
  function finalizeTrial() {
    if (currentIndex < 0 || currentIndex >= sequence.length) return;
    if (currentIndex < nLevel) return; // Not eligible yet

    const wasV = isVisualMatch(sequence, currentIndex, nLevel);
    const wasA = isAudioMatch(sequence, currentIndex, nLevel);

    // Build detailed result
    const result = {
      trial: currentIndex + 1,
      letter: sequence[currentIndex].sound,
      position: sequence[currentIndex].position,
      correctVisual: wasV && visualPressed,
      correctAudio: wasA && audioPressed,
      missedVisual: wasV && !visualPressed,
      missedAudio: wasA && !audioPressed,
      falseVisual: !wasV && visualPressed,
      falseAudio: !wasA && audioPressed,
    };

    // Record to detailed log
    trialResults.push(result);

    // Update aggregate scores
    scores.totalTrials++;

    if (result.correctVisual) scores.visualHits++;
    else if (result.missedVisual) scores.visualMisses++;
    else if (result.falseVisual) scores.visualFP++;

    if (result.correctAudio) scores.audioHits++;
    else if (result.missedAudio) scores.audioMisses++;
    else if (result.falseAudio) scores.audioFP++;

    updateScoreUI();
  }

  // ==========================================
  // STIMULUS LIFECYCLE
  // ==========================================
  function showNextStimulus() {
    // SAFETY: guard against calling when not running
    if (gameState !== STATE.RUNNING) return;

    const stim = generateStimulus(sequence, nLevel);
    sequence.push(stim);
    currentIndex = sequence.length - 1;

    // Reset per-trial input locks
    visualPressed = false;
    audioPressed = false;
    inputWindowOpen = true;

    // Visual — highlight cell
    setActiveCell(stim.position);
    showTrialInfo(currentIndex, stim.sound, true);

    // Reset match button states (now enabled)
    updateMatchButtons();

    // Audio — plays EXACTLY when stimulus appears (same function)
    playSound(stim.sound);
  }

  function hideStimulus() {
    clearGrid();
    showTrialInfo(currentIndex, null, false);
  }

  // ==========================================
  // GAME LOOP — single requestAnimationFrame, no duplicates
  // ==========================================
  function gameLoop(timestamp) {
    // GUARD: exit immediately if not running (race condition safety)
    if (gameState !== STATE.RUNNING) return;

    const elapsed = timestamp - phaseStart;

    if (phase === 'stimulus') {
      if (elapsed >= STIMULUS_DURATION) {
        hideStimulus();
        phase = 'gap';
        phaseStart = timestamp;
      }
    } else if (phase === 'gap') {
      if (elapsed >= gapDuration) {
        // Close input window FIRST, then score
        inputWindowOpen = false;
        updateMatchButtons(); // disable match buttons during transition
        finalizeTrial();

        // Check if game is finished
        if (currentIndex + 1 >= maxTrials) {
          finishGame();
          return; // EXIT — do not schedule another frame
        }

        // Next stimulus
        showNextStimulus();
        phase = 'stimulus';
        phaseStart = timestamp;
      }
    }

    // Schedule next frame (only if still running)
    if (gameState === STATE.RUNNING) {
      rafId = requestAnimationFrame(gameLoop);
    }
  }

  // ==========================================
  // GAME CONTROLS — strict state transitions
  // ==========================================

  /**
   * START — only from IDLE or FINISHED
   */
  function startGame() {
    // GUARD: only allow from idle or finished
    if (gameState !== STATE.IDLE && gameState !== STATE.FINISHED) return;

    // Stop any lingering loop (safety — shouldn't exist, but prevent dupes)
    stopLoop();
    stopAudio();

    // Calculate total trials: user-selected scoreable + nLevel warmup
    maxTrials = userTrials + nLevel;

    // Hide graph from previous game
    dom.graphSection.style.display = 'none';

    // Full clean state
    sequence = [];
    currentIndex = -1;
    visualPressed = false;
    audioPressed = false;
    inputWindowOpen = false;
    trialResults = [];
    scores = {
      visualHits: 0, visualMisses: 0, visualFP: 0,
      audioHits: 0, audioMisses: 0, audioFP: 0,
      totalTrials: 0,
    };
    updateScoreUI();

    // Transition state
    gameState = STATE.RUNNING;
    renderControlButtons();
    updateNButtons();

    // First stimulus immediately
    showNextStimulus();
    phase = 'stimulus';
    phaseStart = performance.now();
    rafId = requestAnimationFrame(gameLoop);

    console.log('🎮 Game started — N=' + nLevel + ', ' + maxTrials + ' total trials');
  }

  /**
   * PAUSE — only from RUNNING
   */
  function pauseGame() {
    if (gameState !== STATE.RUNNING) return;

    gameState = STATE.PAUSED;
    stopLoop();
    stopAudio();

    renderControlButtons();
    updateNButtons();
    updateMatchButtons();
    showTrialInfo(currentIndex, null, false);

    console.log('⏸️ Game paused at trial', currentIndex + 1);
  }

  /**
   * RESUME — only from PAUSED
   */
  function resumeGame() {
    if (gameState !== STATE.PAUSED) return;

    gameState = STATE.RUNNING;
    phaseStart = performance.now();

    // Prevent duplicate loop
    stopLoop();
    rafId = requestAnimationFrame(gameLoop);

    renderControlButtons();
    updateNButtons();
    updateMatchButtons();
    showTrialInfo(currentIndex, null, false);

    console.log('▶️ Game resumed');
  }

  /**
   * RESET — from any state except IDLE (returns to IDLE)
   */
  function resetGame() {
    if (gameState === STATE.IDLE) return;

    // Stop everything
    stopLoop();
    stopAudio();

    // Full clean reset
    gameState = STATE.IDLE;
    phase = 'idle';
    sequence = [];
    currentIndex = -1;
    visualPressed = false;
    audioPressed = false;
    inputWindowOpen = false;
    trialResults = [];
    scores = {
      visualHits: 0, visualMisses: 0, visualFP: 0,
      audioHits: 0, audioMisses: 0, audioFP: 0,
      totalTrials: 0,
    };

    // Clean all UI
    clearGrid();
    updateScoreUI();
    renderControlButtons();
    updateNButtons();
    updateMatchButtons();
    showTrialInfo(-1, null, false);

    // Hide graph
    dom.graphSection.style.display = 'none';

    console.log('⟲ Game reset');
  }

  /**
   * FINISH — called when all trials complete
   */
  function finishGame() {
    inputWindowOpen = false;

    gameState = STATE.FINISHED;
    stopLoop();
    stopAudio();
    clearGrid();

    renderControlButtons();
    updateNButtons();
    updateMatchButtons();
    showTrialInfo(currentIndex, null, false);

    // Show completion badge
    dom.debugLetter.style.display = 'inline-block';
    dom.debugLetter.textContent = '✅ Complete!';

    // Show and render progress graph
    dom.graphSection.style.display = 'block';
    drawProgressGraph();

    // Update graph stats
    const totalCorrect = trialResults.reduce(
      (sum, r) => sum + (r.correctVisual ? 1 : 0) + (r.correctAudio ? 1 : 0), 0
    );
    const accuracy = trialResults.length > 0
      ? ((totalCorrect / (trialResults.length * 2)) * 100).toFixed(1)
      : '0.0';
    dom.graphAccuracy.textContent = 'Accuracy: ' + accuracy + '%';
    dom.graphTrials.textContent = trialResults.length + ' / ' + userTrials + ' trials';

    console.log('🏁 Game finished!', scores);
    console.log('📊 Detailed results:', trialResults);
  }

  /**
   * SET N-LEVEL — only when IDLE or FINISHED
   */
  function setNLevel(n) {
    if (gameState !== STATE.IDLE && gameState !== STATE.FINISHED) return;
    nLevel = n;
    updateNButtons();
  }

  // ==========================================
  // INPUT HANDLING — per-trial locks, strict guards
  // ==========================================
  function handleVisualInput() {
    // GUARD: strict state + window check
    if (gameState !== STATE.RUNNING) return;
    if (!inputWindowOpen) return;
    if (visualPressed) return;  // already pressed this trial — lock

    visualPressed = true;
    const correct = isVisualMatch(sequence, currentIndex, nLevel);
    setMatchButtonFeedback(dom.btnVisual, 'visual', correct ? 'correct' : 'incorrect');

    console.log('🖱️ Visual input:', correct ? '✓ correct' : '✗ incorrect');
  }

  function handleAudioInput() {
    // GUARD: strict state + window check
    if (gameState !== STATE.RUNNING) return;
    if (!inputWindowOpen) return;
    if (audioPressed) return;  // already pressed this trial — lock

    audioPressed = true;
    const correct = isAudioMatch(sequence, currentIndex, nLevel);
    setMatchButtonFeedback(dom.btnAudio, 'audio', correct ? 'correct' : 'incorrect');

    console.log('🖱️ Audio input:', correct ? '✓ correct' : '✗ incorrect');
  }

  // ==========================================
  // EVENT LISTENERS
  // ==========================================

  // Keyboard — with strict state-aware routing
  document.addEventListener('keydown', (e) => {
    const key = e.key.toLowerCase();

    if (key === 'v') {
      e.preventDefault();
      handleVisualInput();
    } else if (key === 'a') {
      e.preventDefault();
      handleAudioInput();
    } else if (key === ' ') {
      e.preventDefault();
      // Space bar: context-sensitive action
      if (gameState === STATE.RUNNING) pauseGame();
      else if (gameState === STATE.PAUSED) resumeGame();
      else if (gameState === STATE.IDLE || gameState === STATE.FINISHED) startGame();
    }
  });

  // Match button clicks
  dom.btnVisual.addEventListener('click', handleVisualInput);
  dom.btnAudio.addEventListener('click', handleAudioInput);

  // Speed slider — works during gameplay (live adjustment)
  dom.speedSlider.addEventListener('input', (e) => {
    gapDuration = Number(e.target.value);
    dom.speedLabel.textContent = (gapDuration / 1000).toFixed(1) + 's';
  });

  // Trials input — only editable when idle/finished
  dom.trialsInput.addEventListener('change', (e) => {
    if (gameState !== STATE.IDLE && gameState !== STATE.FINISHED) return;
    let val = parseInt(e.target.value, 10);
    if (isNaN(val)) val = 20;
    val = Math.max(10, Math.min(100, val));
    userTrials = val;
    e.target.value = val;
    dom.trialsLabel.textContent = val;
  });

  // ==========================================
  // PROGRESS GRAPH — Canvas-based line chart
  // ==========================================
  function drawProgressGraph() {
    const canvas = dom.graphCanvas;
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;

    // Hi-DPI scaling
    const cssW = canvas.parentElement.clientWidth - 32; // minus padding
    const cssH = 140;
    canvas.width = cssW * dpr;
    canvas.height = cssH * dpr;
    canvas.style.width = cssW + 'px';
    canvas.style.height = cssH + 'px';
    ctx.scale(dpr, dpr);

    // Clear
    ctx.clearRect(0, 0, cssW, cssH);

    // Build data: per-trial score (0, 1, or 2)
    const data = trialResults.map(r =>
      (r.correctVisual ? 1 : 0) + (r.correctAudio ? 1 : 0)
    );

    if (data.length < 2) {
      ctx.fillStyle = '#555570';
      ctx.font = '12px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Not enough data', cssW / 2, cssH / 2);
      return;
    }

    const padL = 28, padR = 10, padT = 12, padB = 24;
    const plotW = cssW - padL - padR;
    const plotH = cssH - padT - padB;
    const maxVal = 2;

    // --- Grid lines ---
    ctx.strokeStyle = 'rgba(255,255,255,0.06)';
    ctx.lineWidth = 1;
    for (let v = 0; v <= maxVal; v++) {
      const y = padT + plotH - (v / maxVal) * plotH;
      ctx.beginPath();
      ctx.moveTo(padL, y);
      ctx.lineTo(cssW - padR, y);
      ctx.stroke();
    }

    // --- Y-axis labels ---
    ctx.fillStyle = '#555570';
    ctx.font = '9px JetBrains Mono, monospace';
    ctx.textAlign = 'right';
    for (let v = 0; v <= maxVal; v++) {
      const y = padT + plotH - (v / maxVal) * plotH;
      ctx.fillText(v, padL - 6, y + 3);
    }

    // --- X-axis labels ---
    ctx.textAlign = 'center';
    const step = Math.max(1, Math.floor(data.length / 6));
    for (let i = 0; i < data.length; i += step) {
      const x = padL + (i / (data.length - 1)) * plotW;
      ctx.fillText(i + 1, x, cssH - 4);
    }
    // Always show last
    const lastX = padL + plotW;
    ctx.fillText(data.length, lastX, cssH - 4);

    // --- Build path points ---
    const points = data.map((val, i) => ({
      x: padL + (i / (data.length - 1)) * plotW,
      y: padT + plotH - (val / maxVal) * plotH,
    }));

    // --- Gradient fill under curve ---
    const gradient = ctx.createLinearGradient(0, padT, 0, padT + plotH);
    gradient.addColorStop(0, 'rgba(108, 92, 231, 0.35)');
    gradient.addColorStop(1, 'rgba(108, 92, 231, 0.02)');

    ctx.beginPath();
    ctx.moveTo(points[0].x, padT + plotH);
    points.forEach(p => ctx.lineTo(p.x, p.y));
    ctx.lineTo(points[points.length - 1].x, padT + plotH);
    ctx.closePath();
    ctx.fillStyle = gradient;
    ctx.fill();

    // --- Line ---
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) {
      ctx.lineTo(points[i].x, points[i].y);
    }
    ctx.strokeStyle = '#6c5ce7';
    ctx.lineWidth = 2;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.stroke();

    // --- Data points ---
    points.forEach((p, i) => {
      const val = data[i];
      ctx.beginPath();
      ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
      ctx.fillStyle = val === 2 ? '#00b894' : val === 1 ? '#fdcb6e' : '#e17055';
      ctx.fill();
    });
  }

  // ==========================================
  // INITIAL RENDER
  // ==========================================
  renderControlButtons();
  updateNButtons();
  updateMatchButtons();
  updateScoreUI();
  showTrialInfo(-1, null, false);

  console.log('✅ Dual N-Back engine initialized');

})();
