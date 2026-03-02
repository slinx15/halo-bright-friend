import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { Navigate } from "react-router-dom";
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
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const justLoggedOut = sessionStorage.getItem('logging_out') === 'true';
  if (justLoggedOut) {
    sessionStorage.removeItem('logging_out');
  }

  if (loading && !justLoggedOut) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  if (user && !justLoggedOut) return <Navigate to="/" replace />;

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
    <div className="relative flex min-h-screen items-center justify-center p-4 overflow-hidden" style={{ background: "linear-gradient(160deg, hsl(213 30% 97%) 0%, hsl(217 40% 94%) 50%, hsl(213 30% 97%) 100%)" }}>
      {/* Decorative blobs */}
      <div className="absolute -top-32 -left-32 w-80 h-80 rounded-full opacity-30 blur-3xl" style={{ background: "radial-gradient(circle, hsl(217 91% 50% / 0.2), transparent)" }} />
      <div className="absolute -bottom-32 -right-32 w-96 h-96 rounded-full opacity-20 blur-3xl" style={{ background: "radial-gradient(circle, hsl(217 91% 50% / 0.15), transparent)" }} />
      <div className="absolute top-1/3 right-1/4 w-48 h-48 rounded-full opacity-15 blur-2xl" style={{ background: "radial-gradient(circle, hsl(43 96% 56% / 0.2), transparent)" }} />

      <div className="relative w-full max-w-md space-y-8 animate-fade-in" style={{ animationFillMode: "both" }}>
        {/* Logo / Brand */}
        <div className="flex flex-col items-center gap-3">
          <div className="relative">
            <div className="absolute inset-0 rounded-2xl blur-xl opacity-30" style={{ background: "hsl(217 91% 50% / 0.3)" }} />
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
            <p className="text-muted-foreground text-sm font-medium">Manajemen Stok Produk Tekstil</p>
          </div>
        </div>

        <Card className="card-premium border-border/30 shadow-premium-lg backdrop-blur-sm overflow-hidden">
          <CardHeader className="pb-4 pt-6 text-center">
            <h2 className="text-lg font-bold text-foreground">Masuk</h2>
            <p className="text-xs text-muted-foreground">Gunakan akun yang sudah didaftarkan admin</p>
          </CardHeader>

          <CardContent className="pb-6">
            <form onSubmit={handleLogin} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="login-email" className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Email</Label>
                <Input
                  id="login-email"
                  type="email"
                  placeholder="nama@email.com"
                  value={loginEmail}
                  onChange={(e) => setLoginEmail(e.target.value)}
                  required
                  className="h-11 rounded-xl border-border/50 bg-muted/30 focus:bg-card transition-colors"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="login-password" className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Password</Label>
                <div className="relative">
                  <Input
                    id="login-password"
                    type={showPassword ? "text" : "password"}
                    placeholder="••••••••"
                    value={loginPassword}
                    onChange={(e) => setLoginPassword(e.target.value)}
                    required
                    className="h-11 rounded-xl border-border/50 bg-muted/30 focus:bg-card transition-colors pr-10"
                  />
                  <button
                    type="button"
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                    onClick={() => setShowPassword(!showPassword)}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
              <Button
                type="submit"
                className="w-full h-11 rounded-xl font-bold text-sm shadow-premium native-press"
                disabled={submitting}
              >
                {submitting ? (
                  <div className="flex items-center gap-2">
                    <div className="animate-spin h-4 w-4 border-2 border-primary-foreground border-t-transparent rounded-full" />
                    Memproses...
                  </div>
                ) : "Masuk"}
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* Footer */}
        <p className="text-center text-[11px] text-muted-foreground/60 font-medium">
          © {new Date().getFullYear()} RRCollections · Command Center
        </p>
      </div>
    </div>
  );
};

export default Auth;
