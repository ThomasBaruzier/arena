import { memo } from 'react';

const MatchBar = memo(function MatchBar({ game }) {
  if (!game) return <div className="placeholder-text">Select a match</div>;

  const isSlot1Black = game.black_slot === 1;
  const p1Name = isSlot1Black ? game.black_name : game.white_name;
  const p2Name = isSlot1Black ? game.white_name : game.black_name;
  const p1Ver = isSlot1Black ? game.black_ver : game.white_ver;
  const p2Ver = isSlot1Black ? game.white_ver : game.black_ver;
  const winnerSlot =
    game.winner_color === 1 ? game.black_slot : game.winner_color === 2 ? game.white_slot : 0;
  const p1Gold = winnerSlot === 1;
  const p2Gold = winnerSlot === 2;

  const renderScore = () => {
    if (game.winner_color === 0) return <span className="live-tag">LIVE</span>;
    if (game.winner_color === 3) return <span className="final-score">½ - ½</span>;
    return (
      <span className="final-score">
        {p1Gold ? 1 : 0} - {p2Gold ? 1 : 0}
      </span>
    );
  };

  return (
    <div className="match-bar">
      <div className="player-left">
        <span className="p-ver">{p1Ver}</span>
        <span className={`p-name ${p1Gold ? 'gold' : ''}`}>{p1Name}</span>
        <div className={`p-color ${isSlot1Black ? 'black' : 'white'}`} />
      </div>
      <div className="score-center">{renderScore()}</div>
      <div className="player-right">
        <div className={`p-color ${isSlot1Black ? 'white' : 'black'}`} />
        <span className={`p-name ${p2Gold ? 'gold' : ''}`}>{p2Name}</span>
        <span className="p-ver">{p2Ver}</span>
      </div>
    </div>
  );
});

export default MatchBar;
