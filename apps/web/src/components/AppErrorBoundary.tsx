import { Component, type ErrorInfo, type ReactNode } from "react";

type State = { hasError: boolean; message: string };

export class AppErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { hasError: false, message: "" };
  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, message: error.message };
  }
  componentDidCatch(_error: Error, _errorInfo: ErrorInfo): void {}
  render() {
    if (this.state.hasError) return <div className="page"><div className="card">Error: {this.state.message}</div></div>;
    return this.props.children;
  }
}
