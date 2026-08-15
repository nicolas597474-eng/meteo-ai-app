import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { lazy, Suspense, useEffect } from "react";
import { Route, Switch, Link, useLocation } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import Dashboard from "./pages/Dashboard";
import {
  LayoutDashboard,
  Trophy,
  Calendar,
  FileText,
  Activity,
  FlaskConical,
  ChartNoAxesCombined,
} from "lucide-react";

const Ranking = lazy(() => import("./pages/Ranking"));
const History = lazy(() => import("./pages/History"));
const Report = lazy(() => import("./pages/Report"));
const WeatherAILab = lazy(() => import("./pages/WeatherAILab"));
const FavoriteSettings = lazy(() => import("./pages/FavoriteSettings"));
const WeatherDetails = lazy(() => import("./pages/WeatherDetails"));
const WeightComparison = lazy(() => import("./pages/WeightComparison"));
const ReliabilityLaboratory = lazy(() => import("./pages/ReliabilityLaboratory"));
const NotFound = lazy(() => import("./pages/NotFound"));

const navItems = [
  { path: "/", label: "Dashboard", icon: LayoutDashboard },
  { path: "/laboratoire", label: "Fiabilité", icon: ChartNoAxesCombined },
  { path: "/ranking", label: "Stations", icon: Trophy },
  { path: "/history", label: "Historique", icon: Calendar },
  { path: "/ai-lab", label: "AI Lab", icon: FlaskConical },
];

function TopNav() {
  const [location] = useLocation();
  return (
    <nav className="sticky top-0 z-50 hidden border-b border-border bg-background sm:block">
      <div className="max-w-2xl mx-auto px-3 sm:px-6">
        <div className="flex items-center justify-between h-14">
          <Link href="/" className="flex items-center gap-2">
            <div className="h-7 w-7 rounded-lg bg-primary/20 flex items-center justify-center">
              <Activity className="h-4 w-4 text-primary" />
            </div>
            <span className="font-bold text-base tracking-tight">MeteoAI</span>
          </Link>
          {/* Desktop nav links (hidden on mobile — use bottom bar) */}
          <div className="hidden sm:flex items-center gap-1">
            {navItems.map((item) => {
              const isActive = location === item.path;
              return (
                <Link
                  key={item.path}
                  href={item.path}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                    isActive
                      ? "bg-primary/10 text-primary"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                  }`}
                >
                  <item.icon className="h-4 w-4" />
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </div>
        </div>
      </div>
    </nav>
  );
}

function BottomNav() {
  const [location] = useLocation();
  return (
    <nav aria-label="Navigation principale" className="fixed bottom-0 left-0 right-0 z-50 border-t border-slate-700 bg-[#0d1117] sm:hidden" style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
      <div className="flex h-16 items-center justify-around px-2">
        {navItems.map((item) => {
          const isActive = location === item.path;
          return (
            <Link
              key={item.path}
              href={item.path}
              className={`flex flex-col items-center gap-0.5 px-3 py-2 rounded-xl transition-colors min-w-0 flex-1 ${
                isActive ? "text-primary" : "text-muted-foreground"
              }`}
            >
              <item.icon className={`h-5 w-5 ${isActive ? "text-primary" : ""}`} />
              <span className={`text-xs font-medium truncate ${isActive ? "text-primary" : ""}`}>
                {item.label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

function ScrollToTopOnRouteChange() {
  const [location] = useLocation();

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [location]);

  return null;
}

function RouteLoadingFallback() {
  return (
    <div className="mx-auto min-h-[60vh] max-w-2xl space-y-4 px-3 py-5" role="status" aria-live="polite" aria-label="Chargement de la page">
      <span className="sr-only">Chargement de la page…</span>
      <div className="h-12 w-44 animate-pulse rounded-xl bg-slate-800/80" />
      <div className="h-48 animate-pulse rounded-[22px] border border-slate-800 bg-slate-900/65" />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {Array.from({ length: 6 }).map((_, index) => <div key={index} className="h-28 animate-pulse rounded-2xl border border-slate-800 bg-slate-900/65" />)}
      </div>
    </div>
  );
}

function Router() {
  return (
    <Switch>
      <Route path="/" component={Dashboard} />
      <Route path="/ranking" component={Ranking} />
      <Route path="/reliability" component={Ranking} />
      <Route path="/laboratoire" component={ReliabilityLaboratory} />
      <Route path="/lab" component={ReliabilityLaboratory} />
      <Route path="/history" component={History} />
      <Route path="/report" component={Report} />
      <Route path="/ai-lab" component={WeatherAILab} />
      <Route path="/stations" component={Ranking} />
      <Route path="/details" component={WeatherDetails} />
      <Route path="/weight-comparison" component={WeightComparison} />
      <Route path="/favorites" component={FavoriteSettings} />
      <Route path="/404" component={NotFound} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="dark">
        <TooltipProvider>
          <Toaster />
          <TopNav />
          <ScrollToTopOnRouteChange />
          <div className="pb-[calc(4rem+env(safe-area-inset-bottom))] sm:pb-0">
            <Suspense fallback={<RouteLoadingFallback />}>
              <Router />
            </Suspense>
          </div>
          <BottomNav />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
