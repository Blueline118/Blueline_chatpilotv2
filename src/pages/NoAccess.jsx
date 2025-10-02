export default function NoAccess() {
  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="max-w-md w-full rounded-xl border bg-white p-6 shadow">
        <h1 className="text-xl font-semibold mb-2">Geen toegang</h1>
        <p className="text-sm text-gray-600 mb-4">
          Je bent ingelogd, maar je hebt geen lidmaatschap in deze organisatie.
          Alleen leden kunnen de app gebruiken.
        </p>
        <div className="flex gap-3">
          <a href="/login" className="px-3 py-2 rounded-lg border">Terug naar login</a>
          <a href="/logout" className="px-3 py-2 rounded-lg bg-black text-white">Uitloggen</a>
        </div>
      </div>
    </div>
  );
}
