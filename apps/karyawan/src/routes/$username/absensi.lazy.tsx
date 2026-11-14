import { createLazyFileRoute } from "@tanstack/react-router";
import { Skeleton, useHybridCurrentlyInStore, useHybridPublicUsers, useYumiAuth } from "@yumipos/web-shared";
import { DsButton, DsGroup, DsGroupLabel, DsIcon, DsPageTitle, DsRow, DsTag, ds3d } from "@yumipos/web-shared/components/ds";
import { useStaffProfile } from "../$username.lazy";

export const Route = createLazyFileRoute("/$username/absensi")({
  component: KaryawanAttendancePage,
});

function KaryawanAttendancePage() {
  const { username, staff, navigate, openAbsen } = useStaffProfile();
  const { user: authUser } = useYumiAuth();
  const allStaff = useHybridPublicUsers();
  const currentlyIn = useHybridCurrentlyInStore();
  // The attendance action has always belonged to the signed-in user, including
  // when an administrator is viewing another staff profile.
  const selectedUser = Array.isArray(allStaff) && authUser
    ? allStaff.find((s: any) =>
      (authUser._id && String(s._id) === String(authUser._id)) ||
      (authUser.slug && s.slug && String(s.slug) === String(authUser.slug)) ||
      (authUser.username && s.username && String(s.username) === String(authUser.username)))
    : undefined;
  const isIn = selectedUser && currentlyIn?.some((s: any) => s._id === selectedUser._id);

  return (
    <>
      <DsPageTitle>Absensi</DsPageTitle>
      {selectedUser ? (
        <>
          <div className="ds-hero">
            <img className="ds-hero-art" src={ds3d(isIn ? "employee-attendance-check-out" : "employee-attendance-check-in")} alt="" />
            <small>{selectedUser.name}</small>
            <h3>{!currentlyIn ? "Status belum tersedia" : isIn ? "Sedang bertugas" : "Tidak sedang bertugas"}</h3>
            <DsButton block onClick={() => {
              if (currentlyIn && String(staff?._id) === String(selectedUser._id)) openAbsen();
              else window.open("https://t.me/yumihrdbot", "_blank");
            }}>{!currentlyIn ? "Buka bot Telegram" : isIn ? "Absen keluar · closing dulu" : "Absen masuk"}</DsButton>
          </div>
          <DsGroupLabel>Status kehadiran</DsGroupLabel>
          <DsGroup white>
            <DsRow icon={<DsIcon name="employee-attendance-check-in" />} title={selectedUser.name} sub={!currentlyIn ? "Status belum tersedia" : isIn ? "Sedang bertugas" : "Sedang off"} trail={<DsTag tone={isIn ? "ok" : undefined}>{!currentlyIn ? "Tidak tersedia" : isIn ? "Masuk" : "Off"}</DsTag>} />
            <DsRow icon={<DsIcon name="employee-telegram" />} title="Bot Telegram" sub="Absen dan rekap lewat Telegram" chevron onClick={() => window.open("https://t.me/yumihrdbot", "_blank")} />
          </DsGroup>
          <DsGroupLabel>Riwayat kehadiran</DsGroupLabel>
          <DsGroup white>
            <DsRow icon={<DsIcon name="employee-recap" />} title="Rekap absensi" sub="Lihat riwayat kehadiran" chevron onClick={() => navigate({ to: "/$username/rekap-absensi", params: { username } } as any)} />
          </DsGroup>
        </>
      ) : (
        <div role="status" aria-label="Memuat data absensi" className="space-y-3">
          <Skeleton className="h-36 rounded-3xl" />
          <Skeleton className="h-28 rounded-3xl" />
        </div>
      )}
    </>
  );
}
