import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { Navigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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

  const justLoggedOut = sessionStorage.getItem("logging_out") === "true";
  if (justLoggedOut) {
    sessionStorage.removeItem("logging_out");
  }

  if (loading && !justLoggedOut) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-background">
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
    <div className="relative flex min-h-dvh items-center justify-center p-4 overflow-hidden bg-background">
      <div
        className="absolute inset-0 opacity-40"
        style={{
          background:
            "radial-gradient(circle at top left, hsl(217 91% 50% / 0.12), transparent 35%), radial-gradient(circle at bottom right, hsl(43 96% 56% / 0.10), transparent 35%)",
        }}
      />

      <div className="relative w-full max-w-md animate-fade-in" style={{ animationFillMode: "both" }}>
        <div className="flex flex-col items-center gap-4 mb-8">
          <div className="relative">
            <div className="absolute inset-0 rounded-2xl blur-xl opacity-30 bg-primary" />
            <img
              src={logo}
              alt="RRCollections"
              className="relative h-24 w-24 rounded-2xl object-contain shadow-premium ring-2 ring-primary/10 bg-card"
              onError={(e) => {
                e.currentTarget.onerror = null;
                e.currentTarget.src = "/pwa-icon-192.png";
              }}
            />
          </div>
          <div className="text-center space-y-1">
            <h1 className="text-3xl font-extrabold tracking-tight text-foreground">
              RR<span className="text-primary">Collections</span>
            </h1>
            <p className="text-base font-medium text-muted-foreground">Manajemen Stok Benang Obras</p>
          </div>
        </div>

        <div className="rounded-[1.35rem] border border-border/40 bg-card p-6 shadow-premium-lg">
          <div className="mb-5 text-center">
            <h2 className="text-xl font-bold text-foreground">Selamat datang</h2>
            <p className="text-sm text-muted-foreground mt-1">Masuk dengan akun yang sudah terdaftar</p>
          </div>

          <form onSubmit={handleLogin} className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="login-email" className="text-sm font-semibold text-foreground">
                Email
              </Label>
              <Input
                id="login-email"
                type="email"
                placeholder="nama@email.com"
                value={loginEmail}
                onChange={(e) => setLoginEmail(e.target.value)}
                required
                className="h-12 rounded-xl border-border/50 bg-muted/30 text-base transition-colors focus:bg-card"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="login-password" className="text-sm font-semibold text-foreground">
                Password
              </Label>
              <div className="relative">
                <Input
                  id="login-password"
                  type={showPassword ? "text" : "password"}
                  placeholder="Masukkan password"
                  value={loginPassword}
                  onChange={(e) => setLoginPassword(e.target.value)}
                  required
                  className="h-12 rounded-xl border-border/50 bg-muted/30 pr-11 text-base transition-colors focus:bg-card"
                />
                <button
                  type="button"
                  aria-label={showPassword ? "Sembunyikan password" : "Tampilkan password"}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 rounded-lg text-muted-foreground transition-colors hover:text-foreground hover:bg-muted"
                  onClick={() => setShowPassword(!showPassword)}
                >
                  {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                </button>
              </div>
            </div>
            <Button
              type="submit"
              className="native-press h-12 w-full rounded-xl text-base font-bold shadow-premium"
              disabled={submitting}
            >
              {submitting ? (
                <div className="flex items-center gap-2">
                  <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary-foreground border-t-transparent" />
                  Memproses...
                </div>
              ) : (
                "Masuk"
              )}
            </Button>
          </form>
        </div>

        <p className="text-center text-sm font-medium text-muted-foreground/60 mt-6">
          {`© ${new Date().getFullYear()} RRCollections`}
        </p>
      </div>
    </div>
  );
};

export default Auth;
