import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  AlertTriangle,
  Bell,
  Box,
  Cpu,
  FileSpreadsheet,
  FileText,
  Info,
  Key,
  LayoutDashboard,
  LogOut,
  Plus,
  Ruler,
  Settings,
  ShieldAlert,
  User,
  Users,
} from "lucide-react";

import { AppShell } from "@/components/layout/AppShell";
import { SectionCard } from "@/components/common/SectionCard";
import { StatusBadge } from "@/components/common/StatusBadge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useAuth } from "@/hooks/useAuth";
import { useInspections, useModels, useParts, useProfiles, useSpecifications } from "@/hooks/useInspectionData";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({
    meta: [
      { title: "Settings — WGDeepInsight | WG Tech" },
      { name: "description", content: "Account details, role information and inspection station preferences for WGDeepInsight." },
      { property: "og:title", content: "Settings — WGDeepInsight" },
      { property: "og:description", content: "Account details, role information and inspection station preferences for WGDeepInsight." },
    ],
  }),
  component: SettingsPage,
});

type SettingsTab = {
  id: string;
  label: string;
  icon: typeof User;
  managerOnly?: boolean;
};

const SETTINGS_TABS: SettingsTab[] = [
  // Inspector Tabs
  { id: "profile", label: "Profile", icon: User },
  { id: "security", label: "Security & Auth", icon: Key },
  { id: "preferences", label: "Station Preferences", icon: Settings },
  { id: "notifications", label: "Notifications", icon: Bell },
  { id: "about", label: "About Station", icon: Info },
  
  // Manager-Only Tabs
  { id: "users", label: "User Management", icon: Users, managerOnly: true },
  { id: "parts", label: "Parts Config", icon: Box, managerOnly: true },
  { id: "specs", label: "Specifications", icon: Ruler, managerOnly: true },
  { id: "models", label: "AI Models", icon: Cpu, managerOnly: true },
  { id: "system", label: "System Config", icon: LayoutDashboard, managerOnly: true },
  { id: "audit", label: "Audit Logs", icon: FileSpreadsheet, managerOnly: true },
];

function SettingsPage() {
  const { name, user, role, isManager, signOut } = useAuth();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState("profile");

  // Load Queries
  const { data: people = [] } = useProfiles();
  const { data: parts = [] } = useParts();
  const { data: models = [] } = useModels();
  const { data: specifications = [] } = useSpecifications();
  const { data: inspections = [] } = useInspections();

  // Filter tabs by role
  const visibleTabs = useMemo(() => {
    return SETTINGS_TABS.filter((t) => !t.managerOnly || isManager);
  }, [isManager]);

  // Ensure active tab is allowed
  useEffect(() => {
    if (activeTab === "profile") return;
    const tab = SETTINGS_TABS.find((t) => t.id === activeTab);
    if (tab?.managerOnly && !isManager) {
      setActiveTab("profile");
    }
  }, [isManager, activeTab]);

  // 1. Profile State & Handlers
  const [editProfile, setEditProfile] = useState(false);
  const [profileName, setProfileName] = useState(name || "");
  const [profileEmail, setProfileEmail] = useState(user?.email || "");
  const employeeId = useMemo(() => {
    return role === "inspection_manager" ? "EMP-0419" : "EMP-0922";
  }, [role]);

  async function handleUpdateProfile(e: React.FormEvent) {
    e.preventDefault();
    if (!profileName.trim() || !user?.id) return;
    try {
      const { error } = await supabase
        .from("profiles")
        .update({
          name: profileName.trim(),
          email: profileEmail.trim(),
        })
        .eq("id", user.id);
      if (error) throw error;
      toast.success("Profile updated successfully. Refresh to apply changes.");
      setEditProfile(false);
      await queryClient.invalidateQueries({ queryKey: ["profiles"] });
    } catch (err: any) {
      console.error(err);
      toast.error(err?.message || "Failed to update profile.");
    }
  }

  // 2. Security State & Handlers
  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [updatingPass, setUpdatingPass] = useState(false);

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault();
    if (!newPassword.trim() || newPassword !== confirmPassword) {
      toast.error("Passwords do not match.");
      return;
    }
    setUpdatingPass(true);
    try {
      // Direct call to Supabase password manager
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
      toast.success("Password changed successfully in Supabase auth.");
      setOldPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err: any) {
      console.error(err);
      toast.error(err?.message || "Password update requires real Supabase session.");
    } finally {
      setUpdatingPass(false);
    }
  }

  // 3. Preference States & Handlers
  const [defaultPart, setDefaultPart] = useState(() => localStorage.getItem("wg-pref-part") || "all");
  const [defaultModel, setDefaultModel] = useState(() => localStorage.getItem("wg-pref-model") || "all");
  const [showMeasureAuto, setShowMeasureAuto] = useState(() => localStorage.getItem("wg-pref-show-measure") !== "false");
  const [showInspectAuto, setShowInspectAuto] = useState(() => localStorage.getItem("wg-pref-show-inspect") !== "false");

  function savePreferences() {
    localStorage.setItem("wg-pref-part", defaultPart);
    localStorage.setItem("wg-pref-model", defaultModel);
    localStorage.setItem("wg-pref-show-measure", String(showMeasureAuto));
    localStorage.setItem("wg-pref-show-inspect", String(showInspectAuto));
    toast.success("Station preferences saved locally.");
  }

  // 4. Notification States & Handlers
  const [notifyComplete, setNotifyComplete] = useState(() => localStorage.getItem("wg-notify-complete") !== "false");
  const [notifyDefect, setNotifyDefect] = useState(() => localStorage.getItem("wg-notify-defect") !== "false");
  const [notifyFailed, setNotifyFailed] = useState(() => localStorage.getItem("wg-notify-failed") !== "false");

  function saveNotifications() {
    localStorage.setItem("wg-notify-complete", String(notifyComplete));
    localStorage.setItem("wg-notify-defect", String(notifyDefect));
    localStorage.setItem("wg-notify-failed", String(notifyFailed));
    toast.success("Notification preferences updated.");
  }

  // 5. User Management States & Handlers (Manager only)
  const [addUserOpen, setAddUserOpen] = useState(false);
  const [newUserName, setNewUserName] = useState("");
  const [newUserEmail, setNewUserEmail] = useState("");
  const [newUserRole, setNewUserRole] = useState("inspector");
  const [addingUser, setAddingUser] = useState(false);
  const [deactivatedUsers, setDeactivatedUsers] = useState<string[]>(() => {
    try {
      return JSON.parse(localStorage.getItem("wg-deactivated-users") || "[]");
    } catch {
      return [];
    }
  });

  async function handleCreateUser(e: React.FormEvent) {
    e.preventDefault();
    if (!newUserName.trim() || !newUserEmail.trim()) return;
    setAddingUser(true);
    try {
      const newUserId = window.crypto ? window.crypto.randomUUID() : "user-" + Date.now();
      const { error: profileErr } = await supabase.from("profiles").insert({
        id: newUserId,
        name: newUserName.trim(),
        email: newUserEmail.trim(),
      });
      if (profileErr) throw profileErr;

      const { error: roleErr } = await supabase.from("user_roles").insert({
        user_id: newUserId,
        role: newUserRole as "inspector" | "inspection_manager",
      });
      if (roleErr) throw roleErr;

      toast.success(`Inspector "${newUserName}" added to team directory.`);
      setNewUserName("");
      setNewUserEmail("");
      setAddUserOpen(false);
      await queryClient.invalidateQueries({ queryKey: ["profiles"] });
    } catch (err: any) {
      console.error(err);
      toast.error(err?.message || "Failed to add inspector.");
    } finally {
      setAddingUser(false);
    }
  }

  function toggleUserStatus(userId: string) {
    let next: string[];
    if (deactivatedUsers.includes(userId)) {
      next = deactivatedUsers.filter((id) => id !== userId);
      toast.success("User profile activated.");
    } else {
      next = [...deactivatedUsers, userId];
      toast.success("User profile deactivated.");
    }
    setDeactivatedUsers(next);
    localStorage.setItem("wg-deactivated-users", JSON.stringify(next));
  }

  // 6. Parts management (Manager only)
  const [addPartOpen, setAddPartOpen] = useState(false);
  const [newPartName, setNewPartName] = useState("");
  const [newPartDesc, setNewPartDesc] = useState("");
  const [addingPart, setAddingPart] = useState(false);

  async function handleCreatePart(e: React.FormEvent) {
    e.preventDefault();
    if (!newPartName.trim()) return;
    setAddingPart(true);
    try {
      const { error } = await supabase.from("parts").insert({
        part_name: newPartName.trim(),
        description: newPartDesc.trim(),
      });
      if (error) throw error;
      toast.success(`Part family "${newPartName}" created.`);
      setNewPartName("");
      setNewPartDesc("");
      setAddPartOpen(false);
      await queryClient.invalidateQueries({ queryKey: ["parts"] });
    } catch (err: any) {
      console.error(err);
      toast.error(err?.message || "Failed to create part.");
    } finally {
      setAddingPart(false);
    }
  }

  // 7. Specifications management (Manager only)
  const [selectedPartId, setSelectedPartId] = useState("all");
  const [addSpecOpen, setAddSpecOpen] = useState(false);
  const [specPartId, setSpecPartId] = useState("");
  const [specParam, setSpecParam] = useState("");
  const [specExpected, setSpecExpected] = useState("");
  const [specTolerance, setSpecTolerance] = useState("");
  const [specUnit, setSpecUnit] = useState("mm");
  const [specNotes, setSpecNotes] = useState("");
  const [addingSpec, setAddingSpec] = useState(false);

  const filteredSpecs = useMemo(() => {
    if (selectedPartId === "all") return specifications;
    return specifications.filter((s) => s.part_id === selectedPartId);
  }, [specifications, selectedPartId]);

  async function handleCreateSpec(e: React.FormEvent) {
    e.preventDefault();
    if (!specPartId || !specParam.trim() || !specExpected) {
      toast.error("Please fill in all required fields.");
      return;
    }
    setAddingSpec(true);
    try {
      const { error } = await supabase.from("specifications").insert({
        part_id: specPartId,
        parameter: specParam.trim(),
        expected_value: Number(specExpected),
        tolerance: Number(specTolerance) || 0.0,
        unit: specUnit,
        notes: specNotes.trim(),
      });
      if (error) throw error;
      toast.success("Dimensional parameter specification added.");
      setSpecParam("");
      setSpecExpected("");
      setSpecTolerance("");
      setSpecNotes("");
      setAddSpecOpen(false);
      await queryClient.invalidateQueries({ queryKey: ["specifications"] });
    } catch (err: any) {
      console.error(err);
      toast.error(err?.message || "Failed to create specification.");
    } finally {
      setAddingSpec(false);
    }
  }

  // 8. AI Models management (Manager only)
  const [addModelOpen, setAddModelOpen] = useState(false);
  const [mName, setMName] = useState("");
  const [mType, setMType] = useState("surface");
  const [mPath, setMPath] = useState("");
  const [mVersion, setMVersion] = useState("1.0");
  const [mPartId, setMPartId] = useState("");
  const [addingModel, setAddingModel] = useState(false);

  async function handleRegisterModel(e: React.FormEvent) {
    e.preventDefault();
    if (!mName.trim() || !mPartId) {
      toast.error("Model name and part family are required.");
      return;
    }
    setAddingModel(true);
    try {
      const { error } = await supabase.from("models").insert({
        model_name: mName.trim(),
        model_type: mType,
        model_path: mPath.trim() || `models/${mName.trim().toLowerCase().replace(/\s+/g, '_')}_best.pt`,
        version: mVersion.trim() || "1.0",
        part_id: mPartId,
        status: "active",
      });
      if (error) throw error;
      toast.success(`Model "${mName}" registered.`);
      setMName("");
      setMPath("");
      setMVersion("1.0");
      setAddModelOpen(false);
      await queryClient.invalidateQueries({ queryKey: ["models"] });
    } catch (err: any) {
      console.error(err);
      toast.error(err?.message || "Failed to register model.");
    } finally {
      setAddingModel(false);
    }
  }

  // 9. System config states (Manager only)
  const [companyName, setCompanyName] = useState(() => localStorage.getItem("wg-sys-company") || "WG Tech");
  const [appName, setAppName] = useState(() => localStorage.getItem("wg-sys-app") || "WGDeepInsight");
  const [dateTimeFormat, setDateTimeFormat] = useState(() => localStorage.getItem("wg-sys-dt-format") || "DD/MM/YYYY HH:mm:ss");

  function saveSystemConfig() {
    localStorage.setItem("wg-sys-company", companyName);
    localStorage.setItem("wg-sys-app", appName);
    localStorage.setItem("wg-sys-dt-format", dateTimeFormat);
    toast.success("System configurations saved.");
  }

  // 10. Audit Logs Loader (Manager only)
  const auditLogs = useMemo(() => {
    const logs = [
      { id: "a-1", user: "Aarav Singh", action: "User profiles decoupled from auth.users via SQL migration", time: "2026-08-10 08:50:55" },
      { id: "a-2", user: "Riya Patel", action: "Dynamic camera settings loaded for part: Pin", time: "2026-08-10 08:34:01" },
    ];
    // Map inspections to audit logs for real history
    inspections.slice(0, 8).forEach((ins, idx) => {
      const inspectorName = people.find((p) => p.id === ins.inspector_id)?.name ?? ins.inspector_id;
      const partName = parts.find((p) => p.id === ins.part_id)?.part_name ?? "Unknown Part";
      logs.push({
        id: `ins-log-${ins.id}-${idx}`,
        user: inspectorName,
        action: `Completed inspection ${ins.inspection_number} on ${partName} (Verdict: ${ins.status.toUpperCase()})`,
        time: `${ins.inspection_date} ${ins.inspection_time}`,
      });
    });
    return logs.sort((a, b) => b.time.localeCompare(a.time));
  }, [inspections, parts, people]);

  return (
    <AppShell title="Settings" subtitle="Account and station configuration console">
      <div className="flex flex-col gap-6 lg:flex-row">
        {/* Left-side settings navigation */}
        <aside className="w-full shrink-0 lg:w-60">
          <div className="rounded-2xl border border-border bg-card p-3 space-y-4">
            <div>
              <p className="px-3 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Account Settings</p>
              <nav className="mt-2 space-y-1">
                {visibleTabs.filter((t) => !t.managerOnly).map((tab) => {
                  const Icon = tab.icon;
                  const active = activeTab === tab.id;
                  return (
                    <button
                      key={tab.id}
                      onClick={() => setActiveTab(tab.id)}
                      className={cn(
                        "flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left type-body-s font-semibold transition-colors",
                        active ? "bg-brand-blue text-white" : "text-muted-foreground hover:bg-muted hover:text-foreground"
                      )}
                    >
                      <Icon className="size-4 shrink-0" />
                      {tab.label}
                    </button>
                  );
                })}
              </nav>
            </div>

            {isManager && (
              <div>
                <p className="px-3 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Manager Console</p>
                <nav className="mt-2 space-y-1">
                  {visibleTabs.filter((t) => t.managerOnly).map((tab) => {
                    const Icon = tab.icon;
                    const active = activeTab === tab.id;
                    return (
                      <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id)}
                        className={cn(
                          "flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left type-body-s font-semibold transition-colors",
                          active ? "bg-brand-blue text-white" : "text-muted-foreground hover:bg-muted hover:text-foreground"
                        )}
                      >
                        <Icon className="size-4 shrink-0" />
                        {tab.label}
                      </button>
                    );
                  })}
                </nav>
              </div>
            )}
          </div>
        </aside>

        {/* Right-side content panel */}
        <main className="min-w-0 flex-1">
          {/* TAB: PROFILE */}
          {activeTab === "profile" && (
            <SectionCard title="Inspector Profile" subtitle="Your identification details and authorization role">
              <form onSubmit={handleUpdateProfile} className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="profName">Name</Label>
                    <Input id="profName" value={profileName} onChange={(e) => setProfileName(e.target.value)} disabled={!editProfile} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="profEmail">Email</Label>
                    <Input id="profEmail" type="email" value={profileEmail} onChange={(e) => setProfileEmail(e.target.value)} disabled={!editProfile} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="empId">Employee ID</Label>
                    <Input id="empId" value={employeeId} disabled />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="profRole">Role</Label>
                    <Input id="profRole" value={role === "inspection_manager" ? "Inspection Manager" : "Inspector"} disabled />
                  </div>
                </div>
                
                <div className="flex gap-2 justify-end border-t border-border pt-4">
                  {editProfile ? (
                    <>
                      <Button type="button" variant="outline" onClick={() => setEditProfile(false)}>Cancel</Button>
                      <Button type="submit">Save Changes</Button>
                    </>
                  ) : (
                    <Button type="button" variant="outline" onClick={() => setEditProfile(true)}>Edit Profile</Button>
                  )}
                </div>
              </form>
            </SectionCard>
          )}

          {/* TAB: SECURITY */}
          {activeTab === "security" && (
            <SectionCard title="Security Preferences" subtitle="Manage credentials and authentication status">
              <form onSubmit={handleChangePassword} className="space-y-4 max-w-md">
                <div className="space-y-2">
                  <Label htmlFor="newPass">New Password</Label>
                  <Input id="newPass" type="password" required value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="confirmPass">Confirm Password</Label>
                  <Input id="confirmPass" type="password" required value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} />
                </div>
                <Button type="submit" disabled={updatingPass}>Change Password</Button>
              </form>
              
              <div className="mt-8 border-t border-border pt-6">
                <p className="type-body-m font-semibold text-foreground">Sign Out</p>
                <p className="type-body-s text-muted-foreground mt-0.5">Logout from this inspection terminal station.</p>
                <Button variant="destructive" className="mt-3" onClick={signOut}>
                  <LogOut className="mr-2 size-4" /> Sign Out
                </Button>
              </div>
            </SectionCard>
          )}

          {/* TAB: PREFERENCES */}
          {activeTab === "preferences" && (
            <SectionCard title="Station Preferences" subtitle="Configure defaults for high-speed inspection loop">
              <div className="space-y-6">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Default Selected Part</Label>
                    <Select value={defaultPart} onValueChange={setDefaultPart}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">None (Prompt Operator)</SelectItem>
                        {parts.map((p) => (
                          <SelectItem key={p.id} value={p.id}>{p.part_name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Default Active Model</Label>
                    <Select value={defaultModel} onValueChange={setDefaultModel}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Unified Inspection Model</SelectItem>
                        {models.map((m) => (
                          <SelectItem key={m.id} value={m.id}>{m.model_name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="space-y-4 border-t border-border pt-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="type-body-m font-semibold text-foreground">Show Measurement Results Automatically</p>
                      <p className="type-body-s text-muted-foreground">Skip manual confirmation after Capture & Measure triggers.</p>
                    </div>
                    <Switch checked={showMeasureAuto} onCheckedChange={setShowMeasureAuto} />
                  </div>

                  <div className="flex items-center justify-between">
                    <div>
                      <p className="type-body-m font-semibold text-foreground">Show Inspection Results Automatically</p>
                      <p className="type-body-s text-muted-foreground">Render YOLO annotated bounding boxes immediately.</p>
                    </div>
                    <Switch checked={showInspectAuto} onCheckedChange={setShowInspectAuto} />
                  </div>
                </div>

                <div className="flex justify-end border-t border-border pt-4">
                  <Button onClick={savePreferences}>Save Preferences</Button>
                </div>
              </div>
            </SectionCard>
          )}

          {/* TAB: NOTIFICATIONS */}
          {activeTab === "notifications" && (
            <SectionCard title="Notification Dispatcher" subtitle="Enable audio/visual alerts on quality threshold failures">
              <div className="space-y-6">
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="type-body-m font-semibold text-foreground">Inspection Completed</p>
                      <p className="type-body-s text-muted-foreground">Trigger alert chime when a verdict is ready.</p>
                    </div>
                    <Switch checked={notifyComplete} onCheckedChange={setNotifyComplete} />
                  </div>

                  <div className="flex items-center justify-between">
                    <div>
                      <p className="type-body-m font-semibold text-foreground">Defect Detected</p>
                      <p className="type-body-s text-muted-foreground">Sound alarm if YOLO highlights surface defect marks.</p>
                    </div>
                    <Switch checked={notifyDefect} onCheckedChange={setNotifyDefect} />
                  </div>

                  <div className="flex items-center justify-between">
                    <div>
                      <p className="type-body-m font-semibold text-foreground">Measurement Failed</p>
                      <p className="type-body-s text-muted-foreground">Flag high-priority alerts on dimensional deviations.</p>
                    </div>
                    <Switch checked={notifyFailed} onCheckedChange={setNotifyFailed} />
                  </div>
                </div>

                <div className="flex justify-end border-t border-border pt-4">
                  <Button onClick={saveNotifications}>Save Preferences</Button>
                </div>
              </div>
            </SectionCard>
          )}

          {/* TAB: ABOUT */}
          {activeTab === "about" && (
            <SectionCard title="Station Information" subtitle="Software and hardware deployment details">
              <div className="space-y-4 text-sm leading-relaxed">
                <div>
                  <p className="text-xs font-bold text-muted-foreground uppercase tracking-wide">Developer</p>
                  <p className="type-body-m font-semibold mt-0.5 text-foreground">WG Tech (Precision Engineering Dept.)</p>
                </div>
                <div>
                  <p className="text-xs font-bold text-muted-foreground uppercase tracking-wide">Application</p>
                  <p className="type-body-m font-semibold mt-0.5 text-foreground">WGDeepInsight quality control supervisor</p>
                </div>
                <div>
                  <p className="text-xs font-bold text-muted-foreground uppercase tracking-wide">App Version</p>
                  <p className="type-body-m font-semibold mt-0.5 text-brand-orange font-mono">v2.4.0 (Enterprise Release)</p>
                </div>
                <div className="border-t border-border pt-4">
                  <p className="type-body-s text-muted-foreground">
                    This automated visual inspection station captures 12MP high-resolution frame pairs from dual Hikrobot GigE cameras, compiling dimensional calculations and surface defect checks in real-time.
                  </p>
                </div>
              </div>
            </SectionCard>
          )}

          {/* TAB: USER MANAGEMENT (MANAGER ONLY) */}
          {activeTab === "users" && isManager && (
            <SectionCard 
              title="Team Directory" 
              subtitle="Manage inspector access controls and station credentials"
              action={
                <Dialog open={addUserOpen} onOpenChange={setAddUserOpen}>
                  <DialogTrigger asChild>
                    <Button size="sm">
                      <Plus className="mr-2 size-4" /> Add Inspector
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Add Team Member</DialogTitle>
                      <DialogDescription>Create a new profile for an Inspector or Inspection Manager.</DialogDescription>
                    </DialogHeader>
                    <form onSubmit={handleCreateUser} className="space-y-4">
                      <div className="space-y-2">
                        <Label htmlFor="newUserName">Full Name</Label>
                        <Input id="newUserName" placeholder="e.g. Riya Patel" required value={newUserName} onChange={(e) => setNewUserName(e.target.value)} />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="newUserEmail">Email Address</Label>
                        <Input id="newUserEmail" type="email" placeholder="e.g. riya@wgtech.com" required value={newUserEmail} onChange={(e) => setNewUserEmail(e.target.value)} />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="newUserRole">System Role</Label>
                        <Select value={newUserRole} onValueChange={setNewUserRole}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="inspector">Inspector (Shopfloor Operator)</SelectItem>
                            <SelectItem value="inspection_manager">Inspection Manager (Admin)</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <DialogFooter>
                        <Button type="button" variant="outline" onClick={() => setAddUserOpen(false)}>Cancel</Button>
                        <Button type="submit" disabled={addingUser}>Add User</Button>
                      </DialogFooter>
                    </form>
                  </DialogContent>
                </Dialog>
              }
            >
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-border text-left type-caption font-semibold text-muted-foreground uppercase">
                      <th className="px-4 py-2">Inspector</th>
                      <th className="px-4 py-2">Email</th>
                      <th className="px-4 py-2">Role</th>
                      <th className="px-4 py-2">Status</th>
                      <th className="px-4 py-2 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {people.map((p) => {
                      const isDeactivated = deactivatedUsers.includes(p.id);
                      return (
                        <tr key={p.id} className="hover:bg-muted/10">
                          <td className="px-4 py-3 font-semibold text-foreground">{p.name}</td>
                          <td className="px-4 py-3 text-muted-foreground">{p.email}</td>
                          <td className="px-4 py-3 text-sm">
                            {p.role === "inspection_manager" ? "Manager" : "Inspector"}
                          </td>
                          <td className="px-4 py-3">
                            <span className={cn(
                              "inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase",
                              isDeactivated ? "bg-rose-500/20 text-rose-400" : "bg-emerald-500/20 text-emerald-400"
                            )}>
                              {isDeactivated ? "Deactivated" : "Active"}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right">
                            <Button 
                              size="sm" 
                              variant="outline" 
                              onClick={() => toggleUserStatus(p.id)}
                              disabled={p.id === user?.id} // Don't deactivate yourself
                            >
                              {isDeactivated ? "Activate" : "Deactivate"}
                            </Button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </SectionCard>
          )}

          {/* TAB: PARTS CONFIG (MANAGER ONLY) */}
          {activeTab === "parts" && isManager && (
            <SectionCard 
              title="Part Families Registry" 
              subtitle="Define mechanical part families for inference tracking"
              action={
                <Dialog open={addPartOpen} onOpenChange={setAddPartOpen}>
                  <DialogTrigger asChild>
                    <Button size="sm">
                      <Plus className="mr-2 size-4" /> Add Part
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Add Part Family</DialogTitle>
                      <DialogDescription>Create a new part record for AI training and dimensional checks.</DialogDescription>
                    </DialogHeader>
                    <form onSubmit={handleCreatePart} className="space-y-4">
                      <div className="space-y-2">
                        <Label htmlFor="pName">Part Name</Label>
                        <Input id="pName" placeholder="e.g. Pin, Capnut" required value={newPartName} onChange={(e) => setNewPartName(e.target.value)} />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="pDesc">Description</Label>
                        <Textarea id="pDesc" placeholder="e.g. Precision dowel pin, hardened steel..." value={newPartDesc} onChange={(e) => setNewPartDesc(e.target.value)} />
                      </div>
                      <DialogFooter>
                        <Button type="button" variant="outline" onClick={() => setAddPartOpen(false)}>Cancel</Button>
                        <Button type="submit" disabled={addingPart}>Create Part</Button>
                      </DialogFooter>
                    </form>
                  </DialogContent>
                </Dialog>
              }
            >
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-border text-left type-caption font-semibold text-muted-foreground uppercase">
                      <th className="px-4 py-2">Part Name</th>
                      <th className="px-4 py-2">Description</th>
                      <th className="px-4 py-2">Created At</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {parts.map((p) => (
                      <tr key={p.id} className="hover:bg-muted/10">
                        <td className="px-4 py-3 font-semibold text-foreground">{p.part_name}</td>
                        <td className="px-4 py-3 text-muted-foreground">{p.description}</td>
                        <td className="px-4 py-3 text-sm tabular">{new Date(p.created_at).toLocaleDateString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </SectionCard>
          )}

          {/* TAB: SPECIFICATIONS (MANAGER ONLY) */}
          {activeTab === "specs" && isManager && (
            <SectionCard 
              title="Dimensional Tolerances" 
              subtitle="Set precision parameter expected values and tolerances"
              action={
                <Dialog open={addSpecOpen} onOpenChange={setAddSpecOpen}>
                  <DialogTrigger asChild>
                    <Button size="sm">
                      <Plus className="mr-2 size-4" /> Add Parameter
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Add Specification Parameter</DialogTitle>
                      <DialogDescription>Define expected nominal dimensions and allowed tolerance margins.</DialogDescription>
                    </DialogHeader>
                    <form onSubmit={handleCreateSpec} className="space-y-4">
                      <div className="space-y-2">
                        <Label>Part Family</Label>
                        <Select value={specPartId} onValueChange={setSpecPartId}>
                          <SelectTrigger><SelectValue placeholder="Select Part..." /></SelectTrigger>
                          <SelectContent>
                            {parts.map((p) => (
                              <SelectItem key={p.id} value={p.id}>{p.part_name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="specParam">Parameter Name</Label>
                        <Input id="specParam" placeholder="e.g. Overall Length, Thread Pitch" required value={specParam} onChange={(e) => setSpecParam(e.target.value)} />
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label htmlFor="specExpected">Expected Value</Label>
                          <Input id="specExpected" type="number" step="any" placeholder="e.g. 17.5" required value={specExpected} onChange={(e) => setSpecExpected(e.target.value)} />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="specTolerance">Tolerance Band (±)</Label>
                          <Input id="specTolerance" type="number" step="any" placeholder="e.g. 0.05" value={specTolerance} onChange={(e) => setSpecTolerance(e.target.value)} />
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label htmlFor="specUnit">Unit</Label>
                          <Select value={specUnit} onValueChange={setSpecUnit}>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="mm">Millimeters (mm)</SelectItem>
                              <SelectItem value="inch">Inches (in)</SelectItem>
                              <SelectItem value="degree">Degrees (°)</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="specNotes">Notes / Blueprint Location</Label>
                          <Input id="specNotes" placeholder="e.g. Detail Y, Section G-G" value={specNotes} onChange={(e) => setSpecNotes(e.target.value)} />
                        </div>
                      </div>
                      <DialogFooter>
                        <Button type="button" variant="outline" onClick={() => setAddSpecOpen(false)}>Cancel</Button>
                        <Button type="submit" disabled={addingSpec}>Add Spec</Button>
                      </DialogFooter>
                    </form>
                  </DialogContent>
                </Dialog>
              }
            >
              <div className="mb-4">
                <Label>Filter Specifications by Part</Label>
                <Select value={selectedPartId} onValueChange={setSelectedPartId}>
                  <SelectTrigger className="w-[200px] mt-1.5"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Parts</SelectItem>
                    {parts.map((p) => (
                      <SelectItem key={p.id} value={p.id}>{p.part_name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-border text-left type-caption font-semibold text-muted-foreground uppercase">
                      <th className="px-4 py-2">Parameter</th>
                      <th className="px-4 py-2">Part</th>
                      <th className="px-4 py-2">Expected</th>
                      <th className="px-4 py-2">Tolerance</th>
                      <th className="px-4 py-2">Unit</th>
                      <th className="px-4 py-2">Notes</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {filteredSpecs.map((s) => (
                      <tr key={s.id} className="hover:bg-muted/10">
                        <td className="px-4 py-3 font-semibold text-foreground">{s.parameter}</td>
                        <td className="px-4 py-3 text-sm">
                          {parts.find((p) => p.id === s.part_id)?.part_name ?? "—"}
                        </td>
                        <td className="px-4 py-3 tabular text-foreground font-medium">{s.expected_value}</td>
                        <td className="px-4 py-3 tabular text-muted-foreground">{s.tolerance > 0 ? `±${s.tolerance}` : "—"}</td>
                        <td className="px-4 py-3 text-sm text-muted-foreground">{s.unit}</td>
                        <td className="px-4 py-3 text-sm text-muted-foreground">{s.notes || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </SectionCard>
          )}

          {/* TAB: AI MODELS (MANAGER ONLY) */}
          {activeTab === "models" && isManager && (
            <SectionCard 
              title="AI Inference Registry" 
              subtitle="Register neural defect trackers or measurement scripts"
              action={
                <Dialog open={addModelOpen} onOpenChange={setAddModelOpen}>
                  <DialogTrigger asChild>
                    <Button size="sm">
                      <Plus className="mr-2 size-4" /> Add Model
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Register Model</DialogTitle>
                      <DialogDescription>Deploy a new YOLO surface detector or custom dimensional calculation script.</DialogDescription>
                    </DialogHeader>
                    <form onSubmit={handleRegisterModel} className="space-y-4">
                      <div className="space-y-2">
                        <Label htmlFor="mName">Model Name</Label>
                        <Input id="mName" placeholder="e.g. Pin Surface Defect v4" required value={mName} onChange={(e) => setMName(e.target.value)} />
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label>Model Type</Label>
                          <Select value={mType} onValueChange={setMType}>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="surface">Surface Defect (YOLO)</SelectItem>
                              <SelectItem value="measurement">Measurement (Python Script)</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="mVersion">Version</Label>
                          <Input id="mVersion" placeholder="e.g. 1.0" value={mVersion} onChange={(e) => setMVersion(e.target.value)} />
                        </div>
                      </div>
                      <div className="space-y-2">
                        <Label>Part Family Association</Label>
                        <Select value={mPartId} onValueChange={setMPartId}>
                          <SelectTrigger><SelectValue placeholder="Select Part..." /></SelectTrigger>
                          <SelectContent>
                            {parts.map((p) => (
                              <SelectItem key={p.id} value={p.id}>{p.part_name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="mPath">Weights Path / Executable File Name</Label>
                        <Input id="mPath" placeholder="e.g. surface_models/Pin_best.pt" value={mPath} onChange={(e) => setMPath(e.target.value)} />
                      </div>
                      <DialogFooter>
                        <Button type="button" variant="outline" onClick={() => setAddModelOpen(false)}>Cancel</Button>
                        <Button type="submit" disabled={addingModel}>Register Model</Button>
                      </DialogFooter>
                    </form>
                  </DialogContent>
                </Dialog>
              }
            >
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-border text-left type-caption font-semibold text-muted-foreground uppercase">
                      <th className="px-4 py-2">Model Name</th>
                      <th className="px-4 py-2">Type</th>
                      <th className="px-4 py-2">Associated Part</th>
                      <th className="px-4 py-2">Weights / Executable Path</th>
                      <th className="px-4 py-2">Version</th>
                      <th className="px-4 py-2 text-right">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {models.map((m) => (
                      <tr key={m.id} className="hover:bg-muted/10">
                        <td className="px-4 py-3 font-semibold text-foreground">{m.model_name}</td>
                        <td className="px-4 py-3 text-sm capitalize">{m.model_type}</td>
                        <td className="px-4 py-3 text-sm">
                          {parts.find((p) => p.id === m.part_id)?.part_name ?? "General"}
                        </td>
                        <td className="px-4 py-3 text-sm font-mono truncate max-w-[200px]">{m.model_path}</td>
                        <td className="px-4 py-3 text-sm tabular">v{m.version}</td>
                        <td className="px-4 py-3 text-right">
                          <StatusBadge status={m.status} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </SectionCard>
          )}

          {/* TAB: SYSTEM CONFIG (MANAGER ONLY) */}
          {activeTab === "system" && isManager && (
            <SectionCard title="System configurations" subtitle="Adjust global branding descriptors and date rendering rules">
              <div className="space-y-4 max-w-md">
                <div className="space-y-2">
                  <Label htmlFor="sysCompany">Company Name</Label>
                  <Input id="sysCompany" value={companyName} onChange={(e) => setCompanyName(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="sysApp">Application Name</Label>
                  <Input id="sysApp" value={appName} onChange={(e) => setAppName(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Date & Time Format</Label>
                  <Select value={dateTimeFormat} onValueChange={setDateTimeFormat}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="DD/MM/YYYY HH:mm:ss">European/Standard (DD/MM/YYYY HH:mm:ss)</SelectItem>
                      <SelectItem value="MM/DD/YYYY hh:mm A">US Format (MM/DD/YYYY hh:mm A)</SelectItem>
                      <SelectItem value="YYYY-MM-DD HH:mm:ss">ISO Format (YYYY-MM-DD HH:mm:ss)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                
                <div className="pt-4 border-t border-border">
                  <p className="type-body-s text-muted-foreground">Branding descriptors customize printed and exported reports headers.</p>
                  <Button className="mt-3" onClick={saveSystemConfig}>Save Configurations</Button>
                </div>
              </div>
            </SectionCard>
          )}

          {/* TAB: AUDIT LOGS (MANAGER ONLY) */}
          {activeTab === "audit" && isManager && (
            <SectionCard title="Audit Traceability logs" subtitle="Browse system logging logs, database adjustments, and inspections histories">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-border text-left type-caption font-semibold text-muted-foreground uppercase">
                      <th className="px-4 py-2">Timestamp</th>
                      <th className="px-4 py-2">Inspector</th>
                      <th className="px-4 py-2">Action / Audit Event</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {auditLogs.map((log) => (
                      <tr key={log.id} className="hover:bg-muted/10">
                        <td className="px-4 py-3 text-sm tabular text-muted-foreground whitespace-nowrap">{log.time}</td>
                        <td className="px-4 py-3 font-semibold text-foreground whitespace-nowrap">{log.user}</td>
                        <td className="px-4 py-3 text-sm text-foreground">{log.action}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </SectionCard>
          )}
        </main>
      </div>
    </AppShell>
  );
}
