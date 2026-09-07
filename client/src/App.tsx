import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import SignupPage from "@/pages/SignupPage";
import VerifySignupPage from "@/pages/VerifySignupPage";
import PaymentSuccessPage from "@/pages/PaymentSuccessPage";
import EmployeePortalPage from "@/pages/EmployeePortalPage";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import Home from "./pages/Home";

function Router() {
  // make sure to consider if you need authentication for certain routes
  return (
    <Switch>
      <Route path={"/"} component={Home} />
      <Route path={"/cadastro"} component={SignupPage} />
      <Route path={"/verificar-cadastro"} component={VerifySignupPage} />
      <Route path={"/cadastro-pago"} component={PaymentSuccessPage} />
      <Route path={"/colaborador"} component={EmployeePortalPage} />
      <Route path={"/404"} component={NotFound} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="light" switchable>
        <TooltipProvider>
          <Toaster
            position="top-right"
            toastOptions={{
              style: {
                fontFamily: '"Plus Jakarta Sans", system-ui, sans-serif',
              },
            }}
          />
          <Router />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
