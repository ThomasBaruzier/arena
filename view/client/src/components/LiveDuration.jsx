import { useState, useEffect } from 'react';
import { formatDuration } from '../utils';

export default function LiveDuration({ game, isDead }) {
  const [dur, setDur] = useState(() => {
    if (game.winner_color !== 0 || isDead) {
      return game.duration || 0;
    }
    return 0;
  });

  useEffect(() => {
    if (game.winner_color !== 0 || isDead) {
      setDur(game.duration || 0);
      return;
    }
    const timestamp = game.timestamp.endsWith('Z') ? game.timestamp : game.timestamp + 'Z';
    const start = new Date(timestamp).getTime();
    const update = () => setDur(Math.max(0, Date.now() - start));
    update();
    const timer = setInterval(update, 1000);
    return () => clearInterval(timer);
  }, [game.winner_color, game.timestamp, game.duration, isDead]);

  return <div className="row-dur">{formatDuration(dur)}</div>;
}
