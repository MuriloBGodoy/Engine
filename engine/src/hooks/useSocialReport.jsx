import { useCallback, useState } from "react";
import { SocialReportDialog } from "../components/community/SocialReport";

/**
 * `openReport({ targetType, targetId, reportedUserId })` abre o diálogo de
 * denúncia; `reportDialog` é o elemento a renderizar (null quando fechado).
 */
export function useSocialReport() {
  const [target, setTarget] = useState(null);
  const openReport = useCallback((next) => setTarget(next), []);
  const reportDialog = target ? (
    <SocialReportDialog target={target} onClose={() => setTarget(null)} />
  ) : null;
  return { openReport, reportDialog };
}
