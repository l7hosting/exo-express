"use client";

import { useEffect, useRef, useState } from "react";
import { withBasePath } from "@/lib/base-path";

// Raw <img> sources are not rewritten by Next's basePath — prefix explicitly.
// When deployed under /dashboard the request becomes /dashboard/brand/logo-primary.png.
const LOGO_SRC = withBasePath("/brand/logo-primary.png");

/**
 * EXO EXPRESS brand mark.
 *
 * The official artwork is expected at `public/brand/logo-primary.png`. While
 * that file is not shipped yet, the component degrades to a typographic
 * wordmark built from the provisional brand palette — it never fakes a logo.
 * See `public/brand/README.md` for the restore procedure.
 *
 * The image is rendered server-side, so it can fail *before* React hydrates
 * and the `error` event is then never dispatched. The effect below re-checks
 * the element state (`complete` + `naturalWidth === 0`) to cover that case.
 */
export function BrandLogo({ variant = "sidebar" }: { variant?: "sidebar" | "login" }) {
  const [failed, setFailed] = useState(false);
  const imageRef = useRef<HTMLImageElement | null>(null);

  useEffect(() => {
    const element = imageRef.current;
    if (element && element.complete && element.naturalWidth === 0) {
      setFailed(true);
    }
  }, []);

  if (!failed) {
    return (
      <img
        ref={imageRef}
        src={LOGO_SRC}
        alt="EXO EXPRESS"
        className={variant === "sidebar" ? "brandLogo" : "loginLogo"}
        onError={() => setFailed(true)}
      />
    );
  }

  if (variant === "login") {
    return (
      <span className="loginBrandFallback">
        <span className="brandFallbackMark">EX</span>
        <span className="brandFallbackText">EXO EXPRESS</span>
      </span>
    );
  }

  return (
    <span className="brandFallback">
      <span className="brandFallbackMark">EX</span>
      <span className="brandFallbackText">EXPRESS</span>
    </span>
  );
}
