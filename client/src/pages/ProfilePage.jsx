import { AccountPageHeader } from '../components/account/AccountPageHeader.jsx';
import { PasswordForm } from '../components/account/PasswordForm.jsx';
import { ProfileForm } from '../components/account/ProfileForm.jsx';

export function ProfilePage() {
  return (
    <div>
      <AccountPageHeader
        title="Profil"
        description="Pastikan nama, email, dan nomor WhatsApp selalu bisa dihubungi kurir."
      />

      <div className="mt-8 max-w-xl">
        <ProfileForm />
      </div>

      <section aria-labelledby="ubah-sandi" className="mt-12 max-w-xl border-t border-sand pt-8">
        <h2 id="ubah-sandi" className="font-display text-heading text-ink">
          Kata sandi
        </h2>
        <p className="mt-1 text-sm leading-relaxed text-ink-soft">
          Ganti kata sandi secara berkala. Setelah diperbarui, sesi ini tetap aktif.
        </p>
        <div className="mt-6">
          <PasswordForm />
        </div>
      </section>
    </div>
  );
}
