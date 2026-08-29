'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, CloudDownload, Download, Loader2, RotateCcw, ScrollText, X } from 'lucide-react';
import { useLingui } from '@lingui/react';
import { msg } from '@lingui/core/macro';
import { Trans } from '@lingui/react/macro';
import ReactMarkdown from 'react-markdown';
import { fetchUpdateInfo, downloadAndInstall, getUpdateChannel, updatesAreExternal, type UpdateInfo, type DownloadProgress, type UpdateChannel } from '@/features/updater/updateBridge';
import { openSettingsModal } from '@/components/settings/settingsModalEvents';
import { isAllowSameVersionEnabled, enableAllowSameVersionForSession } from '@/features/updater/debugForceSession';
// ---------------------------------------------------------------------------

type IndicatorState =
  | { status: 'idle' }
  | { status: 'checking' }
  | { status: 'available'; info: UpdateInfo }
  | { status: 'downloading'; pct: number }
  | { status: 'error'; message: string };

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const STARTUP_CHECK_DELAY_MS = 5_000;
const RE_CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;
const STORAGE_KEY_SUPPRESSED = 'dragonfruit-update-suppressed-version';

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Silently checks for updates on startup and periodically. When an update
 * is found, opens a structured modal showing version info, release notes,
 * and a download & install flow.
 *
 * Dev shortcut: Ctrl+Shift+U triggers a fake update for testing.
 */
export function GlobalUpdateIndicator() {
  const { _, i18n } = useLingui();
  const [state, setState] = useState<IndicatorState>({ status: 'idle' });
  const [showReleaseNotesModal, setShowReleaseNotesModal] = useState(false);
  const [isExiting, setIsExiting] = useState(false);

  const isSettingsOpen = () => {
    try {
      return !!document.querySelector('div.fixed.inset-0.z-\\[50\\] h2');
    } catch {
      return false;
    }
  };

  const triggerExit = useCallback((after: () => void) => {
    setIsExiting(true);
    window.setTimeout(after, 190);
  }, []);

  // ── Silent background check ──────────────────────────────────────────
  useEffect(() => {
    // Linux installs updates through Flatpak — nothing to check or offer here.
    if (updatesAreExternal()) return;

    let channel: UpdateChannel = 'stable';
    const runCheck = () => {
      const allowSame = isAllowSameVersionEnabled();
      if (allowSame) console.log('[updater] runCheck with allow_same_version=true (session debug)');
      setState({ status: 'checking' });

      fetchUpdateInfo(channel, allowSame)
        .then(async (info) => {
          if (info && !info.body) {
            try {
              const ghRes = await fetch(`https://api.github.com/repos/Open-Resin-Alliance/DragonFruit/releases/tags/v${info.version}`);
              if (ghRes.ok) {
                const gh = await ghRes.json() as { body?: string; published_at?: string };
                if (gh.body) info.body = gh.body as string;
                if (gh.published_at && !info.date) info.date = gh.published_at as string;
              }
            } catch {}
          }
          if (info) {
            const suppressed = (() => {
              try {
                return window.localStorage.getItem(STORAGE_KEY_SUPPRESSED);
              } catch {
                return null;
              }
            })();

            if (suppressed !== info.version) {
              if (isSettingsOpen()) return;
              setState({ status: 'available', info });
              return;
            }
          }
          setState({ status: 'idle' });
        })
        .catch(() => {
          setState({ status: 'idle' });
        });
    };

    // Load the saved channel first, then schedule checks.
    let startupTimer: ReturnType<typeof setTimeout> | undefined;
    let interval: ReturnType<typeof setInterval> | undefined;

    getUpdateChannel().then((c) => {
      channel = c;
      startupTimer = setTimeout(runCheck, STARTUP_CHECK_DELAY_MS);
      interval = setInterval(runCheck, RE_CHECK_INTERVAL_MS);
    });

    return () => {
      clearTimeout(startupTimer);
      clearInterval(interval);
    };
  }, []);

  // ── Dev shortcut: Ctrl+Shift+U ── just enables allow_same_version for regular logic until reload
  useEffect(() => {
    const handleKeyDown = async (e: CustomEvent) => {
      console.log('[updater] hotkey raw', (e as CustomEvent).detail);
      const { key, ctrlKey, shiftKey } = (e.detail as { key: unknown; ctrlKey: unknown; shiftKey: unknown }) as { key: string; ctrlKey: boolean; shiftKey: boolean };
      if (!(ctrlKey && shiftKey && typeof key === 'string' && key.toLowerCase() === 'u')) return;
      enableAllowSameVersionForSession();
      console.log('[updater] Ctrl+Shift+U -> allow_same_version enabled for session, re-checking');
      try {
        const channel = await getUpdateChannel();
        const info = await fetchUpdateInfo(channel, true);
        if (info && !isSettingsOpen()) setState({ status: 'available', info });
      } catch {}
    };
    window.addEventListener('app-hotkey-keydown', handleKeyDown as unknown as EventListener);
    return () => window.removeEventListener('app-hotkey-keydown', handleKeyDown as unknown as EventListener);
  }, []);

  // ── Handlers ────────────────────────────────────────────────────────
  const handleDownloadAndInstall = useCallback(async () => {
    if (state.status !== 'available') return;
    // Force autosave before restart (don't trust user to have saved)
    try { await (window as unknown as { __df_flushAutosave?: () => Promise<void> }).__df_flushAutosave?.(); } catch {}
    try { await new Promise<void>((r) => setTimeout(r, 400)); } catch {}
    setState({ status: 'downloading', pct: 0 });

    try {
      await downloadAndInstall((progress: DownloadProgress) => {
        const pct =
          progress.contentLength > 0
            ? Math.round((progress.downloaded / progress.contentLength) * 100)
            : 0;
        setState({ status: 'downloading', pct });
      });
      // On success the app relaunches.
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Unknown error installing the update.';
      setState({ status: 'error', message });
    }
  }, [state.status]);

  const handleDismiss = useCallback(() => {
    if (state.status !== 'available') return;
    triggerExit(() => {
      try {
        window.localStorage.setItem(STORAGE_KEY_SUPPRESSED, (state as { status: 'available'; info: UpdateInfo }).info.version);
      } catch {
        // ignore
      }
      setState({ status: 'idle' });
      setIsExiting(false);
    });
  }, [state, triggerExit]);

  const handleClose = useCallback(() => {
    triggerExit(() => {
      setState({ status: 'idle' });
      setIsExiting(false);
    });
  }, [triggerExit]);

  // Auto-exit after 30s expiry bar
  useEffect(() => {
    if (state.status !== 'available' || isExiting) return;
    if (isSettingsOpen()) return;
    const timer = window.setTimeout(() => {
      handleDismiss();
    }, 30_000);
    return () => window.clearTimeout(timer);
  }, [state.status, isExiting, handleDismiss]);


  // ── Render ──────────────────────────────────────────────────────────
  const isNotificationVisible = state.status === 'available' || state.status === 'downloading' || state.status === 'error';
  if (!isNotificationVisible) return null;
  // Don't show global notification when already in Settings → Updates (handled in-page)
  if (isSettingsOpen()) return null;

  const info = state.status === 'available' ? state.info : null;
  const isDownloading = state.status === 'downloading';
  const isError = state.status === 'error';
  const errorMessage = state.status === 'error' ? state.message : null;
  const pct = state.status === 'downloading' ? state.pct : 0;
  const parsedDate = info?.date ? new Date(info.date) : null;
  const releaseDate = parsedDate && !Number.isNaN(parsedDate.getTime())
    ? parsedDate.toLocaleDateString(i18n.locale, { year: 'numeric', month: 'long', day: 'numeric' })
    : null;
  const subtitle = releaseDate ? _(msg`Released ${releaseDate}`) : undefined;
  const version = info?.version ?? '?';

  const openSettingsUpdates = () => {
    openSettingsModal('updates');
    handleClose();
  };

  return (
    <>
      <style>{`@keyframes df-update-expiry { from { transform: scaleX(1); } to { transform: scaleX(0); } } @keyframes df-fly-in-right { from { transform: translateX(100%); opacity: 0; } to { transform: translateX(0); opacity: 1; } } @keyframes df-fly-out-right { from { transform: translateX(0); opacity: 1; } to { transform: translateX(100%); opacity: 0; } }`}</style>
      <div className="fixed bottom-6 right-6 z-[130] w-[22rem]" style={{ animation: isExiting ? 'df-fly-out-right 0.18s ease-in forwards' : 'df-fly-in-right 0.2s ease-out forwards' }}>
        <div
          className="relative overflow-hidden rounded-xl border shadow-2xl backdrop-blur-2xl supports-[backdrop-filter]:backdrop-blur-2xl"
          style={{
            background: 'color-mix(in srgb, var(--surface-0), transparent 12%)',
            borderColor: 'color-mix(in srgb, var(--border-subtle), transparent 8%)',
            boxShadow: '0 18px 48px rgba(0,0,0,0.42)',
            backdropFilter: 'blur(32px) saturate(1.5)',
            WebkitBackdropFilter: 'blur(32px) saturate(1.5)',
          }}
        >
          <div className="flex flex-col items-center gap-1.5 p-3.5 text-center">
            <div className="min-w-0">
              <div className="text-base font-bold leading-tight" style={{ color: isDownloading || isError ? 'var(--text-strong)' : 'var(--accent-secondary)' }}>
                {isDownloading ? _(msg`Downloading update`) : isError ? _(msg`Update failed`) : _(msg`Update Available!`)}
              </div>
              {subtitle && !isDownloading && !isError && (
                <div className="mt-1 text-xs font-medium" style={{ color: 'var(--text-muted)' }}>
                  {subtitle.replace('Released ', 'Release ')}
                </div>
              )}
              {isDownloading && (
                <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full" style={{ background: 'var(--surface-1)' }}>
                  <div className="h-full rounded-full transition-all duration-300" style={{ width: `${pct}%`, background: 'var(--accent)' }} />
                </div>
              )}
              {isError && errorMessage && (
                <div className="mt-1 text-xs" style={{ color: '#fca5a5' }}>
                  {errorMessage}
                </div>
              )}
            </div>
          </div>
        {!isDownloading && !isError && info && (
          <div className="px-3.5 pb-2 -mt-1 text-center">
            <span className="inline-flex items-center justify-center rounded-full border px-2.5 py-1 text-[11px] font-semibold" style={{ borderColor: 'color-mix(in srgb, var(--accent), var(--border-subtle) 40%)', background: 'color-mix(in srgb, var(--accent), var(--surface-1) 85%)', color: 'var(--accent)' }}>
              Version {info.version}
            </span>
          </div>
        )}
        <div className="relative flex items-center gap-3 border-t px-4 py-3 overflow-hidden" style={{ borderColor: 'var(--border-subtle)', background: 'var(--surface-1)' }}>
          {!isDownloading && !isError && (
            <div className="absolute inset-x-0 top-0 h-0.5 overflow-hidden" style={{ background: 'transparent' }}>
              <div
                className="h-full w-full origin-left"
                style={{
                  background: 'var(--accent)',
                  animation: 'df-update-expiry 30s linear forwards',
                }}
              />
            </div>
          )}
          <button
            type="button"
            onClick={handleDismiss}
            className="flex-1 ui-button ui-button-secondary !h-9 px-4 text-sm inline-flex items-center justify-center gap-1.5"
          >
            <Trans>Remind me later</Trans>
          </button>
          <button
            type="button"
            onClick={isDownloading || isError ? handleClose : isError ? handleClose : openSettingsUpdates}
            className="flex-1 ui-button !h-9 px-4 text-sm inline-flex items-center justify-center gap-1.5"
            style={
              isError
                ? {
                    borderColor: 'color-mix(in srgb, #ef4444, var(--border-subtle) 45%)',
                    background: 'color-mix(in srgb, #ef4444, var(--surface-1) 86%)',
                    color: 'var(--danger)',
                  }
                : isDownloading
                  ? {
                      borderColor: 'var(--border-subtle)',
                      background: 'var(--surface-1)',
                      color: 'var(--text-muted)',
                    }
                  : {
                      borderColor: 'color-mix(in srgb, var(--accent-secondary), var(--border-subtle) 45%)',
                      background: 'color-mix(in srgb, var(--accent-secondary), var(--surface-1) 86%)',
                      color: 'var(--accent-secondary)',
                    }
            }
            disabled={isDownloading}
          >
            {isError ? (
              <>
                <RotateCcw className="h-3.5 w-3.5" />
                <Trans>Try again</Trans>
              </>
            ) : isDownloading ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                <Trans>Downloading… {pct}%</Trans>
              </>
            ) : (
              <>
                <Download className="h-3.5 w-3.5" />
                <Trans>View in Settings</Trans>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
    </>
  );
}
