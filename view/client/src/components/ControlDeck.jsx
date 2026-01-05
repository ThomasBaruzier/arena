import { Play, Pause, SkipBack, SkipForward, RotateCcw, FastForward } from 'lucide-react';

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
          onClick={() => {
            setIsPlaying(false);
            setMoveIndex(0);
          }}
        >
          <RotateCcw size={16} />
        </button>
        <button
          onClick={() => {
            setIsPlaying(false);
            setMoveIndex((m) => Math.max(0, m - 1));
          }}
        >
          <SkipBack size={16} />
        </button>
        <button
          className="play-btn"
          onClick={() => {
            if (moveIndex >= totalMoves) setMoveIndex(0);
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
          onClick={() => {
            setIsPlaying(false);
            setMoveIndex((m) => Math.min(totalMoves, m + 1));
          }}
        >
          <SkipForward size={16} />
        </button>
        <button
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
        {[1, 2, 3].map((s) => (
          <button key={s} className={speed === s ? 'active' : ''} onClick={() => setSpeed(s)}>
            {s}x
          </button>
        ))}
      </div>
      <div className="deck-info">Move: {moveIndex}</div>
    </div>
  );
}
