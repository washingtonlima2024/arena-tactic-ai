import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, useSearchParams } from "react-router-dom";
import { SidebarProvider } from "./contexts/SidebarContext";
import { LiveBroadcastProvider } from "./contexts/LiveBroadcastContext";
import { ClipSyncProvider } from "./contexts/ClipSyncContext";
import { ClipSyncIndicator } from "./components/media/ClipSyncIndicator";
import { FloatingLivePlayer } from "./components/live/FloatingLivePlayer";
import Landing from "./pages/Landing";
import Index from "./pages/Index";
import Matches from "./pages/Matches";
import Upload from "./pages/Upload";
import Live from "./pages/Live";
import LiveConfig from "./pages/LiveConfig";
import Viewer from "./pages/Viewer";
import Analysis from "./pages/Analysis";
import MatchDashboard from "./pages/MatchDashboard";
import Events from "./pages/Events";
import Media from "./pages/Media";
import Audio from "./pages/Audio";
import Social from "./pages/Social";
import Settings from "./pages/Settings";
import Auth from "./pages/Auth";
import Field from "./pages/Field";
import Admin from "./pages/Admin";
import NotFound from "./pages/NotFound";
import { ArenaChatbot } from "./components/chatbot/ArenaChatbot";
import { RequireAuth } from "./components/auth/RequireAuth";

// Wrapper component to extract matchId from URL
function ClipSyncWrapper({ children }: { children: React.ReactNode }) {
  const [searchParams] = useSearchParams();
  const matchId = searchParams.get('match');
  
  return (
    <ClipSyncProvider matchId={matchId}>
      {children}
    </ClipSyncProvider>
  );
}

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <LiveBroadcastProvider>
        <SidebarProvider>
          <Toaster />
          <Sonner />
          <BrowserRouter>
            {/* FloatingLivePlayer inside BrowserRouter but outside Routes to persist */}
            <FloatingLivePlayer />
            <ClipSyncWrapper>
              <Routes>
                <Route path="/welcome" element={<Landing />} />
                <Route path="/auth" element={<Auth />} />
                <Route path="/" element={<RequireAuth><Index /></RequireAuth>} />
                <Route path="/matches" element={<RequireAuth><Matches /></RequireAuth>} />
                <Route path="/upload" element={<RequireAuth><Upload /></RequireAuth>} />
                <Route path="/live" element={<RequireAuth><Live /></RequireAuth>} />
                <Route path="/live/config" element={<RequireAuth><LiveConfig /></RequireAuth>} />
                <Route path="/viewer" element={<RequireAuth><Viewer /></RequireAuth>} />
                <Route path="/analysis" element={<RequireAuth><Analysis /></RequireAuth>} />
                <Route path="/dashboard" element={<RequireAuth><MatchDashboard /></RequireAuth>} />
                <Route path="/events" element={<RequireAuth><Events /></RequireAuth>} />
                <Route path="/media" element={<RequireAuth><Media /></RequireAuth>} />
                <Route path="/audio" element={<RequireAuth><Audio /></RequireAuth>} />
                <Route path="/social" element={<RequireAuth><Social /></RequireAuth>} />
                <Route path="/settings" element={<RequireAuth><Settings /></RequireAuth>} />
                <Route path="/field" element={<RequireAuth><Field /></RequireAuth>} />
                <Route path="/admin" element={<RequireAuth><Admin /></RequireAuth>} />
                <Route path="*" element={<NotFound />} />
              </Routes>
              <ArenaChatbot />
              <ClipSyncIndicator />
            </ClipSyncWrapper>
          </BrowserRouter>
        </SidebarProvider>
      </LiveBroadcastProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
