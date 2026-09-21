import React from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error("ErrorBoundary caught an error:", error, errorInfo);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
    if (this.props.onReset) {
      this.props.onReset();
    }
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }
      return (
        <div className="p-4 rounded-xl border border-red-200 bg-red-50 text-red-700 flex flex-col gap-2 my-2">
          <div className="flex items-center gap-2 font-bold text-xs">
            <AlertTriangle className="h-4 w-4 shrink-0 text-red-600" />
            <span>Component Error</span>
          </div>
          <p className="text-[11px] text-red-600">{this.state.error?.message || "An unexpected error occurred."}</p>
          <div>
            <button
              type="button"
              onClick={this.handleReset}
              className="px-3 py-1 bg-red-600 text-white text-xs font-semibold rounded-lg hover:bg-red-700 transition-colors inline-flex items-center gap-1"
            >
              <RefreshCw className="h-3 w-3" /> Retry
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
