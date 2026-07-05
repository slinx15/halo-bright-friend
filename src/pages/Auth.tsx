import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { Navigate, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Eye, EyeOff } from "lucide-react";
import logo from "@/assets/logo.jpg";
import { useToast } from "@/hooks/use-toast";

const Auth = () => {
  const { user, loading, signIn } = useAuth();
  const { toast } = useToast();
  const [params] = useSearchParams();
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const justLoggedOut = sessionStorage.getItem("logging_out") === "true";
  if (justLoggedOut) {
    sessionStorage.removeItem("logging_out");
  }

  // Same-origin relative path only.
  const rawNext = params.get("next") ?? "";
  const safeNext = /^\/(?!\/)/.test(rawNext) ? rawNext : "/";

  if (loading && !justLoggedOut) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  if (user && !justLoggedOut) return <Navigate to={safeNext} replace />;

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    const { error } = await signIn(loginEmail, loginPassword);
    if (error) {
      toast({ title: "Login gagal", description: error.message, variant: "destructive" });
    }
    setSubmitting(false);
  };

  return (
    <div
      className="relative flex min-h-screen items-center justify-center p-4 overflow-hidden"
      style={{
        background:
          "linear-gradient(160deg, hsl(213 30% 97%) 0%, hsl(217 40% 94%) 50%, hsl(213 30% 97%) 100%)",
      }}
    >
      <div
        className="absolute -top-32 -left-32 h-80 w-80 rounded-full opacity-30 blur-3xl"
        style={{ background: "radial-gradient(circle, hsl(217 91% 50% / 0.2), transparent)" }}
      />
      <div
        className="absolute -bottom-32 -right-32 h-96 w-96 rounded-full opacity-20 blur-3xl"
        style={{ background: "radial-gradient(circle, hsl(217 91% 50% / 0.15), transparent)" }}
      />
      <div
        className="absolute right-1/4 top-1/3 h-48 w-48 rounded-full opacity-15 blur-2xl"
        style={{ background: "radial-gradient(circle, hsl(43 96% 56% / 0.2), transparent)" }}
      />

      <div className="relative w-full max-w-md space-y-8 animate-fade-in" style={{ animationFillMode: "both" }}>
        <div className="flex flex-col items-center gap-3">
          <div className="relative">
            <div
              className="absolute inset-0 rounded-2xl blur-xl opacity-30"
              style={{ background: "hsl(217 91% 50% / 0.3)" }}
            />
            <img
              src={logo}
              alt="RRCollections"
              className="relative h-20 w-20 rounded-2xl object-contain shadow-premium ring-2 ring-primary/10"
              onError={(e) => {
                e.currentTarget.onerror = null;
                e.currentTarget.src = "/pwa-icon-192.png";
              }}
            />
          </div>
          <div className="text-center space-y-1">
            <h1 className="text-2xl font-extrabold tracking-tight text-foreground">
              RR<span className="text-primary">Collections</span>
            </h1>
            <p className="text-sm font-medium text-muted-foreground">Manajemen Stok Produk Tekstil</p>
          </div>
        </div>

        <Card className="card-premium overflow-hidden border-border/30 shadow-premium-lg backdrop-blur-sm">
          <CardHeader className="pb-4 pt-6 text-center">
            <h2 className="text-lg font-bold text-foreground">Masuk</h2>
            <p className="text-xs text-muted-foreground">Gunakan akun yang sudah didaftarkan admin</p>
          </CardHeader>

          <CardContent className="pb-6">
            <form onSubmit={handleLogin} className="space-y-4">
              <div className="space-y-2">
                <Label
                  htmlFor="login-email"
                  className="text-xs font-semibold uppercase tracking-wider text-muted-foreground"
                >
                  Email
                </Label>
                <Input
                  id="login-email"
                  type="email"
                  placeholder="nama@email.com"
                  value={loginEmail}
                  onChange={(e) => setLoginEmail(e.target.value)}
                  required
                  className="h-11 rounded-xl border-border/50 bg-muted/30 transition-colors focus:bg-card"
                />
              </div>
              <div className="space-y-2">
                <Label
                  htmlFor="login-password"
                  className="text-xs font-semibold uppercase tracking-wider text-muted-foreground"
                >
                  Password
                </Label>
                <div className="relative">
                  <Input
                    id="login-password"
                    type={showPassword ? "text" : "password"}
                    placeholder="........"
                    value={loginPassword}
                    onChange={(e) => setLoginPassword(e.target.value)}
                    required
                    className="h-11 rounded-xl border-border/50 bg-muted/30 pr-10 transition-colors focus:bg-card"
                  />
                  <button
                    type="button"
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground"
                    onClick={() => setShowPassword(!showPassword)}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
              <Button
                type="submit"
                className="native-press h-11 w-full rounded-xl text-sm font-bold shadow-premium"
                disabled={submitting}
              >
                {submitting ? (
                  <div className="flex items-center gap-2">
                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary-foreground border-t-transparent" />
                    Memproses...
                  </div>
                ) : (
                  "Masuk"
                )}
              </Button>
            </form>
          </CardContent>
        </Card>

        <p className="text-center text-[11px] font-medium text-muted-foreground/60">
          {`© ${new Date().getFullYear()} RRCollections | Command Center`}
        </p>
      </div>
    </div>
  );
};

export default Auth;
