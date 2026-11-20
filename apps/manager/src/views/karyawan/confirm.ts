/** Konfirmasi sederhana untuk Manager (memakai dialog bawaan browser seperti halaman Tim lama). */
export async function requestAdminConfirm(opts: { title: string; message: string; confirmText?: string; variant?: string }): Promise<boolean> {
	return window.confirm(`${opts.title}\n\n${opts.message}`);
}
