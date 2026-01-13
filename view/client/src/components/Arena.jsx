import { Swords } from 'lucide-react';
import Board from './Board';
import ControlDeck from './ControlDeck';
import MatchBar from './MatchBar';

export default function Arena({
  game,
  parsedMoves,
  moveIndex,
  winnerColor,
  openingLen,
  totalLogicalMoves,
  playback,
  onSeekStart,
  onSeekEnd,
  onPlayInteraction,
  isExiting
}) {
  return (
    <main className="main-area">
      <header className="topbar">
        <MatchBar game={game} />
      </header>

      <div className="stage">
        {game ? (
          <>
            <div className="board-container">
              <Board
                parsedMoves={parsedMoves}
                moveIndex={moveIndex}
                winnerColor={winnerColor}
                isPlaying={false}
                openingLen={openingLen}
                isExiting={isExiting}
              />
            </div>
            <div className="control-deck-wrapper">
              <ControlDeck
                {...playback}
                totalMoves={totalLogicalMoves}
                onSeekStart={onSeekStart}
                onSeekEnd={onSeekEnd}
                onPlayInteraction={onPlayInteraction}
              />
            </div>
          </>
        ) : (
          <div className="empty-stage">
            <Swords size={96} opacity={0.2} />
          </div>
        )}
      </div>
    </main>
  );
}
