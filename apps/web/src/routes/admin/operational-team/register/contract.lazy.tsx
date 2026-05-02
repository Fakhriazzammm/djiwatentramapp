import { createLazyFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, FileSignature, Loader2, Plus, Sparkles, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ContractPreview } from "@/components/employee-onboarding/contract-preview";
import { useHybridGenerateEmployeeContract } from "@/hooks/use-employee-onboarding-actions";
import {
  buildEmployeeContractTemplate,
  clausesToPlainText,
  type EmployeeContract,
  type EmployeeContractClause,
} from "@/lib/employee-onboarding-schema";

type ContractDraft = {
  title: string;
  clauses: EmployeeContractClause[];
  aiPrompt: string;
};

function AdminContractPage() {
  const generateContract = useHybridGenerateEmployeeContract();
  const [isGenerating, setIsGenerating] = useState(false);
  const [draft, setDraft] = useState<ContractDraft>({
    title: "Perjanjian Kerja",
    clauses: [],
    aiPrompt: "",
  });

  const contractPreview: EmployeeContract = {
    mode: "custom",
    title: draft.title,
    plainText: clausesToPlainText(draft.title, draft.clauses),
    clauses: draft.clauses,
  };

  const applyTemplate = useCallback(() => {
    const tpl = buildEmployeeContractTemplate({
      employee: { fullName: "[Nama Karyawan]" },
      employment: { roleName: "[Jabatan]", startDate: "[Tanggal Mulai]" },
    });
    setDraft({
      title: tpl.title ?? "Perjanjian Kerja",
      clauses: tpl.clauses ?? [],
      aiPrompt: draft.aiPrompt,
    });
    toast.success("Template diterapkan");
  }, [draft.aiPrompt]);

  const handleGenerateAi = useCallback(async () => {
    setIsGenerating(true);
    try {
      const c = await generateContract({
        employee: { fullName: "[Nama Karyawan]" },
        employment: { roleName: "[Jabatan]", startDate: "[Tanggal Mulai]" },
        company: { name: "Djiwa Tentram Cafe & Resto" },
        options: { tone: "formal", customNotes: draft.aiPrompt },
      });
      setDraft({
        title: c.title ?? "Perjanjian Kerja",
        clauses: c.clauses ?? [],
        aiPrompt: draft.aiPrompt,
      });
      toast.success("Kontrak AI berhasil dibuat");
    } catch (e: any) {
      toast.error(e?.message || "Gagal generate kontrak");
    } finally {
      setIsGenerating(false);
    }
  }, [draft.aiPrompt, generateContract]);

  const addClause = useCallback(() => {
    setDraft((p) => ({
      ...p,
      clauses: [...p.clauses, { title: "Pasal Baru", body: "Isi klausul..." }],
    }));
  }, []);

  const updateClause = useCallback((idx: number, key: keyof EmployeeContractClause, value: string) => {
    setDraft((p) => {
      const clauses = [...p.clauses];
      clauses[idx] = { ...clauses[idx], [key]: value };
      return { ...p, clauses };
    });
  }, []);

  const removeClause = useCallback((idx: number) => {
    setDraft((p) => ({
      ...p,
      clauses: p.clauses.filter((_, i) => i !== idx),
    }));
  }, []);

  // Auto-apply template on mount if empty
  useEffect(() => {
    if (!draft.clauses.length) applyTemplate();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="mx-auto w-full max-w-7xl space-y-4 md:space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <Badge className="mb-2" variant="secondary">
            <FileSignature className="mr-1 h-3 w-3" /> Kontrak Kerja
          </Badge>
          <h2 className="font-bold text-foreground text-xl tracking-tight md:text-3xl">
            Pembuatan Kontrak
          </h2>
          <p className="mt-1 text-muted-foreground text-xs md:text-sm">
            Buat template kontrak kerja yang akan ditampilkan ke karyawan saat registrasi.
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-4 lg:flex-row lg:gap-6">
        {/* Editor */}
        <Card className="flex-1 border sm:rounded-xl">
          <CardHeader className="pb-2 sm:pb-4">
            <CardTitle className="text-base sm:text-lg">Editor Kontrak</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 sm:space-y-4">
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                onClick={applyTemplate}
                type="button"
                variant="outline"
                className="sm:h-10 sm:px-4 sm:text-sm"
              >
                Gunakan Template
              </Button>
              <Button
                size="sm"
                disabled={isGenerating}
                onClick={handleGenerateAi}
                type="button"
                className="sm:h-10 sm:px-4 sm:text-sm"
              >
                <Sparkles className="mr-1.5 h-4 w-4" />
                {isGenerating ? "Generate..." : "Generate AI"}
              </Button>
            </div>

            <div className="space-y-2">
              <Label>Catatan untuk AI</Label>
              <Textarea
                value={draft.aiPrompt}
                onChange={(e) => setDraft((p) => ({ ...p, aiPrompt: e.target.value }))}
                placeholder="Masa probation 3 bulan, training barista, libur menyesuaikan jadwal outlet"
                className="text-sm"
              />
            </div>

            <div className="space-y-2">
              <Label>Judul Kontrak</Label>
              <Input
                value={draft.title}
                onChange={(e) => setDraft((p) => ({ ...p, title: e.target.value }))}
              />
            </div>

            <div className="space-y-2.5 sm:space-y-3">
              {draft.clauses.map((clause, idx) => (
                <div
                  key={idx}
                  className="group rounded-lg border p-2.5 sm:rounded-xl sm:p-3"
                >
                  <div className="mb-2 flex items-center gap-2">
                    <Input
                      className="text-sm"
                      value={clause.title}
                      onChange={(e) => updateClause(idx, "title", e.target.value)}
                    />
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
                      onClick={() => removeClause(idx)}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                  <Textarea
                    className="text-sm"
                    value={clause.body}
                    onChange={(e) => updateClause(idx, "body", e.target.value)}
                  />
                </div>
              ))}
              <Button size="sm" type="button" variant="outline" onClick={addClause}>
                <Plus className="mr-1 h-4 w-4" /> Tambah Klausul
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Preview */}
        <div className="flex-1">
          <ContractPreview
            contract={contractPreview}
            employeeName="[Nama Karyawan]"
          />
        </div>
      </div>
    </div>
  );
}

export const Route = createLazyFileRoute("/admin/operational-team/register/contract" as any)({
  component: AdminContractPage,
});
