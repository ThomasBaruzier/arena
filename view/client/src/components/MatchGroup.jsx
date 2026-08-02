import { useEffect, useId, useRef } from 'react';
import { ChevronDown, ChevronRight, ChevronUp, Loader, RotateCcw } from 'lucide-react';
import { formatDuration, formatGameId } from '../formatters';
import { useTournamentHistory } from '../hooks/useTournamentHistory';
import { getRunId } from '../utils';
import TournamentStats from './TournamentStats';

const COLUMNS = [
  { column: 'id', label: 'ID', name: 'game ID' },
  { column: null, label: 'Side' },
  { column: 'moves', label: 'Mvs', name: 'move count' },
  { column: 'duration', label: 'Dur', name: 'duration' },
  { column: 'result', label: 'Res', name: 'result' }
];

const slot1Won = (game) =>
  (game.winner_color === 1 && game.black_slot === 1) ||
  (game.winner_color === 2 && game.white_slot === 1);

const resultLabel = (game) => {
  if (game.winner_color === 0) return 'live';
  if (game.winner_color === 3) return 'draw';
  if (game.winner_color === 4) return 'void';
  return slot1Won(game) ? 'slot 1 win' : 'slot 1 loss';
};

const resultClass = (game) => {
  if (game.winner_color === 3) return 'res-dot draw';
  if (game.winner_color === 4) return 'res-dot void';
  return slot1Won(game) ? 'res-dot res-win' : 'res-dot res-loss';
};

const timestampValue = (value) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'unknown time' : date.toLocaleString();
};

const Identity = ({ player }) => (
  <span className="player-identity" data-testid={`player-row-${player.slot}`}>
    <span className="p-name-text" title={player.name}>
      {player.name}
    </span>
    <span className="ver-tag" title={player.version}>
      {player.version}
    </span>
  </span>
);

const Record = ({ wins, losses, draws }) => (
  <span
    className="tournament-record"
    aria-label={`${wins} wins, ${losses} losses, ${draws} draws`}
  >
    <span className="badge win">W {wins}</span>
    <span className="badge loss">L {losses}</span>
    <span className="badge draw">D {draws}</span>
  </span>
);

const TournamentIndicator = ({ phase }) => (
  <span className={`group-indicator ${phase}`} aria-hidden="true">
    <ChevronRight size={15} className="group-arrow" />
    <Loader size={14} className="group-spinner spin" />
  </span>
);

const SortIcon = ({ active, ascending, pending }) => {
  if (pending) return <Loader size={10} className="spin" />;
  if (!active) return null;
  return ascending ? <ChevronUp size={10} /> : <ChevronDown size={10} />;
};

const RetryButton = ({ loading, label, onClick }) => (
  <button type="button" onClick={onClick} disabled={loading}>
    {loading ? <Loader size={13} className="spin" /> : <RotateCcw size={13} />}
    {label}
  </button>
);

export default function MatchGroup({
  group,
  run,
  selectedGameId,
  onSelectGame,
  subscribe,
  phase,
  preparationToken,
  onRequest,
  onPrepared,
  onTransitionEnd
}) {
  const detailsId = useId();
  const sentinelRef = useRef(null);
  const runId = getRunId(group);
  const effectiveRun =
    run || group.run
      ? {
          ...(group.run || {}),
          ...(run || {})
        }
      : null;

  const {
    pairs,
    sort,
    pendingSort,
    fetching,
    error,
    paginationError,
    hasMore,
    sortBy,
    loadMore,
    retry,
    retryPage
  } = useTournamentHistory({
    runId,
    phase,
    preparationToken,
    subscribe,
    onPrepared
  });

  useEffect(() => {
    if (
      phase !== 'open' ||
      error ||
      paginationError ||
      !hasMore ||
      !sentinelRef.current
    ) {
      return undefined;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !fetching) loadMore();
      },
      { rootMargin: '100px' }
    );

    observer.observe(sentinelRef.current);
    return () => observer.disconnect();
  }, [phase, error, paginationError, hasMore, fetching, loadMore]);

  const status = effectiveRun?.status ?? group.status ?? 'live';
  const gamesPlayed = effectiveRun?.games_played ?? group.total ?? 0;
  const totalGames = effectiveRun?.total_games ?? 0;
  const wins = effectiveRun?.wins ?? group.heroWins ?? 0;
  const losses = effectiveRun?.losses ?? group.villainWins ?? 0;
  const draws = effectiveRun?.draws ?? group.draws ?? 0;
  const progress = totalGames > 0 ? Math.min(100, (gamesPlayed / totalGames) * 100) : 0;
  const tone = wins > losses ? 'slot1-ahead' : losses > wins ? 'slot1-behind' : 'tied';
  const mounted = phase !== 'closed';
  const expanded = phase === 'opening' || phase === 'open' || phase === 'closing';
  const interactive = phase === 'open';
  const retryVisible = error || (fetching && pairs.length === 0 && phase === 'open');

  return (
    <div className={`group-item ${phase} ${tone}`} data-testid="match-group">
      <button
        type="button"
        className="group-header"
        aria-expanded={expanded}
        aria-controls={detailsId}
        aria-busy={phase === 'preparing'}
        onClick={onRequest}
      >
        {status === 'live' && totalGames > 0 && (
          <span className="header-progress-bg" style={{ width: `${progress}%` }} />
        )}

        <TournamentIndicator phase={phase} />

        <span className="tournament-summary">
          <span className="summary-row">
            <Identity player={group.hero} />
            <Record wins={wins} losses={losses} draws={draws} />
          </span>

          <span className="summary-row">
            <Identity player={group.villain} />

            <span className="run-summary">
              <span className={`badge run-status ${status}`}>
                {status.toUpperCase()}
              </span>
              <span className={`badge run-progress ${status}`}>
                {gamesPlayed}
                {totalGames > 0 ? `/${totalGames}` : ''}
              </span>
            </span>
          </span>
        </span>
      </button>

      {mounted && (
        <div
          id={detailsId}
          className={`group-list ${phase}`}
          aria-busy={fetching}
          inert={!interactive}
          onTransitionEnd={(event) => {
            if (
              event.target === event.currentTarget &&
              event.propertyName === 'grid-template-rows' &&
              (phase === 'opening' || phase === 'closing')
            ) {
              onTransitionEnd();
            }
          }}
        >
          <div className="group-list-clip">
            <div className="group-list-inner">
              <TournamentStats run={effectiveRun} />

              {retryVisible ? (
                <div
                  className="retry-state"
                  role="alert"
                  aria-label="Could not load game history"
                >
                  <RetryButton loading={fetching} label="Retry" onClick={retry} />
                </div>
              ) : (
                <>
                  <div
                    className="match-header-row"
                    role="row"
                    aria-label="Historical game columns"
                  >
                    {COLUMNS.map(({ column, label, name }) => {
                      const active = column && sort.col === column;
                      const pending = column && pendingSort?.col === column;
                      const direction = active
                        ? sort.asc
                          ? 'ascending'
                          : 'descending'
                        : 'none';

                      if (!column) {
                        return (
                          <span
                            key={label}
                            className="history-head-cell side"
                            role="columnheader"
                          >
                            {label}
                          </span>
                        );
                      }

                      return (
                        <span
                          key={column}
                          className={`history-head-cell ${column}`}
                          role="columnheader"
                          aria-sort={direction}
                        >
                          <button
                            type="button"
                            className={`sort-col ${column} ${active ? 'active' : ''}`}
                            aria-label={`Sort by ${name}, ${direction}`}
                            aria-busy={pending}
                            disabled={fetching}
                            onClick={() => sortBy(column)}
                          >
                            <span>{label}</span>
                            <span className="sort-icon">
                              <SortIcon
                                active={active}
                                ascending={sort.asc}
                                pending={pending}
                              />
                            </span>
                          </button>
                        </span>
                      );
                    })}
                  </div>

                  {pairs.map((pair) => (
                    <div
                      key={pair.group_id}
                      className={`pair-container ${
                        pair.games.length === 1 ? 'pending' : ''
                      }`}
                    >
                      {pair.games.map((game) => {
                        const live = game.winner_color === 0;
                        const duration = live ? '—' : formatDuration(game.duration);
                        const durationTitle = live
                          ? 'Duration in progress'
                          : `${game.duration} ms`;
                        const durationDescription = live
                          ? 'duration in progress'
                          : `${game.duration} milliseconds`;
                        const side = game.black_slot === 1 ? 'black' : 'white';

                        return (
                          <button
                            type="button"
                            key={game.id}
                            className={`match-row ${
                              String(selectedGameId) === String(game.id) ? 'active' : ''
                            }`}
                            onClick={() => onSelectGame(game.id)}
                            data-testid="match-row"
                            aria-label={
                              `Game ${game.id}, slot 1 ${side}, ` +
                              `${game.move_count} moves, ${durationDescription}, ` +
                              `${resultLabel(game)}, ${timestampValue(game.timestamp)}`
                            }
                          >
                            <span
                              className="row-id"
                              aria-hidden="true"
                              title={`Game ${game.id}`}
                            >
                              {formatGameId(game.id)}
                            </span>

                            <span className="row-side" aria-hidden="true">
                              <span className={`side-stone ${side}`} />
                            </span>

                            <span className="row-moves" aria-hidden="true">
                              {game.move_count}
                            </span>

                            <span
                              className="row-duration"
                              aria-hidden="true"
                              title={durationTitle}
                            >
                              {duration}
                            </span>

                            <span className="row-status" aria-hidden="true">
                              {live ? (
                                <span className="live-dot" />
                              ) : (
                                <span className={resultClass(game)} />
                              )}
                            </span>
                          </button>
                        );
                      })}

                      {pair.games.length === 1 && (
                        <div className="pending-row">
                          <Loader size={12} className="spin" />
                          Waiting for pair...
                        </div>
                      )}
                    </div>
                  ))}

                  {paginationError ? (
                    <div
                      className="retry-state compact"
                      role="status"
                      aria-label="Could not load more games"
                    >
                      <RetryButton
                        loading={fetching}
                        label="Load more"
                        onClick={retryPage}
                      />
                    </div>
                  ) : (
                    hasMore && (
                      <div ref={sentinelRef} className="loading-sentinel">
                        {fetching && <Loader size={14} className="spin" />}
                      </div>
                    )
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
