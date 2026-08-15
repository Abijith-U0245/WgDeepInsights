import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Users } from "lucide-react";

import { AppShell } from "@/components/layout/AppShell";
import { SectionCard } from "@/components/common/SectionCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { useProfiles } from "@/hooks/useInspectionData";
import { useAuth } from "@/hooks/useAuth";
import { readLocalCollection, writeLocalCollection } from "@/lib/offline-store";

export const Route = createFileRoute("/_authenticated/users")({
  head: () => ({
    meta: [
      { title: "Users & Roles — WGDeepInsight | WG Tech" },
      { name: "description", content: "Team directory showing inspection managers and inspectors with their access level." },
      { property: "og:title", content: "Users & Roles — WGDeepInsight" },
      { property: "og:description", content: "Team directory showing inspection managers and inspectors with their access level." },
    ],
  }),
  component: UsersPage,
});

function UsersPage() {
  const navigate = useNavigate();
  const { isManager } = useAuth();
  const queryClient = useQueryClient();
  const { data: people = [] } = useProfiles();

  useEffect(() => {
    if (isManager) {
      navigate({ to: "/dashboard", replace: true });
    }
  }, [isManager, navigate]);

  // Add User State
  const [addOpen, setAddOpen] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("inspector");
  const [submitting, setSubmitting] = useState(false);

  async function handleAddUser(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !email.trim()) return;
    setSubmitting(true);
    try {
      // Generate a valid UUID format for profiles
      const newUserId = window.crypto ? window.crypto.randomUUID() : "user-" + Date.now();
      
      const profiles = readLocalCollection<Array<Record<string, unknown>>>("profiles", []);
      const roles = readLocalCollection<Array<Record<string, unknown>>>("user_roles", []);
      writeLocalCollection("profiles", [...profiles, { id: newUserId, name: name.trim(), email: email.trim(), created_at: new Date().toISOString() }]);
      writeLocalCollection("user_roles", [...roles, { user_id: newUserId, role: role as "inspector" | "inspection_manager" }]);

      toast.success(`User "${name}" added successfully.`);
      setName("");
      setEmail("");
      setRole("inspector");
      setAddOpen(false);
      await queryClient.invalidateQueries({ queryKey: ["profiles"] });
    } catch (err: any) {
      console.error(err);
      toast.error(err?.message || "Failed to add user.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AppShell 
      title="Users" 
      subtitle="Team directory and access levels"
      actions={
        <Dialog open={addOpen} onOpenChange={setAddOpen}>
          <DialogTrigger asChild>
            <Button size="sm">
              <Plus className="mr-2 size-4" /> Add User
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add Team Member</DialogTitle>
              <DialogDescription>Create a new profile for an Inspector or Inspection Manager.</DialogDescription>
            </DialogHeader>
            <form onSubmit={handleAddUser} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="userName">Full Name</Label>
                <Input id="userName" placeholder="e.g. John Doe" required value={name} onChange={(e) => setName(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">Email Address</Label>
                <Input id="email" type="email" placeholder="e.g. john@wgtech.com" required value={email} onChange={(e) => setEmail(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="role">System Role</Label>
                <Select value={role} onValueChange={setRole}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="inspector">Inspector (Shopfloor Operator)</SelectItem>
                    <SelectItem value="inspection_manager">Inspection Manager (Admin)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setAddOpen(false)}>Cancel</Button>
                <Button type="submit" disabled={submitting}>Add User</Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      }
    >
      <SectionCard bodyClassName="p-0">
        <ul className="divide-y divide-border">
          {people.map((p) => (
            <li key={p.id} className="flex items-center justify-between gap-4 px-5 py-4 hover:bg-muted/10 transition-colors">
              <div className="flex items-center gap-3">
                <span className="flex size-10 items-center justify-center rounded-full bg-brand-blue-subtle type-body-m font-semibold text-brand-blue">
                  {(p.name || p.email || "?").slice(0, 1).toUpperCase()}
                </span>
                <div>
                  <p className="type-body-m font-semibold text-foreground">{p.name || "Unnamed"}</p>
                  <p className="type-body-s text-muted-foreground">{p.email}</p>
                </div>
              </div>
              <span className="rounded-full border border-border bg-muted px-3 py-1 type-caption font-semibold text-muted-foreground">
                {p.role === "inspection_manager" ? "Inspection Manager" : "Inspector"}
              </span>
            </li>
          ))}
          {people.length === 0 && (
            <li className="px-5 py-14 text-center type-body-m text-muted-foreground">No users found.</li>
          )}
        </ul>
      </SectionCard>
    </AppShell>
  );
}
