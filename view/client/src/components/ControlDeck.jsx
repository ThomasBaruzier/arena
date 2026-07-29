import { FastForward, Pause, Play, RotateCcw, SkipBack, SkipForward } from 'lucide-react';

export default function ControlDeck({
  isPlaying,
  setIsPlaying,
  setMoveIndex,
  totalMoves,
  moveIndex,
  speed,
  setSpeed
}) {
  return (
    <div className="control-deck">
      <div className="deck-group playback">
        <button
          type="button"
          aria-label="Go to first position"
          onClick={() => {
            setIsPlaying(false);
            setMoveIndex(0);
          }}
        >
          <RotateCcw size={16} />
        </button>

        <button
          type="button"
          aria-label="Previous move"
          onClick={() => {
            setIsPlaying(false);
            setMoveIndex((current) => Math.max(0, current - 1));
          }}
        >
          <SkipBack size={16} />
        </button>

        <button
          type="button"
          className="play-btn"
          aria-label={isPlaying ? 'Pause playback' : 'Play playback'}
          onClick={() => {
            if (moveIndex >= totalMoves) {
              setMoveIndex(0);
            }

            setIsPlaying(!isPlaying);
          }}
        >
          {isPlaying ? (
            <Pause size={20} fill="currentColor" />
          ) : (
            <Play size={20} fill="currentColor" />
          )}
        </button>

        <button
          type="button"
          aria-label="Next move"
          onClick={() => {
            setIsPlaying(false);
            setMoveIndex((current) => Math.min(totalMoves, current + 1));
          }}
        >
          <SkipForward size={16} />
        </button>

        <button
          type="button"
          aria-label="Go to final position"
          onClick={() => {
            setIsPlaying(false);
            setMoveIndex(totalMoves);
          }}
        >
          <FastForward size={16} />
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

      <div className="deck-info">Move: {moveIndex}</div>
    </div>
  );
}
