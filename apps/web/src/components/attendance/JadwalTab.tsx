import { motion } from "framer-motion";
import { Calendar } from "lucide-react";
import { PersonalSchedule } from "@/components/attendance/PersonalSchedule";

interface JadwalTabProps {
  userId: string;
  userName: string;
  userRole: string;
  month: number;
  year: number;
}

export function JadwalTab({ userId, userName, userRole, month, year }: JadwalTabProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-4"
    >
      <div className="flex items-center gap-2 px-1">
        <Calendar className="h-4 w-4 text-primary" />
        <h2 className="text-xs font-black uppercase tracking-wider text-foreground">
          Jadwal Shift
        </h2>
        <span className="text-[9px] font-bold text-muted-foreground ml-auto">
          {["Januari","Februari","Maret","April","Mei","Juni","Juli","Agustus","September","Oktober","November","Desember"][month - 1]} {year}
        </span>
      </div>

      <PersonalSchedule
        userId={userId}
        month={month}
        year={year}
      />
    </motion.div>
  );
}
