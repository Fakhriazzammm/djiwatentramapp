import { motion } from "framer-motion";
import { Camera, Clock, MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useNavigate } from "@tanstack/react-router";

interface AbsensiTabProps {
  staffName: string;
  userId: string;
}

export function AbsensiTab({ staffName, userId }: AbsensiTabProps) {
  const navigate = useNavigate();

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-5"
    >
      <div className="text-center py-6">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10">
          <Clock className="h-8 w-8 text-primary" />
        </div>
        <h2 className="text-lg font-black tracking-tight">Absensi</h2>
        <p className="text-xs text-muted-foreground mt-1">
          Halo, {staffName}! Siap bekerja hari ini?
        </p>
      </div>

      <div className="space-y-3">
        <Button
          className="h-14 w-full rounded-xl text-base font-black shadow-lg shadow-primary/20 flex items-center justify-center gap-2"
          onClick={() => navigate({ to: "/attendance" as any })}
        >
          <Camera className="h-5 w-5" />
          ABSENSI MASUK / KELUAR
        </Button>

        <Button
          variant="outline"
          className="h-12 w-full rounded-xl text-xs font-bold flex items-center justify-center gap-2"
          onClick={() => navigate({ to: "$username", params: { username: "" } } as any)}
        >
          <MapPin className="h-4 w-4" />
          CEK STATUS SHIFT HARI INI
        </Button>
      </div>

      <div className="rounded-xl border bg-card p-4">
        <h3 className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-2">
          Riwayat Cepat
        </h3>
        <p className="text-xs text-muted-foreground text-center py-3">
          Buka tab Profile untuk melihat riwayat absensi lengkap
        </p>
      </div>
    </motion.div>
  );
}
