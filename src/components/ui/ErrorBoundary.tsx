"use client";
import { Component, type ReactNode } from "react";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}
interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      return (
        this.props.fallback || (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <p className="text-lg font-semibold">문제가 발생했습니다</p>
            <p className="text-sm mt-2" style={{ color: "var(--muted)" }}>
              {this.state.error?.message || "알 수 없는 오류"}
            </p>
            <button
              onClick={() => this.setState({ hasError: false, error: null })}
              className="mt-4 px-4 py-2 rounded text-sm text-white"
              style={{ background: "var(--primary)" }}
            >
              다시 시도
            </button>
          </div>
        )
      );
    }
    return this.props.children;
  }
}
