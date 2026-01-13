import { useEffect, useState } from 'react';
import { useMatchups } from './hooks/useMatchups';
import { useRuns } from './hooks/useRuns';
import { useGameContext } from './hooks/useGameContext';
import Sidebar from './components/Sidebar';
import Arena from './components/Arena';

const API_BASE = '/api';

export default function App() {
  const {
    game,
    initializing,
    selectedId,
    setSelectedId,
    parsedMoves,
    openingLen,
    totalLogicalMoves,
    playback,
    onSeekStart,
    onSeekEnd,
    onPlayInteraction,
    subscribe,
    expandedKey,
    setExpandedKey,
    loadingKey,
    setLoadingKey,
    sidebarOffset,
    gameListOffset,
    setGameListOffset,
    isManualSelection,
    setIsManualSelection,
    isExiting
  } = useGameContext(API_BASE);

  const {
    matchups,
    loading: matchupsLoading,
    hasMore: matchupsHasMore,
    loadMore,
    jumpTo
  } = useMatchups(subscribe);

  const { runs } = useRuns(subscribe);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    if (!initializing && !matchupsLoading) {
      const timer = setTimeout(() => setIsReady(true), 50);
      return () => clearTimeout(timer);
    }
  }, [initializing, matchupsLoading]);

  useEffect(() => {
    if (expandedKey && sidebarOffset !== null) {
      jumpTo(sidebarOffset);
    }
  }, [expandedKey, sidebarOffset, jumpTo]);

  const actualMoveIndex = openingLen + playback.moveIndex;

  return (
    <div className={`app ${isReady ? 'loaded' : ''}`}>
      <Sidebar
        matchups={matchups}
        runs={runs}
        loading={matchupsLoading}
        hasMore={matchupsHasMore}
        loadMore={loadMore}
        selectedId={selectedId}
        setSelectedId={setSelectedId}
        subscribe={subscribe}
        expandedKey={expandedKey}
        setExpandedKey={setExpandedKey}
        loadingKey={loadingKey}
        setLoadingKey={setLoadingKey}
        gameListOffset={gameListOffset}
        setGameListOffset={setGameListOffset}
        setIsManualSelection={setIsManualSelection}
        isManualSelection={isManualSelection}
      />
      <Arena
        game={game}
        parsedMoves={parsedMoves}
        moveIndex={actualMoveIndex}
        winnerColor={game?.winner_color}
        openingLen={openingLen}
        totalLogicalMoves={totalLogicalMoves}
        playback={playback}
        onSeekStart={onSeekStart}
        onSeekEnd={onSeekEnd}
        onPlayInteraction={onPlayInteraction}
        isExiting={isExiting}
      />
    </div>
  );
}
