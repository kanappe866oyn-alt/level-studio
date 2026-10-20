import { Suspense, lazy, useEffect, useRef, useState } from 'react';
import LandingPage from './LandingPage.jsx';
import { STARTER_SCENES } from './core/starterScenes.js';
import { readDrafts } from './core/draftStorage.js';
import { createSampleProjectAsync, randomTerrainSeed } from './core/sampleProjectAsync.js';
import SampleGenerationOverlay from './components/SampleGenerationOverlay.jsx';
import EditorRecoveryBoundary from './components/EditorRecoveryBoundary.jsx';

const Editor = lazy(() => import('./App.jsx'));

export default function AppLauncher() {
  const [launch, setLaunch] = useState(null);
  const [recovery, setRecovery] = useState(() => readDrafts());
  const [job, setJob] = useState(null), controllerRef = useRef(null);
  useEffect(() => () => controllerRef.current?.abort(), []);
  const openSample = async scene => {
    controllerRef.current?.abort();
    const controller = new AbortController(); controllerRef.current = controller;
    setJob({ title: scene.title, status: '準備しています。' });
    try {
      const previousSeed = recovery.drafts.find(d => d.project.metadata.design_rationale?.spatial_design?.variation)?.project.metadata.design_rationale.spatial_design.variation.seed;
      const workspace = await createSampleProjectAsync(scene, { signal: controller.signal, seed: scene.id === 'spatial-varied' ? randomTerrainSeed(previousSeed) : 0,
        onProgress: status => { if (controllerRef.current === controller) setJob({ title: scene.title, status }); } });
      if (controllerRef.current === controller && !controller.signal.aborted) setLaunch({ workspace });
    } catch (error) { if (!controller.signal.aborted) alert(`ステージを開けませんでした。${error.message}`); }
    finally { if (controllerRef.current === controller) { controllerRef.current = null; setJob(null); } }
  };
  return launch ? (
    <EditorRecoveryBoundary onBack={() => { setRecovery(readDrafts()); setLaunch(null); }}>
    <Suspense fallback={<div role="status" style={{ padding: 32 }}>エディタを読み込んでいます…</div>}>
      <Editor initialWorkspace={launch.workspace} initialDraft={launch.draft} />
    </Suspense>
    </EditorRecoveryBoundary>
  ) : <><LandingPage scenes={STARTER_SCENES} drafts={recovery.drafts} storageWarning={recovery.error} onRestoreDraft={draft => setLaunch({ draft })} onLaunch={() => setLaunch({})} onSelectScene={openSample} />
    <SampleGenerationOverlay job={job} onCancel={() => controllerRef.current?.abort()} /></>;
}
