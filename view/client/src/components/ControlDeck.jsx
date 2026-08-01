import { Pause, Play, RotateCcw, SkipBack, SkipForward } from 'lucide-react';

export default function ControlDeck({
  isPlaying,
  setIsPlaying,
  replayFromStart,
  previousMove,
  nextMove,
  totalMoves,
  moveIndex,
  speed,
  setSpeed,
  transition,
  visualTransitioning
}) {
  const atEnd = moveIndex >= totalMoves;
  const movementLocked = Boolean(transition) || visualTransitioning;

  return (
    <div className="control-deck" aria-label="Game playback" aria-busy={movementLocked}>
      <div className="deck-group playback">
        <button
          type="button"
          aria-label="Replay from start"
          disabled={moveIndex === 0 || movementLocked}
          onClick={replayFromStart}
        >
          <RotateCcw size={17} />
        </button>

        <button
          type="button"
          className="play-btn"
          aria-label={isPlaying ? 'Pause playback' : 'Play playback'}
          disabled={totalMoves === 0 || (atEnd && !isPlaying) || (movementLocked && !isPlaying)}
          onClick={() => setIsPlaying(!isPlaying)}
        >
          {isPlaying ? (
            <Pause size={20} fill="currentColor" />
          ) : (
            <Play size={20} fill="currentColor" />
          )}
        </button>

        <button
          type="button"
          aria-label="Previous move"
          disabled={moveIndex === 0 || movementLocked}
          onClick={previousMove}
        >
          <SkipBack size={17} />
        </button>

        <button
          type="button"
          aria-label="Next move"
          disabled={atEnd || movementLocked}
          onClick={nextMove}
        >
          <SkipForward size={17} />
        </button>
      </div>

      <div className="deck-sep" />

      <div className="deck-group speed">
        {[1, 2, 3].map((value) => (
          <button
            key={value}
            type="button"
            aria-pressed={speed === value}
            className={speed === value ? 'active' : ''}
            onClick={() => setSpeed(value)}
          >
            {value}x
          </button>
        ))}
      </div>

      <div className="deck-info">
        Move {moveIndex}/{totalMoves}
      </div>
    </div>
  );
}
