import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { motion } from "motion/react";
import { ArrowRight, CheckCircle2, Gauge, Loader2, Mail, ScanEye, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

import { useAuth } from "@/hooks/useAuth";
import { WgLogo } from "@/lib/brand";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import station from "@/assets/inspection-station.jpg";

export const Route = createFileRoute("/auth")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Sign in — WGDeepInsight | WG Tech" },
      {
        name: "description",
        content:
          "Secure access to WGDeepInsight, WG Tech's AI-powered visual inspection and dimensional measurement platform.",
      },
      { property: "og:title", content: "Sign in — WGDeepInsight" },
      {
        property: "og:description",
        content: "AI visual inspection and dimensional measurement for precision mechanical parts.",
      },
    ],
  }),
  component: AuthPage,
});

const FEATURES = [
  { icon: ScanEye, title: "Surface defect AI", text: "Detects thread and finish defects per frame." },
  { icon: Gauge, title: "Dimensional metrology", text: "Sub-0.01 mm deviation against tolerance." },
  { icon: ShieldCheck, title: "Traceable records", text: "Every part inspection stored and auditable." },
];

function AuthPage() {
  const { session, loading, signIn } = useAuth();
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState("signin");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [remember, setRemember] = useState(true);

  function getPasswordError(value: string) {
    if (!value) return "Enter a password to continue.";
    if (value.length < 8) return "Use at least 8 characters.";
    if (!/[A-Z]/.test(value) || !/[a-z]/.test(value)) {
      return "Include both upper and lowercase letters.";
    }
    if (!/\d/.test(value)) return "Include at least one number.";
    if (!/[!@#$%^&*(),.?":{}|<>]/.test(value)) return "Include a special character.";
    return "";
  }

  useEffect(() => {
    if (!loading && session) window.location.assign("/dashboard");
  }, [loading, session]);

  async function handleSignIn(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const result = await signIn(email, password);
    setBusy(false);
    if (!result.ok) {
      toast.error(result.message ?? "Invalid email or password.");
      return;
    }
    toast.success("Welcome back to WGDeepInsight");
    window.location.assign("/dashboard");
  }

  async function handleSignUp(e: React.FormEvent) {
    e.preventDefault();
    const passwordError = getPasswordError(password);
    if (passwordError) {
      toast.error(passwordError);
      return;
    }

    setBusy(true);
    const result = await signIn(email, password);
    setBusy(false);
    if (!result.ok) {
      toast.error("Sign up is available for the sample accounts only. Use manager@wgtech.com or inspector@wgtech.com.");
      return;
    }
    toast.success("Sample account ready. You are signed in.");
    window.location.assign("/dashboard");
  }

  async function handleReset() {
    if (!email) {
      toast.error("Enter your work email first");
      return;
    }
    toast.success("Use the sample password for the seeded account: Manager@123 or Inspector@123");
  }

  async function handleGoogle() {
    toast.message("Google Workspace login is disabled in this mock mode. Please use the seeded demo accounts.");
  }

  return (
    <div className="grid min-h-screen lg:grid-cols-[1.05fr_1fr]">
      {/* Left brand panel */}
      <div className="relative hidden overflow-hidden bg-brand-blue-text lg:block">
        <img
          src={station}
          alt="Automated optical inspection station examining precision metal parts"
          width={1024}
          height={1280}
          className="absolute inset-0 size-full object-cover opacity-35"
        />
        <div className="absolute inset-0 bg-gradient-to-br from-brand-blue-text via-brand-blue-text/85 to-primary-text/70" />
        <div className="relative flex h-full flex-col justify-between p-12">
          <div className="flex items-center gap-3">
            <span className="flex size-11 items-center justify-center rounded-xl bg-primary">
              <ShieldCheck className="size-6 text-primary-foreground" />
            </span>
            <div>
              <p className="type-h-s text-primary-foreground">
                WG<span className="text-primary">DeepInsight</span>
              </p>
              <p className="type-overline text-primary-foreground/70">WG Tech · Detect Predict Protect</p>
            </div>
          </div>

          <div className="max-w-lg">
            <motion.h2
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
              className="type-display text-primary-foreground"
            >
              AI inspection for precision mechanical parts.
            </motion.h2>
            <p className="type-body-l mt-4 text-primary-foreground/75">
              Automated visual inspection and dimensional measurement across the production block,
              warehouse, assembly and chemical area — one traceable quality record per part.
            </p>

            <div className="mt-10 space-y-5">
              {FEATURES.map((f, i) => (
                <motion.div
                  key={f.title}
                  initial={{ opacity: 0, x: -12 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.4, delay: 0.15 + i * 0.1 }}
                  className="flex items-start gap-4"
                >
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary-foreground/10 ring-1 ring-primary-foreground/15">
                    <f.icon className="size-5 text-primary" />
                  </span>
                  <div>
                    <p className="type-body-l font-semibold text-primary-foreground">{f.title}</p>
                    <p className="type-body-m text-primary-foreground/65">{f.text}</p>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-6 type-caption text-primary-foreground/55">
            <span>ISO 9001 quality workflows</span>
            <span>·</span>
            <span>Role-based access control</span>
          </div>
        </div>
      </div>

      {/* Right form panel */}
      <div className="flex items-center justify-center bg-background px-5 py-12">
        <div className="w-full max-w-[420px]">
          <div className="lg:hidden">
            <WgLogo />
          </div>

          <div className="mt-8 lg:mt-0">
            <h1 className="type-h-l text-foreground">
              {mode === "signin" ? "Sign in" : "Create your account"}
            </h1>
            <p className="type-body-m mt-2 text-muted-foreground">
              {mode === "signin"
                ? "Use your WG Tech work account to access the inspection platform."
                : "New inspectors start with inspector access; a manager can promote you."}
            </p>
          </div>

          <Tabs value={mode} onValueChange={setMode} className="mt-7">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="signin">Sign In</TabsTrigger>
              <TabsTrigger value="signup">Sign Up</TabsTrigger>
            </TabsList>

            <TabsContent value="signin" className="mt-6">
              <form onSubmit={handleSignIn} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="email">Work email</Label>
                  <Input
                    id="email"
                    type="email"
                    required
                    autoComplete="email"
                    placeholder="name@wgtech.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password">Password</Label>
                  <Input
                    id="password"
                    type="password"
                    required
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <label className="flex items-center gap-2 type-body-m text-muted-foreground">
                    <Checkbox
                      checked={remember}
                      onCheckedChange={(v) => setRemember(Boolean(v))}
                    />
                    Remember me
                  </label>
                  <button
                    type="button"
                    onClick={handleReset}
                    className="type-body-m font-medium text-brand-blue-interactive hover:underline"
                  >
                    Forgot password?
                  </button>
                </div>
                <Button type="submit" className="w-full" size="lg" disabled={busy}>
                  {busy ? <Loader2 className="size-4 animate-spin" /> : <ArrowRight className="size-4" />}
                  Sign in
                </Button>
              </form>
            </TabsContent>

            <TabsContent value="signup" className="mt-6">
              <form onSubmit={handleSignUp} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Full name</Label>
                  <Input
                    id="name"
                    required
                    placeholder="Arun Mehta"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="su-email">Work email</Label>
                  <Input
                    id="su-email"
                    type="email"
                    required
                    placeholder="name@wgtech.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="su-password">Password</Label>
                  <Input
                    id="su-password"
                    type="password"
                    required
                    minLength={6}
                    autoComplete="new-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                </div>
                <Button type="submit" className="w-full" size="lg" disabled={busy}>
                  {busy ? <Loader2 className="size-4 animate-spin" /> : <CheckCircle2 className="size-4" />}
                  Create account
                </Button>
              </form>
            </TabsContent>
          </Tabs>

          <div className="my-6 flex items-center gap-3">
            <span className="h-px flex-1 bg-border" />
            <span className="type-caption text-muted-foreground">or continue with</span>
            <span className="h-px flex-1 bg-border" />
          </div>

          <Button variant="outline" size="lg" className="w-full" onClick={handleGoogle} disabled={busy}>
            <Mail className="size-4" />
            Google Workspace
          </Button>

          <p className="type-caption mt-8 text-center text-muted-foreground">
            Access is monitored. By signing in you accept WG Tech's quality data policy.{" "}
            <Link to="/auth" className="font-medium text-brand-blue-interactive">
              Need help?
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
