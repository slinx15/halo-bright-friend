import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogClose } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Users, Shield, ShieldCheck, Loader2, UserPlus, Trash2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from "@/lib/supabaseEnv";

const SUPABASE_KEY = SUPABASE_PUBLISHABLE_KEY;

function getAuthToken(): string {
  const storageKey = Object.keys(localStorage).find(k => k.includes("auth-token"));
  if (!storageKey) return "";
  try {
    const parsed = JSON.parse(localStorage.getItem(storageKey) || "");
    return parsed?.access_token || "";
  } catch {
    return "";
  }
}

function callManageUsers(action: string, method: string, body?: any) {
  const token = getAuthToken();
  return fetch(`${SUPABASE_URL}/functions/v1/manage-users?action=${action}`, {
    method,
    headers: {
      Authorization: `Bearer ${token || SUPABASE_KEY}`,
      apikey: SUPABASE_KEY,
      "Content-Type": "application/json",
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}

interface UserInfo {
  id: string;
  email: string;
  name: string;
  role: string;
  created_at: string;
  last_sign_in_at: string | null;
}

export default function ManajemenUser() {
  const { toast } = useToast();
  const { role, user: currentUser } = useAuth();
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newName, setNewName] = useState("");
  const [newRole, setNewRole] = useState("karyawan");

  const { data: users, isLoading } = useQuery({
    queryKey: ["manage-users"],
    queryFn: async () => {
      const res = await callManageUsers("list", "GET");
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `Error ${res.status}`);
      }
      const data = await res.json();
      return data.users as UserInfo[];
    },
    enabled: role === "admin",
  });

  const setRoleMutation = useMutation({
    mutationFn: async ({ userId, newRole }: { userId: string; newRole: string }) => {
      const res = await callManageUsers("set-role", "POST", { userId, role: newRole });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `Error ${res.status}`);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["manage-users"] });
      toast({ title: "Role berhasil diubah" });
    },
    onError: (err: Error) => {
      toast({ title: "Gagal", description: err.message, variant: "destructive" });
    },
  });

  const createUserMutation = useMutation({
    mutationFn: async () => {
      const res = await callManageUsers("create-user", "POST", {
        email: newEmail,
        password: newPassword,
        name: newName,
        role: newRole,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `Error ${res.status}`);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["manage-users"] });
      toast({ title: "User berhasil dibuat", description: `${newEmail} sudah bisa login` });
      setCreateOpen(false);
      setNewEmail("");
      setNewPassword("");
      setNewName("");
      setNewRole("karyawan");
    },
    onError: (err: Error) => {
      toast({ title: "Gagal buat user", description: err.message, variant: "destructive" });
    },
  });

  const deleteUserMutation = useMutation({
    mutationFn: async (userId: string) => {
      const res = await callManageUsers("delete-user", "POST", { userId });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `Error ${res.status}`);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["manage-users"] });
      toast({ title: "User berhasil dihapus" });
    },
    onError: (err: Error) => {
      toast({ title: "Gagal hapus user", description: err.message, variant: "destructive" });
    },
  });

  if (role !== "admin") {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <p className="text-muted-foreground">Akses hanya untuk admin</p>
      </div>
    );
  }

  return (
    <div className="space-y-4 [&>*]:animate-fade-in [&>*:nth-child(1)]:![animation-delay:0ms] [&>*:nth-child(2)]:![animation-delay:50ms] [&>*]:[animation-fill-mode:both]">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-primary/10">
            <Users className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-bold">Manajemen User</h1>
            <p className="text-sm text-muted-foreground">Kelola role dan akses pengguna</p>
          </div>
        </div>

        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <Button size="sm" className="rounded-xl gap-1.5">
              <UserPlus className="h-4 w-4" /> Tambah User
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Tambah User Baru</DialogTitle>
            </DialogHeader>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                createUserMutation.mutate();
              }}
              className="space-y-4 mt-2"
            >
              <div className="space-y-2">
                <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Nama</Label>
                <Input
                  placeholder="Nama lengkap"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  className="h-10 rounded-xl"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Email *</Label>
                <Input
                  type="email"
                  placeholder="nama@email.com"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  required
                  className="h-10 rounded-xl"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Password *</Label>
                <Input
                  type="text"
                  placeholder="Min. 6 karakter"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  required
                  minLength={6}
                  className="h-10 rounded-xl"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Role</Label>
                <Select value={newRole} onValueChange={setNewRole}>
                  <SelectTrigger className="h-10 rounded-xl">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="karyawan">Karyawan</SelectItem>
                    <SelectItem value="admin">Admin</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <DialogFooter>
                <DialogClose asChild>
                  <Button type="button" variant="outline" className="rounded-xl">Batal</Button>
                </DialogClose>
                <Button type="submit" disabled={createUserMutation.isPending} className="rounded-xl gap-1.5">
                  {createUserMutation.isPending ? (
                    <><Loader2 className="h-4 w-4 animate-spin" /> Membuat...</>
                  ) : (
                    <><UserPlus className="h-4 w-4" /> Buat User</>
                  )}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <Card className="rounded-2xl shadow-md border-0">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Daftar User</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : !users || users.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">Belum ada user</p>
          ) : (
            <div className="space-y-3">
              {users.map((u) => (
                <div
                  key={u.id}
                  className="flex items-center justify-between gap-3 p-3 rounded-xl bg-muted/40 border border-border/50"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="p-2 rounded-lg bg-primary/10 shrink-0">
                      {u.role === "admin" ? (
                        <ShieldCheck className="h-4 w-4 text-primary" />
                      ) : (
                        <Shield className="h-4 w-4 text-muted-foreground" />
                      )}
                    </div>
                    <div className="min-w-0">
                      <p className="font-medium text-sm truncate">{u.name || u.email}</p>
                      <p className="text-xs text-muted-foreground truncate">{u.email}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Select
                      value={u.role}
                      onValueChange={(val) => setRoleMutation.mutate({ userId: u.id, newRole: val })}
                      disabled={setRoleMutation.isPending}
                    >
                      <SelectTrigger className="w-[120px] h-8 text-xs rounded-lg">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="admin">
                          <span className="flex items-center gap-1.5">
                            <ShieldCheck className="h-3 w-3" /> Admin
                          </span>
                        </SelectItem>
                        <SelectItem value="karyawan">
                          <span className="flex items-center gap-1.5">
                            <Shield className="h-3 w-3" /> Karyawan
                          </span>
                        </SelectItem>
                      </SelectContent>
                    </Select>

                    {u.id !== currentUser?.id && (
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10 rounded-lg">
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Hapus user ini?</AlertDialogTitle>
                            <AlertDialogDescription>
                              User <strong>{u.name || u.email}</strong> akan dihapus permanen dan tidak bisa login lagi.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Batal</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={() => deleteUserMutation.mutate(u.id)}
                              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                            >
                              Hapus
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
