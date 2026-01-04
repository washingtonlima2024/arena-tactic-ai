import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { SidebarProvider } from "./contexts/SidebarContext";
import { LiveBroadcastProvider } from "./contexts/LiveBroadcastContext";
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
import Settings from "./pages/Settings";
import Auth from "./pages/Auth";
import Field from "./pages/Field";
import NotFound from "./pages/NotFound";
import { ArenaChatbot } from "./components/chatbot/ArenaChatbot";
import { RequireAuth } from "./components/auth/RequireAuth";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <LiveBroadcastProvider>
        <SidebarProvider>
          <Toaster />
          <Sonner />
          {/* FloatingLivePlayer OUTSIDE BrowserRouter to persist recording across navigation */}
          <FloatingLivePlayer />
          <BrowserRouter>
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
              <Route path="/settings" element={<RequireAuth><Settings /></RequireAuth>} />
              <Route path="/field" element={<RequireAuth><Field /></RequireAuth>} />
              <Route path="*" element={<NotFound />} />
            </Routes>
            <ArenaChatbot />
          </BrowserRouter>
        </SidebarProvider>
      </LiveBroadcastProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
