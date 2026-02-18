import { useNavigate } from 'react-router-dom';
import { LogOut, Mail, User } from 'lucide-react';
import { Header } from '@/components/layout/Header';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useAuth } from '@/contexts/AuthContext';

export default function Settings() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();

  const getInitials = (name?: string | null, email?: string | null) => {
    if (name) return name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2);
    if (email) return email[0].toUpperCase();
    return 'U';
  };

  const handleSignOut = async () => {
    await signOut();
    navigate('/login');
  };

  return (
    <div className="min-h-screen bg-background">
      <Header />

      <main className="container py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold tracking-tight">Configurações</h1>
          <p className="mt-1 text-muted-foreground">Gerencie sua conta de acesso ao Engage DashView.</p>
        </div>

        <Card className="max-w-2xl">
          <CardHeader>
            <CardTitle>Conta</CardTitle>
            <CardDescription>Informações do usuário autenticado.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="flex items-center gap-4">
              <Avatar className="h-12 w-12">
                <AvatarImage src={user?.user_metadata?.avatar_url} />
                <AvatarFallback className="bg-primary text-primary-foreground">
                  {getInitials(user?.user_metadata?.full_name, user?.email)}
                </AvatarFallback>
              </Avatar>
              <div>
                <p className="font-medium">{user?.user_metadata?.full_name || 'Usuário'}</p>
                <p className="text-sm text-muted-foreground">{user?.email}</p>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-lg border p-3">
                <p className="mb-1 flex items-center gap-2 text-sm text-muted-foreground">
                  <User className="h-4 w-4" />
                  Nome
                </p>
                <p className="font-medium">{user?.user_metadata?.full_name || '-'}</p>
              </div>
              <div className="rounded-lg border p-3">
                <p className="mb-1 flex items-center gap-2 text-sm text-muted-foreground">
                  <Mail className="h-4 w-4" />
                  E-mail
                </p>
                <p className="font-medium break-all">{user?.email || '-'}</p>
              </div>
            </div>

            <div className="pt-2">
              <Button
                variant="destructive"
                onClick={handleSignOut}
                className="inline-flex items-center gap-2"
              >
                <LogOut className="h-4 w-4" />
                Sair da conta
              </Button>
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}

