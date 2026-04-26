/* =========================================
   Dual N-Back — Main Application
   ========================================= */

import { useEffect, useCallback } from 'react';
import { useGameEngine, GAME_IDLE, GAME_RUNNING, GAME_PAUSED } from './useGameEngine';
import Grid from './components/Grid';
import Controls from './components/Controls';
import ScoreBoard from './components/ScoreBoard';
import MatchButtons from './components/MatchButtons';
import Header from './components/Header';

export default function App() {
  const engine = useGameEngine();

  // --- Keyboard input handler ---
  const handleKeyDown = useCallback((e) => {
    const key = e.key.toLowerCase();

    if (key === 'v') {
      e.preventDefault();
      engine.handleVisualInput();
    } else if (key === 'a') {
      e.preventDefault();
      engine.handleAudioInput();
    } else if (key === ' ') {
      e.preventDefault();
      if (engine.gameState === GAME_RUNNING) {
        engine.pauseGame();
      } else {
        engine.startGame();
      }
    } else if (key === 'r' && e.ctrlKey) {
      e.preventDefault();
      engine.resetGame();
    }
  }, [engine]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  const trialNumber = engine.currentIndex + 1;

  return (
    <div className="app">
      <div className="app-bg" />

      <div className="app-container">
        <Header nLevel={engine.nLevel} />

        <div className="game-layout">
          {/* Left panel — scores */}
          <div className="panel panel-left">
            <ScoreBoard scores={engine.scores} nLevel={engine.nLevel} />
          </div>

          {/* Center — grid + match buttons */}
          <div className="panel panel-center">
            <div className="trial-indicator">
              {engine.gameState !== GAME_IDLE && (
                <span className="trial-badge">
                  Trial <strong>{trialNumber > 0 ? trialNumber : '—'}</strong>
                </span>
              )}
              {engine.showingStimulus && engine.activeLetter && (
                <span className="letter-badge">{engine.activeLetter}</span>
              )}
              {engine.gameState === GAME_PAUSED && (
                <span className="pause-badge">PAUSED</span>
              )}
            </div>

            <Grid
              activePosition={engine.activePosition}
              showingStimulus={engine.showingStimulus}
            />

            <MatchButtons
              onVisual={engine.handleVisualInput}
              onAudio={engine.handleAudioInput}
              visualPressed={engine.visualPressed}
              audioPressed={engine.audioPressed}
              visualFeedback={engine.visualFeedback}
              audioFeedback={engine.audioFeedback}
              disabled={engine.gameState !== GAME_RUNNING}
            />
          </div>

          {/* Right panel — controls */}
          <div className="panel panel-right">
            <Controls
              gameState={engine.gameState}
              nLevel={engine.nLevel}
              gapDuration={engine.gapDuration}
              onStart={engine.startGame}
              onPause={engine.pauseGame}
              onReset={engine.resetGame}
              onNLevelChange={engine.setNLevel}
              onGapDurationChange={engine.setGapDuration}
            />
          </div>
        </div>

        <footer className="app-footer">
          <p>
            Press <kbd>V</kbd> for visual match · <kbd>A</kbd> for audio match · <kbd>Space</kbd> to start/pause
          </p>
        </footer>
      </div>
    </div>
  );
}
