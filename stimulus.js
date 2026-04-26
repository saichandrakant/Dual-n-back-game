/* =========================================
   Dual N-Back — Stimulus Generator
   Smart randomization with forced match rate
   ========================================= */

import { LETTERS } from './audio';

const GRID_SIZE = 9; // 3x3 grid positions 0-8
const MATCH_RATE_MIN = 0.2;
const MATCH_RATE_MAX = 0.3;

/**
 * Generate a single stimulus
 * @returns {{ position: number, sound: string }}
 */
function randomStimulus() {
  return {
    position: Math.floor(Math.random() * GRID_SIZE),
    sound: LETTERS[Math.floor(Math.random() * LETTERS.length)],
  };
}

/**
 * Generate the next stimulus with smart match control
 * @param {Array} sequence - Existing sequence of stimuli
 * @param {number} nLevel - Current N level
 * @returns {{ position: number, sound: string }}
 */
export function generateStimulus(sequence, nLevel) {
  const index = sequence.length;

  // For the first N stimuli, just generate random
  if (index < nLevel) {
    return randomStimulus();
  }

  const target = sequence[index - nLevel];

  // Count how many matches we've created so far (from index nLevel onward)
  const eligibleCount = index - nLevel; // how many stimuli have been eligible for matching
  let visualMatches = 0;
  let audioMatches = 0;

  for (let i = nLevel; i < index; i++) {
    if (sequence[i].position === sequence[i - nLevel].position) visualMatches++;
    if (sequence[i].sound === sequence[i - nLevel].sound) audioMatches++;
  }

  const currentVisualRate = eligibleCount > 0 ? visualMatches / eligibleCount : 0;
  const currentAudioRate = eligibleCount > 0 ? audioMatches / eligibleCount : 0;

  // Decide whether to force a match
  let forceVisual = false;
  let forceAudio = false;

  // If below minimum rate and we have enough history, force matches more often
  if (currentVisualRate < MATCH_RATE_MIN) {
    forceVisual = Math.random() < 0.5;
  } else if (currentVisualRate > MATCH_RATE_MAX) {
    forceVisual = false;
  } else {
    forceVisual = Math.random() < 0.25;
  }

  if (currentAudioRate < MATCH_RATE_MIN) {
    forceAudio = Math.random() < 0.5;
  } else if (currentAudioRate > MATCH_RATE_MAX) {
    forceAudio = false;
  } else {
    forceAudio = Math.random() < 0.25;
  }

  const stimulus = randomStimulus();

  if (forceVisual) {
    stimulus.position = target.position;
  }
  if (forceAudio) {
    stimulus.sound = target.sound;
  }

  return stimulus;
}

/**
 * Check if the current stimulus is a visual N-back match
 */
export function isVisualMatch(sequence, index, nLevel) {
  if (index < nLevel) return false;
  return sequence[index].position === sequence[index - nLevel].position;
}

/**
 * Check if the current stimulus is an audio N-back match
 */
export function isAudioMatch(sequence, index, nLevel) {
  if (index < nLevel) return false;
  return sequence[index].sound === sequence[index - nLevel].sound;
}
