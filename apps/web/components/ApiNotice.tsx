import { API_IS_CONFIGURED } from "@/lib/api";

/**
 * Shown while the dashboard is deployed without a public API URL.
 * Renders nothing as soon as NEXT_PUBLIC_API_URL is set at build time.
 */
export function ApiNotice() {
  if (API_IS_CONFIGURED) return null;

  return (
    <div className="apiNotice" role="status">
      <span className="apiNoticeBadge">Shell statique</span>
      <div className="apiNoticeBody">
        <strong>Tableau de bord déployé — API en direct non connectée.</strong>
        <p>
          Cette version présente l&apos;interface EXO EXPRESS sans backend public. La connexion et les
          données en temps réel restent indisponibles tant qu&apos;une URL d&apos;API HTTPS publique
          n&apos;est pas configurée.
        </p>
      </div>
    </div>
  );
}
