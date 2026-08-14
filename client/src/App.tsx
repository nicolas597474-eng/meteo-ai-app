import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { lazy, Suspense } from "react";
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
} from "lucide-react";

const Ranking = lazy(() => import("./pages/Ranking"));
const History = lazy(() => import("./pages/History"));
const Report = lazy(() => import("./pages/Report"));
const WeatherAILab = lazy(() => import("./pages/WeatherAILab"));
const FavoriteSettings = lazy(() => import("./pages/FavoriteSettings"));
const WeatherDetails = lazy(() => import("./pages/WeatherDetails"));
const WeightComparison = lazy(() => import("./pages/WeightComparison"));
const NotFound = lazy(() => import("./pages/NotFound"));

const navItems = [
  { path: "/", label: "Dashboard", icon: LayoutDashboard },
  { path: "/ranking", label: "Fiabilité", icon: Trophy },
  { path: "/history", label: "Historique", icon: Calendar },
  { path: "/ai-lab", label: "AI Lab", icon: FlaskConical },
];

function TopNav() {
  const [location] = useLocation();
  return (
    <nav className="weather-nav sticky top-0 z-50 hidden border-b backdrop-blur-xl sm:block">
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
                      ? "weather-nav-active text-primary"
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
    <nav className="weather-nav sm:hidden fixed bottom-0 left-0 right-0 z-50 border-t backdrop-blur-xl safe-area-inset-bottom">
      <div className="flex items-center justify-around h-16 px-2">
        {navItems.map((item) => {
          const isActive = location === item.path;
          return (
            <Link
              key={item.path}
              href={item.path}
              className={`flex flex-col items-center gap-0.5 px-3 py-2 rounded-xl transition-colors min-w-0 flex-1 ${
                isActive ? "weather-nav-active text-primary" : "text-muted-foreground"
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

function Router() {
  return (
    <Switch>
      <Route path="/" component={Dashboard} />
      <Route path="/ranking" component={Ranking} />
      <Route path="/reliability" component={Ranking} />
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
          {/* Add bottom padding on mobile for the bottom nav bar */}
          <div className="pb-16 sm:pb-0">
            <Suspense fallback={<div className="mx-auto min-h-[280px] max-w-2xl animate-pulse px-3 py-6"><div className="h-44 rounded-2xl bg-muted" /></div>}>
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
