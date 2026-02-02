import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

function base64UrlDecode(input: string) {
  const padded = input.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(input.length / 4) * 4, "=");
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function safeReturnTo(value: unknown) {
  if (typeof value !== "string") return "/app/projects";
  if (!value.startsWith("/")) return "/app/projects";
  return value;
}

export default function MetaCallback() {
  const navigate = useNavigate();
  const location = useLocation();
  const { toast } = useToast();
  const [status, setStatus] = useState<"working" | "error">("working");

  const params = useMemo(() => new URLSearchParams(location.search), [location.search]);

  useEffect(() => {
    const error = params.get("error") || params.get("error_message");
    const code = params.get("code");
    const state = params.get("state");

    let returnTo = "/app/projects";
    if (state) {
      try {
        const decoded = JSON.parse(base64UrlDecode(state));
        returnTo = safeReturnTo(decoded?.return_to);
      } catch {
        returnTo = "/app/projects";
      }
    }

    if (error) {
      setStatus("error");
      toast({ title: "ConexÃ£o com a Meta cancelada", description: error, variant: "destructive" });
      navigate(returnTo, { replace: true });
      return;
    }

    if (!code) {
      setStatus("error");
      toast({ title: "Erro na conexÃ£o com a Meta", description: "CÃ³digo de autorizaÃ§Ã£o ausente.", variant: "destructive" });
      navigate(returnTo, { replace: true });
      return;
    }

    (async () => {
      const { error: callbackError } = await supabase.functions.invoke("meta-auth?action=callback", {
        body: { code },
      });

      if (callbackError) {
        setStatus("error");
        toast({ title: "Erro ao conectar Meta", description: callbackError.message, variant: "destructive" });
        navigate(returnTo, { replace: true });
        return;
      }

      toast({ title: "Meta conectada!", description: "Agora vocÃª pode selecionar uma conta de anÃºncios." });
      navigate(returnTo, { replace: true });
    })();
  }, [navigate, params, toast]);

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Conectando Meta Ads</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          {status === "working" ? "Finalizando autorizaÃ§Ã£o..." : "Redirecionando..."}
        </CardContent>
      </Card>
    </div>
  );
}

