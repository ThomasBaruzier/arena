import { ChevronLeft, ChevronRight, SkipBack, SkipForward } from 'lucide-react';

export default function ControlDeck({
  setMoveIndex,
  totalMoves,
  moveIndex,
  onSeekStart,
  onSeekEnd,
  onPlayInteraction,
  isLive
}) {
  const handleSeek = (e) => setMoveIndex(Number(e.target.value));
  const handleSeekEnd = (e) => onSeekEnd && onSeekEnd(Number(e.target.value));

  const interact = (fn) => {
    if (onPlayInteraction) onPlayInteraction();
    fn();
  };

  const currentValue = isLive ? totalMoves : moveIndex;

  return (
    <div className={`control-deck ${isLive ? 'live' : ''}`}>
      <button
        className="deck-btn"
        onClick={() => interact(() => setMoveIndex(0))}
        disabled={moveIndex === 0}
      >
        <SkipBack size={18} />
      </button>
      <button
        className="deck-btn"
        onClick={() => interact(() => setMoveIndex((m) => Math.max(0, m - 1)))}
        disabled={moveIndex === 0}
      >
        <ChevronLeft size={18} />
      </button>

      <div className="seek-container">
        <input
          type="range"
          min="0"
          max={totalMoves}
          value={currentValue}
          onPointerDown={onSeekStart}
          onPointerUp={handleSeekEnd}
          onChange={handleSeek}
          className="integrated-seek"
        />
      </div>

      <button
        className="deck-btn"
        onClick={() => interact(() => setMoveIndex((m) => Math.min(totalMoves, m + 1)))}
        disabled={moveIndex === totalMoves}
      >
        <ChevronRight size={18} />
      </button>
      <button
        className="deck-btn"
        onClick={() => interact(() => setMoveIndex(totalMoves))}
        disabled={moveIndex === totalMoves}
      >
        <SkipForward size={18} />
      </button>
    </div>
  );
}
