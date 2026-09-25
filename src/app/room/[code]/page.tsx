import { RoomClient } from "@/components/RoomClient";

export default async function RoomPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  return (
    <main className="min-h-screen">
      <RoomClient code={code.toUpperCase()} />
    </main>
  );
}
