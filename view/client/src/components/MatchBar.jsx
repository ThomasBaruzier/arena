import { memo } from 'react';

const MatchBar = memo(function MatchBar({ game }) {
  if (!game) {
    return <div className="placeholder-text">Select a match</div>;
  }

  const slot1Black = game.black_slot === 1;

  const slot1 = {
    name: slot1Black ? game.black_name : game.white_name,
    version: slot1Black ? game.black_ver : game.white_ver,
    color: slot1Black ? 'black' : 'white'
  };

  const slot2 = {
    name: slot1Black ? game.white_name : game.black_name,
    version: slot1Black ? game.white_ver : game.black_ver,
    color: slot1Black ? 'white' : 'black'
  };

  const winnerSlot =
    game.winner_color === 1 ? game.black_slot : game.winner_color === 2 ? game.white_slot : 0;

  const score =
    game.winner_color === 0
      ? null
      : game.winner_color === 3
        ? '½ – ½'
        : game.winner_color === 4
          ? 'VOID'
          : winnerSlot === 1
            ? '1 – 0'
            : '0 – 1';

  return (
    <div className="match-bar">
      <div className="player-left">
        <span className={`p-color ${slot1.color}`} aria-label={`${slot1.color} stone`} />
        <span className="p-ver">{slot1.version}</span>
        <span className={`p-name ${winnerSlot === 1 ? 'gold' : ''}`}>{slot1.name}</span>
      </div>

      <div className="score-center">
        {score == null ? (
          <span className="live-tag">LIVE</span>
        ) : (
          <span className={`final-score ${game.winner_color === 4 ? 'void' : ''}`}>{score}</span>
        )}
      </div>

      <div className="player-right">
        <span className={`p-name ${winnerSlot === 2 ? 'gold' : ''}`}>{slot2.name}</span>
        <span className="p-ver">{slot2.version}</span>
        <span className={`p-color ${slot2.color}`} aria-label={`${slot2.color} stone`} />
      </div>
    </div>
  );
});

export default MatchBar;
