import { Component, Suspense } from 'react';
import { Environment } from '@react-three/drei';

// HDR lighting is optional: loading or network failure must not hide the grid.
export default class EnvironmentLighting extends Component {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error) {
    console.warn('環境光を読み込めなかったため、標準の照明を使用します。', error);
  }

  render() {
    return this.state.failed ? null : (
      <Suspense fallback={null}>
        <Environment preset="city" />
      </Suspense>
    );
  }
}
