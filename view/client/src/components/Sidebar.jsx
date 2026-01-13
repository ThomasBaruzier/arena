import { useRef, useEffect, useLayoutEffect } from 'react';
import { Swords, Loader } from 'lucide-react';
import { matchupKey } from '../utils';
import MatchGroup from './MatchGroup';

export default function Sidebar({
  matchups,
  runs,
  loading,
  hasMore,
  loadMore,
  selectedId,
  setSelectedId,
  subscribe,
  expandedKey,
  setExpandedKey,
  loadingKey,
  setLoadingKey,
  gameListOffset,
  setGameListOffset,
  setIsManualSelection,
  isManualSelection
}) {
  const scrollRef = useRef(null);
  const sentinelRef = useRef(null);
  const prevFirstKeyRef = useRef(null);
  const hasInitialized = useRef(false);
  const scrollAdjRef = useRef(null);

  useLayoutEffect(() => {
    if (!matchups || matchups.length === 0) return;

    const currentFirstKey = matchupKey(matchups[0]);
    const container = scrollRef.current;

    if (!hasInitialized.current) {
      hasInitialized.current = true;
      prevFirstKeyRef.current = currentFirstKey;
      scrollAdjRef.current = currentFirstKey;
      return;
    }

    if (prevFirstKeyRef.current !== currentFirstKey && container) {
      const firstEl = container.firstElementChild;
      if (firstEl) {
        const displacement = firstEl.offsetHeight + 12;

        if (container.scrollTop < 50) {
          firstEl.style.transition = 'none';
          firstEl.style.marginTop = `-${displacement}px`;

          void firstEl.offsetHeight;

          requestAnimationFrame(() => {
            firstEl.style.transition = 'margin-top 500ms cubic-bezier(0.2, 0.8, 0.2, 1)';
            firstEl.style.marginTop = '0px';
          });

          const cleanup = () => {
            firstEl.style.transition = '';
            firstEl.style.marginTop = '';
          };
          const timer = setTimeout(cleanup, 550);
          return () => {
            clearTimeout(timer);
            cleanup();
          };
        } else {
          if (scrollAdjRef.current !== currentFirstKey) {
            container.scrollTop += displacement;
            scrollAdjRef.current = currentFirstKey;
          }
        }
      }
    }
  }, [matchups]);

  useEffect(() => {
    if (matchups && matchups.length > 0) {
      prevFirstKeyRef.current = matchupKey(matchups[0]);
    }
  }, [matchups]);

  useEffect(() => {
    if (!sentinelRef.current) return;
    const obs = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting && !loading && hasMore) loadMore();
      },
      { rootMargin: '100px' }
    );
    obs.observe(sentinelRef.current);
    return () => obs.disconnect();
  }, [loading, hasMore, loadMore]);

  return (
    <aside className="sidebar">
      <div className="sidebar-header desktop-only">
        <div className="logo">
          <Swords size={20} className="accent" />
          <span>ARENA</span>
        </div>
      </div>
      <div className="sidebar-content" ref={scrollRef}>
        {matchups.map((g) => {
          const key = matchupKey(g);
          return (
            <MatchGroup
              key={key}
              group={g}
              run={runs.find((r) => r.id === g.tournamentId)}
              selectedGameId={selectedId}
              onSelectGame={(id) => {
                setIsManualSelection(true);
                setSelectedId(id);
              }}
              subscribe={subscribe}
              open={expandedKey === key}
              loading={loadingKey === key}
              initialOffset={expandedKey === key ? gameListOffset : null}
              isManualSelection={isManualSelection}
              onLoad={() => {
                setExpandedKey(key);
                setLoadingKey(null);
              }}
              onToggle={() => {
                setIsManualSelection(true);
                if (expandedKey === key) {
                  setExpandedKey(null);
                  setGameListOffset(null);
                } else {
                  setLoadingKey(key);
                }
              }}
            />
          );
        })}
        {hasMore && (
          <div ref={sentinelRef} className="loading-sentinel">
            {loading && <Loader size={16} className="spin" />}
          </div>
        )}
        {!hasMore && !matchups.length && <div className="empty-msg">Waiting for matches...</div>}
      </div>
    </aside>
  );
}
