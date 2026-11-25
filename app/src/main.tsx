import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Toaster } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import { ProvedorDeDados } from '@/dados';
import { App } from '@/App';
import { Portao } from '@/telas/Login';
import './index.css';

createRoot(document.getElementById('raiz')!).render(
  <StrictMode>
    <TooltipProvider>
      <Portao>
      <ProvedorDeDados
        carregando={<div className="grid h-dvh place-items-center text-sm text-muted-foreground">Abrindo o editor…</div>}
        falha={(erro) => <div className="grid h-dvh place-items-center p-6 text-center text-sm text-destructive">{erro}</div>}
      >
        <App />
      </ProvedorDeDados>
      </Portao>
      <Toaster position="bottom-center" />
    </TooltipProvider>
  </StrictMode>,
);
