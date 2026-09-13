import { Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';

interface Props { children: ReactNode }
interface State { error: Error | null }

/**
 * 路由级兜底：懒加载 chunk 加载失败（发版后哈希失效、网络抖动）或渲染异常时，
 * 给出可操作的恢复入口，而不是白屏。
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('route crashed', error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="card p-8 text-center">
          <h2 className="display mb-2 text-xl">页面出错了 / Something went wrong</h2>
          <p className="mb-4 text-sm opacity-60">
            数据保存在本机，不会丢失。请尝试重新加载。 / Your data is safe on this device. Try reloading.
          </p>
          <button className="btn-primary" onClick={() => window.location.reload()}>重新加载 / Reload</button>
        </div>
      );
    }
    return this.props.children;
  }
}
