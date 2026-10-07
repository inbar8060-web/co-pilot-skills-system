import { Banner } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { defaultLayout } from "@/lib/canvas/layout";
import { getCanvasState, widgetContext } from "@/lib/canvas/server";
import { singleParams, type SearchParams } from "@/lib/utils";
import { CrewCanvas } from "./canvas/crew-canvas";
import { loadCanvasData } from "./canvas/load";
import { ClassicOverview } from "./classic-overview";

export default async function OverviewPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const user = await requireUser();
  const { error } = singleParams(await searchParams);
  const canvas = await getCanvasState(user);
  if (!canvas.active) return <ClassicOverview user={user} error={error} />;

  const data = await loadCanvasData(user);
  return (
    <>
      {error === "forbidden" ? <div className="mb-5"><Banner tone="warn" title="You do not have access to that area" /></div> : null}
      <CrewCanvas data={data} initialLayout={canvas.layout} defaultItems={defaultLayout(widgetContext(user)).items} />
    </>
  );
}
