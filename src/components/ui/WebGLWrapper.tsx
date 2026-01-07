import { useState, useEffect, ReactNode } from 'react';
import { AlertCircle, Box } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

interface WebGLWrapperProps {
  children: ReactNode;
  fallback?: ReactNode;
  className?: string;
  style?: React.CSSProperties;
}

// Check if WebGL is available
function isWebGLAvailable(): boolean {
  try {
    const canvas = document.createElement('canvas');
    return !!(
      window.WebGLRenderingContext &&
      (canvas.getContext('webgl') || canvas.getContext('experimental-webgl'))
    );
  } catch (e) {
    return false;
  }
}

// Check if WebGL2 is available
function isWebGL2Available(): boolean {
  try {
    const canvas = document.createElement('canvas');
    return !!(window.WebGL2RenderingContext && canvas.getContext('webgl2'));
  } catch (e) {
    return false;
  }
}

export function WebGLWrapper({ children, fallback, className, style }: WebGLWrapperProps) {
  const [webglSupported, setWebglSupported] = useState<boolean | null>(null);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    const supported = isWebGLAvailable() || isWebGL2Available();
    setWebglSupported(supported);
  }, []);

  // Still checking
  if (webglSupported === null) {
    return (
      <div className={className} style={style}>
        <div className="flex items-center justify-center h-full min-h-[300px] bg-muted/30 rounded-xl">
          <div className="text-muted-foreground text-sm">Verificando suporte WebGL...</div>
        </div>
      </div>
    );
  }

  // WebGL not supported - show fallback
  if (!webglSupported || error) {
    if (fallback) {
      return <>{fallback}</>;
    }

    return (
      <div className={className} style={style}>
        <Alert variant="default" className="bg-muted/30 border-muted">
          <Box className="h-4 w-4" />
          <AlertTitle>Visualização 3D indisponível</AlertTitle>
          <AlertDescription>
            Seu navegador ou ambiente não suporta WebGL, necessário para renderização 3D.
            {error && <span className="block mt-1 text-xs opacity-70">{error.message}</span>}
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  // WebGL supported - render children with error boundary
  return (
    <WebGLErrorBoundary onError={setError} className={className} style={style}>
      {children}
    </WebGLErrorBoundary>
  );
}

// Error boundary for catching WebGL errors during render
interface ErrorBoundaryProps {
  children: ReactNode;
  onError: (error: Error) => void;
  className?: string;
  style?: React.CSSProperties;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

import { Component, ErrorInfo } from 'react';

class WebGLErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('WebGL Error:', error, errorInfo);
    this.props.onError(error);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className={this.props.className}>
          <Alert variant="destructive" className="bg-destructive/10">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Erro na renderização 3D</AlertTitle>
            <AlertDescription>
              Ocorreu um erro ao renderizar o conteúdo 3D.
              <span className="block mt-1 text-xs opacity-70">
                {this.state.error?.message || 'Erro desconhecido'}
              </span>
            </AlertDescription>
          </Alert>
        </div>
      );
    }

    return (
      <div className={this.props.className} style={this.props.style}>
        {this.props.children}
      </div>
    );
  }
}

export default WebGLWrapper;
