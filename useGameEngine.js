/* =========================================
   Dual N-Back — Game Engine Hook
   requestAnimationFrame-based timing engine
   ========================================= */

import { useState, useRef, useCallback, useEffect } from 'react';
import { generateStimulus, isVisualMatch, isAudioMatch } from './stimulus';
import { initAudio, playLetterSound, playFeedbackSound } from './audio';

const STIMULUS_DURATION = 500; // ms — how long the highlight shows

// Game states
export const GAME_IDLE = 'idle';
export const GAME_RUNNING = 'running';
export const GAME_PAUSED = 'paused';

/**
 * Core game engine hook
 * @returns {Object} Game state and control functions
 */
export function useGameEngine() {
  // --- Config ---
  const [nLevel, setNLevel] = useState(2);
  const [gapDuration, setGapDuration] = useState(1500); // ms between stimuli

  // --- Game state ---
  const [gameState, setGameState] = useState(GAME_IDLE);
  const [sequence, setSequence] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(-1);
  const [activePosition, setActivePosition] = useState(-1); // which cell is lit
  const [activeLetter, setActiveLetter] = useState('');
  const [showingStimulus, setShowingStimulus] = useState(false);

  // --- Scores ---
  const [scores, setScores] = useState({
    visualHits: 0,
    visualMisses: 0,
    visualFalsePositives: 0,
    audioHits: 0,
    audioMisses: 0,
    audioFalsePositives: 0,
    totalTrials: 0,
  });

  // --- Input tracking for current trial ---
  const [visualPressed, setVisualPressed] = useState(false);
  const [audioPressed, setAudioPressed] = useState(false);
  const [visualFeedback, setVisualFeedback] = useState(null); // 'correct' | 'incorrect' | null
  const [audioFeedback, setAudioFeedback] = useState(null);

  // --- Refs for animation frame ---
  const rafRef = useRef(null);
  const phaseRef = useRef('idle'); // 'stimulus' | 'gap' | 'idle'
  const phaseStartRef = useRef(0);
  const sequenceRef = useRef([]);
  const indexRef = useRef(-1);
  const gameStateRef = useRef(GAME_IDLE);
  const gapDurationRef = useRef(gapDuration);
  const nLevelRef = useRef(nLevel);
  const visualPressedRef = useRef(false);
  const audioPressedRef = useRef(false);
  const inputWindowOpenRef = useRef(false);
  const scoresRef = useRef(scores);

  // Keep refs in sync
  useEffect(() => { gapDurationRef.current = gapDuration; }, [gapDuration]);
  useEffect(() => { nLevelRef.current = nLevel; }, [nLevel]);
  useEffect(() => { gameStateRef.current = gameState; }, [gameState]);
  useEffect(() => { scoresRef.current = scores; }, [scores]);

  /**
   * Score the current trial — called at the END of the input window
   */
  const scoreTrial = useCallback(() => {
    const idx = indexRef.current;
    const seq = sequenceRef.current;
    const n = nLevelRef.current;

    if (idx < 0 || idx >= seq.length) return;

    const wasVisualMatch = isVisualMatch(seq, idx, n);
    const wasAudioMatch = isAudioMatch(seq, idx, n);
    const didPressVisual = visualPressedRef.current;
    const didPressAudio = audioPressedRef.current;

    setScores(prev => {
      const next = { ...prev };

      // Only count trials that are eligible (index >= N)
      if (idx >= n) {
        next.totalTrials = prev.totalTrials + 1;

        // Visual scoring
        if (wasVisualMatch && didPressVisual) {
          next.visualHits = prev.visualHits + 1;
        } else if (wasVisualMatch && !didPressVisual) {
          next.visualMisses = prev.visualMisses + 1;
        } else if (!wasVisualMatch && didPressVisual) {
          next.visualFalsePositives = prev.visualFalsePositives + 1;
        }

        // Audio scoring
        if (wasAudioMatch && didPressAudio) {
          next.audioHits = prev.audioHits + 1;
        } else if (wasAudioMatch && !didPressAudio) {
          next.audioMisses = prev.audioMisses + 1;
        } else if (!wasAudioMatch && didPressAudio) {
          next.audioFalsePositives = prev.audioFalsePositives + 1;
        }
      }

      scoresRef.current = next;
      return next;
    });
  }, []);

  /**
   * Start a new stimulus cycle
   */
  const showNextStimulus = useCallback(() => {
    const seq = sequenceRef.current;
    const newStimulus = generateStimulus(seq, nLevelRef.current);
    seq.push(newStimulus);
    const newIndex = seq.length - 1;

    sequenceRef.current = seq;
    indexRef.current = newIndex;
    visualPressedRef.current = false;
    audioPressedRef.current = false;
    inputWindowOpenRef.current = true;

    // Update React state
    setSequence([...seq]);
    setCurrentIndex(newIndex);
    setActivePosition(newStimulus.position);
    setActiveLetter(newStimulus.sound);
    setShowingStimulus(true);
    setVisualPressed(false);
    setAudioPressed(false);
    setVisualFeedback(null);
    setAudioFeedback(null);

    // Play audio immediately with stimulus
    playLetterSound(newStimulus.sound);
  }, []);

  /**
   * Main game loop using requestAnimationFrame
   */
  const gameLoop = useCallback((timestamp) => {
    if (gameStateRef.current !== GAME_RUNNING) return;

    const elapsed = timestamp - phaseStartRef.current;

    if (phaseRef.current === 'stimulus') {
      // During stimulus display phase
      if (elapsed >= STIMULUS_DURATION) {
        // Stimulus time is over — hide it
        setActivePosition(-1);
        setShowingStimulus(false);
        phaseRef.current = 'gap';
        phaseStartRef.current = timestamp;
      }
    } else if (phaseRef.current === 'gap') {
      // During gap between stimuli
      if (elapsed >= gapDurationRef.current) {
        // Gap is over — score the previous trial and show next stimulus
        inputWindowOpenRef.current = false;
        scoreTrial();
        showNextStimulus();
        phaseRef.current = 'stimulus';
        phaseStartRef.current = timestamp;
      }
    }

    rafRef.current = requestAnimationFrame(gameLoop);
  }, [scoreTrial, showNextStimulus]);

  /**
   * Start the game
   */
  const startGame = useCallback(() => {
    initAudio();

    if (gameState === GAME_PAUSED) {
      // Resume from pause
      setGameState(GAME_RUNNING);
      gameStateRef.current = GAME_RUNNING;
      phaseStartRef.current = performance.now();
      rafRef.current = requestAnimationFrame(gameLoop);
      return;
    }

    // Fresh start
    sequenceRef.current = [];
    indexRef.current = -1;
    visualPressedRef.current = false;
    audioPressedRef.current = false;
    inputWindowOpenRef.current = false;

    setSequence([]);
    setCurrentIndex(-1);
    setActivePosition(-1);
    setActiveLetter('');
    setShowingStimulus(false);
    setVisualPressed(false);
    setAudioPressed(false);
    setVisualFeedback(null);
    setAudioFeedback(null);
    setScores({
      visualHits: 0, visualMisses: 0, visualFalsePositives: 0,
      audioHits: 0, audioMisses: 0, audioFalsePositives: 0,
      totalTrials: 0,
    });

    setGameState(GAME_RUNNING);
    gameStateRef.current = GAME_RUNNING;

    // Show first stimulus immediately
    showNextStimulus();
    phaseRef.current = 'stimulus';
    phaseStartRef.current = performance.now();
    rafRef.current = requestAnimationFrame(gameLoop);
  }, [gameState, gameLoop, showNextStimulus]);

  /**
   * Pause the game
   */
  const pauseGame = useCallback(() => {
    setGameState(GAME_PAUSED);
    gameStateRef.current = GAME_PAUSED;
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  }, []);

  /**
   * Reset the game completely
   */
  const resetGame = useCallback(() => {
    // Stop the loop
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }

    // Cancel any pending speech
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }

    phaseRef.current = 'idle';
    sequenceRef.current = [];
    indexRef.current = -1;
    visualPressedRef.current = false;
    audioPressedRef.current = false;
    inputWindowOpenRef.current = false;
    gameStateRef.current = GAME_IDLE;

    setGameState(GAME_IDLE);
    setSequence([]);
    setCurrentIndex(-1);
    setActivePosition(-1);
    setActiveLetter('');
    setShowingStimulus(false);
    setVisualPressed(false);
    setAudioPressed(false);
    setVisualFeedback(null);
    setAudioFeedback(null);
    setScores({
      visualHits: 0, visualMisses: 0, visualFalsePositives: 0,
      audioHits: 0, audioMisses: 0, audioFalsePositives: 0,
      totalTrials: 0,
    });
  }, []);

  /**
   * Handle visual match input (V key)
   */
  const handleVisualInput = useCallback(() => {
    if (gameStateRef.current !== GAME_RUNNING) return;
    if (!inputWindowOpenRef.current) return;
    if (visualPressedRef.current) return; // already pressed this trial

    visualPressedRef.current = true;
    setVisualPressed(true);

    const idx = indexRef.current;
    const seq = sequenceRef.current;
    const n = nLevelRef.current;
    const correct = isVisualMatch(seq, idx, n);

    setVisualFeedback(correct ? 'correct' : 'incorrect');
    playFeedbackSound(correct ? 'correct' : 'incorrect');
  }, []);

  /**
   * Handle audio match input (A key)
   */
  const handleAudioInput = useCallback(() => {
    if (gameStateRef.current !== GAME_RUNNING) return;
    if (!inputWindowOpenRef.current) return;
    if (audioPressedRef.current) return;

    audioPressedRef.current = true;
    setAudioPressed(true);

    const idx = indexRef.current;
    const seq = sequenceRef.current;
    const n = nLevelRef.current;
    const correct = isAudioMatch(seq, idx, n);

    setAudioFeedback(correct ? 'correct' : 'incorrect');
    playFeedbackSound(correct ? 'correct' : 'incorrect');
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
      }
      if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  return {
    // State
    gameState,
    nLevel,
    gapDuration,
    sequence,
    currentIndex,
    activePosition,
    activeLetter,
    showingStimulus,
    scores,
    visualPressed,
    audioPressed,
    visualFeedback,
    audioFeedback,

    // Actions
    startGame,
    pauseGame,
    resetGame,
    setNLevel: (n) => {
      if (gameState === GAME_IDLE) setNLevel(n);
    },
    setGapDuration,
    handleVisualInput,
    handleAudioInput,
  };
}
