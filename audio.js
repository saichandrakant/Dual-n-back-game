/* =========================================
   Dual N-Back — Audio Engine
   Uses Web Audio API for zero-latency playback
   ========================================= */

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');

// Frequency map for each letter — spread across a pleasant range
const LETTER_FREQUENCIES = {};
LETTERS.forEach((letter, i) => {
  // Range from 220 Hz (A3) to ~880 Hz (A5), spaced evenly
  LETTER_FREQUENCIES[letter] = 220 + (i / 25) * 440;
});

let audioContext = null;

/**
 * Initialize the AudioContext (must be called after user gesture)
 */
export function initAudio() {
  if (!audioContext) {
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
  }
  // Resume if suspended (browser autoplay policy)
  if (audioContext.state === 'suspended') {
    audioContext.resume();
  }
  return audioContext;
}

/**
 * Speak a letter using a rich synthesized tone + optional SpeechSynthesis fallback
 * @param {string} letter - Single uppercase letter
 * @param {number} duration - Duration in seconds (default 0.3)
 */
export function playLetterSound(letter, duration = 0.35) {
  if (!audioContext) initAudio();

  const freq = LETTER_FREQUENCIES[letter] || 440;
  const now = audioContext.currentTime;

  // --- Main oscillator (sine for clean tone) ---
  const osc1 = audioContext.createOscillator();
  osc1.type = 'sine';
  osc1.frequency.setValueAtTime(freq, now);

  // --- Second oscillator (slight detune for richness) ---
  const osc2 = audioContext.createOscillator();
  osc2.type = 'triangle';
  osc2.frequency.setValueAtTime(freq * 1.002, now);

  // --- Sub oscillator for warmth ---
  const osc3 = audioContext.createOscillator();
  osc3.type = 'sine';
  osc3.frequency.setValueAtTime(freq * 0.5, now);

  // --- Gain envelope ---
  const gainNode = audioContext.createGain();
  gainNode.gain.setValueAtTime(0, now);
  gainNode.gain.linearRampToValueAtTime(0.25, now + 0.02);  // Attack
  gainNode.gain.setValueAtTime(0.25, now + duration * 0.6);   // Sustain
  gainNode.gain.exponentialRampToValueAtTime(0.001, now + duration); // Release

  const gain2 = audioContext.createGain();
  gain2.gain.setValueAtTime(0.1, now);

  const gain3 = audioContext.createGain();
  gain3.gain.setValueAtTime(0.08, now);

  // Connect
  osc1.connect(gainNode);
  osc2.connect(gain2);
  gain2.connect(gainNode);
  osc3.connect(gain3);
  gain3.connect(gainNode);
  gainNode.connect(audioContext.destination);

  // Play
  osc1.start(now);
  osc2.start(now);
  osc3.start(now);
  osc1.stop(now + duration);
  osc2.stop(now + duration);
  osc3.stop(now + duration);

  // Also try to speak the letter using Speech Synthesis for clarity
  if ('speechSynthesis' in window) {
    const utterance = new SpeechSynthesisUtterance(letter);
    utterance.rate = 1.8;
    utterance.pitch = 1.0;
    utterance.volume = 0.7;
    window.speechSynthesis.speak(utterance);
  }
}

/**
 * Play a UI feedback sound (correct/incorrect)
 */
export function playFeedbackSound(type = 'correct') {
  if (!audioContext) initAudio();

  const now = audioContext.currentTime;
  const osc = audioContext.createOscillator();
  const gain = audioContext.createGain();

  if (type === 'correct') {
    osc.type = 'sine';
    osc.frequency.setValueAtTime(523.25, now); // C5
    osc.frequency.setValueAtTime(659.25, now + 0.08); // E5
    gain.gain.setValueAtTime(0.15, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
    osc.connect(gain);
    gain.connect(audioContext.destination);
    osc.start(now);
    osc.stop(now + 0.2);
  } else {
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(200, now);
    osc.frequency.linearRampToValueAtTime(150, now + 0.15);
    gain.gain.setValueAtTime(0.1, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
    osc.connect(gain);
    gain.connect(audioContext.destination);
    osc.start(now);
    osc.stop(now + 0.2);
  }
}

export { LETTERS };
