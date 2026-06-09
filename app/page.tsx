import dynamicLoader from "next/dynamic";

export const dynamic = "force-dynamic";

const MarketTerminal = dynamicLoader(() => import("./MarketTerminal"), {
  ssr: false,
});

export default function Page() {
  return <MarketTerminal />;
}
