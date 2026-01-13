import { memo } from 'react';

const MatchBar = memo(function MatchBar({ game }) {
  if (!game) return <div className="placeholder-text">Select a match</div>;

  const isBlackP1 = game.black_is_p1 ?? true;
  const p1Name = isBlackP1 ? game.black_name : game.white_name;
  const p2Name = isBlackP1 ? game.white_name : game.black_name;
  const p1Ver = isBlackP1 ? game.black_ver : game.white_ver;
  const p2Ver = isBlackP1 ? game.white_ver : game.black_ver;
  const p1Gold = game.winner_color === 1;
  const p2Gold = game.winner_color === 2;

  const renderScore = () => {
    if (game.winner_color === 0) return <span className="live-tag">LIVE</span>;
    if (game.winner_color === 3) return <span className="final-score">½ - ½</span>;
    return (
      <span className="final-score">
        {game.winner_color === 1 ? 1 : 0} - {game.winner_color === 2 ? 1 : 0}
      </span>
    );
  };

  return (
    <div className="match-bar">
      <div className="player-left">
        <span className="p-ver">{p1Ver}</span>
        <span className={`p-name ${p1Gold ? 'gold' : ''}`}>{p1Name}</span>
        <div className={`p-color ${isBlackP1 ? 'black' : 'white'}`} />
      </div>
      <div className="score-center">{renderScore()}</div>
      <div className="player-right">
        <div className={`p-color ${isBlackP1 ? 'white' : 'black'}`} />
        <span className={`p-name ${p2Gold ? 'gold' : ''}`}>{p2Name}</span>
        <span className="p-ver">{p2Ver}</span>
      </div>
    </div>
  );
});

export default MatchBar;
