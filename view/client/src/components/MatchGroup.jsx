import { useState, useEffect, useRef } from 'react';
import { ChevronDown, ChevronRight, ChevronUp, Loader } from 'lucide-react';
import { useMatchPairs } from '../hooks/useMatchPairs';
import LiveDuration from './LiveDuration';
import MatchStats from './MatchStats';

export default function MatchGroup({
  group,
  run,
  selectedGameId,
  onSelectGame,
  subscribe,
  open,
  loading,
  onLoad,
  onToggle,
  initialOffset,
  isManualSelection
}) {
  const { pairs, loaded, hasMore, sort, handleSort, loadMore } = useMatchPairs(
    group,
    subscribe,
    open || loading,
    initialOffset
  );
  const activeRowRef = useRef(null);
  const sentinelRef = useRef(null);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    if (loading && loaded) {
      onLoad();
    }
  }, [loading, loaded, onLoad]);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (open && loaded && selectedGameId && activeRowRef.current && !isManualSelection) {
      const row = activeRowRef.current;
      const container = row.closest('.group-list-scroll');
      if (container) {
        const rowRect = row.getBoundingClientRect();
        const containerRect = container.getBoundingClientRect();
        const isVisible =
          rowRect.top >= containerRect.top && rowRect.bottom <= containerRect.bottom;

        if (!isVisible) {
          row.scrollIntoView({ block: 'center', behavior: 'instant' });
        }
      }
    }
  }, [open, loaded, selectedGameId, isManualSelection]);

  useEffect(() => {
    if (!open || !loaded || !sentinelRef.current) return;
    const obs = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting && hasMore) loadMore();
      },
      { rootMargin: '100px' }
    );
    obs.observe(sentinelRef.current);
    return () => obs.disconnect();
  }, [open, loaded, hasMore, loadMore]);

  const progress = run && run.total_games > 0 ? (run.games_played / run.total_games) * 100 : 0;
  const isFinished = run && run.games_played >= run.total_games;

  const safeDate = (ts) => {
    if (!ts) return 0;
    return new Date(ts.endsWith('Z') ? ts : ts + 'Z').getTime();
  };

  const activeGames = group.live_count || 0;
  const lastCrashDelta = group.lastCrash ? now - group.lastCrash : Infinity;
  const isBurstCrash = activeGames === 0 && lastCrashDelta < 60000;

  const isDead =
    run &&
    !isFinished &&
    (run.timed_out || isBurstCrash || now - safeDate(group.lastActivity) > 60000);

  const showCrashes = run && (run.p1_crashes > 0 || run.p2_crashes > 0);

  let zScore = 0;
  if (run && run.games_played > 0) {
    const total = group.heroWins + group.villainWins + group.draws;
    if (total > 0) {
      const score = group.heroWins + 0.5 * group.draws;
      const mu = 0.5 * total;
      const sigma = 0.5 * Math.sqrt(total);
      zScore = (score - mu) / sigma;
    }
  }

  const getStatusClass = (g) => {
    if (g.winner_color === 4) return 'res-dot crash-dot';
    if (g.winner_color === 0) return 'live-dot';
    if (g.winner_color === 3) return 'res-dot draw';
    const isHeroWin =
      (g.winner_color === 1 && g.black_id === group.hero.id) ||
      (g.winner_color === 2 && g.white_id === group.hero.id);
    return isHeroWin ? 'res-dot res-win' : 'res-dot res-loss';
  };

  const isOpen = open && loaded;
  let borderClass = '';
  if (zScore >= 1.28) borderClass = 'z-good';
  else if (zScore <= -1.28) borderClass = 'z-bad';

  return (
    <div className="group-wrapper">
      <div
        className={`group-item ${isOpen ? 'open' : ''} ${isDead ? 'timed-out' : ''} ${borderClass}`}
        data-testid="match-group"
      >
        <div className="group-header" onClick={onToggle}>
          {run && !isFinished && !isDead && (
            <div className="header-progress-bg" style={{ width: `${progress}%` }} />
          )}
          <div className="header-content">
            <div className="icon-col">
              {loading ? (
                <Loader size={14} className="spin" />
              ) : open ? (
                <ChevronDown size={14} />
              ) : (
                <ChevronRight size={14} />
              )}
            </div>
            <div className="group-info">
              <div className="info-row">
                <div className="player-info">
                  <span
                    className={`p-name-text ${group.heroWins > group.villainWins ? 'gold-text' : ''}`}
                  >
                    {group.hero.name}
                  </span>
                  <span className="ver-tag">{group.hero.version}</span>
                </div>
                <div className="meta-info">
                  <span className={`badge ${group.heroWins > group.villainWins ? 'win' : ''}`}>
                    W {group.heroWins}
                  </span>
                  <span className={`badge ${group.villainWins > group.heroWins ? 'loss' : ''}`}>
                    L {group.villainWins}
                  </span>
                  <span className="badge draw">D {group.draws}</span>
                  {showCrashes && (
                    <span className="badge crash">
                      C {(run.p1_crashes || 0) + (run.p2_crashes || 0)}
                    </span>
                  )}
                </div>
              </div>
              <div className="info-row">
                <div className="player-info">
                  <span
                    className={`p-name-text ${group.villainWins > group.heroWins ? 'gold-text' : ''}`}
                  >
                    {group.villain.name}
                  </span>
                  <span className="ver-tag">{group.villain.version}</span>
                </div>
                {run && (
                  <div className="meta-info">
                    {activeGames > 0 && <span className="badge pending">P: {activeGames}</span>}
                    <span
                      className={`badge progress ${isFinished ? 'finished' : ''} ${isDead ? 'danger' : ''}`}
                    >
                      {run.games_played}/{run.total_games}
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>
          {run && <MatchStats run={run} showCrashes={showCrashes} />}
        </div>
        <div
          className={`group-list-wrapper ${isOpen ? 'open' : ''}`}
          style={{ transition: !isManualSelection ? 'none' : undefined }}
        >
          <div className="group-list-inner">
            <div className="group-list-scroll">
              <div className="match-header-row">
                {[
                  ['id', 'ID'],
                  ['duration', 'Dur'],
                  ['moves', 'Mvs'],
                  ['status', 'Res'],
                  ['time', 'Time']
                ].map(([col, label]) => (
                  <div
                    key={col}
                    onClick={() => handleSort(col)}
                    className={`sort-col ${sort.col === col ? 'active' : ''}`}
                  >
                    {label}{' '}
                    {sort.col === col &&
                      (sort.asc ? <ChevronUp size={10} /> : <ChevronDown size={10} />)}
                  </div>
                ))}
              </div>
              {pairs.map((p) => (
                <div
                  key={p.group_id}
                  className={`pair-container ${p.games.length === 1 ? 'pending' : ''}`}
                >
                  {p.games.map((g) => (
                    <div
                      key={g.id}
                      className={`match-row ${selectedGameId === g.id ? 'active' : ''} ${g.winner_color === 4 ? 'crash' : ''}`}
                      onClick={() => onSelectGame(g.id)}
                      data-testid="match-row"
                      ref={selectedGameId === g.id ? activeRowRef : null}
                    >
                      <div className="row-id">#{g.id}</div>
                      <LiveDuration game={g} isDead={isDead} />
                      <div className="row-moves">{g.move_count || 0}</div>
                      <div className="row-status">
                        {g.winner_color === 0 ? (
                          isDead ? (
                            <div className="res-dot crash-dot" />
                          ) : (
                            <span className="live-dot" />
                          )
                        ) : (
                          <div className={getStatusClass(g)} />
                        )}
                      </div>
                      <div className="row-time">
                        {new Date(g.timestamp).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                          hour12: false
                        })}
                      </div>
                    </div>
                  ))}
                  {p.games.length === 1 && <div className="pending-row">Waiting for pair...</div>}
                </div>
              ))}
              {hasMore && <div ref={sentinelRef} className="loading-sentinel"></div>}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
