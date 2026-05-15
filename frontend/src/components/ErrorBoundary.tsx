import { Component, type ErrorInfo, type ReactNode } from 'react';

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // eslint-disable-next-line no-console
    console.error('[ErrorBoundary]', error, info);
  }

  reset = () => this.setState({ hasError: false, error: null });

  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <div className="min-h-screen w-full grid place-items-center bg-paperwarm p-8">
        <div className="max-w-xl w-full rounded-2xl border border-hairline bg-white p-8 shadow-lg">
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-accent mb-2">
            Algo se rompió
          </p>
          <h1 className="text-2xl font-bold tracking-editorial text-ink mb-4">
            Hubo un error al cargar la app
          </h1>
          <pre className="rounded-lg bg-paper border border-hairline p-4 text-[12px] text-bad whitespace-pre-wrap leading-relaxed mono">
            {this.state.error?.stack || this.state.error?.message || 'Unknown error'}
          </pre>
          <p className="text-[12px] text-inkmute mt-4">
            Abre la consola del navegador (F12 → Console) para más detalles.
            Si dice <span className="mono">Missing VITE_SUPABASE_URL</span>, crea{' '}
            <span className="mono">v1/frontend/.env.local</span>.
          </p>
          <button
            onClick={this.reset}
            className="mt-5 inline-flex items-center justify-center gap-2 rounded-full bg-ink text-white px-4 py-2 text-sm font-medium hover:bg-black"
          >
            Reintentar
          </button>
        </div>
      </div>
    );
  }
}
