"use client";

import Script from "next/script";

const PIXEL_ID = process.env.NEXT_PUBLIC_META_PIXEL_ID;

type Fbq = (...args: unknown[]) => void;

/** Fire a pixel event. eventID lets Meta dedupe it against the server-side copy. */
export function trackPixel(event: "Lead" | "Schedule", eventId: string) {
  const fbq = (window as unknown as { fbq?: Fbq }).fbq;
  if (PIXEL_ID && fbq) fbq("track", event, {}, { eventID: eventId });
}

/** Meta pixel base code + PageView. Renders nothing without NEXT_PUBLIC_META_PIXEL_ID. */
export function MetaPixel() {
  if (!PIXEL_ID) return null;
  return (
    <Script id="meta-pixel" strategy="afterInteractive">
      {`!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?
n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;
n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;
t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,
document,'script','https://connect.facebook.net/en_US/fbevents.js');
fbq('init', ${JSON.stringify(PIXEL_ID)});
fbq('track', 'PageView');`}
    </Script>
  );
}
