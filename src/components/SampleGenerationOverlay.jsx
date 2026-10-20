import './sample-generation.css';

export default function SampleGenerationOverlay({ job, onCancel }) {
  if (!job) return null;
  return <div className="sample-generation-backdrop">
    <section className="sample-generation-dialog" role="dialog" aria-modal="true" aria-labelledby="sample-generation-title" onKeyDown={event => {
      if (event.key === 'Escape') { event.stopPropagation(); onCancel(); }
      if (event.key === 'Tab') event.preventDefault();
    }}>
      <h2 id="sample-generation-title">{job.title}を作成中</h2>
      <p role="status" aria-live="polite">{job.status || '準備しています。'}</p>
      <button type="button" autoFocus onClick={onCancel}>作成を中止</button>
    </section>
  </div>;
}
