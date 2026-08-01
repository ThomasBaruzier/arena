import { memo } from 'react';

const playerForSlot = (game, slot) => {
  const black = game.black_slot === slot;

  return {
    name: black ? game.black_name : game.white_name,
    version: black ? game.black_ver : game.white_ver,
    color: black ? 'black' : 'white'
  };
};

const winnerSlot = (game) => {
  if (game.winner_color === 1) {
    return game.black_slot;
  }

  if (game.winner_color === 2) {
    return game.white_slot;
  }

  return 0;
};

const resultText = (game, winner) => {
  if (game.winner_color === 0) {
    return null;
  }

  if (game.winner_color === 3) {
    return '½ – ½';
  }

  if (game.winner_color === 4) {
    return 'VOID';
  }

  return winner === 1 ? '1 – 0' : '0 – 1';
};

const Identity = ({ player, side, winner }) => (
  <div className={`player-side player-${side}`}>
    {side === 'left' && (
      <span className={`p-color ${player.color}`} aria-label={`${player.color} stone`} />
    )}

    <span className="player-identity">
      {side === 'left' && (
        <span className="p-ver" title={player.version}>
          {player.version}
        </span>
      )}

      <span className={`p-name ${winner ? 'gold' : ''}`} title={player.name}>
        {player.name}
      </span>

      {side === 'right' && (
        <span className="p-ver" title={player.version}>
          {player.version}
        </span>
      )}
    </span>

    {side === 'right' && (
      <span className={`p-color ${player.color}`} aria-label={`${player.color} stone`} />
    )}
  </div>
);

const MatchBar = memo(function MatchBar({ game }) {
  if (!game) {
    return <div className="placeholder-text">Select a match</div>;
  }

  const first = playerForSlot(game, 1);

  const second = playerForSlot(game, 2);

  const winner = winnerSlot(game);

  const result = resultText(game, winner);

  return (
    <div className="match-bar">
      <Identity player={first} side="left" winner={winner === 1} />

      <div className="score-center">
        {result == null ? (
          <span className="live-tag">LIVE</span>
        ) : (
          <span className={`final-score ${game.winner_color === 4 ? 'void' : ''}`}>{result}</span>
        )}
      </div>

      <Identity player={second} side="right" winner={winner === 2} />
    </div>
  );
});

export default MatchBar;
