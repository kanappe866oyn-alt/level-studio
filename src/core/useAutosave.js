import { useCallback, useEffect, useMemo, useState } from 'react';
import { createDraftSnapshot, getDraftStorage, saveDraft, formatDraftTime } from './draftStorage.js';

export function useAutosave({ documentId, project, editor, enabled, initialSavedAt }) {
  const snapshot = useMemo(() => createDraftSnapshot(project, editor), [project, editor]);
  const signature = useMemo(() => JSON.stringify(snapshot), [snapshot]);
  const [saved, setSaved] = useState(() => initialSavedAt ? { documentId, signature, savedAt: initialSavedAt } : null);
  const [exported, setExported] = useState(null);
  const [error, setError] = useState(null);
  const savedHere = saved?.documentId === documentId && saved.signature === signature;
  const exportedHere = exported?.documentId === documentId && exported.signature === signature;
  const pending = enabled && !savedHere;
  const hasUnsavedChanges = pending && !exportedHere;

  const flush = useCallback(() => {
    if (!enabled || savedHere) return true;
    try {
      const draft = saveDraft(getDraftStorage(), { id: documentId, savedAt: new Date().toISOString(), ...snapshot });
      setSaved({ documentId, signature, savedAt: draft.savedAt });
      setError(null);
      return true;
    } catch {
      setError({ documentId, signature });
      return false;
    }
  }, [enabled, savedHere, documentId, snapshot, signature]);

  useEffect(() => {
    if (!pending) return;
    const timer = setTimeout(flush, 700);
    return () => clearTimeout(timer);
  }, [pending, flush]);

  useEffect(() => {
    const onBeforeUnload = event => {
      if (!flush() && hasUnsavedChanges) { event.preventDefault(); event.returnValue = ''; }
    };
    const onHidden = () => { if (document.visibilityState === 'hidden') flush(); };
    window.addEventListener('beforeunload', onBeforeUnload);
    window.addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', onHidden);
    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload);
      window.removeEventListener('pagehide', flush);
      document.removeEventListener('visibilitychange', onHidden);
    };
  }, [flush, hasUnsavedChanges]);

  const failed = error?.documentId === documentId && error.signature === signature;
  const status = failed ? '自動保存できません。「保存」でJSONファイルを残してください。'
    : pending ? '自動保存待ち…'
      : savedHere ? `自動保存済み · ${formatDraftTime(saved.savedAt)}` : '作業は自動保存されます';
  return {
    flush, status, failed, hasUnsavedChanges,
    markExported: () => setExported({ documentId, signature }),
  };
}
